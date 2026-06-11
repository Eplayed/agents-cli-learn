/**
 * 通用 API 调用 composable
 * 基于 Vite 代理，请求自动转发到后端
 */

const BASE = '' // Vite proxy handles /api -> localhost:8000

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = opts
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText)
    throw new Error(`API ${res.status}: ${detail}`)
  }
  return res.json()
}

// ---- Session API ----

export interface SessionInfo {
  id: string
  name: string
  message_count: number
  created_at: string
  updated_at: string
}

export interface SessionSummary extends SessionInfo {
  last_message_preview: string | null
  last_message_at: string | null
  last_role: string | null
}

export interface MessageRecord {
  id: string
  session_id: string
  role: string
  content: string
  tool_calls: string | null
  created_at: string
}

export function createSession(name?: string) {
  return api<SessionInfo>('/api/v1/session/', { method: 'POST', body: { name } })
}

export function listSessions(limit = 20) {
  return api<SessionInfo[]>(`/api/v1/session/?limit=${limit}`)
}

export function listSessionSummaries(limit = 50) {
  return api<SessionSummary[]>(`/api/v1/session/summary?limit=${limit}`)
}

export function getSessionMessages(sessionId: string, limit = 50) {
  return api<MessageRecord[]>(`/api/v1/session/${sessionId}/messages?limit=${limit}`)
}

export function deleteSession(sessionId: string) {
  return api(`/api/v1/session/${sessionId}`, { method: 'DELETE' })
}

// ---- Models & Agents ----

export interface ModelsResponse {
  models: string[]
  default: string
}

export interface AgentInfo {
  key: string
  name: string
  description: string
}

export interface AgentsResponse {
  agents: AgentInfo[]
  default: string
}

export function listModels() {
  return api<ModelsResponse>('/api/v1/models')
}

export function listAgents() {
  return api<AgentsResponse>('/api/v1/agents')
}

// ---- Chat (non-stream) ----

export interface ChatResponse {
  session_id: string
  message_id: string
  content: string
  created_at: string
}

export function chatSend(message: string, sessionId?: string, model?: string, agentKey?: string) {
  return api<ChatResponse>('/api/v1/chat/send', {
    method: 'POST',
    body: { message, session_id: sessionId, model, agent_key: agentKey, stream: false },
  })
}

// ---- Team (non-stream) ----

export interface TeamResponse {
  session_id: string
  mode: string
  summary: string
  created_at: string
}

export function teamExecute(topic: string, mode: string, sessionId?: string) {
  return api<TeamResponse>('/api/v1/team/execute', {
    method: 'POST',
    body: { topic, mode, session_id: sessionId },
  })
}
