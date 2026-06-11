import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  createSession as apiCreateSession,
  listSessionSummaries,
  getSessionMessages,
  deleteSession as apiDeleteSession,
  type SessionSummary,
  type MessageRecord,
} from '../composables/useApi'

export const useSessionStore = defineStore('session', () => {
  const sessions = ref<SessionSummary[]>([])
  const currentSessionId = ref<string | null>(null)
  const messages = ref<MessageRecord[]>([])
  const loading = ref(false)

  async function loadSessions() {
    sessions.value = await listSessionSummaries()
  }

  async function switchSession(id: string) {
    currentSessionId.value = id
    messages.value = await getSessionMessages(id)
  }

  async function createNew() {
    const sess = await apiCreateSession()
    currentSessionId.value = sess.id
    messages.value = []
    await loadSessions()
    return sess.id
  }

  async function deleteSessionById(id: string) {
    await apiDeleteSession(id)
    if (currentSessionId.value === id) {
      currentSessionId.value = null
      messages.value = []
    }
    await loadSessions()
  }

  async function refreshMessages() {
    if (currentSessionId.value) {
      messages.value = await getSessionMessages(currentSessionId.value)
    }
  }

  return {
    sessions,
    currentSessionId,
    messages,
    loading,
    loadSessions,
    switchSession,
    createNew,
    deleteSessionById,
    refreshMessages,
  }
})
