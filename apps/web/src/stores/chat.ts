import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useStream, type StreamChunk } from '../composables/useStream'
import { useSessionStore } from './session'
import { useAgentStore } from './agent'
import type { ImageAttachment } from '../composables/useApi'
import { isPseudoToolEvent } from '../composables/toolDisplay'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'event'
  type?: string // text, tool_call, tool_result, token_stats, error, config_error, agent_start, etc.
  content: string
  data?: Record<string, unknown>
  attachments?: string[]   // 图片 URL 列表（用户消息）
  feedback?: 'up' | 'down' | null
  timestamp: number
  // 工具调用卡片状态（M12 P0：流式可视化）：
  // 'running' = 已收到 tool_calls，还没等到对应的 tool_result（展示 loading）
  // 'done'    = 已收到匹配的 tool_result（展示结果），后端"伪事件"（如 [Skills 激活]）直接是 done
  toolStatus?: 'running' | 'done'
}

export const useChatStore = defineStore('chat', () => {
  const chatMessages = ref<ChatMessage[]>([])
  const { isStreaming, startStream, stopStream } = useStream()

  let msgCounter = 0
  function genId() {
    return `msg_${Date.now()}_${++msgCounter}`
  }

  function addMessage(
    role: ChatMessage['role'],
    content: string,
    type?: string,
    data?: Record<string, unknown>,
    attachments?: string[]
  ) {
    const msg: ChatMessage = { id: genId(), role, content, type, data, attachments, feedback: null, timestamp: Date.now() }
    chatMessages.value.push(msg)
    return msg
  }

  /**
   * 工具调用开始（M12 P0：流式可视化）。
   * - 普通工具（get_weather 等）：新建一张卡片，状态 running，等待对应的 tool_result 把它翻成 done
   * - 后端"伪事件"（[Skills 激活: xxx] / [RAG 检索] 等）：没有对应的 tool_result，直接标记为 done
   */
  function addToolCall(data: Record<string, unknown>) {
    const name = (data?.name as string) || ''
    const status = isPseudoToolEvent(name) ? 'done' : 'running'
    const msg = addMessage('event', '', 'tool_call', data)
    msg.toolStatus = status
    return msg
  }

  /**
   * 工具调用结束：找到最近一张同名、状态为 running 的卡片，原地更新为 done + 附加输出。
   * 找不到匹配项时（理论上不该发生，防御性兜底）新增一条独立的 tool_result 消息，保持旧行为。
   */
  function resolveToolResult(data: Record<string, unknown>) {
    const name = (data?.name as string) || ''
    for (let i = chatMessages.value.length - 1; i >= 0; i--) {
      const m = chatMessages.value[i]
      if (m.type === 'tool_call' && m.toolStatus === 'running' && (m.data?.name as string) === name) {
        m.toolStatus = 'done'
        m.data = { ...m.data, output: data?.output }
        return m
      }
    }
    // 兜底：没找到配对的 running 卡片，退回旧行为单独展示一条结果
    const msg = addMessage('event', '', 'tool_result', data)
    msg.toolStatus = 'done'
    return msg
  }

  /**
   * 兜底清理：流式结束（正常完成或异常报错）后，把所有还卡在 running 的工具调用卡片标记为 done，
   * 避免"服务端报错、没等到 tool_result"时转圈动画永久停在界面上。
   */
  function settleDanglingToolCalls() {
    for (const m of chatMessages.value) {
      if (m.type === 'tool_call' && m.toolStatus === 'running') {
        m.toolStatus = 'done'
      }
    }
  }

  function clearMessages() {
    chatMessages.value = []
  }

  /**
   * 发送单 Agent 流式消息（支持图片）
   */
  async function sendSingle(text: string, images: ImageAttachment[] = []) {
    const sessionStore = useSessionStore()
    const agentStore = useAgentStore()

    if (!sessionStore.currentSessionId) {
      await sessionStore.createNew()
    }

    // 用户消息（带图片预览 URL）
    const previews = images.map((img) => `data:${img.media_type};base64,${img.data}`)
    addMessage('user', text, 'text', undefined, previews.length ? previews : undefined)

    const assistantMsg = addMessage('assistant', '', 'text')
    let fullContent = ''

    try {
      await startStream(
        '/api/v1/chat/stream_ndjson',
        {
          message: text,
          session_id: sessionStore.currentSessionId,
          model: agentStore.selectedModel || undefined,
          agent_key: agentStore.selectedAgent || undefined,
          images: images.length ? images : undefined,
          stream: true,
        },
        (chunk: StreamChunk) => {
          handleChunk(chunk, assistantMsg, (c) => {
            fullContent += c
          })
        }
      )
    } finally {
      // 无论正常结束 / 服务端报错 / 用户点"停止"中止请求，都要把还卡在 running 的
      // 工具调用卡片收尾成 done，避免转圈动画永久卡住（M12 P0）
      settleDanglingToolCalls()
    }

    assistantMsg.content = fullContent
    await sessionStore.loadSessions()
  }

  /**
   * 发送 Multi-Agent 流式消息
   */
  async function sendTeam(topic: string) {
    const sessionStore = useSessionStore()
    const agentStore = useAgentStore()

    if (!sessionStore.currentSessionId) {
      await sessionStore.createNew()
    }

    addMessage('user', topic, 'team')
    const assistantMsg = addMessage('assistant', '', 'text')
    let fullContent = ''

    await startStream(
      '/api/v1/team/stream_ndjson',
      { topic, mode: agentStore.teamMode, session_id: sessionStore.currentSessionId },
      (chunk: StreamChunk) => {
        if (chunk.type === 'summary') {
          fullContent = chunk.content || ''
          assistantMsg.content = fullContent
        } else if (chunk.type === 'task_result') {
          addMessage('event', String(chunk.content || ''), 'task_result')
        } else if (chunk.type === 'agent_start' || chunk.type === 'agent_thinking' || chunk.type === 'agent_done') {
          addMessage('event', String(chunk.content || ''), chunk.type)
        } else if (chunk.type === 'error') {
          addMessage('event', String(chunk.content || ''), 'error')
        } else if (chunk.type !== 'done') {
          addMessage('event', JSON.stringify(chunk), 'event')
        }
      }
    )

    await sessionStore.loadSessions()
  }

  function handleChunk(chunk: StreamChunk, assistantMsg: ChatMessage, appendText: (c: string) => void) {
    switch (chunk.type) {
      case 'text':
        appendText(chunk.content || '')
        assistantMsg.content += chunk.content || ''
        break
      case 'tool_calls':
      case 'tool_call':
        addToolCall(chunk.data as Record<string, unknown>)
        break
      case 'tool_result':
        resolveToolResult(chunk.data as Record<string, unknown>)
        break
      case 'token_stats':
        addMessage('event', '', 'token_stats', chunk.data as Record<string, unknown>)
        break
      case 'config_error':
        addMessage('event', chunk.content || 'API Key 未配置', 'config_error', chunk.details as Record<string, unknown>)
        break
      case 'error':
        addMessage('event', chunk.content || 'Unknown error', 'error')
        break
      case 'done':
        break
      default:
        addMessage('event', JSON.stringify(chunk), 'event')
    }
  }

  return {
    chatMessages,
    isStreaming,
    addMessage,
    clearMessages,
    sendSingle,
    sendTeam,
    stopStream,
  }
})
