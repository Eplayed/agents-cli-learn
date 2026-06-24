// 代码片段展示组件：带文件路径标题 + 代码体 + 讲解
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'CodeBlock',
  props: {
    file: { type: String, default: '' },
    lang: { type: String, default: 'text' },
    code: { type: String, default: '' },
    note: { type: String, default: '' },
  },
  template: `
    <div class="code-block">
      <div class="code-header">
        <span class="code-dot"></span>
        <span class="code-file">{{ file }}</span>
        <span class="code-lang">{{ lang }}</span>
      </div>
      <pre class="code-body"><code>{{ code }}</code></pre>
      <div v-if="note" class="code-note">
        <span class="code-note-icon">💡</span>
        <span>{{ note }}</span>
      </div>
    </div>
  `,
});
