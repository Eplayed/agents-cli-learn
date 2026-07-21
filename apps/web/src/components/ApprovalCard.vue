<script setup lang="ts">
/**
 * HITL 人审卡片（M14）
 * 高危工具执行前展示，用户点"批准/拒绝"决定是否执行。
 */
import { computed } from 'vue'
import type { ChatMessage } from '../stores/chat'
import { useChatStore } from '../stores/chat'
import { getToolDisplayName } from '../composables/toolDisplay'

const props = defineProps<{ msg: ChatMessage }>()
const chat = useChatStore()

const toolName = computed(() => (props.msg.data?.tool as string) || '未知工具')
const displayName = computed(() => getToolDisplayName(toolName.value))
const taskId = computed(() => (props.msg.data?.task_id as string) || '')
const args = computed(() => props.msg.data?.args ?? {})
const resolved = computed(() => Boolean(props.msg.data?.resolved))
const approved = computed(() => Boolean(props.msg.data?.approved))

function decide(ok: boolean) {
  if (resolved.value || !taskId.value) return
  chat.approveTask(taskId.value, ok)
}
</script>

<template>
  <div class="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm">
    <div class="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-300">
      <span>⚠️ 需要人工确认</span>
      <span class="text-xs font-normal text-amber-700/70 dark:text-amber-400/70">高危操作</span>
    </div>
    <div class="mt-2 text-gray-700 dark:text-gray-300">
      即将执行工具：<strong>{{ displayName }}</strong>
      <span class="font-mono text-xs text-gray-400">({{ toolName }})</span>
    </div>
    <pre class="mt-1 whitespace-pre-wrap break-all rounded bg-black/5 dark:bg-white/5 px-2 py-1 text-xs text-gray-600 dark:text-gray-400">{{ JSON.stringify(args, null, 2) }}</pre>

    <div v-if="!resolved" class="mt-3 flex gap-2">
      <button
        class="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
        @click="decide(true)"
      >批准执行</button>
      <button
        class="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
        @click="decide(false)"
      >拒绝</button>
    </div>
    <div v-else class="mt-3 text-xs font-medium" :class="approved ? 'text-green-600' : 'text-gray-500'">
      {{ approved ? '✓ 已批准，正在执行…' : '✕ 已拒绝，操作取消' }}
    </div>
  </div>
</template>
