// 关卡注册中心：增加新关卡只需在这里 import 并加入数组

// ===== 学习关卡（M0-M5） =====
import m0 from './m0.js';
import m1 from './m1.js';
import m2 from './m2.js';
import m3 from './m3.js';
import m4 from './m4.js';
import m5 from './m5.js';

export const LEVELS = [m0, m1, m2, m3, m4, m5];

// ===== 面试题库（M0-M4 通关后可直接进入） =====
import interviewAgent from './interview-agent.js';

// 面试关卡和学习关卡合并在同一个数组，排在学习关卡后面
// 通关条件：前面关卡全部完成才解锁（和学习关卡一样的解锁制）
export const LEVELS_ALL = [...LEVELS, interviewAgent];

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
