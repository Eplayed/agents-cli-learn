/**
 * NDJSON 流式读取 composable
 * 与后端 /stream_ndjson 接口对接
 */
import { ref } from 'vue'

export interface StreamChunk {
  type: string
  content?: string
  data?: Record<string, unknown>
  name?: string
  [key: string]: unknown
}

export type ChunkHandler = (chunk: StreamChunk) => void

export function useStream() {
  const isStreaming = ref(false)
  let abortController: AbortController | null = null

  /**
   * 发起 NDJSON 流式请求
   */
  async function startStream(url: string, body: unknown, onChunk: ChunkHandler) {
    abortController = new AbortController()
    isStreaming.value = true

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: abortController.signal,
      })

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText)
        throw new Error(`Stream failed: ${res.status} - ${text}`)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No readable stream')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        // 最后一行可能不完整，保留到 buffer
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            const chunk: StreamChunk = JSON.parse(trimmed)
            onChunk(chunk)
            if (chunk.type === 'done') {
              return
            }
          } catch {
            // 跳过非 JSON 行
          }
        }
      }

      // 处理 buffer 中剩余数据
      if (buffer.trim()) {
        try {
          const chunk: StreamChunk = JSON.parse(buffer.trim())
          onChunk(chunk)
        } catch {
          // ignore
        }
      }
    } finally {
      isStreaming.value = false
      abortController = null
    }
  }

  function stopStream() {
    abortController?.abort()
    isStreaming.value = false
  }

  return { isStreaming, startStream, stopStream }
}
