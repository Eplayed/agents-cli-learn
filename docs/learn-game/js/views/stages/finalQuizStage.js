// Final-quiz stage：通关测验，扣 HP，决定是否解锁下一关
import { renderStageShell, bindStageShell } from './_layout.js';
import { state, save, applyAnswer, applyLevelResult } from '../../store.js';
import { buildQuestionCardHTML, bindQuestionCard } from './_quizCore.js';
import { refreshHeader } from '../../components/header.js';

export function renderFinalQuizStage(level, stage, stageIdx, navigate, handlers) {
  // final-quiz 进入时初始化
  if (state.currentQuestionIndex >= stage.questions.length) state.currentQuestionIndex = 0;
  if (state.currentHp <= 0 || state.currentAnswers.length === 0) {
    state.currentHp = 3;
    state.currentAnswers = [];
    state.currentQuestionIndex = 0;
  }
  save();
  renderCurrent(level, stage, stageIdx, navigate, handlers);
}

function renderCurrent(level, stage, stageIdx, navigate, handlers) {
  const app = document.getElementById('app');
  const total = stage.questions.length;
  const q = stage.questions[state.currentQuestionIndex];
  const hpPct = (state.currentHp / 3) * 100;
  const hpClass = state.currentHp <= 1 ? 'low' : '';

  const inner = `
    <div class="stage-kind-badge final-quiz">🏁 通关测验</div>
    <h1 class="stage-h1">${stage.title || ''}</h1>
    <div class="quiz-bar">
      <div class="hp-bar"><div class="hp-fill ${hpClass}" style="width: ${hpPct}%"></div></div>
      <div class="question-counter">
        第 ${state.currentQuestionIndex + 1} / ${total} 题 · HP ${state.currentHp}/3
      </div>
    </div>
    <div id="fqHost"></div>
  `;
  app.innerHTML = renderStageShell(level, stageIdx, inner, { skipFooter: true });
  bindStageShell({ ...handlers, onNext: () => {/* 通关测验里禁用通用 next */} });

  const host = document.getElementById('fqHost');
  host.innerHTML = buildQuestionCardHTML(q);
  const cardEl = host.querySelector('.question-card');

  bindQuestionCard(cardEl, q, {
    onAnswered: ({ correct, formattedUser, formattedCorrect }) => {
      applyAnswer(q, correct, level, formattedUser, formattedCorrect);
      refreshHeader();
    },
    onContinue: () => {
      const isLast = state.currentQuestionIndex >= total - 1;
      if (state.currentHp <= 0 || isLast) {
        // 进入结算
        navigate('result');
        return;
      }
      state.currentQuestionIndex += 1;
      save();
      renderCurrent(level, stage, stageIdx, navigate, handlers);
    },
  });
}
