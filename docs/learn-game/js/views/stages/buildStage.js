// 代码搭建 stage：项目真实代码 + 解读
import { renderStageShell, bindStageShell } from './_layout.js';

export function renderBuildStage(level, stage, stageIdx, navigate, handlers) {
  const app = document.getElementById('app');
  const inner = `
    <div class="stage-kind-badge build">🛠 项目实战</div>
    <h1 class="stage-h1">${stage.title || ''}</h1>
    <div class="stage-prose">${stage.content}</div>
  `;
  app.innerHTML = renderStageShell(level, stageIdx, inner);
  bindStageShell(handlers);
}
