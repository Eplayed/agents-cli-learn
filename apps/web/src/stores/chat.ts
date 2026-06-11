import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useStream, type StreamChunk } from '../composables/useStream'
import { useSessionStore } from './session'
import { useAgentStore } from './agent'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'event'
  type?: string // text, tool_call, tool_result, token_stats, error, agent_start, etc.
  content: string
  data?: Record<string, unknown>
  timestamp: number
}

export const useChatStore = defineStore('chat', () => {
  const chatMessages = ref<ChatMessage[]>([])
  const { isStreaming, startStream, stopStream } = useStream()

  let msgCounter = 0
  function genId() {
    return `msg_${Date.now()}_${++msgCounter}`
  }

  function addMessage(role: ChatMessage['role'], content: string, type?: string, data?: Record<string, unknown>) {
    const msg: ChatMessage = { id: genId(), role, content, type, data, timestamp: Date.now() }
    chatMessages.value.push(msg)
    return msg
  }

  function clearMessages() {
    chatMessages.value = []
  }

  /**
   * 发送单 Agent 流式消息
   */
  async function sendSingle(text: string) {
    const sessionStore = useSessionStore()
    const agentStore = useAgentStore()

    if (!sessionStore.currentSessionId) {
      await sessionStore.createNew()
    }

    addMessage('user', text)

    // 创建一个 assistant 占位消息，逐步填充
    const assistantMsg = addMessage('assistant', '', 'text')
    let fullContent = ''

    await startStream('/api/v1/chat/stream_ndjson', {
      message: text,
      session_id: sessionStore.currentSessionId,
      model: agentStore.selectedModel || undefined,
      agent_key: agentStore.selectedAgent || undefined,
      stream: true,
    }, (chunk: StreamChunk) => {
      handleChunk(chunk, assistantMsg, (c) => { fullContent += c })
    })

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

    await startStream('/api/v1/team/stream_ndjson', {
      topic,
      mode: agentStore.teamMode,
      session_id: sessionStore.currentSessionId,
    }, (chunk: StreamChunk) => {
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
    })

    await sessionStore.loadSessions()
  }

  function handleChunk(chunk: StreamChunk, assistantMsg: ChatMessage, appendText: (c: string) => void) {
    switch (chunk.type) {
      case 'text':
        appendText(chunk.content || '')
        assistantMsg.content += chunk.content || ''
        break
      case 'tool_call':
        addMessage('event', '', 'tool_call', chunk.data as Record<string, unknown>)
        break
      case 'tool_result':
        addMessage('event', '', 'tool_result', chunk.data as Record<string, unknown>)
        break
      case 'token_stats':
        addMessage('event', '', 'token_stats', chunk.data as Record<string, unknown>)
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
