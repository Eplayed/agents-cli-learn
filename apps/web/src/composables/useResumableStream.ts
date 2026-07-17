/**
 * 任务化 SSE 流式 + 断线续传（M12「改法 B」）
 *
 * 两步式：
 *   1) POST {createUrl}            创建任务，拿到 { task_id, session_id }
 *   2) GET  {createUrl}/{id}/stream  用 fetch 读 SSE，逐帧解析 event/id/data
 *
 * 断线续传：记住最后收到的事件 id（SSE 的 id: 字段），连接意外断开且未收到
 * done 时，带着 Last-Event-ID / ?after_id= 重连，服务端从该 id 之后重放事件。
 *
 * 为什么用 fetch 手解 SSE、而不是浏览器原生 EventSource？
 * - 需要在重连时精确控制 Last-Event-ID / after_id 与退避策略（更利于演示机制）
 * - 与项目既有 fetch 流式风格一致，且鉴权开启时还能带自定义头
 * 每个 chunk 的负载与 NDJSON 路径完全一致，因此可复用同一个 onChunk 处理器。
 */
import { ref } from 'vue'
import type { StreamChunk, ChunkHandler } from './useStream'
import { genRequestId } from './useStream'

const MAX_RECONNECTS = 5
const BASE_BACKOFF_MS = 500

export function useResumableStream() {
  const isStreaming = ref(false)
  let stopped = false
  let controller: AbortController | null = null

  function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms))
  }

  /**
   * 解析一段 SSE 文本缓冲，产出完整事件，返回剩余未闭合的尾部。
   * SSE 事件以空行分隔，字段有 id: / event: / data:（data 可多行）。
   */
  function drainSseBuffer(
    buffer: string,
    onEvent: (ev: { id: string; event: string; data: string }) => void
  ): string {
    // SSE 事件以空行分隔；sse-starlette 默认 CRLF，这里兼容 \n / \r\n
    const parts = buffer.split(/\r?\n\r?\n/)
    const rest = parts.pop() ?? '' // 最后一段可能不完整，留到下次
    for (const block of parts) {
      let id = ''
      let event = 'message'
      const dataLines: string[] = []
      for (const rawLine of block.split('\n')) {
        const line = rawLine.replace(/\r$/, '')
        if (!line || line.startsWith(':')) continue // 空行 / 注释(心跳)
        const idx = line.indexOf(':')
        const field = idx === -1 ? line : line.slice(0, idx)
        const value = idx === -1 ? '' : line.slice(idx + 1).replace(/^ /, '')
        if (field === 'id') id = value
        else if (field === 'event') event = value
        else if (field === 'data') dataLines.push(value)
      }
      if (dataLines.length) onEvent({ id, event, data: dataLines.join('\n') })
    }
    return rest
  }

  /**
   * 发起任务化流式请求。
   * @returns 创建任务时后端返回的 session_id（可能是新建的）
   */
  async function startResumableStream(
    createUrl: string,
    body: unknown,
    onChunk: ChunkHandler
  ): Promise<string | undefined> {
    stopped = false
    isStreaming.value = true
    let sessionId: string | undefined

    try {
      // ---- 1) 创建任务 ----
      const createRes = await fetch(createUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Request-ID': genRequestId() },
        body: JSON.stringify(body),
      })
      if (!createRes.ok) {
        const text = await createRes.text().catch(() => createRes.statusText)
        throw new Error(`Create task failed: ${createRes.status} - ${text}`)
      }
      const created = (await createRes.json()) as { task_id: string; session_id: string }
      sessionId = created.session_id
      const streamUrl = `${createUrl}/${encodeURIComponent(created.task_id)}/stream`

      // ---- 2) 观察流（带断线重连）----
      let lastId = 0
      let finished = false
      let attempt = 0

      while (!finished && !stopped && attempt <= MAX_RECONNECTS) {
        controller = new AbortController()
        try {
          const res = await fetch(`${streamUrl}?after_id=${lastId}`, {
            method: 'GET',
            headers: {
              Accept: 'text/event-stream',
              'X-Request-ID': genRequestId(),
              ...(lastId > 0 ? { 'Last-Event-ID': String(lastId) } : {}),
            },
            signal: controller.signal,
          })
          if (!res.ok) {
            const text = await res.text().catch(() => res.statusText)
            throw new Error(`Stream failed: ${res.status} - ${text}`)
          }
          const reader = res.body?.getReader()
          if (!reader) throw new Error('No readable stream')

          const decoder = new TextDecoder()
          let buffer = ''
          attempt = 0 // 成功建立连接，重置重连计数

          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            buffer = drainSseBuffer(buffer, ({ id, data }) => {
              if (id && /^\d+$/.test(id)) lastId = Math.max(lastId, parseInt(id, 10))
              let chunk: StreamChunk
              try {
                chunk = JSON.parse(data)
              } catch {
                return
              }
              onChunk(chunk)
              if (chunk.type === 'done') finished = true
            })
            if (finished) break
          }

          if (finished || stopped) break
          // 流被中断但没收到 done → 退避后带 lastId 重连
          attempt++
          if (attempt <= MAX_RECONNECTS) await sleep(BASE_BACKOFF_MS * attempt)
        } catch (err) {
          if (stopped || (err as Error).name === 'AbortError') break
          attempt++
          if (attempt > MAX_RECONNECTS) throw err
          await sleep(BASE_BACKOFF_MS * attempt)
        }
      }
    } finally {
      isStreaming.value = false
      controller = null
    }

    return sessionId
  }

  function stopResumableStream() {
    stopped = true
    controller?.abort()
    isStreaming.value = false
  }

  return { isStreaming, startResumableStream, stopResumableStream }
}
