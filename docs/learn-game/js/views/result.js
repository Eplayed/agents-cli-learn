// 结算页
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

  let subtitle;
  if (passed) {
    const isLast = state.currentLevel >= LEVELS.length - 1;
    subtitle = isLast
      ? '恭喜打完全部已开放关卡！下一阶段（M5+）正在准备'
      : `${lvl.id} 完成！下一关已解锁，继续走下一关或回地图复习`;
  } else {
    subtitle = '别担心，错过的题已自动进入错题本，先去复习再战';
  }

  const isLast = state.currentLevel >= LEVELS.length - 1;
  const continueLabel = passed && !isLast ? '下一关 →' : '返回地图';

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
    // 重做时从最后一步（final-quiz）开始
    const lvl2 = LEVELS[state.currentLevel];
    state.currentStageIndex = (lvl2.stages?.length || 1) - 1;
    save();
    navigate('lesson');
  };
  app.querySelector('[data-act="continue"]').onclick = () => {
    if (passed && !isLast) {
      state.currentLevel += 1;
      // 进入下一关时从 stage 0 开始
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
