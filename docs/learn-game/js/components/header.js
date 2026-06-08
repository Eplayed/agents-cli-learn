// 顶部 header：logo / XP / streak / 错题本 / 重置
import { state, save, reset } from '../store.js';
import { toast } from '../utils.js';

export function renderHeader(onNav) {
  const root = document.getElementById('appHeader');
  root.innerHTML = `
    <div class="logo">⚡ AI Agent 学习闯关</div>
    <div class="spacer"></div>
    <div class="stat-pill" title="总经验值"><span>⭐</span><span id="hdrXp">${state.xp}</span> XP</div>
    <div class="stat-pill" title="当前连击"><span>🔥</span><span id="hdrStreak">${state.streak}</span></div>
    <button class="nav-btn" data-act="stats">📊 统计</button>
    <button class="nav-btn" data-act="wrong">📕 错题本</button>
    <button class="nav-btn" data-act="reset">🔄 重置</button>
  `;

  root.querySelector('[data-act="stats"]').onclick = () => onNav('stats');
  root.querySelector('[data-act="wrong"]').onclick = () => onNav('wrongBook');
  root.querySelector('[data-act="reset"]').onclick = () => {
    if (confirm('确定要重置全部进度吗？错题本也会清空。')) {
      reset();
      onNav('map');
      toast('🔄 已重置', 'good');
    }
  };
}

// 实时刷新右上角数字（不重渲染整个 header）
export function refreshHeader() {
  const xp = document.getElementById('hdrXp');
  const streak = document.getElementById('hdrStreak');
  if (xp) xp.textContent = state.xp;
  if (streak) streak.textContent = state.streak;
}
