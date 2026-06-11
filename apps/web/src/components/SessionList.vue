<script setup lang="ts">
import { ref, computed } from 'vue'
import { useSessionStore } from '../stores/session'
import { useChatStore } from '../stores/chat'

const sessionStore = useSessionStore()
const chatStore = useChatStore()
const search = ref('')

const filteredSessions = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return sessionStore.sessions
  return sessionStore.sessions.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q) ||
      (s.last_message_preview || '').toLowerCase().includes(q)
  )
})

async function select(id: string) {
  chatStore.clearMessages()
  await sessionStore.switchSession(id)
  // 加载历史消息到 chat store
  for (const m of sessionStore.messages) {
    chatStore.addMessage(
      m.role as 'user' | 'assistant',
      m.content,
      'text'
    )
  }
}

function formatTime(ts: string | null) {
  if (!ts) return ''
  return new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="space-y-2">
    <input
      v-model="search"
      placeholder="搜索会话…"
      class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
    />
    <div class="max-h-[400px] overflow-y-auto space-y-1">
      <button
        v-for="s in filteredSessions"
        :key="s.id"
        class="w-full text-left rounded-lg px-3 py-2 text-sm transition-colors"
        :class="sessionStore.currentSessionId === s.id
          ? 'bg-accent/10 border border-accent/30'
          : 'hover:bg-gray-100 dark:hover:bg-gray-800 border border-transparent'"
        @click="select(s.id)"
      >
        <div class="flex justify-between items-center">
          <span class="font-medium truncate">{{ s.name }}</span>
          <span class="text-xs text-gray-400 whitespace-nowrap ml-2">{{ formatTime(s.updated_at) }}</span>
        </div>
        <div v-if="s.last_message_preview" class="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
          {{ s.last_message_preview }}
        </div>
      </button>
      <div v-if="filteredSessions.length === 0" class="text-center text-xs text-gray-400 py-4">
        暂无会话
      </div>
    </div>
  </div>
</template>
