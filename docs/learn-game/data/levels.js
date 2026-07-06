// 关卡注册中心：增加新关卡只需在这里 import 并加入数组

// ===== 学习关卡（M0-M5） =====
import m0 from './m0.js';
import m1 from './m1.js';
import m2 from './m2.js';
import m3 from './m3.js';
import m4 from './m4.js';
import m5 from './m5.js';
import m6 from './m6.js';
import m7 from './m7.js';
import m8 from './m8.js';
import m9 from './m9.js';

export const LEVELS = [m0, m1, m2, m3, m4, m5, m6, m7, m8, m9];

// ===== 面试题库（M0-M4 通关后可直接进入） =====
import interviewAgent from './interview-agent.js';
import interviewAdvanced from './interview-advanced.js';
import interviewEngineering from './interview-engineering.js';
import interviewRealbugs from './interview-realbugs.js';
import interviewRuntime from './interview-runtime.js';

// 面试关卡和学习关卡合并在同一个数组，排在学习关卡后面
export const LEVELS_ALL = [...LEVELS, interviewAgent, interviewAdvanced, interviewEngineering, interviewRealbugs, interviewRuntime];

// ===== 面试题库（计划中，M0-M4 通关后解锁） =====
// 面试关卡特殊设计：
// - 每题带 interviewTip（面试时怎么答能加分）
// - 每题带 projectMapping（对应项目的哪行代码）
// - 难度标注：⭐ / ⭐⭐ / ⭐⭐⭐
// - 支持"模拟面试模式"（随机抽题 + 计时）
//
// 参考题库来源：
// - adongwanai/AgentGuide（AI Agent 开发 × 面试求职一站式）
// - guocong-bincai/ai-interview-guide（AI 应用开发工程师面试宝典）
// - didilili/ai-agents-from-zero（AI 智能体开发面试题库）
//
// 接入方式（和学习关卡完全相同）：
// import interviewAgent from './interview-agent.js';
// import interviewMcp from './interview-mcp.js';
// import interviewLanggraph from './interview-langgraph.js';
// import interviewRag from './interview-rag.js';
// import interviewSystem from './interview-system.js';
// export const INTERVIEW_LEVELS = [interviewAgent, interviewMcp, interviewLanggraph, interviewRag, interviewSystem];
