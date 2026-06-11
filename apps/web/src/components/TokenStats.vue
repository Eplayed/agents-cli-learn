<script setup lang="ts">
import type { ChatMessage } from '../stores/chat'

const props = defineProps<{ msg: ChatMessage }>()
const stats = props.msg.data || {}
</script>

<template>
  <div class="flex flex-wrap items-center gap-3 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-xs text-blue-800 dark:text-blue-300">
    <span>📊 Token</span>
    <span class="font-mono">{{ stats.total_tokens || 0 }}</span>
    <span class="text-gray-500 dark:text-gray-400">(入 {{ stats.input_tokens || 0 }} / 出 {{ stats.output_tokens || 0 }})</span>
    <span>· 模型: {{ stats.model || '?' }}</span>
    <span>· 费用: {{ stats.cost_display || '?' }}</span>
    <span>· LLM调用: {{ stats.llm_calls || 0 }}次</span>
  </div>
</template>
