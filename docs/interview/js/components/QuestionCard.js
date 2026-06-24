// 单个面试题的学习卡片（学习模式，非答题）
// 展示：题号 + 难度 + 知识点 + 题目 → (展开) 答案 + 解析 + 加分点 + 面试话术 + 真实项目代码
import { defineComponent, ref, computed } from 'vue';
import CodeBlock from './CodeBlock.js';
import { getCodeSnippet } from '../data/codeSnippets.js';

export default defineComponent({
  name: 'QuestionCard',
  components: { CodeBlock },
  props: {
    question: { type: Object, required: true },
    index: { type: Number, default: 0 },
    revealed: { type: Boolean, default: false },
    learned: { type: Boolean, default: false },
  },
  emits: ['toggle-learned'],
  setup(props) {
    const open = ref(props.revealed);

    // revealed 由父组件「全部展开/收起」控制
    computed(() => open.value);

    const snippet = computed(() => getCodeSnippet(props.question.id));

    // 把正确答案格式化成可读文本
    const correctText = computed(() => {
      const q = props.question;
      if (q.type === 'single') {
        const opt = (q.options || []).find((o) => o.value === q.answer);
        return opt ? opt.text : q.answer;
      }
      if (q.type === 'multi') {
        const ans = Array.isArray(q.answer) ? q.answer : [];
        return (q.options || [])
          .filter((o) => ans.includes(o.value))
          .map((o) => o.text)
          .join('；');
      }
      if (q.type === 'order') {
        const ans = Array.isArray(q.answer) ? q.answer : [];
        return ans
          .map((id, i) => {
            const item = (q.items || []).find((it) => it.id === id);
            return `${i + 1}. ${item ? item.text : id}`;
          })
          .join('\n');
      }
      return String(q.answer);
    });

    // 判断某个选项是否为正确答案（用于高亮）
    function isCorrect(value) {
      const a = props.question.answer;
      return Array.isArray(a) ? a.includes(value) : a === value;
    }

    return { open, snippet, correctText, isCorrect };
  },
  // 当父组件切换 revealed 时同步
  watch: {
    revealed(val) {
      this.open = val;
    },
  },
  template: `
    <div class="q-card" :class="{ learned }">
      <div class="q-head">
        <div class="q-head-left">
          <span class="q-num">{{ String(index + 1).padStart(2, '0') }}</span>
          <span class="q-diff">{{ question.difficulty }}</span>
          <span class="q-tag">{{ question.knowledgeTag }}</span>
        </div>
        <button
          class="q-learned-btn"
          :class="{ active: learned }"
          @click="$emit('toggle-learned', question.id)"
          :title="learned ? '已学会' : '标记为已学会'"
        >
          {{ learned ? '✓ 已学会' : '○ 标记已学' }}
        </button>
      </div>

      <div class="q-text" v-html="question.text"></div>

      <button class="q-reveal-btn" @click="open = !open">
        {{ open ? '收起答案 ▲' : '查看答案与讲解 ▼' }}
      </button>

      <div v-show="open" class="q-body">
        <!-- 正确答案 -->
        <div class="q-section q-answer">
          <div class="q-section-title">✅ 正确答案</div>
          <div class="q-answer-text">{{ correctText }}</div>
        </div>

        <!-- 选项（高亮正确项），仅 single/multi 显示 -->
        <div v-if="question.options" class="q-section">
          <div class="q-section-title">选项对照</div>
          <ul class="q-options">
            <li
              v-for="opt in question.options"
              :key="opt.value"
              :class="{ correct: isCorrect(opt.value) }"
            >
              <span class="q-opt-mark">{{ isCorrect(opt.value) ? '✓' : '·' }}</span>
              <span>{{ opt.text }}</span>
            </li>
          </ul>
        </div>

        <!-- 解析 -->
        <div class="q-section">
          <div class="q-section-title">📖 解析</div>
          <p>{{ question.explain }}</p>
        </div>

        <!-- 加分点 -->
        <div v-if="question.deeper" class="q-section q-deeper">
          <div class="q-section-title">🚀 面试加分</div>
          <p>{{ question.deeper }}</p>
        </div>

        <!-- 面试话术 -->
        <div v-if="question.interviewTip" class="q-section q-tip">
          <div class="q-section-title">🎯 怎么答（话术）</div>
          <p>{{ question.interviewTip }}</p>
        </div>

        <!-- 真实项目代码 -->
        <div class="q-section">
          <div class="q-section-title">🔗 对应项目代码</div>
          <code-block
            v-if="snippet"
            :file="snippet.file"
            :lang="snippet.lang"
            :code="snippet.code"
            :note="snippet.note"
          />
          <div v-else class="q-mapping">
            <span class="code-dot"></span>
            <code>{{ question.projectMapping }}</code>
          </div>
        </div>
      </div>
    </div>
  `,
});
