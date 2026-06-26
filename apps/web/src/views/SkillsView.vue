<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  listInstalledSkills, listLocalSkills, searchOnlineSkills,
  installSkill, toggleSkill, uninstallSkill, type SkillItem,
} from '../composables/useApi'

const router = useRouter()
type Tab = 'online' | 'installed' | 'local'
const tab = ref<Tab>('online')
const search = ref('')
const loading = ref(false)
const toast = ref('')

const onlineSkills = ref<SkillItem[]>([])
const installedSkills = ref<SkillItem[]>([])
const localSkills = ref<SkillItem[]>([])

let searchTimer: number | undefined

function showToast(msg: string) {
  toast.value = msg
  setTimeout(() => (toast.value = ''), 2500)
}

function isInstalled(name: string) {
  return installedSkills.value.some((s) => s.name === name)
}

async function loadInstalledAndLocal() {
  const [inst, local] = await Promise.all([listInstalledSkills(), listLocalSkills()])
  installedSkills.value = inst.skills || []
  localSkills.value = local.skills || []
}

async function runOnlineSearch(q: string) {
  loading.value = true
  try {
    const data = await searchOnlineSkills(q)
    onlineSkills.value = data.skills || []
  } catch {
    onlineSkills.value = []
  }
  loading.value = false
}

function onSearchInput() {
  if (tab.value !== 'online') return
  clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => {
    const q = search.value.trim()
    runOnlineSearch(q || 'AI agent skill')
  }, 500)
}

function switchTab(t: Tab) {
  tab.value = t
  if (t === 'online' && onlineSkills.value.length === 0) {
    runOnlineSearch('AI agent skill')
  }
}

async function doInstall(skill: SkillItem) {
  try {
    await installSkill(skill)
    showToast(`✓ 已安装: ${skill.display_name || skill.name}`)
    await loadInstalledAndLocal()
  } catch (e: any) {
    showToast(`✗ ${e.message || '安装失败'}`)
  }
}

async function doToggle(slug: string, name: string) {
  await toggleSkill(slug)
  showToast(`已切换: ${name}`)
  await loadInstalledAndLocal()
}

async function doUninstall(slug: string, name: string) {
  if (!confirm(`确定卸载「${name}」？`)) return
  await uninstallSkill(slug)
  showToast(`✓ 已卸载: ${name}`)
  await loadInstalledAndLocal()
}

onMounted(async () => {
  await loadInstalledAndLocal()
  await runOnlineSearch('AI agent skill')
})
</script>

<template>
  <div class="min-h-screen max-w-5xl mx-auto px-5 py-4">
    <!-- Header -->
    <header class="flex items-center gap-4 border-b border-gray-200 dark:border-gray-700 pb-3 mb-4">
      <button class="text-sm text-gray-500 hover:text-accent" @click="router.push('/')">← 返回对话</button>
      <h1 class="text-lg font-bold">🛒 Skill 商店</h1>
      <div class="flex-1"></div>
      <div class="flex gap-1">
        <button
          v-for="t in (['online','installed','local'] as Tab[])"
          :key="t"
          class="px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors"
          :class="tab === t ? 'bg-accent/10 border-accent text-accent' : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-accent'"
          @click="switchTab(t)"
        >{{ t === 'online' ? '在线搜索' : t === 'installed' ? '已安装' : '本地' }}</button>
      </div>
    </header>

    <!-- Search (online only) -->
    <input
      v-if="tab === 'online'"
      v-model="search"
      placeholder="输入关键词搜索在线 Skill（如 python、react、testing）"
      class="w-full mb-4 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
      @input="onSearchInput"
    />

    <!-- Loading -->
    <div v-if="loading" class="text-center py-12 text-gray-400 text-sm">⏳ 搜索中...</div>

    <!-- Grid -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      <!-- Online -->
      <template v-if="tab === 'online'">
        <div v-for="s in onlineSkills" :key="s.name + (s.source_url || '')" class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 flex flex-col gap-2">
          <div class="flex items-center gap-2">
            <span class="text-2xl">{{ s.icon || '🐙' }}</span>
            <div class="flex-1 min-w-0">
              <div class="font-bold text-sm truncate">{{ s.display_name || s.name }}</div>
              <div class="text-[11px] text-gray-400 flex gap-2">
                <span>{{ s.author }}</span>
                <span v-if="s.stars">⭐ {{ s.stars }}</span>
              </div>
            </div>
          </div>
          <p class="text-xs text-gray-500 dark:text-gray-400 flex-1 line-clamp-3">{{ s.description }}</p>
          <div class="flex gap-2">
            <button v-if="isInstalled(s.name)" disabled class="px-3 py-1.5 rounded-lg text-xs border border-gray-200 dark:border-gray-700 text-gray-400">已安装</button>
            <button v-else class="px-3 py-1.5 rounded-lg text-xs bg-accent text-white hover:bg-accent/90" @click="doInstall(s)">安装</button>
            <a v-if="s.source_url" :href="s.source_url" target="_blank" class="px-3 py-1.5 rounded-lg text-xs border border-gray-200 dark:border-gray-700 hover:border-accent">🔗 源码</a>
          </div>
        </div>
        <div v-if="onlineSkills.length === 0" class="col-span-full text-center py-12 text-gray-400 text-sm">没有找到匹配的 Skill</div>
      </template>

      <!-- Installed -->
      <template v-else-if="tab === 'installed'">
        <div v-for="s in installedSkills" :key="s.id" class="rounded-xl border bg-white dark:bg-gray-800 p-4 flex flex-col gap-2" :class="s.enabled ? 'border-green-300 dark:border-green-800' : 'border-gray-200 dark:border-gray-700 opacity-60'">
          <div class="flex items-center gap-2">
            <span class="text-2xl">{{ s.icon || '🔧' }}</span>
            <div class="flex-1 min-w-0">
              <div class="font-bold text-sm truncate">{{ s.display_name || s.name }}<span v-if="!s.enabled" class="text-[10px] text-gray-400 ml-1">(已禁用)</span></div>
              <div class="text-[11px] text-gray-400">v{{ s.version }}</div>
            </div>
          </div>
          <p class="text-xs text-gray-500 dark:text-gray-400 flex-1 line-clamp-2">{{ s.description }}</p>
          <div class="flex flex-wrap gap-1">
            <span v-for="t in (s.triggers || []).slice(0,4)" :key="t" class="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">{{ t }}</span>
          </div>
          <div class="flex gap-2">
            <button class="px-3 py-1.5 rounded-lg text-xs border" :class="s.enabled ? 'border-gray-200 dark:border-gray-700 text-gray-500' : 'bg-accent text-white'" @click="doToggle(s.id!, s.display_name || s.name)">{{ s.enabled ? '禁用' : '启用' }}</button>
            <button class="px-3 py-1.5 rounded-lg text-xs border border-red-300 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" @click="doUninstall(s.id!, s.display_name || s.name)">卸载</button>
          </div>
        </div>
        <div v-if="installedSkills.length === 0" class="col-span-full text-center py-12 text-gray-400 text-sm">还没有安装任何 Skill，去「在线搜索」看看</div>
      </template>

      <!-- Local -->
      <template v-else>
        <div v-for="s in localSkills" :key="s.name" class="rounded-xl border border-yellow-300 dark:border-yellow-800 bg-white dark:bg-gray-800 p-4 flex flex-col gap-2">
          <div class="flex items-center gap-2">
            <span class="text-2xl">🔧</span>
            <div class="flex-1 min-w-0">
              <div class="font-bold text-sm truncate">{{ s.name }} <span class="text-[10px] text-yellow-600">内置</span></div>
              <div class="text-[11px] text-gray-400">v{{ s.version }}</div>
            </div>
          </div>
          <p class="text-xs text-gray-500 dark:text-gray-400 flex-1 line-clamp-2">{{ s.description }}</p>
          <div class="flex flex-wrap gap-1">
            <span v-for="t in (s.triggers || []).slice(0,4)" :key="t" class="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">{{ t }}</span>
          </div>
          <div class="text-[11px] text-gray-400">只读（编辑请修改 skills/ 目录文件）</div>
        </div>
        <div v-if="localSkills.length === 0" class="col-span-full text-center py-12 text-gray-400 text-sm">没有内置 Skill</div>
      </template>
    </div>

    <!-- Toast -->
    <div v-if="toast" class="fixed bottom-5 left-1/2 -translate-x-1/2 bg-white dark:bg-gray-800 border border-accent rounded-lg px-5 py-2.5 text-sm shadow-lg">{{ toast }}</div>
  </div>
</template>
