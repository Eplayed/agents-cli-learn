// 地图页：显示所有关卡 + 进度
import { LEVELS_ALL as LEVELS } from '../../data/levels.js';
import { state, save, levelStars, isUnlocked, levelCompleted } from '../store.js';
import { toast } from '../utils.js';

export function renderMap(navigate) {
  const app = document.getElementById('app');
  const completedCount = LEVELS.filter(l => state.progress[l.id]?.completed).length;
  const total = LEVELS.length;

  let html = `
    <h1 class="map-title">学习地图</h1>
    <p class="map-subtitle">已完成 ${completedCount} / ${total} 关 · 总 XP ${state.xp} · 最佳连击 ${state.bestStreak}</p>

    <div class="section-divider">阶段一 · Agent 基础与 Runtime</div>
    <div class="level-track">
  `;

  LEVELS.forEach((lvl, idx) => {
    const unlocked = isUnlocked(LEVELS, idx);
    const prog = state.progress[lvl.id];
    const completed = prog?.completed;
    const stars = levelStars(lvl.id);
    const starStr = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);

    let nodeClass = 'level-node ';
    if (!unlocked) nodeClass += 'locked';
    else if (completed) nodeClass += 'completed';
    else nodeClass += 'unlocked';

    const nodeContent = unlocked
      ? `<div class="num">${lvl.id}</div><div class="topic">${lvl.topic}</div><div class="stars">${starStr}</div>`
      : `<div class="lock-icon">🔒</div>`;

    const totalStages = lvl.stages?.length || 1;
    const stageStudied = prog?.stageIndex != null ? Math.min(prog.stageIndex + 1, totalStages) : 0;
    const studyPct = Math.round(stageStudied / totalStages * 100);
    const scorePct = prog ? Math.round((prog.score || 0) * 100) : 0;

    const progressBar = `
      <div class="progress">
        <div class="progress-bar"><div style="width: ${studyPct}%"></div></div>
        <span>已学 ${stageStudied}/${totalStages}${completed ? ` · 通关 ${scorePct}%` : ''}</span>
      </div>
    `;

    // 已完成的关卡显示"重新学习"按钮
    const restartBtn = completed
      ? `<button class="restart-btn" data-restart-idx="${idx}" title="从第一步重新学习">🔄 重新学习</button>`
      : '';

    html += `
      <div class="level-row">
        <div class="${nodeClass}" data-level-idx="${idx}">${nodeContent}</div>
        <div class="level-info">
          <h3>${lvl.id} · ${lvl.title} ${restartBtn}</h3>
          <p>${lvl.subtitle}</p>
          ${progressBar}
        </div>
      </div>
    `;
  });

  html += '</div>';

  // 后续阶段占位
  html += `
    <div class="section-divider">阶段二 · 生产化（M5+ 待解锁）</div>
    <div class="coming-soon-card">
      🚧 M5：Checkpoint 持久化 + 预算控制<br>
      🚧 M6：OpenTelemetry + Langfuse 可观测<br>
      🚧 M7：DeepEval 评测体系<br>
      <br>
      完成 M0-M4 后，新关卡会陆续上线
    </div>

    <div class="section-divider">题库扩展（计划中）</div>
    <div class="coming-soon-card">
      📝 Agent 工程师面试题库（OpenAI / LangChain / Anthropic / 国内大厂）<br>
      🎯 系统设计题（如何设计支持百万 QPS 的 Agent 服务）<br>
      🐛 实战 Debug 题（基于真实 issue 改编）
    </div>

    <div class="section-divider">🏢 公司定向刷题（外部资源）</div>
    <div class="coming-soon-card" style="cursor: pointer;" onclick="window.open('https://adongwanai.github.io/AgentGuide/interview/companies/', '_blank')">
      <strong>→ AgentGuide 公司定向题库</strong>（点击跳转）<br><br>
      覆盖 28 家公司 · 12960 道题 · 444 道高频题<br>
      字节跳动 / 美团 / 腾讯 / 百度 / 阿里 / 小红书 / 华为 / 京东 ...<br><br>
      <span style="font-size: 11px; color: var(--muted);">来源：adongwanai/AgentGuide · 算法 + 编程题为主</span>
    </div>
  `;

  app.innerHTML = html;

  // 点击关卡节点：进入（已完成的从上次位置继续）
  app.querySelectorAll('.level-node').forEach(el => {
    el.addEventListener('click', () => {
      const idx = +el.dataset.levelIdx;
      if (!isUnlocked(LEVELS, idx)) {
        toast('🔒 通关上一关才能解锁', 'bad');
        return;
      }
      enterLevel(idx, false, navigate);
    });
  });

  // 点击"重新学习"按钮：从头开始
  app.querySelectorAll('.restart-btn').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation(); // 不触发父级 level-node 的 click
      const idx = +el.dataset.restartIdx;
      enterLevel(idx, true, navigate);
      toast('📖 从头开始学习', 'good');
    });
  });
}

function enterLevel(idx, fromStart, navigate) {
  const lvl = LEVELS[idx];
  state.currentLevel = idx;

  if (fromStart) {
    // 从头开始：stage 归零
    state.currentStageIndex = 0;
  } else {
    // 继续上次：跳到上次学到的 stage
    const lastIdx = state.progress[lvl.id]?.stageIndex ?? 0;
    state.currentStageIndex = Math.min(lastIdx, (lvl.stages?.length || 1) - 1);
  }

  // quiz 状态总是重置（不管从头还是继续）
  state.currentQuestionIndex = 0;
  state.currentHp = 3;
  state.currentAnswers = [];
  save();
  navigate('lesson');
}
