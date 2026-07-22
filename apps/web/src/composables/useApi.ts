/**
 * 通用 API 调用 composable
 * 基于 Vite 代理，请求自动转发到后端
 */

const BASE = '' // Vite proxy handles /api -> localhost:8000

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
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
  attachments: string[] | null
  created_at: string
}

export interface ImageAttachment {
  data: string         // base64 (无前缀)
  media_type: string   // image/png 等
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

export function cleanupEmptySessions() {
  return api<{ deleted: number }>('/api/v1/session/cleanup-empty', { method: 'DELETE' })
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

// ---- Skills Store ----

export interface SkillItem {
  id?: string
  name: string
  display_name?: string
  description?: string
  version?: string
  author?: string
  category?: string
  icon?: string
  triggers?: string[]
  content?: string
  source?: string
  source_url?: string
  stars?: number
  enabled?: number
  installed?: boolean
}

export function listInstalledSkills() {
  return api<{ skills: SkillItem[]; count: number }>('/api/v1/skills/installed')
}

export function listLocalSkills() {
  return api<{ skills: SkillItem[]; count: number }>('/api/v1/skills/local')
}

export function searchOnlineSkills(q: string) {
  return api<{ skills: SkillItem[]; count: number; source: string }>(
    `/api/v1/skills/online-search?q=${encodeURIComponent(q)}`
  )
}

export function installSkill(skill: SkillItem) {
  return api('/api/v1/skills/install', {
    method: 'POST',
    body: {
      name: skill.name,
      display_name: skill.display_name,
      description: skill.description,
      version: skill.version || '1.0.0',
      author: skill.author,
      category: skill.category,
      icon: skill.icon,
      triggers: skill.triggers || [],
      content: skill.content || `# ${skill.name}\n\n${skill.description || ''}`,
      source: skill.source || 'online',
      source_url: skill.source_url,
    },
  })
}

export function toggleSkill(slug: string) {
  return api(`/api/v1/skills/${slug}/toggle`, { method: 'POST' })
}

export function uninstallSkill(slug: string) {
  return api(`/api/v1/skills/${slug}`, { method: 'DELETE' })
}

// ---- AI Testing ----

export interface TestTypeInfo {
  key: string
  label: string
  description: string
  default_agent: string | null
}

export interface TestCaseResult {
  case_id: string
  passed: boolean
  input: string
  output: string
  reasons: string[]
  details: Record<string, unknown>
  duration_ms: number
  error: string | null
}

export interface TestSuiteResponse {
  test_type: string
  total: number
  passed: number
  failed: number
  pass_rate: number
  duration_ms: number
  cases: TestCaseResult[]
  run_id: string
  created_at: string
}

export interface TestRunSummary {
  id: string
  test_type: string
  agent_key: string | null
  model: string | null
  total: number
  passed: number
  failed: number
  pass_rate: number
  duration_ms: number
  created_at: string
}

export function listTestTypes() {
  return api<{ types: TestTypeInfo[] }>('/api/v1/ai-testing/types')
}

export function getTestPresets(testType: string) {
  return api<{ test_type: string; cases: Record<string, unknown>[] }>(`/api/v1/ai-testing/presets/${testType}`)
}

export function runTest(testType: string, opts: { agentKey?: string; model?: string; cases?: unknown[]; runs?: number } = {}) {
  return api<TestSuiteResponse>('/api/v1/ai-testing/run', {
    method: 'POST',
    body: {
      test_type: testType,
      agent_key: opts.agentKey,
      model: opts.model,
      cases: opts.cases,
      runs: opts.runs,
    },
  })
}

export function listTestHistory(testType?: string, limit = 30) {
  const q = testType ? `?test_type=${testType}&limit=${limit}` : `?limit=${limit}`
  return api<{ runs: TestRunSummary[]; count: number }>(`/api/v1/ai-testing/history${q}`)
}

export function getTestHistoryDetail(runId: string) {
  return api<TestSuiteResponse & { id: string }>(`/api/v1/ai-testing/history/${runId}`)
}

export function deleteTestHistory(runId: string) {
  return api(`/api/v1/ai-testing/history/${runId}`, { method: 'DELETE' })
}

// ---- M16 Memory & Files ----

export interface MemoryItem {
  id: string
  key: string
  value: string
  category: string
  source: string
  confidence: number
  created_at: string
  updated_at: string
}

export function listMemories() {
  return api<{ memories: MemoryItem[]; count: number }>('/api/v1/memory/')
}

export function createMemory(body: { key: string; value: string; category?: string; session_id?: string }) {
  return api<MemoryItem>('/api/v1/memory/', { method: 'POST', body })
}

export function deleteMemory(id: string) {
  return api(`/api/v1/memory/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export interface UploadedFileItem {
  id: string
  filename: string
  media_type: string | null
  size_bytes: number
  status: string
  error_message: string | null
  text_preview: string | null
  created_at: string
}

export function listFiles() {
  return api<{ files: UploadedFileItem[]; count: number }>('/api/v1/files/')
}

export async function uploadKnowledgeFile(file: File, sessionId?: string) {
  const form = new FormData()
  form.append('file', file)
  if (sessionId) form.append('session_id', sessionId)
  const res = await fetch('/api/v1/files/upload', { method: 'POST', body: form })
  if (!res.ok) throw new Error(`Upload failed: ${res.status} - ${await res.text()}`)
  return res.json() as Promise<UploadedFileItem>
}

export function getFileText(id: string) {
  return api<{ id: string; filename: string; text: string }>(`/api/v1/files/${encodeURIComponent(id)}/text`)
}

export function deleteUploadedFile(id: string) {
  return api(`/api/v1/files/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// ---- M18 Scheduled Tasks ----

export interface ScheduledTaskItem {
  id: string
  name: string
  prompt: string
  agent_key: string | null
  model: string | null
  enabled: boolean
  interval_seconds: number | null
  next_run_at: string | null
  last_run_at: string | null
  max_runs: number | null
  run_count: number
  created_at: string
}

export interface ScheduledRunItem {
  id: string
  task_id: string
  agent_run_id: string | null
  trigger: string
  status: string
  started_at: string
  finished_at: string | null
  error_message: string | null
}

export function listScheduledTasks() {
  return api<{ tasks: ScheduledTaskItem[]; count: number }>('/api/v1/scheduled/')
}

export function createScheduledTask(body: { name: string; prompt: string; interval_seconds?: number; once_at?: string; agent_key?: string; model?: string; max_runs?: number }) {
  return api<ScheduledTaskItem>('/api/v1/scheduled/', { method: 'POST', body })
}

export function pauseScheduledTask(id: string) {
  return api(`/api/v1/scheduled/${encodeURIComponent(id)}/pause`, { method: 'POST' })
}

export function resumeScheduledTask(id: string) {
  return api(`/api/v1/scheduled/${encodeURIComponent(id)}/resume`, { method: 'POST' })
}

export function triggerScheduledTask(id: string) {
  return api<{ triggered: boolean; scheduled_task_run_id: string }>(`/api/v1/scheduled/${encodeURIComponent(id)}/trigger`, { method: 'POST' })
}

export function deleteScheduledTask(id: string) {
  return api(`/api/v1/scheduled/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function listScheduledRuns(id: string) {
  return api<{ runs: ScheduledRunItem[]; count: number }>(`/api/v1/scheduled/${encodeURIComponent(id)}/runs`)
}
