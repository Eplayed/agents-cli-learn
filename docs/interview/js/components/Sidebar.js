// 左侧导航：6 个模块（入门 → 高级），显示每个模块的已学进度
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'Sidebar',
  props: {
    modules: { type: Array, required: true },
    activeId: { type: String, default: '' },
    learnedSet: { type: Object, required: true }, // Set of learned question ids
  },
  emits: ['select'],
  methods: {
    learnedCount(mod) {
      return mod.questions.filter((q) => this.learnedSet.has(q.id)).length;
    },
    isDone(mod) {
      return this.learnedCount(mod) === mod.questions.length && mod.questions.length > 0;
    },
  },
  template: `
    <nav class="sidebar">
      <div class="sidebar-title">学习路径</div>
      <div class="sidebar-sub">从入门到高级，循序渐进</div>
      <ul class="mod-list">
        <li
          v-for="mod in modules"
          :key="mod.id"
          class="mod-item"
          :class="{ active: mod.id === activeId, done: isDone(mod) }"
          @click="$emit('select', mod.id)"
        >
          <div class="mod-item-top">
            <span class="mod-icon">{{ mod.icon }}</span>
            <span class="mod-level">{{ mod.level }}</span>
            <span class="mod-progress">{{ learnedCount(mod) }}/{{ mod.questions.length }}</span>
          </div>
          <div class="mod-item-title">{{ mod.title }}</div>
          <div class="mod-bar">
            <div
              class="mod-bar-fill"
              :style="{ width: (mod.questions.length ? learnedCount(mod) / mod.questions.length * 100 : 0) + '%' }"
            ></div>
          </div>
        </li>
      </ul>
    </nav>
  `,
});
