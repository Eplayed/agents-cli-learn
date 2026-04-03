/**
 * Agent 核心实现 - 带 Checkpoint 记忆
 * 
 * 阶段 2 进阶功能：
 * 1. Checkpoint 状态持久化
 * 2. 会话恢复
 * 3. 记忆管理
 */
import { ChatOpenAI } from '@langchain/openai';
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  BaseMessage,
} from '@langchain/core/messages';
import { StateGraph, END, MessagesAnnotation, StateSnapshot } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { ToolRegistry } from '../tools';

// ============================================
// 新增：Checkpoint 内存存储
// ============================================
import { MemorySaver } from '@langchain/langgraph-checkpoint';

// 内存中的 Checkpoint 存储
const checkpointer = new MemorySaver();

// ============================================
// Agent 配置接口
// ============================================
export interface AgentConfig {
  apiKey: string;           // OpenAI API Key
  baseURL?: string;         // API 基础 URL（可选）
  model?: string;           // 模型名称，默认 gpt-4o-mini
  temperature?: number;     // 温度参数，默认 0.7
  systemPrompt?: string;    // 系统提示
  tools?: string[];         // 启用的工具列表
  maxIterations?: number;  // 最大迭代次数
}

// ============================================
// 会话配置
// ============================================
export interface SessionConfig {
  threadId: string;        // 会话 ID
  checkpointId?: string;    // 检查点 ID（可选，恢复特定版本）
}

// ============================================
// 默认系统提示
// ============================================
const DEFAULT_SYSTEM_PROMPT = `你是一个智能助手，帮助用户解答问题。

## 你的能力
- 你可以回答一般性问题
- 你可以查询天气信息
- 你可以联网搜索信息
- 你可以进行数学计算

## 工具使用规则
- 当用户询问天气时，使用 get_weather 工具
- 当需要最新信息时，使用 search_web 工具
- 当需要计算时，使用 calculator 工具
- 如果不需要工具就能回答，直接回答即可

## 回答风格
- 简洁明了，避免冗余
- 使用中文回答
- 友好、专业`;

// ============================================
// LangGraphAgent 类（带 Checkpoint 支持）
// ============================================
export class LangGraphAgent {
  private graph: ReturnType<typeof this.buildGraph>;
  private llm: ChatOpenAI;
  private tools: ReturnType<typeof ToolRegistry.getToolsByNames>;
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;

    // 1. 创建 LLM 实例
    this.llm = new ChatOpenAI({
      modelName: config.model || 'gpt-4o-mini',
      temperature: config.temperature ?? 0.7,
      openAIApiKey: config.apiKey,
      configuration: config.baseURL ? { baseURL: config.baseURL } : undefined,
    });

    // 2. 获取工具
    this.tools = config.tools
      ? ToolRegistry.getToolsByNames(config.tools)
      : ToolRegistry.getAll();

    // 3. 构建状态图（带 Checkpoint）
    this.graph = this.buildGraph();
  }

  // ============================================
  // 构建状态图（带 Checkpoint 支持）
  // ============================================
  private buildGraph() {
    // 创建工具节点
    const toolNode = new ToolNode(this.tools);

    // 将工具绑定到 LLM
    const llmWithTools = this.llm.bindTools(this.tools);

    // 节点 1：agent - 调用 LLM
    const agentNode = async (state: typeof MessagesAnnotation.State) => {
      const messages = state.messages;
      const response = await llmWithTools.invoke(messages);
      return { messages: [response] };
    };

    // 条件边：判断是否需要调用工具
    const shouldContinue = (state: typeof MessagesAnnotation.State): string => {
      const messages = state.messages;
      const lastMessage = messages[messages.length - 1];

      if (
        lastMessage &&
        'tool_calls' in lastMessage &&
        lastMessage.tool_calls &&
        Array.isArray(lastMessage.tool_calls) &&
        lastMessage.tool_calls.length > 0
      ) {
        const toolNames = lastMessage.tool_calls
          .map((t: { name: string }) => t.name).join(', ');
        console.log('\n🔧 调用工具:', toolNames);
        return 'tools';
      }

      return END;
    };

    // 构建状态图
    const workflow = new StateGraph(MessagesAnnotation)
      .addNode('agent', agentNode)
      .addNode('tools', toolNode)
      .addEdge('__start__', 'agent')
      .addConditionalEdges('agent', shouldContinue)
      .addEdge('tools', 'agent');

    // 编译并启用 Checkpoint
    // ============================================
    // 关键：添加 checkpointer 实现记忆持久化
    // ============================================
    return workflow.compile({
      checkpointer: checkpointer,
    });
  }

  // ============================================
  // 同步调用（非流式）
  // ============================================
  async invoke(
    messages: Array<{ role: string; content: string }>,
    sessionConfig?: SessionConfig
  ): Promise<string> {
    const langchainMessages = this.convertMessages(messages);

    // 构建执行配置
    const invokeConfig: { configurable: Record<string, string> } = {
      configurable: {
        thread_id: sessionConfig?.threadId || 'default',
      },
    };

    // 如果指定了 checkpointId，恢复到特定版本
    if (sessionConfig?.checkpointId) {
      invokeConfig.configurable.checkpoint_id = sessionConfig.checkpointId;
    }

    // 执行 Agent
    const result = await this.graph.invoke(
      { messages: langchainMessages },
      invokeConfig
    );

    // 提取最后一条消息
    const lastMessage = result.messages[result.messages.length - 1];
    return typeof lastMessage.content === 'string'
      ? lastMessage.content
      : JSON.stringify(lastMessage.content);
  }

  // ============================================
  // 流式调用
  // ============================================
  async *stream(
    messages: Array<{ role: string; content: string }>,
    sessionConfig?: SessionConfig
  ): AsyncGenerator<{ type: string; content?: string; data?: unknown }> {
    const langchainMessages = this.convertMessages(messages);

    // 构建执行配置
    const streamConfig = {
      configurable: {
        thread_id: sessionConfig?.threadId || 'default',
      },
    };

    try {
      const stream = await this.graph.stream(
        { messages: langchainMessages },
        { ...streamConfig, streamMode: 'updates' }
      );

      for await (const event of stream) {
        const nodeNames = Object.keys(event);
        
        for (const nodeName of nodeNames) {
          const nodeOutput = event[nodeName as keyof typeof event];

          if (nodeName === 'agent' && nodeOutput && typeof nodeOutput === 'object' && 'messages' in nodeOutput) {
            const messageList = nodeOutput.messages as Array<{ content: unknown; tool_calls?: unknown[] }>;
            if (messageList && messageList.length > 0) {
              const message = messageList[0];
              
              if (message.tool_calls && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
                yield { type: 'tool_calls', data: message.tool_calls };
              }
              else if (message.content) {
                yield { type: 'text', content: String(message.content) };
              }
            }
          }
          else if (nodeName === 'tools' && nodeOutput && typeof nodeOutput === 'object' && 'messages' in nodeOutput) {
            yield { type: 'tool_result', data: nodeOutput.messages };
          }
        }
      }

      yield { type: 'done' };
    } catch (error) {
      yield {
        type: 'error',
        content: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ============================================
  // 新增：获取会话历史
  // ============================================
  async getSessionHistory(
    threadId: string,
    limit: number = 10
  ): Promise<Array<{ role: string; content: string }>> {
    try {
      const config = { configurable: { thread_id: threadId } };
      
      // 使用 getState 获取当前状态
      const state = await this.graph.getState(config);
      
      if (!state || !state.values || !state.values.messages) {
        return [];
      }

      // 获取所有历史记录
      const allStates: StateSnapshot[] = [];
      for await (const checkpoint of this.graph.getStateHistory(config)) {
        allStates.push(checkpoint);
        if (allStates.length >= limit) break;
      }

      // 从最新的 checkpoint 中获取消息
      if (allStates.length === 0) {
        return [];
      }

      const latestState = allStates[0];
      const messages = latestState.values?.messages as BaseMessage[] || [];
      
      return messages.map((msg) => {
        if (msg instanceof HumanMessage) {
          return { role: 'user', content: msg.content as string };
        } else if (msg instanceof AIMessage) {
          return { role: 'assistant', content: msg.content as string };
        } else if (msg instanceof SystemMessage) {
          return { role: 'system', content: msg.content as string };
        }
        return { role: 'user', content: String(msg.content) };
      });
    } catch (error) {
      console.error('获取会话历史失败:', error);
      return [];
    }
  }

  // ============================================
  // 新增：列出所有检查点
  // ============================================
  async listCheckpoints(threadId: string): Promise<Array<{ id: string; timestamp: string }>> {
    try {
      const config = { configurable: { thread_id: threadId } };
      const checkpoints: Array<{ id: string; timestamp: string }> = [];
      
      for await (const checkpoint of this.graph.getStateHistory(config)) {
        const checkpointId = checkpoint.config?.configurable?.checkpoint_id as string;
        if (checkpointId) {
          checkpoints.push({
            id: checkpointId,
            timestamp: checkpoint.createdAt || new Date().toISOString(),
          });
        }
      }
      
      return checkpoints;
    } catch (error) {
      console.error('列出检查点失败:', error);
      return [];
    }
  }

  // ============================================
  // 新增：恢复到特定检查点
  // ============================================
  async restoreCheckpoint(threadId: string, checkpointId: string): Promise<boolean> {
    try {
      const config = {
        configurable: {
          thread_id: threadId,
          checkpoint_id: checkpointId,
        },
      };
      
      await this.graph.getState(config);
      console.log(`✅ 已恢复到检查点: ${checkpointId}`);
      return true;
    } catch (error) {
      console.error('恢复检查点失败:', error);
      return false;
    }
  }

  // ============================================
  // 新增：删除会话
  // ============================================
  async deleteSession(threadId: string): Promise<void> {
    // 使用 MemorySaver 的 deleteThread 方法
    try {
      await checkpointer.deleteThread(threadId);
      console.log(`🗑️ 会话 ${threadId} 已删除`);
    } catch (error) {
      console.error('删除会话失败:', error);
    }
  }

  // ============================================
  // 辅助方法：转换消息格式
  // ============================================
  private convertMessages(messages: Array<{ role: string; content: string }>) {
    const langchainMessages = messages.map((msg) => {
      switch (msg.role) {
        case 'system':
          return new SystemMessage(msg.content);
        case 'user':
          return new HumanMessage(msg.content);
        case 'assistant':
          return new AIMessage(msg.content);
        default:
          return new HumanMessage(msg.content);
      }
    });

    // 添加系统提示
    if (
      langchainMessages.length === 0 ||
      !(langchainMessages[0] instanceof SystemMessage)
    ) {
      langchainMessages.unshift(
        new SystemMessage(this.config.systemPrompt || DEFAULT_SYSTEM_PROMPT)
      );
    }

    return langchainMessages;
  }

  // 获取可用工具列表
  getAvailableTools(): string[] {
    return this.tools.map((tool) => tool.name);
  }
}