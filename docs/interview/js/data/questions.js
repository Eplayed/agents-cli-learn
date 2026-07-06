// 面试题课程编排：复用 learn-game 的 4 个题库，重新组织成「入门 → 高级」的学习顺序
//
// 设计：
// - 不复制题目内容，直接 import learn-game 的现有题库（单一数据源）
// - 从每个题库的 final-quiz stage 抽取 questions
// - 用 CURRICULUM 定义模块顺序（入门→高级）和每个模块包含哪些题
// - 每个模块标注难度区间和学习目标

import interviewAgent from '../../../learn-game/data/interview-agent.js';
import interviewEngineering from '../../../learn-game/data/interview-engineering.js';
import interviewAdvanced from '../../../learn-game/data/interview-advanced.js';
import interviewRealbugs from '../../../learn-game/data/interview-realbugs.js';

// 从题库中抽取所有 question（题库结构：stages[].questions[]）
function extractQuestions(bank) {
  const out = [];
  for (const stage of bank.stages || []) {
    if (Array.isArray(stage.questions)) out.push(...stage.questions);
  }
  return out;
}

// 把 4 个题库的题目汇总成「id -> question」的索引，便于按 id 编排
const ALL_BANKS = [interviewAgent, interviewEngineering, interviewAdvanced, interviewRealbugs];
const QUESTION_INDEX = {};
for (const bank of ALL_BANKS) {
  for (const q of extractQuestions(bank)) {
    QUESTION_INDEX[q.id] = { ...q, _bankId: bank.id, _bankTopic: bank.topic };
  }
}

// ============================================================
// 课程编排：入门 → 高级
// 6 个模块，由浅入深，每个模块对应学习项目的一个能力层次
// ============================================================
const CURRICULUM = [
  {
    id: 'mod-basics',
    order: 1,
    level: '入门',
    icon: '🌱',
    title: 'Agent 核心概念',
    summary: 'Agent 是什么、ReAct、Function Calling、bind_tools、为什么要用 Runtime。打地基的 5 个问题。',
    difficulty: '⭐ ~ ⭐⭐',
    questionIds: ['ia01', 'ia02', 'ia03', 'ia04', 'ia05'],
  },
  {
    id: 'mod-framework',
    order: 2,
    level: '进阶',
    icon: '🏗',
    title: 'LangGraph 框架原理',
    summary: 'StateGraph vs Chain、Checkpoint 三要素、astream_events、Multi-Agent 模式、预算控制。',
    difficulty: '⭐⭐ ~ ⭐⭐⭐',
    questionIds: ['ia06', 'ia07', 'ia08', 'ia09', 'ia10'],
  },
  {
    id: 'mod-engineering',
    order: 3,
    level: '工程落地',
    icon: '🔧',
    title: '工程落地：流式 / MCP / 工具选择',
    summary: 'NDJSON 协议、MCP 价值与 stdio 语义、异步并发、工具 description、LLM 如何选工具。',
    difficulty: '⭐⭐ ~ ⭐⭐⭐',
    questionIds: ['ia11', 'ia12', 'ia13', 'ia14', 'ia15', 'ieng01', 'ieng02', 'ieng03', 'ieng04'],
  },
  {
    id: 'mod-rag-eval',
    order: 4,
    level: '工程深入',
    icon: '📚',
    title: 'RAG / 评测 / 调试 / 成本',
    summary: 'RAG 6 步流程、Reranker、引用标注、Trajectory 评测、工具结果幻觉、token 成本控制、流式优化体验。',
    difficulty: '⭐⭐ ~ ⭐⭐⭐',
    questionIds: ['ieng05', 'ieng06', 'ieng07', 'ieng08', 'ieng09', 'ieng10', 'ieng11', 'ieng12'],
  },
  {
    id: 'mod-advanced',
    order: 5,
    level: '高级',
    icon: '🧠',
    title: '上下文工程 / Harness / 系统设计',
    summary: '区分度最高的考点：Context Engineering、Agent Harness 七层、12-Factor、系统设计、Agent vs Workflow 边界。',
    difficulty: '⭐⭐ ~ ⭐⭐⭐',
    questionIds: ['iadv01', 'iadv02', 'iadv03', 'iadv04', 'iadv05', 'iadv06', 'iadv07', 'iadv08', 'iadv09', 'iadv10'],
  },
  {
    id: 'mod-realworld',
    order: 6,
    level: '实战表达',
    icon: '🎤',
    title: 'STAR 项目表达 + 真实踩坑',
    summary: '怎么讲项目（STAR）、最大挑战怎么答、未来规划，以及 5 个来自本项目的真实 bug——面试官最爱追问的部分。',
    difficulty: '⭐⭐ ~ ⭐⭐⭐',
    questionIds: ['iadv11', 'iadv12', 'iadv13', 'ibug01', 'ibug02', 'ibug03', 'ibug04', 'ibug05'],
  },
];

// 组装：把每个模块的 questionIds 替换成完整 question 对象
export function getModules() {
  return CURRICULUM.map((mod) => ({
    ...mod,
    questions: mod.questionIds
      .map((id) => QUESTION_INDEX[id])
      .filter(Boolean),
  }));
}

// 全部题目（按课程顺序展平），用于「连续学习」模式
export function getAllQuestionsOrdered() {
  const out = [];
  for (const mod of CURRICULUM) {
    for (const id of mod.questionIds) {
      if (QUESTION_INDEX[id]) out.push({ ...QUESTION_INDEX[id], _moduleId: mod.id });
    }
  }
  return out;
}

// 统计信息（首页展示）
export function getStats() {
  const modules = getModules();
  const total = modules.reduce((sum, m) => sum + m.questions.length, 0);
  return {
    moduleCount: modules.length,
    questionCount: total,
  };
}

export { QUESTION_INDEX };
