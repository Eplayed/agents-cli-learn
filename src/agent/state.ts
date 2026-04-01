/**
 * Agent 状态定义
 * 
 * LangGraph 使用 Annotation 来定义 Agent 的状态结构
 * 状态会在各个节点之间传递和更新
 */
import { Annotation } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';

// 定义 Agent 状态（简化版）
export const AgentState = Annotation.Root({
  // 消息历史：包含所有对话消息
  messages: Annotation<BaseMessage[]>,
  
  // 会话 ID
  chatId: Annotation<string>,
  
  // 可用工具列表
  tools: Annotation<string[]>,
  
  // 推理过程
  reasoning: Annotation<string>,
});

// 导出状态类型
export type AgentStateType = typeof AgentState.State;
