<script setup lang="ts">
import { useAgentStore } from '../stores/agent'

const agentStore = useAgentStore()
</script>

<template>
  <div class="space-y-1">
    <label class="text-xs text-gray-500 dark:text-gray-400 font-medium">Agent 模式</label>
    <select
      v-model="agentStore.selectedAgent"
      class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
    >
      <option v-for="a in agentStore.agents" :key="a.key" :value="a.key" :title="a.description">
        {{ a.name }}
      </option>
    </select>
  </div>
</template>
