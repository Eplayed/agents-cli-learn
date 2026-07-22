<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  createScheduledTask,
  deleteScheduledTask,
  listScheduledRuns,
  listScheduledTasks,
  pauseScheduledTask,
  resumeScheduledTask,
  triggerScheduledTask,
  type ScheduledRunItem,
  type ScheduledTaskItem,
} from '../composables/useApi'

const router = useRouter()
const tasks = ref<ScheduledTaskItem[]>([])
const runs = ref<ScheduledRunItem[]>([])
const selectedTaskId = ref('')
const name = ref('每日项目复盘')
const prompt = ref('请总结当前项目最近一次对话的进展和下一步。')
const interval = ref(300)
const error = ref('')

async function refresh() {
  error.value = ''
  try {
    const res = await listScheduledTasks()
    tasks.value = res.tasks
    if (selectedTaskId.value) await loadRuns(selectedTaskId.value)
  } catch (e) {
    error.value = (e as Error).message
  }
}

async function addTask() {
  await createScheduledTask({ name: name.value, prompt: prompt.value, interval_seconds: interval.value })
  await refresh()
}

async function loadRuns(id: string) {
  selectedTaskId.value = id
  const res = await listScheduledRuns(id)
  runs.value = res.runs
}

async function trigger(id: string) {
  await triggerScheduledTask(id)
  await refresh()
  await loadRuns(id)
}

async function pauseOrResume(task: ScheduledTaskItem) {
  if (task.enabled) await pauseScheduledTask(task.id)
  else await resumeScheduledTask(task.id)
  await refresh()
}

async function removeTask(id: string) {
  await deleteScheduledTask(id)
  if (selectedTaskId.value === id) {
    selectedTaskId.value = ''
    runs.value = []
  }
  await refresh()
}

onMounted(refresh)
</script>

<template>
  <div class="min-h-screen bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
    <header class="flex items-center justify-between border-b border-gray-200 px-5 py-3 dark:border-gray-700">
      <div>
        <h1 class="text-base font-semibold">M18 · Scheduled Tasks</h1>
        <p class="text-xs text-gray-500">支持 interval 任务、手动触发、暂停/恢复和运行历史。</p>
      </div>
      <button class="rounded bg-gray-200 px-3 py-1 text-sm dark:bg-gray-700" @click="router.push('/')">返回聊天</button>
    </header>

    <main class="grid gap-4 p-5 lg:grid-cols-[420px_1fr]">
      <section class="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
        <h2 class="mb-3 font-semibold">创建任务</h2>
        <div class="space-y-2">
          <input v-model="name" class="w-full rounded border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" placeholder="任务名" />
          <textarea v-model="prompt" rows="4" class="w-full rounded border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" placeholder="要定时执行的 prompt"></textarea>
          <label class="block text-xs text-gray-500">间隔秒数（最小 60）</label>
          <input v-model.number="interval" type="number" min="60" class="w-full rounded border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
          <button class="rounded bg-accent px-3 py-2 text-sm text-white" @click="addTask">创建</button>
        </div>

        <h2 class="mb-3 mt-6 font-semibold">任务列表</h2>
        <div class="space-y-2">
          <div v-for="task in tasks" :key="task.id" class="rounded border border-gray-200 p-3 text-sm dark:border-gray-700">
            <div class="flex items-start justify-between gap-2">
              <div>
                <div class="font-medium">{{ task.name }}</div>
                <div class="text-xs text-gray-400">interval={{ task.interval_seconds }}s · runs={{ task.run_count }} · {{ task.enabled ? 'enabled' : 'paused' }}</div>
                <div class="mt-1 line-clamp-2 text-xs text-gray-500">{{ task.prompt }}</div>
              </div>
            </div>
            <div class="mt-3 flex gap-2">
              <button class="text-xs text-accent" @click="trigger(task.id)">立即触发</button>
              <button class="text-xs text-accent" @click="pauseOrResume(task)">{{ task.enabled ? '暂停' : '恢复' }}</button>
              <button class="text-xs text-accent" @click="loadRuns(task.id)">运行历史</button>
              <button class="text-xs text-red-500" @click="removeTask(task.id)">删除</button>
            </div>
          </div>
          <div v-if="!tasks.length" class="text-sm text-gray-400">暂无定时任务。</div>
        </div>
      </section>

      <section class="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
        <h2 class="mb-3 font-semibold">运行历史</h2>
        <div class="space-y-2">
          <div v-for="run in runs" :key="run.id" class="rounded border border-gray-200 p-3 text-sm dark:border-gray-700">
            <div class="flex items-center justify-between">
              <span class="font-mono text-xs">{{ run.id }}</span>
              <span :class="run.status === 'completed' ? 'text-green-500' : run.status === 'failed' ? 'text-red-500' : 'text-yellow-500'">{{ run.status }}</span>
            </div>
            <div class="mt-1 text-xs text-gray-400">{{ run.trigger }} · {{ run.started_at }}</div>
            <div v-if="run.error_message" class="mt-1 text-xs text-red-500">{{ run.error_message }}</div>
          </div>
          <div v-if="!runs.length" class="text-sm text-gray-400">选择一个任务查看运行历史。</div>
        </div>
      </section>
    </main>

    <div v-if="error" class="px-5 text-sm text-red-500">{{ error }}</div>
  </div>
</template>
