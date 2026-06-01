// 故事 stage：吸引人 + 引导式
import { renderStageShell, bindStageShell } from './_layout.js';

export function renderStoryStage(level, stage, stageIdx, navigate, handlers) {
  const app = document.getElementById('app');
  const inner = `
    <div class="stage-kind-badge">📖 故事</div>
    <h1 class="stage-h1">${stage.title || ''}</h1>
    <div class="stage-prose">${stage.content}</div>
  `;
  app.innerHTML = renderStageShell(level, stageIdx, inner);
  bindStageShell(handlers);
}
