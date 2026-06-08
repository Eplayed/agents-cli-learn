// 游戏状态管理 + localStorage 持久化
// v3：增加 stage 维度（每关有多个学习阶段，不只是测验）

const STORE_KEY = 'agents_cli_learn_game_v3';

export function defaultState() {
  return {
    xp: 0,
    streak: 0,
    bestStreak: 0,
    progress: {},        // levelId -> { stars, completed, score, attempts, stageIndex }
    wrongBook: [],
    // 答题统计：questionId -> { correct: number, wrong: number, lastSeen: timestamp, knowledgeTag: string }
    questionStats: {},
    view: 'map',
    currentLevel: null,
    currentStageIndex: 0,
    currentQuestionIndex: 0,
    currentHp: 3,
    currentAnswers: [],
  };
}

export const state = (() => {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return Object.assign(defaultState(), JSON.parse(raw));
  } catch {}
  return defaultState();
})();

export function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {}
}

export function reset() {
  localStorage.removeItem(STORE_KEY);
  Object.assign(state, defaultState());
}

export function levelStars(levelId) {
  return state.progress[levelId]?.stars ?? 0;
}

export function levelCompleted(levelId) {
  return !!state.progress[levelId]?.completed;
}

export function levelStageIndex(levelId) {
  return state.progress[levelId]?.stageIndex ?? 0;
}

export function isUnlocked(levels, idx) {
  if (idx === 0) return true;
  return levelCompleted(levels[idx - 1].id);
}

// 进入 stage 时调用，记录学习进度
export function markStageVisited(levelId, stageIdx) {
  const prev = state.progress[levelId] || { stars: 0, completed: false, score: 0, attempts: 0, stageIndex: 0 };
  state.progress[levelId] = {
    ...prev,
    stageIndex: Math.max(prev.stageIndex || 0, stageIdx),
  };
  save();
}

// 答错时记录到错题本
export function recordWrong(question, level, formattedUser, formattedCorrect) {
  state.wrongBook.unshift({
    levelId: level.id,
    questionId: question.id,
    knowledgeTag: question.knowledgeTag || '',
    qText: question.text,
    type: question.type,
    userAns: formattedUser,
    correctAns: formattedCorrect,
    explain: question.explain,
    deeper: question.deeper || null,
    ts: Date.now(),
  });
  if (state.wrongBook.length > 100) state.wrongBook.length = 100;
}

// 答题（mini-quiz 或 final-quiz 通用）
export function applyAnswer(question, correct, level, formattedUser, formattedCorrect, opts = {}) {
  if (opts.recordIntoCurrentRun !== false) {
    state.currentAnswers.push({ qid: question.id, correct });
  }

  // 更新答题统计
  const qid = question.id;
  if (!state.questionStats[qid]) {
    state.questionStats[qid] = { correct: 0, wrong: 0, lastSeen: 0, knowledgeTag: question.knowledgeTag || '' };
  }
  const qs = state.questionStats[qid];
  if (correct) {
    qs.correct += 1;
    state.streak += 1;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    state.xp += opts.xpOnCorrect ?? 10;
  } else {
    qs.wrong += 1;
    state.streak = 0;
    if (opts.deductHp !== false) state.currentHp -= 1;
    recordWrong(question, level, formattedUser, formattedCorrect);
  }
  qs.lastSeen = Date.now();
  qs.knowledgeTag = question.knowledgeTag || qs.knowledgeTag;
  save();
}

// 关卡通关结算
export function applyLevelResult(level, correctCount, total, hpLeft) {
  const score = correctCount / total;
  const passed = score >= 0.8 && hpLeft > 0;
  let stars = 0;
  if (passed) {
    if (score >= 1) stars = 3;
    else if (score >= 0.9) stars = 2;
    else stars = 1;
  }
  const prev = state.progress[level.id] || { stars: 0, completed: false, score: 0, attempts: 0, stageIndex: 0 };
  state.progress[level.id] = {
    ...prev,
    stars: Math.max(prev.stars, stars),
    completed: prev.completed || passed,
    score: Math.max(prev.score, score),
    attempts: prev.attempts + 1,
    stageIndex: Math.max(prev.stageIndex || 0, (level.stages?.length || 1) - 1),
  };
  if (passed) state.xp += 50;
  save();
  return { score, passed, stars };
}
