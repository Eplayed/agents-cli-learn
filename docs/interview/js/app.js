// 面试题学习站入口（Vue 3, 无构建，CDN ESM）
import { createApp, defineComponent, ref, computed, onMounted } from 'vue';
import Sidebar from './components/Sidebar.js';
import QuestionCard from './components/QuestionCard.js';
import { getModules, getStats } from './data/questions.js';

const STORE_KEY = 'agents_interview_progress_v1';

// localStorage：记录已学会的题 id
function loadLearned() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return new Set();
}
function saveLearned(set) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify([...set]));
  } catch {}
}

const App = defineComponent({
  name: 'InterviewApp',
  components: { Sidebar, QuestionCard },
  setup() {
    const modules = ref(getModules());
    const stats = ref(getStats());
    const activeId = ref(modules.value[0]?.id || '');
    const learnedSet = ref(loadLearned());
    const allExpanded = ref(false);

    const activeModule = computed(
      () => modules.value.find((m) => m.id === activeId.value) || modules.value[0]
    );

    const totalLearned = computed(() => {
      // 只统计课程里出现的题
      let n = 0;
      for (const m of modules.value) {
        for (const q of m.questions) {
          if (learnedSet.value.has(q.id)) n++;
        }
      }
      return n;
    });

    const overallPct = computed(() =>
      stats.value.questionCount
        ? Math.round((totalLearned.value / stats.value.questionCount) * 100)
        : 0
    );

    function selectModule(id) {
      activeId.value = id;
      allExpanded.value = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function toggleLearned(qid) {
      const s = new Set(learnedSet.value);
      if (s.has(qid)) s.delete(qid);
      else s.add(qid);
      learnedSet.value = s;
      saveLearned(s);
    }

    function toggleExpandAll() {
      allExpanded.value = !allExpanded.value;
    }

    function nextModule() {
      const idx = modules.value.findIndex((m) => m.id === activeId.value);
      if (idx < modules.value.length - 1) selectModule(modules.value[idx + 1].id);
    }

    const hasNext = computed(() => {
      const idx = modules.value.findIndex((m) => m.id === activeId.value);
      return idx < modules.value.length - 1;
    });

    return {
      modules, stats, activeId, learnedSet, allExpanded,
      activeModule, totalLearned, overallPct,
      selectModule, toggleLearned, toggleExpandAll, nextModule, hasNext,
    };
  },
  template: `
    <div class="layout">
      <Sidebar
        :modules="modules"
        :active-id="activeId"
        :learned-set="learnedSet"
        @select="selectModule"
      />

      <main class="main">
        <header class="topbar">
          <a class="back-link" href="../index.html">← 返回学习站</a>
          <div class="topbar-progress">
            <span class="topbar-progress-text">总进度 {{ totalLearned }}/{{ stats.questionCount }}</span>
            <div class="topbar-bar">
              <div class="topbar-bar-fill" :style="{ width: overallPct + '%' }"></div>
            </div>
            <span class="topbar-pct">{{ overallPct }}%</span>
          </div>
        </header>

        <section class="mod-hero" :key="activeModule.id">
          <div class="mod-hero-badge">{{ activeModule.icon }} {{ activeModule.level }} · {{ activeModule.difficulty }}</div>
          <h1>{{ activeModule.title }}</h1>
          <p>{{ activeModule.summary }}</p>
          <div class="mod-hero-actions">
            <button class="hero-btn" @click="toggleExpandAll">
              {{ allExpanded ? '全部收起' : '全部展开答案' }}
            </button>
            <span class="hero-count">本模块 {{ activeModule.questions.length }} 题</span>
          </div>
        </section>

        <div class="q-list">
          <QuestionCard
            v-for="(q, i) in activeModule.questions"
            :key="q.id"
            :question="q"
            :index="i"
            :revealed="allExpanded"
            :learned="learnedSet.has(q.id)"
            @toggle-learned="toggleLearned"
          />
        </div>

        <div class="mod-footer">
          <button v-if="hasNext" class="next-btn" @click="nextModule">
            下一模块 →
          </button>
          <div v-else class="finish-note">
            🎉 你已浏览到最后一个模块。把每道题的「话术」练到能脱口而出，面试就稳了。
          </div>
        </div>
      </main>
    </div>
  `,
});

createApp(App).mount('#app');
