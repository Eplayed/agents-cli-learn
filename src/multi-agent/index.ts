/**
 * ============================================================
 * 📦 Multi-Agent 模块导出
 * ============================================================
 *
 * 本模块包含 Multi-Agent 协作的所有组件：
 *
 * agents.ts   - Agent 角色定义和工厂
 * crew.ts     - Crew 编排（Sequential/Parallel/Supervisor）
 * groupchat.ts - GroupChat 群聊（AutoGen 风格）
 * team.ts     - LangGraph 驱动的 Multi-Agent
 *
 * 【快速上手】
 * ```typescript
 * import { AgentFactory, Crew, executeSequential, GroupChat, TeamGraph } from "./multi-agent";
 *
 * // 方式 1: Crew 顺序执行
 * const researcher = AgentFactory.create("researcher", apiKey);
 * const writer = AgentFactory.create("writer", apiKey);
 * const crew = new Crew("内容团队");
 * crew.runSequential([task1, task2]);
 *
 * // 方式 2: GroupChat 群聊
 * const chat = new GroupChat([researcher, writer, reviewer], apiKey);
 * await chat.chat("AI 的未来是什么？");
 *
 * // 方式 3: LangGraph TeamGraph
 * const team = new TeamGraph({ apiKey });
 * await team.run("写一篇关于 AI 的文章");
 * ```
 */

// agents.ts - Agent 角色定义
export {
  AgentInstance,
  AgentFactory,
  AGENT_TEMPLATES,
} from "./agents";
export type { AgentProfile } from "./agents";

// crew.ts - Crew 编排
export {
  Crew,
  executeSequential,
  executeParallel,
  executeSupervisor,
} from "./crew";
export type { Task, TaskResult, CrewResult } from "./crew";

// groupchat.ts - GroupChat 群聊
export { GroupChat } from "./groupchat";
export type { ChatMessage, GroupChatConfig } from "./groupchat";

// team.ts - LangGraph Multi-Agent
export { TeamGraph } from "./team";
