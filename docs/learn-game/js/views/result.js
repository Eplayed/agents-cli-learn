// 结算页 + 下一关技术架构预览（带流动动效箭头）
import { LEVELS_ALL as LEVELS } from '../../data/levels.js';
import { TECH_FLOWS } from '../../data/techFlows.js';
import { state, save, applyLevelResult } from '../store.js';
import { refreshHeader } from '../components/header.js';

export function renderResult(navigate) {
  const app = document.getElementById('app');
  const lvl = LEVELS[state.currentLevel];

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

  // 生成下一关的技术架构流程图
  const nextLevel = !isLast ? LEVELS[state.currentLevel + 1] : null;
  const techFlow = nextLevel ? TECH_FLOWS[nextLevel.id] : null;
  const techFlowHtml = (passed && techFlow) ? buildTechFlowSVG(techFlow) : '';

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
      ${techFlowHtml}
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
// 技术架构流程图 SVG 渲染（带流动箭头动效）
// ============================================================

function buildTechFlowSVG(flow) {
  const nodes = flow.nodes;
  const edges = flow.edges;

  // 布局：自动排列节点（水平方向）
  const nodeW = 110;
  const nodeH = 70;
  const gapX = 60;
  const padX = 30;
  const padY = 50;

  // 计算节点位置（简单水平排列，如果超过 4 个就分两行）
  const maxPerRow = Math.min(nodes.length, nodes.length <= 4 ? 4 : 3);
  const rows = Math.ceil(nodes.length / maxPerRow);
  const positions = {};

  nodes.forEach((node, i) => {
    const row = Math.floor(i / maxPerRow);
    const col = i % maxPerRow;
    const colsInRow = Math.min(maxPerRow, nodes.length - row * maxPerRow);
    const rowOffsetX = (maxPerRow - colsInRow) * (nodeW + gapX) / 2;
    positions[node.id] = {
      x: padX + rowOffsetX + col * (nodeW + gapX),
      y: padY + row * (nodeH + 60),
      cx: padX + rowOffsetX + col * (nodeW + gapX) + nodeW / 2,
      cy: padY + row * (nodeH + 60) + nodeH / 2,
    };
  });

  const totalW = padX * 2 + maxPerRow * nodeW + (maxPerRow - 1) * gapX;
  const totalH = padY * 2 + rows * nodeH + (rows - 1) * 60;

  // 渲染节点
  let nodesHtml = '';
  nodes.forEach((node, i) => {
    const pos = positions[node.id];
    const lines = node.label.split('\n');
    nodesHtml += `
      <g class="tech-node" style="animation-delay: ${i * 0.12}s">
        <rect x="${pos.x}" y="${pos.y}" width="${nodeW}" height="${nodeH}" rx="14"
              fill="rgba(${hexToRgb(node.color)}, 0.12)"
              stroke="${node.color}" stroke-width="1.5" />
        <text x="${pos.cx}" y="${pos.y + 24}" text-anchor="middle"
              font-size="18">${node.icon}</text>
        ${lines.map((line, li) => `
          <text x="${pos.cx}" y="${pos.y + 42 + li * 14}" text-anchor="middle"
                font-size="10" fill="#cbd5e1" font-weight="600">${escSvg(line)}</text>
        `).join('')}
      </g>
    `;
  });

  // 渲染边（带流动动效）
  let edgesHtml = '';
  edges.forEach((edge, i) => {
    const from = positions[edge.from];
    const to = positions[edge.to];
    if (!from || !to) return;

    // 计算连线起止点（从节点边缘出发）
    const dx = to.cx - from.cx;
    const dy = to.cy - from.cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return;

    const nx = dx / dist;
    const ny = dy / dist;

    // 起点：从 from 节点边缘出发
    const x1 = from.cx + nx * (nodeW / 2 + 4);
    const y1 = from.cy + ny * (nodeH / 2 + 4);
    // 终点：到 to 节点边缘
    const x2 = to.cx - nx * (nodeW / 2 + 10);
    const y2 = to.cy - ny * (nodeH / 2 + 10);

    // 标签位置（中点偏上）
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2 - 8;

    edgesHtml += `
      <g class="tech-edge" style="animation-delay: ${i * 0.1 + 0.3}s">
        <!-- 底线（暗色） -->
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
              stroke="#2a3358" stroke-width="2" />
        <!-- 流动线 -->
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
              stroke="url(#techGradient)" stroke-width="2"
              stroke-dasharray="8 5"
              class="tech-flow-line" style="animation-delay: ${i * 0.2}s" />
        <!-- 箭头 -->
        <polygon points="${arrowHead(x2, y2, nx, ny)}"
                 fill="#6366f1" class="tech-arrow-head"
                 style="animation-delay: ${i * 0.2 + 0.1}s" />
        <!-- 标签 -->
        ${edge.label ? `
          <rect x="${mx - measureText(edge.label) / 2 - 6}" y="${my - 8}"
                width="${measureText(edge.label) + 12}" height="16" rx="4"
                fill="#0a0f24" stroke="#2a3358" stroke-width="0.5" />
          <text x="${mx}" y="${my + 3}" text-anchor="middle"
                font-size="9" fill="#7d8aa9" font-weight="600">${escSvg(edge.label)}</text>
        ` : ''}
      </g>
    `;
  });

  return `
    <div class="next-level-preview">
      <div class="preview-header">
        <span class="preview-tag">🔮 下一关技术架构</span>
        <span class="preview-title">${escHtml(flow.title)}</span>
      </div>
      <div class="preview-subtitle">${escHtml(flow.description)}</div>
      <div class="flow-container">
        <svg viewBox="0 0 ${totalW} ${totalH}" xmlns="http://www.w3.org/2000/svg"
             class="flow-svg" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="techGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#6366f1" stop-opacity="0.4" />
              <stop offset="50%" stop-color="#8b5cf6" stop-opacity="1" />
              <stop offset="100%" stop-color="#6366f1" stop-opacity="0.4" />
            </linearGradient>
          </defs>
          ${edgesHtml}
          ${nodesHtml}
        </svg>
      </div>
    </div>
  `;
}

function arrowHead(x, y, nx, ny) {
  const size = 6;
  const px = x + nx * 2;
  const py = y + ny * 2;
  // 三角形箭头
  const p1x = px;
  const p1y = py;
  const p2x = px - nx * size + ny * size * 0.5;
  const p2y = py - ny * size - nx * size * 0.5;
  const p3x = px - nx * size - ny * size * 0.5;
  const p3y = py - ny * size + nx * size * 0.5;
  return `${p1x},${p1y} ${p2x},${p2y} ${p3x},${p3y}`;
}

function measureText(text) {
  // 粗略估算文本宽度（每字符约 5.5px at font-size 9）
  return (text || '').length * 5.5;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return `${parseInt(h.substring(0, 2), 16)},${parseInt(h.substring(2, 4), 16)},${parseInt(h.substring(4, 6), 16)}`;
}

function escSvg(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
