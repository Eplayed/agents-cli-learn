// 概念 stage：图文讲解
import { renderStageShell, bindStageShell } from './_layout.js';

export function renderConceptStage(level, stage, stageIdx, navigate, handlers) {
  const app = document.getElementById('app');
  const inner = `
    <div class="stage-kind-badge concept">💡 核心概念</div>
    <h1 class="stage-h1">${stage.title || ''}</h1>
    <div class="stage-prose">${stage.content}</div>
  `;
  app.innerHTML = renderStageShell(level, stageIdx, inner);
  bindStageShell(handlers);
}
