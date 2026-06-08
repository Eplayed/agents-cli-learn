// 极简路由：根据 state.view 调用对应 view 渲染
import { state, save } from './store.js';
import { renderMap } from './views/map.js';
import { renderLesson } from './views/lesson.js';
import { renderResult } from './views/result.js';
import { renderWrongBook } from './views/wrongBook.js';
import { renderStats } from './views/stats.js';
import { refreshHeader } from './components/header.js';

const views = {
  map: renderMap,
  lesson: renderLesson,
  // quiz 视图已被 lesson 内的 final-quiz stage 取代
  quiz: renderLesson,
  result: renderResult,
  wrongBook: renderWrongBook,
  stats: renderStats,
};

export function navigate(view) {
  state.view = view;
  save();
  render();
  window.scrollTo(0, 0);
}

export function render() {
  refreshHeader();
  const fn = views[state.view] || renderMap;
  fn(navigate);
}
