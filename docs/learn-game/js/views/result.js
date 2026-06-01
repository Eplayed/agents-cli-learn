// 结算页 + 下一关预览流程图（带流动动效箭头）
import { LEVELS } from '../../data/levels.js';
import { state, save, applyLevelResult } from '../store.js';
import { refreshHeader } from '../components/header.js';

export function renderResult(navigate) {
  const app = document.getElementById('app');
  const lvl = LEVELS[state.currentLevel];

  // 找出 final-quiz stage 取题数（兼容老格式）
  const finalQuizStage = lvl.stages?.find(s => s.kind === 'final-quiz');
  const total = finalQuizStage?.questions?.length
    ?? lvl.questions?.length
    ?? Math.max(state.currentAnswers.length, 1);

  const correctCount = state.currentAnswers.filter(a => a.correct).length;
  const { score, passed, stars } = applyLevelResult(lvl, correctCount, total, state.currentHp);
  refreshHeader();

  const emoji = passed ? (stars === 3 ? '🏆' : '🎉') : '💪';
  const title = passed ? '过关！' : 'HP 耗尽，再来一次';

  const isLast = state.currentLevel >= LEVELS.length - 1;

  let subtitle;
  if (passed) {
    subtitle = isLast
      ? '恭喜打完全部已开放关卡！下一阶段（M5+）正在准备'
      : `${lvl.id} 完成！下一关已解锁`;
  } else {
    subtitle = '别担心，错过的题已自动进入错题本，先去复习再战';
  }

  const continueLabel = passed && !isLast ? '进入下一关 →' : '返回地图';

  // 生成下一关预览流程图
  const nextFlowHtml = (passed && !isLast) ? buildNextLevelFlow(state.currentLevel + 1) : '';

  app.innerHTML = `
    <div class="result">
      <div class="emoji">${emoji}</div>
      <h2>${title}</h2>
      <p class="subtitle">${subtitle}</p>
      <div class="stars">${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
      <div class="result-stats">
        <div class="stat-card">
          <div class="label">正确率</div>
          <div class="value">${Math.round(score * 100)}%</div>
        </div>
        <div class="stat-card">
          <div class="label">答对</div>
          <div class="value">${correctCount} / ${total}</div>
        </div>
        <div class="stat-card">
          <div class="label">最佳连击</div>
          <div class="value">${state.bestStreak}</div>
        </div>
      </div>
      ${nextFlowHtml}
      <div class="actions">
        <button class="btn-secondary" data-act="retry">再来一次</button>
        <button class="btn-primary" data-act="continue">${continueLabel}</button>
      </div>
    </div>
  `;

  app.querySelector('[data-act="retry"]').onclick = () => {
    state.currentQuestionIndex = 0;
    state.currentHp = 3;
    state.currentAnswers = [];
    const lvl2 = LEVELS[state.currentLevel];
    state.currentStageIndex = (lvl2.stages?.length || 1) - 1;
    save();
    navigate('lesson');
  };
  app.querySelector('[data-act="continue"]').onclick = () => {
    if (passed && !isLast) {
      state.currentLevel += 1;
      state.currentStageIndex = 0;
      state.currentQuestionIndex = 0;
      state.currentHp = 3;
      state.currentAnswers = [];
      save();
      navigate('lesson');
    } else {
      navigate('map');
    }
  };
}

// ============================================================
// 下一关预览流程图（SVG + 流动动效箭头）
// ============================================================

const STAGE_ICONS = {
  story: '📖',
  concept: '💡',
  build: '🛠',
  'mini-quiz': '✏️',
  'final-quiz': '🏁',
};

const STAGE_COLORS = {
  story: '#6366f1',
  concept: '#8b5cf6',
  build: '#fbbf24',
  'mini-quiz': '#10b981',
  'final-quiz': '#ef4444',
};

function buildNextLevelFlow(nextIdx) {
  const next = LEVELS[nextIdx];
  if (!next || !next.stages || next.stages.length === 0) return '';

  const stages = next.stages;
  const nodeW = 100;
  const nodeH = 56;
  const gapX = 40;
  const startX = 20;
  const startY = 40;
  const totalW = startX * 2 + stages.length * nodeW + (stages.length - 1) * gapX;
  const totalH = startY + nodeH + 40;

  let nodesHtml = '';
  let arrowsHtml = '';

  stages.forEach((stage, i) => {
    const x = startX + i * (nodeW + gapX);
    const y = startY;
    const color = STAGE_COLORS[stage.kind] || '#6366f1';
    const icon = STAGE_ICONS[stage.kind] || '•';

    // 节点
    nodesHtml += `
      <g class="flow-node" style="animation-delay: ${i * 0.1}s">
        <rect x="${x}" y="${y}" width="${nodeW}" height="${nodeH}" rx="12"
              fill="rgba(${hexToRgb(color)}, 0.15)"
              stroke="${color}" stroke-width="1.5" />
        <text x="${x + nodeW / 2}" y="${y + 22}" text-anchor="middle"
              font-size="18" fill="${color}">${icon}</text>
        <text x="${x + nodeW / 2}" y="${y + 42}" text-anchor="middle"
              font-size="10" fill="#7d8aa9" font-weight="600">
          ${stageLabel(stage.kind)}
        </text>
      </g>
    `;

    // 箭头（除了最后一个节点）
    if (i < stages.length - 1) {
      const ax1 = x + nodeW;
      const ax2 = x + nodeW + gapX;
      const ay = y + nodeH / 2;
      const arrowId = `arrow-${i}`;

      arrowsHtml += `
        <line x1="${ax1}" y1="${ay}" x2="${ax2}" y2="${ay}"
              stroke="#2a3358" stroke-width="2" />
        <line x1="${ax1}" y1="${ay}" x2="${ax2}" y2="${ay}"
              stroke="url(#flowGradient)" stroke-width="2"
              stroke-dasharray="6 4"
              class="flow-arrow" style="animation-delay: ${i * 0.15}s" />
        <polygon points="${ax2 - 1},${ay - 4} ${ax2 + 5},${ay} ${ax2 - 1},${ay + 4}"
                 fill="#6366f1" class="flow-arrow-head"
                 style="animation-delay: ${i * 0.15 + 0.3}s" />
      `;
    }
  });

  return `
    <div class="next-level-preview">
      <div class="preview-header">
        <span class="preview-tag">🔮 下一关预览</span>
        <span class="preview-title">${next.id} · ${next.title}</span>
      </div>
      <div class="preview-subtitle">${next.subtitle}</div>
      <div class="flow-container">
        <svg viewBox="0 0 ${totalW} ${totalH}" xmlns="http://www.w3.org/2000/svg"
             class="flow-svg" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="flowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#6366f1" />
              <stop offset="100%" stop-color="#8b5cf6" />
            </linearGradient>
          </defs>
          ${arrowsHtml}
          ${nodesHtml}
        </svg>
      </div>
      <div class="flow-legend">
        ${stages.map(s => `<span class="legend-item"><span style="color:${STAGE_COLORS[s.kind] || '#6366f1'}">${STAGE_ICONS[s.kind] || '•'}</span> ${s.title ? truncate(s.title, 16) : stageLabel(s.kind)}</span>`).join('')}
      </div>
    </div>
  `;
}

function stageLabel(kind) {
  return { story: '故事', concept: '概念', build: '实战', 'mini-quiz': '小测', 'final-quiz': '通关' }[kind] || kind;
}

function truncate(s, max) {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r},${g},${b}`;
}
