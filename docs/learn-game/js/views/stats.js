// 学习统计页：正确率、易错题、薄弱知识点
import { state } from '../store.js';
import { escapeHtml } from '../utils.js';

export function renderStats(navigate) {
  const app = document.getElementById('app');
  const stats = state.questionStats || {};
  const entries = Object.entries(stats);

  // 总体统计
  let totalCorrect = 0;
  let totalWrong = 0;
  entries.forEach(([, s]) => {
    totalCorrect += s.correct;
    totalWrong += s.wrong;
  });
  const totalAttempts = totalCorrect + totalWrong;
  const overallRate = totalAttempts > 0 ? Math.round(totalCorrect / totalAttempts * 100) : 0;

  // 按知识点分组统计
  const tagMap = {}; // tag -> { correct, wrong }
  entries.forEach(([, s]) => {
    const tag = s.knowledgeTag || '未分类';
    if (!tagMap[tag]) tagMap[tag] = { correct: 0, wrong: 0 };
    tagMap[tag].correct += s.correct;
    tagMap[tag].wrong += s.wrong;
  });

  // 按错误率排序知识点（最薄弱的在前）
  const tagList = Object.entries(tagMap)
    .map(([tag, d]) => ({
      tag,
      correct: d.correct,
      wrong: d.wrong,
      total: d.correct + d.wrong,
      rate: d.correct + d.wrong > 0 ? Math.round(d.correct / (d.correct + d.wrong) * 100) : 0,
    }))
    .sort((a, b) => a.rate - b.rate);

  // 易错题 TOP 10（错误次数最多的）
  const hardQuestions = entries
    .filter(([, s]) => s.wrong > 0)
    .map(([qid, s]) => ({ qid, ...s, total: s.correct + s.wrong, rate: Math.round(s.correct / (s.correct + s.wrong) * 100) }))
    .sort((a, b) => b.wrong - a.wrong)
    .slice(0, 10);

  let html = `
    <button class="nav-btn" data-act="back" style="margin-bottom: 16px;">← 返回</button>
    <h1 class="map-title">📊 学习统计</h1>
    <p class="map-subtitle">基于你所有答题记录的数据分析</p>

    <!-- 总览卡片 -->
    <div class="stats-overview">
      <div class="stat-card">
        <div class="label">总答题数</div>
        <div class="value">${totalAttempts}</div>
      </div>
      <div class="stat-card">
        <div class="label">总正确率</div>
        <div class="value" style="color: ${overallRate >= 80 ? 'var(--good)' : overallRate >= 60 ? 'var(--warn)' : 'var(--bad)'}">${overallRate}%</div>
      </div>
      <div class="stat-card">
        <div class="label">答对</div>
        <div class="value" style="color: var(--good)">${totalCorrect}</div>
      </div>
      <div class="stat-card">
        <div class="label">答错</div>
        <div class="value" style="color: var(--bad)">${totalWrong}</div>
      </div>
      <div class="stat-card">
        <div class="label">总 XP</div>
        <div class="value">${state.xp}</div>
      </div>
      <div class="stat-card">
        <div class="label">最佳连击</div>
        <div class="value">${state.bestStreak}</div>
      </div>
    </div>
  `;

  // 知识点薄弱分析
  if (tagList.length > 0) {
    html += `
      <div class="section-divider">📚 知识点正确率（薄弱在前）</div>
      <div class="stats-table">
        <div class="stats-row header">
          <span>知识点</span>
          <span>正确率</span>
          <span>答对/答错</span>
          <span>掌握度</span>
        </div>
        ${tagList.map(t => `
          <div class="stats-row">
            <span class="tag-name">${escapeHtml(t.tag)}</span>
            <span style="color: ${t.rate >= 80 ? 'var(--good)' : t.rate >= 60 ? 'var(--warn)' : 'var(--bad)'}; font-weight: 700;">${t.rate}%</span>
            <span>${t.correct} / ${t.wrong}</span>
            <span>${rateToBar(t.rate)}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  // 易错题 TOP 10
  if (hardQuestions.length > 0) {
    html += `
      <div class="section-divider">⚠️ 易错题 TOP ${hardQuestions.length}（错误次数最多）</div>
      <div class="wrong-list">
        ${hardQuestions.map(q => `
          <div class="wrong-item">
            <div class="meta">
              <span class="q-tag knowledge">📚 ${escapeHtml(q.knowledgeTag || '未分类')}</span>
              <span>答对 ${q.correct} 次 · 答错 ${q.wrong} 次 · 正确率 ${q.rate}%</span>
            </div>
            <div class="q" style="font-size: 13px; color: var(--muted);">题目 ID: ${escapeHtml(q.qid)}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  if (totalAttempts === 0) {
    html += `
      <div class="empty">
        <div class="emoji">📝</div>
        <div>还没有答题记录。去闯关产生数据吧！</div>
      </div>
    `;
  }

  app.innerHTML = html;
  app.querySelector('[data-act="back"]').onclick = () => navigate('map');
}

function rateToBar(rate) {
  const filled = Math.round(rate / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}
