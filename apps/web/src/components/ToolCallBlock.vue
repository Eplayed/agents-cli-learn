<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import type { ChatMessage } from '../stores/chat'
import { getToolDisplayName, isPseudoToolEvent } from '../composables/toolDisplay'

const props = defineProps<{ msg: ChatMessage }>()
const expanded = ref(false)

const rawName = computed(() => (props.msg.data?.name as string) || 'tool')
const displayName = computed(() => getToolDisplayName(rawName.value))
const isPseudo = computed(() => isPseudoToolEvent(rawName.value))

// M12 P0：流式可视化——running = 还在等 tool_result，done = 已收到结果（或后端伪事件本就是一次性通知）
const isRunning = computed(() => props.msg.toolStatus === 'running')

// 项目里的工具（天气/计算器/搜索/时间）都是一次性同步返回，没有可拆解的"已完成 N%"这类内容进度。
// 与其伪造假进度文案，不如展示真实的耗时秒数——用户至少能感知到"还在处理、处理了多久"，
// 而不是面对一个完全静默、无法判断是卡住还是正常运行的转圈图标。
const elapsedMs = ref(0)
let timer: ReturnType<typeof setInterval> | null = null
const startedAt = props.msg.timestamp

function startTicking() {
  stopTicking()
  timer = setInterval(() => {
    elapsedMs.value = Date.now() - startedAt
  }, 200)
}
function stopTicking() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

onMounted(() => {
  if (isRunning.value) startTicking()
})
onUnmounted(stopTicking)
watch(isRunning, (running) => {
  if (running) startTicking()
  else stopTicking()
})

const elapsedLabel = computed(() => `${(elapsedMs.value / 1000).toFixed(1)}s`)

const statusLabel = computed(() => {
  if (isPseudo.value) return '通知'
  return isRunning.value ? `正在调用…（${elapsedLabel.value}）` : '调用完成'
})
</script>

<template>
  <div class="my-1 rounded-lg border overflow-hidden text-xs transition-colors" :class="isRunning ? 'border-accent/40 bg-accent/5' : 'border-gray-200 dark:border-gray-700'">
    <button
      class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      @click="expanded = !expanded"
    >
      <span v-if="isRunning" class="inline-block w-3 h-3 rounded-full border-2 border-accent border-t-transparent animate-spin" aria-hidden="true"></span>
      <span v-else class="font-mono" :class="isPseudo ? 'text-blue-500 dark:text-blue-400' : 'text-green-600 dark:text-green-400'">
        {{ isPseudo ? 'ℹ' : '✓' }}
      </span>
      <span class="font-medium">{{ displayName }}</span>
      <span class="text-gray-400" :class="isRunning ? 'text-accent' : ''">{{ statusLabel }}</span>
      <span class="ml-auto text-gray-400">{{ expanded ? '▾' : '▸' }}</span>
    </button>
    <div v-if="expanded" class="border-t border-gray-200 dark:border-gray-700 px-3 py-2 bg-gray-50 dark:bg-gray-900">
      <div v-if="rawName !== displayName" class="text-[10px] text-gray-400 mb-1 font-mono">原始工具名：{{ rawName }}</div>
      <pre v-if="!isRunning" class="whitespace-pre-wrap break-all text-gray-700 dark:text-gray-300">{{ msg.data?.output ?? JSON.stringify(msg.data?.input ?? msg.data, null, 2) }}</pre>
      <pre v-else class="whitespace-pre-wrap break-all text-gray-500 dark:text-gray-400">入参：{{ JSON.stringify(msg.data?.input ?? {}, null, 2) }}</pre>
    </div>
  </div>
</template>
