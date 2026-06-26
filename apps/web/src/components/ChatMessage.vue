<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '../composables/useMarkdown'
import type { ChatMessage } from '../stores/chat'

const props = defineProps<{ msg: ChatMessage }>()

const html = computed(() => {
  if (props.msg.role === 'event') return ''
  if (!props.msg.content) return ''
  return renderMarkdown(props.msg.content)
})

const bubbleClass = computed(() => {
  if (props.msg.role === 'user') {
    return 'ml-auto bg-accent/10 border-accent/30'
  }
  return 'mr-auto bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
})

function setFeedback(v: 'up' | 'down') {
  props.msg.feedback = props.msg.feedback === v ? null : v
}
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

      <!-- 图片附件 -->
      <div v-if="msg.attachments && msg.attachments.length" class="flex flex-wrap gap-2 mb-2">
        <img
          v-for="(url, i) in msg.attachments"
          :key="i"
          :src="url"
          class="max-w-[160px] max-h-[160px] rounded-lg border border-gray-200 dark:border-gray-700 object-cover"
          alt="attachment"
        />
      </div>

      <div v-if="html" class="markdown-body" v-html="html"></div>

      <!-- 反馈按钮（仅 assistant 且有内容）-->
      <div v-if="msg.role === 'assistant' && msg.content" class="flex gap-2 mt-2">
        <button
          class="text-xs px-2 py-0.5 rounded border transition-colors"
          :class="msg.feedback === 'up'
            ? 'border-green-500 text-green-600 bg-green-50 dark:bg-green-900/20'
            : 'border-gray-200 dark:border-gray-700 text-gray-400 hover:text-green-500 hover:border-green-500'"
          title="有帮助"
          @click="setFeedback('up')"
        >👍</button>
        <button
          class="text-xs px-2 py-0.5 rounded border transition-colors"
          :class="msg.feedback === 'down'
            ? 'border-red-500 text-red-600 bg-red-50 dark:bg-red-900/20'
            : 'border-gray-200 dark:border-gray-700 text-gray-400 hover:text-red-500 hover:border-red-500'"
          title="不太对"
          @click="setFeedback('down')"
        >👎</button>
      </div>
    </div>
  </div>
</template>
