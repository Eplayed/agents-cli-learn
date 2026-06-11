<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useChatStore } from '../stores/chat'
import { useSessionStore } from '../stores/session'
import { useAgentStore } from '../stores/agent'
import SessionList from '../components/SessionList.vue'
import ModelSelector from '../components/ModelSelector.vue'
import AgentSelector from '../components/AgentSelector.vue'
import ChatMessage from '../components/ChatMessage.vue'
import ToolCallBlock from '../components/ToolCallBlock.vue'
import TokenStats from '../components/TokenStats.vue'
import TypingIndicator from '../components/TypingIndicator.vue'

const router = useRouter()
const chatStore = useChatStore()
const sessionStore = useSessionStore()
const agentStore = useAgentStore()

const inputText = ref('')
const messagesRef = ref<HTMLElement | null>(null)

// 自动滚动到底部
watch(
  () => chatStore.chatMessages.length,
  async () => {
    await nextTick()
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  }
)

onMounted(async () => {
  await Promise.all([
    agentStore.loadModels(),
    agentStore.loadAgents(),
    sessionStore.loadSessions(),
  ])
  // 自动加载最新会话
  if (sessionStore.sessions.length > 0) {
    chatStore.clearMessages()
    await sessionStore.switchSession(sessionStore.sessions[0].id)
    for (const m of sessionStore.messages) {
      chatStore.addMessage(m.role as 'user' | 'assistant', m.content, 'text')
    }
  }
})

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || chatStore.isStreaming) return
  inputText.value = ''

  if (agentStore.uiMode === 'team') {
    await chatStore.sendTeam(text)
  } else {
    await chatStore.sendSingle(text)
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

async function newSession() {
  chatStore.clearMessages()
  await sessionStore.createNew()
}
</script>

<template>
  <div class="h-screen flex flex-col">
    <!-- Header -->
    <header class="shrink-0 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-b from-accent/5 to-transparent px-5 py-3">
      <div class="flex items-center justify-between">
        <h1 class="text-base font-semibold">Noah Agent Web UI</h1>
        <div class="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span>Session: <strong class="text-gray-700 dark:text-gray-300">{{ sessionStore.currentSessionId || '-' }}</strong></span>
          <span :class="chatStore.isStreaming ? 'text-green-500' : ''">
            {{ chatStore.isStreaming ? '● streaming' : '○ idle' }}
          </span>
          <button
            class="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-xs transition-colors"
            @click="router.push('/logs')"
          >
            Logs
          </button>
        </div>
      </div>
    </header>

    <!-- Main Layout -->
    <div class="flex-1 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-0 overflow-hidden">
      <!-- Sidebar -->
      <aside class="hidden lg:flex flex-col border-r border-gray-200 dark:border-gray-700 overflow-y-auto p-4 space-y-4">
        <SessionList />

        <div class="space-y-1">
          <label class="text-xs text-gray-500 dark:text-gray-400 font-medium">交互类型</label>
          <div class="flex gap-2">
            <select
              v-model="agentStore.uiMode"
              class="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
            >
              <option value="single">单 Agent</option>
              <option value="team">Multi-Agent</option>
            </select>
            <select
              v-if="agentStore.uiMode === 'team'"
              v-model="agentStore.teamMode"
              class="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
            >
              <option value="sequential">sequential</option>
              <option value="parallel">parallel</option>
              <option value="supervisor">supervisor</option>
              <option value="groupchat">groupchat</option>
            </select>
          </div>
        </div>

        <ModelSelector />
        <AgentSelector />

        <div class="pt-2 space-y-2">
          <button
            class="w-full rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 px-3 py-2 text-sm font-medium transition-colors"
            @click="newSession"
          >
            新建 Session
          </button>
          <button
            class="w-full rounded-lg bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 px-3 py-2 text-sm font-medium transition-colors"
            @click="chatStore.clearMessages()"
          >
            清空窗口
          </button>
        </div>
      </aside>

      <!-- Chat Area -->
      <section class="flex flex-col overflow-hidden">
        <!-- Messages -->
        <div ref="messagesRef" class="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          <template v-for="msg in chatStore.chatMessages" :key="msg.id">
            <ChatMessage v-if="msg.role !== 'event'" :msg="msg" />
            <ToolCallBlock v-else-if="msg.type === 'tool_call' || msg.type === 'tool_result'" :msg="msg" />
            <TokenStats v-else-if="msg.type === 'token_stats'" :msg="msg" />
            <div
              v-else
              class="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400"
            >
              <span class="font-mono text-[10px] mr-2 text-gray-400">{{ msg.type }}</span>
              {{ msg.content }}
            </div>
          </template>
          <TypingIndicator v-if="chatStore.isStreaming" />
        </div>

        <!-- Composer -->
        <div class="shrink-0 border-t border-gray-200 dark:border-gray-700 p-4">
          <div class="flex gap-2">
            <textarea
              v-model="inputText"
              :placeholder="agentStore.uiMode === 'team' ? '输入 topic…' : '输入消息…'"
              rows="2"
              class="flex-1 resize-none rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
              @keydown="handleKeydown"
            ></textarea>
            <div class="flex flex-col gap-2">
              <button
                class="rounded-xl bg-accent hover:bg-accent/90 disabled:opacity-50 text-white px-4 py-2 text-sm font-medium transition-colors"
                :disabled="chatStore.isStreaming || !inputText.trim()"
                @click="handleSend"
              >
                发送
              </button>
              <button
                v-if="chatStore.isStreaming"
                class="rounded-xl bg-red-500 hover:bg-red-600 text-white px-4 py-2 text-sm font-medium transition-colors"
                @click="chatStore.stopStream()"
              >
                停止
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
