<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  createMemory,
  deleteMemory,
  deleteUploadedFile,
  getFileText,
  listFiles,
  listMemories,
  uploadKnowledgeFile,
  type MemoryItem,
  type UploadedFileItem,
} from '../composables/useApi'

const router = useRouter()
const memories = ref<MemoryItem[]>([])
const files = ref<UploadedFileItem[]>([])
const key = ref('interview_goal')
const value = ref('')
const loading = ref(false)
const error = ref('')
const selectedText = ref('')

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    const [m, f] = await Promise.all([listMemories(), listFiles()])
    memories.value = m.memories
    files.value = f.files
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function addMemory() {
  if (!key.value.trim() || !value.value.trim()) return
  await createMemory({ key: key.value.trim(), value: value.value.trim(), category: 'manual' })
  value.value = ''
  await refresh()
}

async function removeMemory(id: string) {
  await deleteMemory(id)
  await refresh()
}

async function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  await uploadKnowledgeFile(file)
  input.value = ''
  await refresh()
}

async function previewFile(id: string) {
  const res = await getFileText(id)
  selectedText.value = res.text
}

async function removeFile(id: string) {
  await deleteUploadedFile(id)
  selectedText.value = ''
  await refresh()
}

onMounted(refresh)
</script>

<template>
  <div class="min-h-screen bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
    <header class="flex items-center justify-between border-b border-gray-200 px-5 py-3 dark:border-gray-700">
      <div>
        <h1 class="text-base font-semibold">M16 · Memory & Files</h1>
        <p class="text-xs text-gray-500">长期记忆 + 文件文本化链路，都会注入 Agent 上下文。</p>
      </div>
      <button class="rounded bg-gray-200 px-3 py-1 text-sm dark:bg-gray-700" @click="router.push('/')">返回聊天</button>
    </header>

    <main class="grid gap-4 p-5 lg:grid-cols-2">
      <section class="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
        <h2 class="mb-3 font-semibold">长期记忆</h2>
        <div class="mb-4 grid gap-2 md:grid-cols-[180px_1fr_auto]">
          <input v-model="key" class="rounded border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" placeholder="key" />
          <input v-model="value" class="rounded border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" placeholder="例如：我正在准备 Agent 应用工程师面试" />
          <button class="rounded bg-accent px-3 py-2 text-sm text-white" @click="addMemory">添加</button>
        </div>
        <div class="space-y-2">
          <div v-for="m in memories" :key="m.id" class="rounded border border-gray-200 p-3 text-sm dark:border-gray-700">
            <div class="flex items-center justify-between gap-2">
              <div class="font-mono text-xs text-accent">{{ m.key }}</div>
              <button class="text-xs text-red-500" @click="removeMemory(m.id)">删除</button>
            </div>
            <div class="mt-1">{{ m.value }}</div>
            <div class="mt-1 text-xs text-gray-400">{{ m.category }} · {{ m.source }}</div>
          </div>
          <div v-if="!memories.length" class="text-sm text-gray-400">暂无记忆。</div>
        </div>
      </section>

      <section class="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
        <h2 class="mb-3 font-semibold">文件处理链路</h2>
        <label class="mb-4 inline-block cursor-pointer rounded bg-gray-200 px-3 py-2 text-sm dark:bg-gray-700">
          上传文件
          <input type="file" class="hidden" @change="onFileChange" />
        </label>
        <div class="space-y-2">
          <div v-for="f in files" :key="f.id" class="rounded border border-gray-200 p-3 text-sm dark:border-gray-700">
            <div class="flex items-center justify-between gap-2">
              <div>
                <div class="font-medium">{{ f.filename }}</div>
                <div class="text-xs" :class="f.status === 'processed' ? 'text-green-500' : 'text-red-500'">{{ f.status }} · {{ f.size_bytes }} bytes</div>
              </div>
              <div class="flex gap-2">
                <button class="text-xs text-accent" :disabled="f.status !== 'processed'" @click="previewFile(f.id)">预览</button>
                <button class="text-xs text-red-500" @click="removeFile(f.id)">删除</button>
              </div>
            </div>
            <p v-if="f.error_message" class="mt-2 text-xs text-red-500">{{ f.error_message }}</p>
            <p v-else-if="f.text_preview" class="mt-2 line-clamp-2 text-xs text-gray-500">{{ f.text_preview }}</p>
          </div>
          <div v-if="!files.length" class="text-sm text-gray-400">暂无上传文件。</div>
        </div>
      </section>
    </main>

    <section v-if="selectedText" class="mx-5 mb-5 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
      <h2 class="mb-2 font-semibold">文件全文预览</h2>
      <pre class="max-h-80 overflow-auto whitespace-pre-wrap text-xs">{{ selectedText }}</pre>
    </section>

    <div v-if="loading" class="px-5 text-sm text-gray-400">加载中...</div>
    <div v-if="error" class="px-5 text-sm text-red-500">{{ error }}</div>
  </div>
</template>
