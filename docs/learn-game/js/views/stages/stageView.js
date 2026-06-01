// Stage 调度器：根据 stage.kind 决定渲染哪个组件
import { state, save, markStageVisited } from '../../store.js';
import { renderStoryStage } from './storyStage.js';
import { renderConceptStage } from './conceptStage.js';
import { renderBuildStage } from './buildStage.js';
import { renderMiniQuizStage } from './miniQuizStage.js';
import { renderFinalQuizStage } from './finalQuizStage.js';

const RENDERERS = {
  story: renderStoryStage,
  concept: renderConceptStage,
  build: renderBuildStage,
  'mini-quiz': renderMiniQuizStage,
  'final-quiz': renderFinalQuizStage,
};

export function renderStage(level, stageIdx, navigate) {
  const stage = level.stages[stageIdx];
  const renderer = RENDERERS[stage.kind] || renderConceptStage;
  renderer(level, stage, stageIdx, navigate, {
    onPrev: () => goPrev(level, stageIdx, navigate),
    onNext: () => goNext(level, stageIdx, navigate),
    onBack: () => navigate('map'),
  });
}

function goPrev(level, stageIdx, navigate) {
  if (stageIdx <= 0) {
    navigate('map');
    return;
  }
  state.currentStageIndex = stageIdx - 1;
  save();
  navigate('lesson');
}

function goNext(level, stageIdx, navigate) {
  if (stageIdx >= level.stages.length - 1) {
    navigate('map');
    return;
  }
  state.currentStageIndex = stageIdx + 1;
  markStageVisited(level.id, state.currentStageIndex);
  save();
  navigate('lesson');
}
