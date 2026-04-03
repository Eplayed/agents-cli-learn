/**
 * ============================================================
 * 💬 GroupChat 多 Agent 聊天模块 (groupchat.ts)
 * ============================================================
 *
 * 【小白必读】什么是 GroupChat？
 *
 * GroupChat = 群聊！就像微信群里多个人一起讨论问题。
 *
 * 与 Crew 的区别：
 *   Crew：    每个人各做各的，最后汇总（分工合作）
 *   GroupChat：大家在群里讨论，互相补充（头脑风暴）
 *
 * 类比：
 *   Crew = 流水线工人（各干各的）
 *   GroupChat = 开会讨论（互相交流）
 *
 * AutoGen 的 GroupChat 就是这样：
 *   多个 Agent 在一个"聊天室"里，
 *   每个 Agent 可以看到其他人的发言，
 *   然后决定自己是否要补充什么。
 *
 * ============================================================
 */

import { BaseMessage, HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { AgentInstance } from "./agents";

// ============================================================
// 📋 聊天消息类型
// ============================================================

export interface ChatMessage {
  /** 谁说的 */
  sender: string;
  /** 说了什么 */
  content: string;
  /** 什么时候说的 */
  timestamp: Date;
  /** 消息类型 */
  type: "user" | "agent" | "system";
}

// ============================================================
// ⚙️ GroupChat 配置
// ============================================================

export interface GroupChatConfig {
  /** 最多聊几轮（防止无限循环） */
  maxRounds?: number;
  /** 是否允许 Agent 之间互相回复 */
  allowAgentToAgent?: boolean;
  /** 是否打印聊天记录 */
  verbose?: boolean;
}

// ============================================================
// 🏠 GroupChat 类 - 多 Agent 聊天室
// ============================================================

/**
 * GroupChat 类
 *
 * 【概念】就像一个"会议室"：
 *   - agents[]: 参会人员
 *   - messages[]: 会议记录
 *   - manager: 会议主持人（决定谁下一个发言）
 *
 * 流程图：
 *   用户提问
 *      │
 *      ▼
 *   ┌──────────────────┐
 *   │   Manager 分析    │  ← 谁最适合回答？
 *   └────────┬─────────┘
 *            │
 *            ▼
 *   Agent A 发言
 *      │
 *      ▼
 *   ┌──────────────────┐
 *   │   Manager 判断    │  ← 需要其他人补充吗？
 *   └────────┬─────────┘
 *         是 │    │ 否
 *            ▼    ▼
 *      Agent B 发言  结束
 *            │
 *            ▼
 *         ... 循环 ...
 *
 * 用法：
 * ```typescript
 * const chat = new GroupChat([researcher, writer, reviewer]);
 * const result = await chat.chat("AI Agent 的未来是什么？");
 * ```
 */
export class GroupChat {
  private agents: AgentInstance[];
  private messages: ChatMessage[] = [];
  private manager: ChatOpenAI;
  private config: Required<GroupChatConfig>;

  constructor(
    agents: AgentInstance[],
    apiKey: string,
    model: string = "gpt-4o-mini",
    config?: GroupChatConfig
  ) {
    this.agents = agents;
    this.config = {
      maxRounds: config?.maxRounds ?? 5,
      allowAgentToAgent: config?.allowAgentToAgent ?? true,
      verbose: config?.verbose ?? true,
    };

    // Manager LLM（主持人用的大脑）
    this.manager = new ChatOpenAI({
      modelName: model,
      temperature: 0.3, // 主持人需要理性，温度低一点
      openAIApiKey: apiKey,
    });
  }

  /**
   * 发起一次群聊
   *
   * @param userMessage 用户的问题
   * @returns 最终的回答
   */
  async chat(userMessage: string): Promise<{
    finalAnswer: string;
    messages: ChatMessage[];
    rounds: number;
  }> {
    // 清空历史
    this.messages = [];

    // 添加用户消息
    this.addMessage("User", userMessage, "user");
    this.log("💬 User: " + userMessage);

    let round = 0;
    let lastSpeaker = "";

    while (round < this.config.maxRounds) {
      round++;
      this.log(`\n--- Round ${round}/${this.config.maxRounds} ---`);

      // ─────────────────────────────────────────────────────
      // Step 1: Manager 决定下一个发言者
      // ─────────────────────────────────────────────────────
      const nextSpeaker = await this.selectNextSpeaker(lastSpeaker);

      // 如果 manager 说 "结束"，就退出循环
      if (nextSpeaker === "END") {
        this.log("🏁 Manager: 讨论结束");
        break;
      }

      // ─────────────────────────────────────────────────────
      // Step 2: 选中的 Agent 发言
      // ─────────────────────────────────────────────────────
      const agent = this.agents.find(
        (a) => a.profile.name === nextSpeaker
      );
      if (!agent) {
        this.log(`⚠️ 未找到 Agent: ${nextSpeaker}，跳过`);
        break;
      }

      const response = await agent.execute(
        this.buildAgentPrompt(agent.profile.name)
      );

      this.addMessage(agent.profile.name, response, "agent");
      this.log(
        `🗣️ ${agent.profile.name}(${agent.profile.role}): ` +
        response.slice(0, 150) + (response.length > 150 ? "..." : "")
      );

      lastSpeaker = agent.profile.name;
    }

    // 返回最后一个 Agent 的回答作为最终答案
    const lastAgentMsg = [...this.messages]
      .reverse()
      .find((m) => m.type === "agent");

    return {
      finalAnswer: lastAgentMsg?.content || "讨论未得出结论",
      messages: [...this.messages],
      rounds: round,
    };
  }

  /**
   * Manager 选择下一个发言者
   *
   * 【概念】这是 GroupChat 的核心逻辑：
   *   Manager 看了聊天记录后，判断：
   *   - 该谁说了？
   *   - 还是说已经可以结束了？
   */
  private async selectNextSpeaker(
    lastSpeaker: string
  ): Promise<string> {
    const agentList = this.agents
      .filter((a) =>
        this.config.allowAgentToAgent || lastSpeaker !== a.profile.name
      )
      .map((a) => `${a.profile.name}(${a.profile.role})`)
      .join(", ");

    const prompt = `你是群聊的管理者，负责决定下一个发言者。

## 参会人员
${agentList}

## 聊天记录
${this.messages.map((m) => `[${m.sender}]: ${m.content.slice(0, 100)}`).join("\n")}

## 上一个发言者
${lastSpeaker}

## 你的任务
请判断：应该让谁继续发言，还是结束讨论？

回答规则：
1. 如果讨论还不充分，选择一个最合适的参会人员的名字
2. 如果讨论已经足够充分，回答 "END"
3. 如果某个 Agent 已经重复发言，不要让他继续
4. 每个人员最多发言 2 次

只回答一个人名或 "END"，不要解释。`;

    const response = await this.manager.invoke([
      new SystemMessage("你是群聊管理者，只回答一个人名或 END。"),
      new HumanMessage(prompt),
    ]);

    const answer = (response.content as string).trim();
    return answer === "END" ? "END" : answer;
  }

  /**
   * 为 Agent 构建提示词（包含聊天记录）
   */
  private buildAgentPrompt(agentName: string): string {
    const chatHistory = this.messages
      .map((m) => `[${m.sender}]: ${m.content}`)
      .join("\n");

    return `你正在参加一个多人讨论。

## 讨论记录
${chatHistory}

## 你的名字
${agentName}

## 要求
1. 基于前面的讨论，补充你的观点
2. 不要重复别人已经说过的内容
3. 如果你觉得讨论已经足够，可以说"我同意以上观点"
4. 保持简洁，重点突出`;
  }

  /**
   * 添加消息到聊天记录
   */
  private addMessage(
    sender: string,
    content: string,
    type: "user" | "agent" | "system"
  ): void {
    this.messages.push({
      sender,
      content,
      timestamp: new Date(),
      type,
    });
  }

  /**
   * 打印日志
   */
  private log(message: string): void {
    if (this.config.verbose) {
      console.log(message);
    }
  }
}
