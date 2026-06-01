// 应用入口
import { state } from './store.js';
import { renderHeader } from './components/header.js';
import { navigate, render } from './router.js';

// 渲染顶部 header（一次性，按钮通过 onNav 回调路由）
renderHeader(navigate);

// 刷新时如果停在 quiz / result，回到 lesson 起点（避免半途状态混乱）
if (state.view === 'quiz' || state.view === 'result') state.view = 'lesson';

render();
