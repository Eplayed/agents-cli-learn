<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  listTestTypes, getTestPresets, runTest, listTestHistory,
  getTestHistoryDetail, deleteTestHistory,
  type TestTypeInfo, type TestSuiteResponse, type TestRunSummary,
} from '../composables/useApi'

const router = useRouter()

type Tab = 'run' | 'history'
const tab = ref<Tab>('run')

const testTypes = ref<TestTypeInfo[]>([])
const selectedType = ref<string>('')
const presetCases = ref<Record<string, unknown>[]>([])
const casesJson = ref('')
const runsCount = ref(3)
const running = ref(false)
const toast = ref('')

const result = ref<TestSuiteResponse | null>(null)
const history = ref<TestRunSummary[]>([])
const loadingHistory = ref(false)

const selectedInfo = computed(() => testTypes.value.find((t) => t.key === selectedType.value))

function showToast(msg: string) {
  toast.value = msg
  setTimeout(() => (toast.value = ''), 2500)
}

async function loadTypes() {
  const data = await listTestTypes()
  testTypes.value = data.types
  if (!selectedType.value && testTypes.value.length) {
    selectType(testTypes.value[0].key)
  }
}

async function selectType(key: string) {
  selectedType.value = key
  result.value = null
  try {
    const data = await getTestPresets(key)
    presetCases.value = data.cases
    casesJson.value = JSON.stringify(data.cases, null, 2)
  } catch {
    presetCases.value = []
    casesJson.value = '[]'
  }
}

function resetToPreset() {
  casesJson.value = JSON.stringify(presetCases.value, null, 2)
}

async function doRun() {
  if (!selectedType.value) return
  let cases: unknown[] | undefined
  try {
    cases = JSON.parse(casesJson.value)
  } catch {
    showToast('✗ 用例 JSON 格式错误，请检查后重试')
    return
  }

  running.value = true
  result.value = null
  try {
    const data = await runTest(selectedType.value, { cases, runs: runsCount.value })
    result.value = data
    showToast(`✓ 测试完成：${data.passed}/${data.total} 通过`)
    if (tab.value === 'history') await loadHistory()
  } catch (e: any) {
    showToast(`✗ 运行失败: ${e.message || e}`)
  }
  running.value = false
}

async function loadHistory() {
  loadingHistory.value = true
  try {
    const data = await listTestHistory()
    history.value = data.runs
  } catch {
    history.value = []
  }
  loadingHistory.value = false
}

async function viewHistoryDetail(id: string) {
  try {
    const data = await getTestHistoryDetail(id)
    result.value = data
    tab.value = 'run'
    selectedType.value = data.test_type
  } catch (e: any) {
    showToast(`✗ 加载失败: ${e.message || e}`)
  }
}

async function removeHistory(id: string) {
  if (!confirm('删除这条历史记录？')) return
  await deleteTestHistory(id)
  await loadHistory()
}

function switchTab(t: Tab) {
  tab.value = t
  if (t === 'history') loadHistory()
}

function typeLabel(key: string) {
  return testTypes.value.find((t) => t.key === key)?.label || key
}

function fmtTime(ts: string) {
  return new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

onMounted(loadTypes)
</script>

<template>
  <div class="min-h-screen max-w-6xl mx-auto px-5 py-4">
    <!-- Header -->
    <header class="flex items-center gap-4 border-b border-gray-200 dark:border-gray-700 pb-3 mb-4">
      <button class="text-sm text-gray-500 hover:text-accent" @click="router.push('/')">← 返回对话</button>
      <h1 class="text-lg font-bold">🧪 AI 测试</h1>
      <div class="flex-1"></div>
      <div class="flex gap-1">
        <button
          v-for="t in (['run', 'history'] as Tab[])"
          :key="t"
          class="px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors"
          :class="tab === t ? 'bg-accent/10 border-accent text-accent' : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-accent'"
          @click="switchTab(t)"
        >{{ t === 'run' ? '运行测试' : '历史记录' }}</button>
      </div>
    </header>

    <!-- ============ 运行测试 ============ -->
    <div v-if="tab === 'run'" class="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
      <!-- 测试类型列表 -->
      <aside class="space-y-2">
        <div
          v-for="t in testTypes"
          :key="t.key"
          class="rounded-xl border p-3 cursor-pointer transition-colors"
          :class="selectedType === t.key ? 'border-accent bg-accent/5' : 'border-gray-200 dark:border-gray-700 hover:border-accent/50'"
          @click="selectType(t.key)"
        >
          <div class="text-sm font-bold">{{ t.label }}</div>
          <div class="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{{ t.description }}</div>
        </div>
      </aside>

      <!-- 主区：用例编辑 + 运行 + 结果 -->
      <main class="space-y-4">
        <div v-if="selectedInfo" class="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div class="flex items-center justify-between mb-2">
            <h2 class="text-base font-bold">{{ selectedInfo.label }}</h2>
            <div class="flex items-center gap-2">
              <label v-if="selectedType === 'prompt_stability'" class="text-xs text-gray-500 flex items-center gap-1">
                重复次数
                <input v-model.number="runsCount" type="number" min="2" max="10" class="w-14 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-1.5 py-0.5 text-xs" />
              </label>
              <button class="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:border-accent" @click="resetToPreset">恢复预置用例</button>
              <button
                class="text-xs px-4 py-1.5 rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-50"
                :disabled="running"
                @click="doRun"
              >{{ running ? '⏳ 运行中…' : '▶ 运行测试' }}</button>
            </div>
          </div>
          <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">{{ selectedInfo.description }}</p>

          <details class="text-xs">
            <summary class="cursor-pointer text-gray-500 hover:text-accent select-none">📝 查看 / 编辑测试用例（JSON）</summary>
            <textarea
              v-model="casesJson"
              rows="10"
              class="w-full mt-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 px-3 py-2 font-mono text-[11px] focus:outline-none focus:ring-2 focus:ring-accent/50"
            ></textarea>
          </details>
        </div>

        <!-- 运行结果 -->
        <div v-if="result" class="space-y-3">
          <div class="rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4">
            <div class="text-2xl">{{ result.pass_rate === 1 ? '✅' : result.pass_rate >= 0.5 ? '⚠️' : '❌' }}</div>
            <div class="flex-1">
              <div class="text-sm font-bold">{{ typeLabel(result.test_type) }} · {{ result.passed }}/{{ result.total }} 通过（{{ Math.round(result.pass_rate * 100) }}%）</div>
              <div class="text-xs text-gray-400">耗时 {{ result.duration_ms }}ms · {{ result.created_at ? fmtTime(result.created_at) : '' }}</div>
            </div>
          </div>

          <div
            v-for="c in result.cases"
            :key="c.case_id"
            class="rounded-xl border p-3"
            :class="c.passed ? 'border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-900/10' : 'border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-900/10'"
          >
            <div class="flex items-center gap-2 mb-1">
              <span>{{ c.passed ? '✅' : '❌' }}</span>
              <span class="text-xs font-mono text-gray-400">{{ c.case_id }}</span>
              <span class="text-xs text-gray-400 ml-auto">{{ c.duration_ms }}ms</span>
            </div>
            <div class="text-sm mb-1"><span class="text-gray-400 text-xs">输入：</span>{{ c.input }}</div>
            <div v-if="c.output" class="text-sm text-gray-600 dark:text-gray-300 mb-1"><span class="text-gray-400 text-xs">输出：</span>{{ c.output }}</div>
            <div v-if="c.reasons?.length" class="mt-1 space-y-0.5">
              <div v-for="(r, i) in c.reasons" :key="i" class="text-xs text-red-500">✗ {{ r }}</div>
            </div>
            <details v-if="c.details && Object.keys(c.details).length" class="mt-1">
              <summary class="text-xs text-gray-400 cursor-pointer select-none">详情</summary>
              <pre class="text-[11px] text-gray-500 mt-1 whitespace-pre-wrap">{{ JSON.stringify(c.details, null, 2) }}</pre>
            </details>
          </div>
        </div>
      </main>
    </div>

    <!-- ============ 历史记录 ============ -->
    <div v-else class="space-y-2">
      <div v-if="loadingHistory" class="text-center py-12 text-gray-400 text-sm">加载中…</div>
      <div v-else-if="history.length === 0" class="text-center py-12 text-gray-400 text-sm">还没有运行过测试，去「运行测试」试试</div>
      <div
        v-for="h in history"
        :key="h.id"
        class="rounded-xl border border-gray-200 dark:border-gray-700 p-3 flex items-center gap-4 cursor-pointer hover:border-accent/50"
        @click="viewHistoryDetail(h.id)"
      >
        <div class="text-xl">{{ h.pass_rate === 1 ? '✅' : h.pass_rate >= 0.5 ? '⚠️' : '❌' }}</div>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-bold">{{ typeLabel(h.test_type) }}</div>
          <div class="text-xs text-gray-400">{{ h.agent_key || '-' }} · {{ h.passed }}/{{ h.total }} 通过 · {{ fmtTime(h.created_at) }}</div>
        </div>
        <div class="text-sm font-mono" :class="h.pass_rate === 1 ? 'text-green-500' : 'text-red-500'">{{ Math.round(h.pass_rate * 100) }}%</div>
        <button class="text-gray-400 hover:text-red-500 text-xs px-1" @click.stop="removeHistory(h.id)">✕</button>
      </div>
    </div>

    <!-- Toast -->
    <div v-if="toast" class="fixed bottom-5 left-1/2 -translate-x-1/2 bg-white dark:bg-gray-800 border border-accent rounded-lg px-5 py-2.5 text-sm shadow-lg">{{ toast }}</div>
  </div>
</template>
