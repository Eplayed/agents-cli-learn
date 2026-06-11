<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useChatStore, type ChatMessage } from '../stores/chat'

const router = useRouter()
const chatStore = useChatStore()
const search = ref('')
const levelFilter = ref<'ALL' | 'INFO' | 'WARN' | 'ERROR'>('ALL')

// 从聊天消息中提取事件日志
const logs = computed(() => {
  return chatStore.chatMessages.filter((m) => m.role === 'event')
})

const filtered = computed(() => {
  let items = logs.value
  if (search.value.trim()) {
    const q = search.value.toLowerCase()
    items = items.filter((m) => (m.content + (m.type || '')).toLowerCase().includes(q))
  }
  if (levelFilter.value !== 'ALL') {
    const lv = levelFilter.value.toLowerCase()
    items = items.filter((m) => {
      if (lv === 'error') return m.type === 'error'
      if (lv === 'warn') return false
      return true
    })
  }
  return items
})

function exportJson() {
  const blob = new Blob([JSON.stringify(logs.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `logs_${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function exportText() {
  const text = logs.value.map((m) => `[${m.type}] ${m.content}`).join('\n')
  const blob = new Blob([text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `logs_${Date.now()}.txt`
  a.click()
  URL.revokeObjectURL(url)
}

function getIcon(msg: ChatMessage) {
  switch (msg.type) {
    case 'error': return '❌'
    case 'tool_call': return '⚙️'
    case 'tool_result': return '✅'
    case 'token_stats': return '📊'
    case 'agent_start': return '🚀'
    case 'agent_thinking': return '💭'
    case 'task_result': return '📝'
    default: return '📋'
  }
}
</script>

<template>
  <div class="h-screen flex flex-col bg-white dark:bg-[#0b0f19]">
    <header class="shrink-0 border-b border-gray-200 dark:border-gray-700 px-5 py-3 flex items-center justify-between">
      <h1 class="text-base font-semibold">会话日志</h1>
      <div class="flex items-center gap-2">
        <button class="px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors" @click="exportJson">
          导出 JSON
        </button>
        <button class="px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors" @click="exportText">
          导出文本
        </button>
        <button class="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent/90 transition-colors" @click="router.push('/')">
          返回聊天
        </button>
      </div>
    </header>

    <div class="p-4 flex gap-3">
      <input
        v-model="search"
        placeholder="搜索日志…"
        class="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
      />
      <select
        v-model="levelFilter"
        class="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
      >
        <option value="ALL">全部</option>
        <option value="INFO">INFO</option>
        <option value="WARN">WARN</option>
        <option value="ERROR">ERROR</option>
      </select>
    </div>

    <div class="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
      <div
        v-for="msg in filtered"
        :key="msg.id"
        class="flex gap-2 items-start px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-xs"
        :class="msg.type === 'error' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'bg-gray-50 dark:bg-gray-900'"
      >
        <span>{{ getIcon(msg) }}</span>
        <span class="font-mono text-gray-400 w-20 shrink-0">{{ msg.type }}</span>
        <span class="break-all text-gray-700 dark:text-gray-300">{{ msg.content || JSON.stringify(msg.data) }}</span>
        <span class="ml-auto text-gray-400 whitespace-nowrap">{{ new Date(msg.timestamp).toLocaleTimeString() }}</span>
      </div>
      <div v-if="filtered.length === 0" class="text-center text-gray-400 py-8">
        暂无日志
      </div>
    </div>
  </div>
</template>
