// 错题本
import { state } from '../store.js';
import { typeLabel, escapeHtml } from '../utils.js';

export function renderWrongBook(navigate) {
  const app = document.getElementById('app');

  let html = `
    <button class="nav-btn" data-act="back" style="margin-bottom: 16px;">← 返回</button>
    <h1 class="map-title">📕 错题本</h1>
    <p class="map-subtitle">最近的 ${state.wrongBook.length} 道错题（最多保留 100 条）</p>
  `;

  if (state.wrongBook.length === 0) {
    html += `
      <div class="empty">
        <div class="emoji">🎯</div>
        <div>还没有错题，去挑战关卡吧</div>
      </div>
    `;
  } else {
    html += '<div class="wrong-list">';
    state.wrongBook.forEach(w => {
      const tag = w.knowledgeTag
        ? `<span class="q-tag knowledge">📚 ${escapeHtml(w.knowledgeTag)}</span>`
        : '';
      html += `
        <div class="wrong-item">
          <div class="meta">
            <span class="q-tag type-${w.type}">${typeLabel(w.type)}</span>
            ${tag}
            <span>${w.levelId} · ${new Date(w.ts).toLocaleString('zh-CN')}</span>
          </div>
          <div class="q">${w.qText}</div>
          <div class="ans">✅ 正解：${w.correctAns}</div>
          <div class="explanation">💡 ${w.explain}</div>
          ${w.deeper ? `<div class="explanation">🧠 ${w.deeper}</div>` : ''}
        </div>
      `;
    });
    html += '</div>';
  }

  app.innerHTML = html;
  app.querySelector('[data-act="back"]').onclick = () => navigate('map');
}
