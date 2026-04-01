/**
 * Agent 核心实现
 * 
 * 这是阶段 1 的核心代码，实现一个基于 LangGraph 的 Agent
 * 
 * 学习要点：
 * 1. StateGraph 状态图的构建
 * 2. 节点（Node）的定义
 * 3. 边（Edge）的连接
 * 4. 条件边的使用
 * 5. 工具调用流程
 */
import { ChatOpenAI } from '@langchain/openai';
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { StateGraph, END, MessagesAnnotation } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { ToolRegistry } from '../tools';

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
  maxIterations?: number;   // 最大迭代次数
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
// LangGraphAgent 类
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

    // 3. 构建状态图
    this.graph = this.buildGraph();
  }

  // ============================================
  // 构建状态图
  // ============================================
  private buildGraph() {
    // 创建工具节点
    const toolNode = new ToolNode(this.tools);

    // 将工具绑定到 LLM
    const llmWithTools = this.llm.bindTools(this.tools);

    // ============================================
    // 节点 1：agent - 调用 LLM
    // ============================================
    const agentNode = async (state: typeof MessagesAnnotation.State) => {
      const messages = state.messages;
      
      // 调用 LLM（带工具绑定）
      const response = await llmWithTools.invoke(messages);

      // 返回更新后的消息
      return { messages: [response] };
    };

    // ============================================
    // 条件边：判断是否需要调用工具
    // ============================================
    const shouldContinue = (state: typeof MessagesAnnotation.State): string => {
      const messages = state.messages;
      const lastMessage = messages[messages.length - 1];

      // 如果最后一条消息包含工具调用，则执行工具
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

      // 否则结束
      return END;
    };

    // ============================================
    // 构建状态图（使用内置的 MessagesAnnotation）
    // ============================================
    const workflow = new StateGraph(MessagesAnnotation)
      // 添加节点
      .addNode('agent', agentNode)
      .addNode('tools', toolNode)
      
      // 设置入口点
      .addEdge('__start__', 'agent')
      
      // 添加条件边：agent -> tools 或 END
      .addConditionalEdges('agent', shouldContinue)
      
      // 工具执行后返回 agent 继续处理
      .addEdge('tools', 'agent');

    // 编译并返回
    return workflow.compile();
  }

  // ============================================
  // 同步调用（非流式）
  // ============================================
  async invoke(messages: Array<{ role: string; content: string }>): Promise<string> {
    // 转换消息格式
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

    // 执行 Agent
    const result = await this.graph.invoke({
      messages: langchainMessages,
    });

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
    messages: Array<{ role: string; content: string }>
  ): AsyncGenerator<{ type: string; content?: string; data?: unknown }> {
    // 转换消息格式
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

    try {
      // 流式执行 Agent
      const stream = await this.graph.stream(
        { messages: langchainMessages },
        { streamMode: 'updates' }
      );

      for await (const event of stream) {
        // 事件格式：{ nodeName: { messages: [...] } }
        const nodeNames = Object.keys(event);
        
        for (const nodeName of nodeNames) {
          const nodeOutput = event[nodeName as keyof typeof event];

          if (nodeName === 'agent' && nodeOutput && typeof nodeOutput === 'object' && 'messages' in nodeOutput) {
            const messageList = nodeOutput.messages as Array<{ content: unknown; tool_calls?: unknown[] }>;
            if (messageList && messageList.length > 0) {
              const message = messageList[0];
              
              // 工具调用
              if (message.tool_calls && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
                yield {
                  type: 'tool_calls',
                  data: message.tool_calls,
                };
              }
              // 文本内容
              else if (message.content) {
                yield {
                  type: 'text',
                  content: String(message.content),
                };
              }
            }
          }
          else if (nodeName === 'tools' && nodeOutput && typeof nodeOutput === 'object' && 'messages' in nodeOutput) {
            yield {
              type: 'tool_result',
              data: nodeOutput.messages,
            };
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
  // 获取可用工具列表
  // ============================================
  getAvailableTools(): string[] {
    return this.tools.map((tool) => tool.name);
  }
}
