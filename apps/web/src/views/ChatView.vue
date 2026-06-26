<script setup lang="ts">
import { ref, onMounted, nextTick, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useChatStore } from '../stores/chat'
import { useSessionStore } from '../stores/session'
import { useAgentStore } from '../stores/agent'
import type { ImageAttachment } from '../composables/useApi'
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
const fileInputRef = ref<HTMLInputElement | null>(null)
const isDragOver = ref(false)

const CHAR_LIMIT = 4000
const MAX_IMAGES = 3
const MAX_IMAGE_SIZE = 4 * 1024 * 1024

// 待发送的图片
interface PendingImage extends ImageAttachment { preview: string; name: string }
const pendingImages = ref<PendingImage[]>([])

const overLimit = computed(() => inputText.value.length > CHAR_LIMIT)
const canSend = computed(() => !chatStore.isStreaming && inputText.value.trim().length > 0 && !overLimit.value)

watch(
  () => chatStore.chatMessages.length,
  async () => {
    await nextTick()
    if (messagesRef.value) messagesRef.value.scrollTop = messagesRef.value.scrollHeight
  }
)

onMounted(async () => {
  await Promise.all([agentStore.loadModels(), agentStore.loadAgents(), sessionStore.loadSessions()])
  // 自动加载"最近一个有消息的会话"（跳过空会话），避免一打开就是空白
  const withMsg = sessionStore.sessions.find((s) => s.message_count > 0 || s.last_message_preview)
  const target = withMsg || sessionStore.sessions[0]
  if (target) {
    chatStore.clearMessages()
    await sessionStore.switchSession(target.id)
    for (const m of sessionStore.messages) {
      chatStore.addMessage(m.role as 'user' | 'assistant', m.content, 'text', undefined, m.attachments || undefined)
    }
  }
})

// ===== 图片处理 =====
function fileToBase64(file: File): Promise<{ data: string; media_type: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve({ data: result.split(',')[1], media_type: file.type || 'image/png' })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function addImageFiles(files: File[]) {
  for (const file of files) {
    if (pendingImages.value.length >= MAX_IMAGES) break
    if (!file.type.startsWith('image/')) continue
    if (file.size > MAX_IMAGE_SIZE) continue
    const { data, media_type } = await fileToBase64(file)
    pendingImages.value.push({ data, media_type, preview: URL.createObjectURL(file), name: file.name })
  }
}

function removeImage(i: number) {
  URL.revokeObjectURL(pendingImages.value[i].preview)
  pendingImages.value.splice(i, 1)
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.length) addImageFiles(Array.from(input.files))
  input.value = ''
}

function onPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  const imgs: File[] = []
  for (const it of items) {
    if (it.type.startsWith('image/')) {
      const f = it.getAsFile()
      if (f) imgs.push(f)
    }
  }
  if (imgs.length) { e.preventDefault(); addImageFiles(imgs) }
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  isDragOver.value = false
  if (e.dataTransfer?.files.length) addImageFiles(Array.from(e.dataTransfer.files))
}

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || chatStore.isStreaming || overLimit.value) return
  inputText.value = ''

  if (agentStore.uiMode === 'team') {
    await chatStore.sendTeam(text)
  } else {
    const images = pendingImages.value.map((p) => ({ data: p.data, media_type: p.media_type }))
    pendingImages.value.forEach((p) => URL.revokeObjectURL(p.preview))
    pendingImages.value = []
    await chatStore.sendSingle(text, images)
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

async function cleanupEmpty() {
  const n = await sessionStore.cleanupEmpty()
  alert(n > 0 ? `已清理 ${n} 个空会话` : '没有空会话需要清理')
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
          <span :class="chatStore.isStreaming ? 'text-green-500' : ''">{{ chatStore.isStreaming ? '● streaming' : '○ idle' }}</span>
          <button class="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors" @click="router.push('/skills')">🛒 Skills</button>
          <button class="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors" @click="router.push('/logs')">Logs</button>
        </div>
      </div>
    </header>

    <div class="flex-1 grid grid-cols-1 lg:grid-cols-[320px_1fr] overflow-hidden">
      <!-- Sidebar -->
      <aside class="hidden lg:flex flex-col border-r border-gray-200 dark:border-gray-700 overflow-y-auto p-4 space-y-4">
        <SessionList />
        <div class="space-y-1">
          <label class="text-xs text-gray-500 dark:text-gray-400 font-medium">交互类型</label>
          <div class="flex gap-2">
            <select v-model="agentStore.uiMode" class="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50">
              <option value="single">单 Agent</option>
              <option value="team">Multi-Agent</option>
            </select>
            <select v-if="agentStore.uiMode === 'team'" v-model="agentStore.teamMode" class="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50">
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
          <button class="w-full rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 px-3 py-2 text-sm font-medium transition-colors" @click="newSession">新建 Session</button>
          <button class="w-full rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 px-3 py-2 text-sm font-medium transition-colors" @click="cleanupEmpty">清理空会话</button>
          <button class="w-full rounded-lg bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 px-3 py-2 text-sm font-medium transition-colors" @click="chatStore.clearMessages()">清空窗口</button>
        </div>
      </aside>

      <!-- Chat Area -->
      <section class="flex flex-col overflow-hidden">
        <div ref="messagesRef" class="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          <div v-if="chatStore.chatMessages.length === 0 && !chatStore.isStreaming" class="h-full flex items-center justify-center text-sm text-gray-400">
            这个会话还没有消息，发一条开始对话吧 👇
          </div>
          <template v-for="msg in chatStore.chatMessages" :key="msg.id">
            <ChatMessage v-if="msg.role !== 'event'" :msg="msg" />
            <ToolCallBlock v-else-if="msg.type === 'tool_call' || msg.type === 'tool_result'" :msg="msg" />
            <TokenStats v-else-if="msg.type === 'token_stats'" :msg="msg" />
            <!-- 配置错误引导卡片 -->
            <div v-else-if="msg.type === 'config_error'" class="rounded-xl border border-accent/40 bg-accent/5 px-4 py-3 text-sm">
              <div class="font-semibold text-accent mb-2">🔑 {{ (msg.data?.title as string) || '需要配置 API Key' }}</div>
              <ol class="list-decimal pl-5 space-y-1 text-gray-600 dark:text-gray-300">
                <li v-for="(step, i) in ((msg.data?.steps as string[]) || [])" :key="i">{{ step }}</li>
              </ol>
              <div v-if="msg.data?.hint" class="text-xs text-gray-400 mt-2">💡 {{ msg.data.hint }}</div>
              <a v-if="msg.data?.link" :href="(msg.data.link as any).url" target="_blank" class="text-xs text-accent underline mt-1 inline-block">{{ (msg.data.link as any).text }} →</a>
            </div>
            <div v-else-if="msg.type === 'error'" class="text-xs px-3 py-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400">
              {{ msg.content }}
            </div>
            <div v-else class="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400">
              <span class="font-mono text-[10px] mr-2 text-gray-400">{{ msg.type }}</span>{{ msg.content }}
            </div>
          </template>
          <TypingIndicator v-if="chatStore.isStreaming" />
        </div>

        <!-- Composer -->
        <div
          class="shrink-0 border-t border-gray-200 dark:border-gray-700 p-4"
          :class="isDragOver ? 'bg-accent/5' : ''"
          @dragover.prevent="isDragOver = true"
          @dragleave="isDragOver = false"
          @drop="onDrop"
        >
          <!-- 图片预览条 -->
          <div v-if="pendingImages.length" class="flex gap-2 mb-2">
            <div v-for="(img, i) in pendingImages" :key="i" class="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
              <img :src="img.preview" class="w-full h-full object-cover" :alt="img.name" />
              <button class="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white text-[10px] flex items-center justify-center hover:bg-red-500" @click="removeImage(i)">✕</button>
            </div>
          </div>

          <div class="flex gap-2">
            <div class="flex-1 relative">
              <textarea
                v-model="inputText"
                :placeholder="agentStore.uiMode === 'team' ? '输入 topic…' : '输入消息，可粘贴/拖拽/点击📎上传图片'"
                rows="2"
                class="w-full resize-none rounded-xl border bg-white dark:bg-gray-800 px-4 py-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                :class="overLimit ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'"
                @keydown="handleKeydown"
                @paste="onPaste"
              ></textarea>
              <label v-if="agentStore.uiMode === 'single'" class="absolute right-2 bottom-3 cursor-pointer opacity-60 hover:opacity-100" title="上传图片（最多3张）">
                📎
                <input ref="fileInputRef" type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden @change="onFileChange" />
              </label>
            </div>
            <div class="flex flex-col gap-2">
              <button class="rounded-xl bg-accent hover:bg-accent/90 disabled:opacity-50 text-white px-4 py-2 text-sm font-medium transition-colors" :disabled="!canSend" @click="handleSend">发送</button>
              <button v-if="chatStore.isStreaming" class="rounded-xl bg-red-500 hover:bg-red-600 text-white px-4 py-2 text-sm font-medium transition-colors" @click="chatStore.stopStream()">停止</button>
            </div>
          </div>
          <div class="flex justify-end mt-1">
            <span class="text-xs" :class="overLimit ? 'text-red-500 font-bold' : 'text-gray-400'">{{ inputText.length }}/{{ CHAR_LIMIT }}</span>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
