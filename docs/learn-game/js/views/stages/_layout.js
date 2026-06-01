// 共用的 stage 顶部进度条 + 底部导航
export function renderStageShell(level, stageIdx, innerHtml, opts = {}) {
  const total = level.stages.length;
  const stage = level.stages[stageIdx];

  const dots = level.stages.map((s, i) => {
    let cls = 'dot';
    if (i < stageIdx) cls += ' done';
    else if (i === stageIdx) cls += ' active';
    const icon = stageIcon(s.kind);
    return `<span class="${cls}" title="${s.title || ''}">${icon}</span>`;
  }).join('<span class="dot-sep"></span>');

  const isFirst = stageIdx === 0;
  const isLast = stageIdx === total - 1;

  return `
    <div class="stage-topbar">
      <button class="nav-btn" data-act="back">← 地图</button>
      <div class="stage-title">
        <span class="stage-level-tag">${level.id}</span>
        <span>${stage.title || level.title}</span>
      </div>
      <div class="stage-progress">第 ${stageIdx + 1} / ${total} 步</div>
    </div>

    <div class="stage-dots">${dots}</div>

    <article class="stage-body stage-${stage.kind}">
      ${innerHtml}
    </article>

    ${opts.skipFooter ? '' : `
      <div class="stage-footer">
        <button class="btn-secondary" data-act="prev" ${isFirst ? 'disabled' : ''}>
          ${isFirst ? '已是第一步' : '← 上一步'}
        </button>
        <button class="btn-primary" data-act="next">
          ${isLast ? '完成本关 → 返回地图' : '下一步 →'}
        </button>
      </div>
    `}
  `;
}

export function bindStageShell(handlers) {
  const app = document.getElementById('app');
  app.querySelector('[data-act="back"]')?.addEventListener('click', handlers.onBack);
  app.querySelector('[data-act="prev"]')?.addEventListener('click', handlers.onPrev);
  app.querySelector('[data-act="next"]')?.addEventListener('click', handlers.onNext);
}

function stageIcon(kind) {
  return {
    story: '📖',
    concept: '💡',
    build: '🛠',
    'mini-quiz': '✏️',
    'final-quiz': '🏁',
  }[kind] || '•';
}
