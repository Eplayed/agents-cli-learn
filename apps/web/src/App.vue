<script setup lang="ts">
import { onMounted, ref } from 'vue'

const isDark = ref(true)

onMounted(() => {
  // 跟随系统主题
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  isDark.value = mq.matches
  document.documentElement.classList.toggle('dark', isDark.value)
  mq.addEventListener('change', (e) => {
    isDark.value = e.matches
    document.documentElement.classList.toggle('dark', isDark.value)
  })
})
</script>

<template>
  <router-view />
</template>
