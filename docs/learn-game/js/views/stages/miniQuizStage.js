// Mini-quiz stage：2-3 题快速验证概念
// 不扣 HP（更友好），只用于学习验证；XP 比 final 少
import { renderStageShell, bindStageShell } from './_layout.js';
import { state, applyAnswer } from '../../store.js';
import { buildQuestionCardHTML, bindQuestionCard } from './_quizCore.js';
import { refreshHeader } from '../../components/header.js';

let qIdx = 0;

export function renderMiniQuizStage(level, stage, stageIdx, navigate, handlers) {
  qIdx = 0;
  renderCurrent(level, stage, stageIdx, handlers);
}

function renderCurrent(level, stage, stageIdx, handlers) {
  const app = document.getElementById('app');
  const total = stage.questions.length;
  const q = stage.questions[qIdx];

  const inner = `
    <div class="stage-kind-badge mini-quiz">✏️ 小测（不扣 HP）</div>
    <h1 class="stage-h1">${stage.title || ''}</h1>
    <p class="stage-subtitle">第 ${qIdx + 1} / ${total} 题 · 学习验证，错了不扣 HP</p>
    <div id="mqHost"></div>
  `;
  app.innerHTML = renderStageShell(level, stageIdx, inner, { skipFooter: true });
  bindStageShell(handlers);

  const host = document.getElementById('mqHost');
  host.innerHTML = buildQuestionCardHTML(q);
  const cardEl = host.querySelector('.question-card');

  bindQuestionCard(cardEl, q, {
    onAnswered: ({ correct, formattedUser, formattedCorrect }) => {
      // mini-quiz 不扣 HP，xp 减半
      applyAnswer(q, correct, level, formattedUser, formattedCorrect, {
        deductHp: false,
        xpOnCorrect: 5,
        recordIntoCurrentRun: false,
      });
      refreshHeader();
    },
    onContinue: () => {
      if (qIdx < total - 1) {
        qIdx += 1;
        renderCurrent(level, stage, stageIdx, handlers);
      } else {
        // 小测完成，进入下一个 stage
        handlers.onNext();
      }
    },
  });
}
