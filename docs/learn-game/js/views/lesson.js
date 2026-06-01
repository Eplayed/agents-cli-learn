// 关卡 lesson 页：按 stage 顺序学习（故事 / 概念 / 代码 / 小测 / 通关测验）
import { LEVELS } from '../../data/levels.js';
import { state, save, markStageVisited } from '../store.js';
import { renderStage } from './stages/stageView.js';

export function renderLesson(navigate) {
  const lvl = LEVELS[state.currentLevel];
  if (!lvl.stages || !lvl.stages.length) {
    // 兼容老格式：没 stages 直接进 final quiz
    state.currentQuestionIndex = 0;
    state.currentHp = 3;
    state.currentAnswers = [];
    save();
    navigate('quiz');
    return;
  }

  // 限制 stageIndex 不超出范围
  if (state.currentStageIndex >= lvl.stages.length) {
    state.currentStageIndex = 0;
  }

  // 标记进度
  markStageVisited(lvl.id, state.currentStageIndex);

  // 渲染当前 stage
  renderStage(lvl, state.currentStageIndex, navigate);
}
