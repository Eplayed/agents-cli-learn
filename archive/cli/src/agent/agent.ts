/**
 * ============================================================
 * 🤖 Agent 核心实现 (agent.ts)
 * ============================================================
 *
 * 【小白必读】这个文件是做什么的？
 *
 * 这个文件是整个 Agent 的"大脑"！
 * 它负责：
 *   1. 把用户的提问发送给 AI 模型
 *   2. 让 AI 决定是否需要调用工具
 *   3. 如果需要，调用工具并获取结果
 *   4. 把结果整理成人类能看懂的回答
 *
 * 核心概念：
 * - LangGraph = 状态机框架（让 AI 按流程办事）
 * - StateGraph = 状态图（AI 的工作流程图）
 * - Checkpoint = 记忆（保存对话历史，下次还能接着聊）
 * ============================================================
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

// ============================================================
// 🧠 引入 LangGraph 的"记忆"功能
// ============================================================
// MemorySaver 就像一个"记事本"，会自动把每次对话记录下来
// 这样用户下次再来，Agent 还能记得之前聊了什么
import { MemorySaver } from '@langchain/langgraph-checkpoint';

// 创建全局唯一的"记事本"实例
// 【概念】checkpointer 负责把状态保存到内存中
const checkpointer = new MemorySaver();

// ============================================================
// ⚙️ Agent 配置接口
// ============================================================//
// 就像买手机时需要选配置（内存、颜色、存储空间）
// 创建 Agent 时需要传入这些参数
export interface AgentConfig {
  apiKey: string;           // 【必须】OpenAI API 密钥，就像"身份证号"
  baseURL?: string;         // 【可选】如果用其他 AI 服务，需要填这个
  model?: string;           // 【可选】用哪个 AI 模型，默认 gpt-4o-mini
  temperature?: number;     // 【可选】AI 的"创意程度"，0-2，越高越有创意
  systemPrompt?: string;    // 【可选】给 AI 的"人设"，比如"你是一个温柔的助手"
  tools?: string[];         // 【可选】允许 AI 使用哪些工具，不填则全部可用
  maxIterations?: number;   // 【可选】最多思考几轮，防止死循环
}

// ============================================================
// 🎫 会话配置：每场对话的"门票"
// ============================================================//
// 当用户发起一次对话时，需要给他一个"门票"（会话 ID）
// 这样就能区分是谁在说话，不会把 A 的话当成 B 的
export interface SessionConfig {
  threadId: string;        // 会话 ID，比如 "user-123-session"
  checkpointId?: string;   // 可选：恢复到之前的某个时间点
}

// ============================================================
// 💬 默认系统提示（AI 的人设）
// ============================================================// 这段文字会在每次对话开始时告诉 AI：
// "你是谁"、"你能做什么"、"用户该怎么跟你说话"
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

// ============================================================
// 🏗️ LangGraphAgent 类 - Agent 的"大脑"
// ============================================================//
// 这个类封装了所有 Agent 的能力
// 外部代码只需要创建这个类的实例，就能使用 Agent
export class LangGraphAgent {
  // graph：状态图，整个工作流程的"路线图"
  private graph: ReturnType<typeof this.buildGraph>;

  // llm：大型语言模型，AI 的"大脑"
  private llm: ChatOpenAI;

  // tools：工具箱，AI 可以调用的"技能"
  private tools: ReturnType<typeof ToolRegistry.getToolsByNames>;

  // config：配置，Agent 的"参数"
  private config: AgentConfig;

  // ============================================================
  // 🎬 构造函数：创建 Agent 实例
  // ============================================================//
  // 就像"组装电脑"：把 CPU、内存、硬盘装进机箱
  constructor(config: AgentConfig) {
    this.config = config;

    // 步骤 1：安装"CPU" - 创建 LLM 实例
    // 这是 AI 的"大脑"，负责处理文字
    this.llm = new ChatOpenAI({
      modelName: config.model || 'gpt-4o-mini',   // 用什么模型
      temperature: config.temperature ?? 0.7,      // 多"聪明"
      openAIApiKey: config.apiKey,                 // 身份证
      // 如果用了"魔法上网"，需要自定义 baseURL
      configuration: config.baseURL ? { baseURL: config.baseURL } : undefined,
    });

    // 步骤 2：准备"工具箱" - 获取可用的工具
    // 用户指定了哪些工具就用哪些，没指定就全部用
    this.tools = config.tools
      ? ToolRegistry.getToolsByNames(config.tools)
      : ToolRegistry.getAll();

    // 步骤 3：搭建"生产线" - 构建状态图
    // 告诉 AI：遇到问题该怎么处理，先做什么、后做什么
    this.graph = this.buildGraph();
  }

  // ============================================================
  // 🗺️ 构建状态图（整个 Agent 的核心！）
  // ============================================================//
  //
  // 【小白必读】什么是状态图？
  // 想象一个"流水线"：
  //   1. 用户说话 → 2. AI 思考 → 3. 需要工具吗？
  //                                  ↓ 是
  //                              4. 调用工具 → 5. 返回结果给 AI
  //                                  ↓ 否
  //                              6. 直接回答用户
  //
  // 这就是状态图要做的事情：定义每一步该做什么，以及下一步该去哪
  //
  private buildGraph() {
    // ─────────────────────────────────────────────────────────
    // 第 1 步：创建"工具执行器" (toolNode)
    // ─────────────────────────────────────────────────────────
    // 当 AI 说"我要用工具"时，这个节点负责实际执行工具
    // 类似于：厨房里的"厨师"，AI 是"服务员"
    // AI 负责点菜，厨师负责炒菜
    const toolNode = new ToolNode(this.tools);

    // ─────────────────────────────────────────────────────────
    // 第 2 步：给 AI 装上"工具"（bindTools）
    // ─────────────────────────────────────────────────────────
    // 相当于告诉 AI："你有这些工具，想用就直接说"
    const llmWithTools = this.llm.bindTools(this.tools);

    // ─────────────────────────────────────────────────────────
    // 第 3 步：定义"AI 思考节点" (agentNode)
    // ─────────────────────────────────────────────────────────
    // 这是整个流程的核心：AI 收到用户问题后，开始"思考"
    //
    // state 是什么？
    //   就像一张"白纸"，上面记录了：
    //   - 用户之前说过什么
    //   - AI 之前回答过什么
    //   - 工具返回过什么结果
    //
    const agentNode = async (state: typeof MessagesAnnotation.State) => {
      const messages = state.messages;  // 取出对话历史
      const response = await llmWithTools.invoke(messages);  // AI 思考并回答
      return { messages: [response] };  // 把回答写回"白纸"
    };

    // ─────────────────────────────────────────────────────────
    // 第 4 步：定义"判断规则" (shouldContinue)
    // ─────────────────────────────────────────────────────────
    // AI 回答完后，需要决定下一步做什么：
    //   - 如果 AI 说"我要用工具" → 去执行工具
    //   - 如果 AI 直接回答了 → 结束
    //
    const shouldContinue = (state: typeof MessagesAnnotation.State): string => {
      const messages = state.messages;
      const lastMessage = messages[messages.length - 1];  // AI 说的最后一句话

      // 检查 AI 是否要求调用工具
      if (
        lastMessage &&
        'tool_calls' in lastMessage &&
        lastMessage.tool_calls &&
        Array.isArray(lastMessage.tool_calls) &&
        lastMessage.tool_calls.length > 0
      ) {
        // AI 要求调用工具！告诉系统：去 "tools" 节点
        const toolNames = lastMessage.tool_calls
          .map((t: { name: string }) => t.name).join(', ');
        console.log('\n🔧 AI 决定调用工具:', toolNames);
        return 'tools';
      }

      // AI 没有要求调用工具，流程结束
      return END;
    };

    // ─────────────────────────────────────────────────────────
    // 第 5 步：组装"生产线" (StateGraph)
    // ─────────────────────────────────────────────────────────
    //
    //  workflow = new StateGraph(MessagesAnnotation)
    //                    ↑
    //              使用 LangGraph 内置的消息状态类型
    //
    // .addNode('agent', agentNode)
    //              ↑
    //        给节点起个名字"agent"，用于流程中引用
    //
    // .addEdge('__start__', 'agent')
    //              ↑
    //        起点（用户输入）直接到 agent 节点
    //
    // .addConditionalEdges('agent', shouldContinue)
    //              ↑
    //        agent 节点之后的路径不是固定的，根据 shouldContinue 的返回值决定
    //
    // .addEdge('tools', 'agent')
    //              ↑
    //        工具执行完后，回到 agent 节点，让 AI 继续处理结果
    //
    const workflow = new StateGraph(MessagesAnnotation)
      .addNode('agent', agentNode)           // 添加 AI 思考节点
      .addNode('tools', toolNode)            // 添加工具执行节点
      .addEdge('__start__', 'agent')          // 入口：用户输入 → AI 思考
      .addConditionalEdges('agent', shouldContinue)  // 分支：AI 决定后续路径
      .addEdge('tools', 'agent');           // 循环：工具 → AI

    // ─────────────────────────────────────────────────────────
    // 第 6 步：编译并启用"记忆"功能 (Checkpoint)
    // ─────────────────────────────────────────────────────────
    //
    // 【关键】checkpointer 参数：
    //   有了它，每次对话结束后，状态会被自动保存
    //   下次用户再来，只需要传入相同的 threadId
    //   Agent 就能"恢复记忆"，知道之前聊过什么
    //
    return workflow.compile({
      checkpointer: checkpointer,  // 启用记忆功能
    });
  }

  // ============================================================
  // 🗣️ 同步调用（非流式）- 适合简单场景
  // ============================================================//
  //
  // 【概念】同步 vs 流式：
  //   - 同步：等 AI 完全回答完，一次性返回结果
  //   - 流式：AI 边说边返回，就像打字机效果
  //
  // 这个方法返回的是"完整答案"，不是"一点一点"返回
  async invoke(
    messages: Array<{ role: string; content: string }>,
    sessionConfig?: SessionConfig
  ): Promise<string> {
    // 把普通消息格式转成 LangChain 的消息对象
    const langchainMessages = this.convertMessages(messages);

    // 构建会话配置（包含 threadId，用于记忆恢复）
    const invokeConfig: { configurable: Record<string, string> } = {
      configurable: {
        thread_id: sessionConfig?.threadId || 'default',
      },
    };

    // 如果指定了 checkpointId，恢复到之前的某个状态
    if (sessionConfig?.checkpointId) {
      invokeConfig.configurable.checkpoint_id = sessionConfig.checkpointId;
    }

    // 执行 Agent！
    const result = await this.graph.invoke(
      { messages: langchainMessages },
      invokeConfig
    );

    // 取出 AI 的最后一条回答，返回给用户
    const lastMessage = result.messages[result.messages.length - 1];
    return typeof lastMessage.content === 'string'
      ? lastMessage.content
      : JSON.stringify(lastMessage.content);
  }

  // ============================================================
  // 🌊 流式调用 - 返回"打字机"效果
  // ============================================================//
  //
  // 【场景】当回答很长时（如写文章、解释概念）
  //   用流式调用可以让用户"边看边等"，体验更好
  //
  // yield 的意思是"让出"：每次输出一点，就"让出"给调用者
  // 这样调用者可以立即处理这个片段，而不是等全部说完
  //
  async *stream(
    messages: Array<{ role: string; content: string }>,
    sessionConfig?: SessionConfig
  ): AsyncGenerator<{ type: string; content?: string; data?: unknown }> {
    const langchainMessages = this.convertMessages(messages);

    const streamConfig = {
      configurable: {
        thread_id: sessionConfig?.threadId || 'default',
      },
    };

    try {
      // 使用 streamMode: 'updates' 模式，获取每一步的更新
      const stream = await this.graph.stream(
        { messages: langchainMessages },
        { ...streamConfig, streamMode: 'updates' }
      );

      // 遍历每一个"事件"
      for await (const event of stream) {
        const nodeNames = Object.keys(event);

        for (const nodeName of nodeNames) {
          const nodeOutput = event[nodeName as keyof typeof event];

          // agent 节点的输出（AI 的思考结果）
          if (nodeName === 'agent' && nodeOutput && typeof nodeOutput === 'object' && 'messages' in nodeOutput) {
            const messageList = nodeOutput.messages as Array<{ content: unknown; tool_calls?: unknown[] }>;
            if (messageList && messageList.length > 0) {
              const message = messageList[0];

              // 如果 AI 决定调用工具
              if (message.tool_calls && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
                yield { type: 'tool_calls', data: message.tool_calls };
              }
              // 如果 AI 直接回答了
              else if (message.content) {
                yield { type: 'text', content: String(message.content) };
              }
            }
          }
          // tools 节点的输出（工具执行结果）
          else if (nodeName === 'tools' && nodeOutput && typeof nodeOutput === 'object' && 'messages' in nodeOutput) {
            yield { type: 'tool_result', data: nodeOutput.messages };
          }
        }
      }

      // 全部完成
      yield { type: 'done' };
    } catch (error) {
      // 出错了
      yield {
        type: 'error',
        content: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ============================================================
  // 📜 获取会话历史 - 看看之前聊过什么
  // ============================================================//
  // threadId：会话 ID
  // limit：最多返回多少条消息
  async getSessionHistory(
    threadId: string,
    limit: number = 10
  ): Promise<Array<{ role: string; content: string }>> {
    try {
      const config = { configurable: { thread_id: threadId } };

      // 获取当前状态
      const state = await this.graph.getState(config);

      if (!state || !state.values || !state.values.messages) {
        return [];
      }

      // 获取历史记录（通过 getStateHistory）
      const allStates: StateSnapshot[] = [];
      for await (const checkpoint of this.graph.getStateHistory(config)) {
        allStates.push(checkpoint);
        if (allStates.length >= limit) break;
      }

      if (allStates.length === 0) {
        return [];
      }

      // 从最新状态中提取消息
      const latestState = allStates[0];
      const messages = latestState.values?.messages as BaseMessage[] || [];

      // 转换成通用格式
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

  // ============================================================
  // 📍 列出所有检查点 - "时光机"功能
  // ============================================================//
  // 每次对话都会生成一个"快照"（检查点）
  // 这个方法列出所有的快照，方便用户"回到过去"
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

  // ============================================================
  // ⏪ 恢复到特定检查点 - "时光倒流"
  // ============================================================//
  // 输入一个 checkpointId，就能让 Agent 回到那个时间点的状态
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

  // ============================================================
  // 🗑️ 删除会话 - "格式化"
  // ============================================================//
  // 删除某个会话的所有记录，就像"清除记忆"
  async deleteSession(threadId: string): Promise<void> {
    try {
      await checkpointer.deleteThread(threadId);
      console.log(`🗑️ 会话 ${threadId} 已删除`);
    } catch (error) {
      console.error('删除会话失败:', error);
    }
  }

  // ============================================================
  // 🔄 辅助方法：消息格式转换
  // ============================================================//
  // 用户发的消息格式（role: 'user', content: '你好'）
  // → LangChain 的消息对象（new HumanMessage('你好')）
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

    // 如果第一条不是系统消息，自动添加默认的"人设"
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

  // ============================================================
  // 📦 获取可用工具列表
  // ============================================================//
  getAvailableTools(): string[] {
    return this.tools.map((tool) => tool.name);
  }
}