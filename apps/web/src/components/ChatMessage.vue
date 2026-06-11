<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'
import type { ChatMessage } from '../stores/chat'

const props = defineProps<{ msg: ChatMessage }>()

const html = computed(() => {
  if (props.msg.role === 'event') return ''
  if (!props.msg.content) return ''
  return marked.parse(props.msg.content, { async: false }) as string
})

const bubbleClass = computed(() => {
  if (props.msg.role === 'user') {
    return 'ml-auto bg-accent/10 border-accent/30'
  }
  return 'mr-auto bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
})
</script>

<template>
  <div v-if="msg.role !== 'event'" class="flex w-full" :class="msg.role === 'user' ? 'justify-end' : 'justify-start'">
    <div
      class="max-w-[80%] rounded-xl border px-4 py-3 text-sm leading-relaxed shadow-sm"
      :class="bubbleClass"
    >
      <div class="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
        {{ msg.role === 'user' ? '你' : 'Assistant' }}
      </div>
      <div class="markdown-body" v-html="html"></div>
    </div>
  </div>
</template>
