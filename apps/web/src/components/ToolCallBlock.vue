<script setup lang="ts">
import { ref } from 'vue'
import type { ChatMessage } from '../stores/chat'

const props = defineProps<{ msg: ChatMessage }>()
const expanded = ref(false)

const toolName = props.msg.data?.name as string || 'tool'
const isResult = props.msg.type === 'tool_result'
</script>

<template>
  <div class="my-1 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-xs">
    <button
      class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      @click="expanded = !expanded"
    >
      <span class="font-mono" :class="isResult ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'">
        {{ isResult ? '✓' : '⚙' }}
      </span>
      <span class="font-medium">{{ isResult ? 'Result' : 'Call' }}: {{ toolName }}</span>
      <span class="ml-auto text-gray-400">{{ expanded ? '▾' : '▸' }}</span>
    </button>
    <div v-if="expanded" class="border-t border-gray-200 dark:border-gray-700 px-3 py-2 bg-gray-50 dark:bg-gray-900">
      <pre class="whitespace-pre-wrap break-all text-gray-700 dark:text-gray-300">{{
        isResult
          ? (msg.data?.output ?? '(no output)')
          : JSON.stringify(msg.data?.input ?? msg.data, null, 2)
      }}</pre>
    </div>
  </div>
</template>
