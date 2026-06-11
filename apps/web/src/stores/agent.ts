import { defineStore } from 'pinia'
import { ref } from 'vue'
import { listModels, listAgents, type AgentInfo } from '../composables/useApi'

export const useAgentStore = defineStore('agent', () => {
  const models = ref<string[]>([])
  const defaultModel = ref('')
  const selectedModel = ref('')

  const agents = ref<AgentInfo[]>([])
  const defaultAgent = ref('')
  const selectedAgent = ref('')

  // UI 交互模式
  const uiMode = ref<'single' | 'team'>('single')
  const teamMode = ref<'sequential' | 'parallel' | 'supervisor' | 'groupchat'>('sequential')

  async function loadModels() {
    try {
      const data = await listModels()
      models.value = data.models
      defaultModel.value = data.default
      if (!selectedModel.value) selectedModel.value = data.default
    } catch {
      models.value = []
    }
  }

  async function loadAgents() {
    try {
      const data = await listAgents()
      agents.value = data.agents
      defaultAgent.value = data.default
      if (!selectedAgent.value) selectedAgent.value = data.default
    } catch {
      agents.value = []
    }
  }

  return {
    models,
    defaultModel,
    selectedModel,
    agents,
    defaultAgent,
    selectedAgent,
    uiMode,
    teamMode,
    loadModels,
    loadAgents,
  }
})
