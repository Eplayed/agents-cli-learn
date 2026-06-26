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
  // 加载历史消息到 chat store（含图片附件）
  for (const m of sessionStore.messages) {
    chatStore.addMessage(
      m.role as 'user' | 'assistant',
      m.content,
      'text',
      undefined,
      m.attachments || undefined
    )
  }
}

async function remove(id: string, name: string, e: Event) {
  e.stopPropagation()
  if (!confirm(`确定删除会话「${name}」？消息将被永久删除。`)) return
  await sessionStore.deleteSessionById(id)
  if (sessionStore.currentSessionId === null) {
    chatStore.clearMessages()
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
    <div class="max-h-[360px] overflow-y-auto space-y-1">
      <div
        v-for="s in filteredSessions"
        :key="s.id"
        class="group w-full rounded-lg px-3 py-2 text-sm transition-colors cursor-pointer"
        :class="sessionStore.currentSessionId === s.id
          ? 'bg-accent/10 border border-accent/30'
          : 'hover:bg-gray-100 dark:hover:bg-gray-800 border border-transparent'"
        @click="select(s.id)"
      >
        <div class="flex justify-between items-center gap-2">
          <span class="font-medium truncate flex-1 min-w-0">{{ s.name }}</span>
          <span class="text-xs text-gray-400 whitespace-nowrap">{{ formatTime(s.updated_at) }}</span>
          <button
            class="text-gray-400 hover:text-red-500 text-xs px-1 shrink-0"
            title="删除会话"
            @click="remove(s.id, s.name, $event)"
          >✕</button>
        </div>
        <div v-if="s.last_message_preview" class="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
          {{ s.last_message_preview }}
        </div>
      </div>
      <div v-if="filteredSessions.length === 0" class="text-center text-xs text-gray-400 py-4">
        暂无会话
      </div>
    </div>
  </div>
</template>
