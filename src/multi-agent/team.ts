/**
 * ============================================================
 * 🏛️ LangGraph Multi-Agent 团队编排 (team.ts)
 * ============================================================
 *
 * 【小白必读】用 LangGraph 实现 Multi-Agent！
 *
 * 前面的 agents.ts + crew.ts + groupchat.ts 是"手动编排"
 * 这个模块用 LangGraph 的 StateGraph 实现"自动编排"
 *
 * 区别：
 *   手动编排 → 你写代码决定谁先做、谁后做
 *   LangGraph → AI 自己决定流程（状态机驱动）
 *
 * 【核心思想】
 * 把每个 Agent 当作 StateGraph 的一个节点（Node），
 * 然后用条件边（ConditionalEdge）让 AI 决定下一步去哪。
 *
 * 流程图：
 *          ┌──────────┐
 *   START ─┤ Supervisor│ ──→ Router ──→ Researcher
 *          │  (LLM)   │                Writer
 *          └──────────┘                Reviewer
 *                                      │
 *                                      ▼
 *                                  Synthesizer ──→ END
 *
 * ============================================================
 */

import { StateGraph, END, Annotation } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { AgentFactory } from "./agents";

// ============================================================
// 📦 团队状态定义
// ============================================================

/**
 * 团队协作的状态
 *
 * 【概念】状态 = 白板，记录整个团队的进展
 *   - messages: 对话历史
 *   - currentAgent: 当前在处理的是谁
 *   - task: 用户的需求
 *   - research: 研究员的产出
 *   - article: 作家的产出
 *   - review: 审稿人的产出
 *   - iteration: 第几轮了（防止死循环）
 */
const TeamState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (_left, right) => right,
  }),
  currentAgent: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => "supervisor",
  }),
  task: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => "",
  }),
  research: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => "",
  }),
  article: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => "",
  }),
  review: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => "",
  }),
  iteration: Annotation<number>({
    reducer: (_left, right) => right,
    default: () => 0,
  }),
});

// ============================================================
// 🏛️ TeamGraph 类 - LangGraph 驱动的 Multi-Agent
// ============================================================

/**
 * TeamGraph 类
 *
 * 【用法】
 * ```typescript
 * const team = new TeamGraph({ apiKey: "xxx" });
 * const result = await team.run("写一篇关于 AI Agent 的文章");
 * ```
 */
export class TeamGraph {
  private llm: ChatOpenAI;
  private graph: ReturnType<typeof this.buildGraph>;
  private apiKey: string;
  private model: string;

  constructor(config: { apiKey: string; model?: string }) {
    this.apiKey = config.apiKey;
    this.model = config.model || "gpt-4o-mini";

    this.llm = new ChatOpenAI({
      modelName: this.model,
      temperature: 0.7,
      openAIApiKey: this.apiKey,
    });

    this.graph = this.buildGraph();
  }

  /**
   * 构建 StateGraph
   *
   * 【小白必读】节点说明：
   *   supervisor: 主管，决定下一步该谁做
   *   researcher: 研究员，搜索和整理信息
   *   writer:     作家，根据研究写文章
   *   reviewer:   审稿人，检查并修改文章
   *   synthesizer: 汇总员，整合所有产出
   */
  private buildGraph() {
    // ─────────────────────────────────────────────────────────
    // 节点 1: 主管（Supervisor）
    // ─────────────────────────────────────────────────────────
    const supervisorNode = async (state: typeof TeamState.State) => {
      const iteration = state.iteration + 1;

      console.log(`\n👑 [Round ${iteration}] Supervisor 分析中...`);

      const prompt = `你是项目主管，负责分配任务。

## 用户需求
${state.task}

## 当前进展
- 研究: ${state.research ? "✅ 已完成" : "⏳ 待完成"}
- 写作: ${state.article ? "✅ 已完成" : "⏳ 待完成"}
- 审稿: ${state.review ? "✅ 已完成" : "⏳ 待完成"}

## 请决定下一步
只回答一个词：researcher / writer / reviewer / synthesizer / END
- researcher: 需要研究
- writer: 研究完成，开始写作
- reviewer: 写作完成，需要审稿
- synthesizer: 审稿完成，汇总结果
- END: 全部完成

规则：按 researcher → writer → reviewer → synthesizer 的顺序，
但如果某个步骤已经有产出，跳过它。`;

      const response = await this.llm.invoke([
        new SystemMessage("你是主管，只回答一个词。"),
        new HumanMessage(prompt),
      ]);

      const nextAgent = (response.content as string)
        .trim()
        .split(/\s+/)[0]
        .toLowerCase();

      console.log(`   → 分配给: ${nextAgent}`);

      return {
        currentAgent: nextAgent,
        iteration,
      };
    };

    // ─────────────────────────────────────────────────────────
    // 节点 2: 研究员（Researcher）
    // ─────────────────────────────────────────────────────────
    const researcherNode = async (state: typeof TeamState.State) => {
      console.log("🔍 Researcher 开始研究...");

      const researcher = AgentFactory.create("researcher", this.apiKey, this.model);
      const output = await researcher.execute(state.task);

      console.log(`   ✅ 研究完成 (${output.length} 字)`);
      return { research: output, currentAgent: "supervisor" };
    };

    // ─────────────────────────────────────────────────────────
    // 节点 3: 作家（Writer）
    // ─────────────────────────────────────────────────────────
    const writerNode = async (state: typeof TeamState.State) => {
      console.log("✍️ Writer 开始写作...");

      const writer = AgentFactory.create("writer", this.apiKey, this.model);
      const taskWithResearch = state.research
        ? `${state.task}\n\n【参考素材】\n${state.research}`
        : state.task;

      const output = await writer.execute(taskWithResearch);

      console.log(`   ✅ 写作完成 (${output.length} 字)`);
      return { article: output, currentAgent: "supervisor" };
    };

    // ─────────────────────────────────────────────────────────
    // 节点 4: 审稿人（Reviewer）
    // ─────────────────────────────────────────────────────────
    const reviewerNode = async (state: typeof TeamState.State) => {
      console.log("📝 Reviewer 开始审稿...");

      const reviewer = AgentFactory.create("reviewer", this.apiKey, this.model);
      const reviewTask = `请审阅以下文章：

## 用户需求
${state.task}

## 文章内容
${state.article}

请给出修改意见和最终润色版本。`;

      const output = await reviewer.execute(reviewTask);

      console.log(`   ✅ 审稿完成 (${output.length} 字)`);
      return { review: output, currentAgent: "supervisor" };
    };

    // ─────────────────────────────────────────────────────────
    // 节点 5: 汇总员（Synthesizer）
    // ─────────────────────────────────────────────────────────
    const synthesizerNode = async (state: typeof TeamState.State) => {
      console.log("📦 Synthesizer 汇总结果...");

      const parts: string[] = [];
      if (state.research) parts.push(`## 研究成果\n${state.research.slice(0, 500)}`);
      if (state.article) parts.push(`## 文章内容\n${state.article.slice(0, 500)}`);
      if (state.review) parts.push(`## 审稿意见\n${state.review.slice(0, 500)}`);

      const finalAnswer = parts.join("\n\n---\n\n");

      console.log(`   ✅ 汇总完成`);
      return {
        messages: [new AIMessage(finalAnswer)],
        currentAgent: "done",
      };
    };

    // ─────────────────────────────────────────────────────────
    // 路由函数：决定下一步
    // ─────────────────────────────────────────────────────────
    const routeFromSupervisor = (state: typeof TeamState.State): string => {
      // 防止死循环：超过 10 轮强制结束
      if (state.iteration >= 10) {
        return "synthesizer";
      }

      switch (state.currentAgent) {
        case "researcher":
          return "researcher";
        case "writer":
          return "writer";
        case "reviewer":
          return "reviewer";
        case "synthesizer":
          return "synthesizer";
        case "end":
        default:
          return "synthesizer";
      }
    };

    const routeAfterWork = (_state: typeof TeamState.State): string => {
      return "supervisor";
    };

    // ─────────────────────────────────────────────────────────
    // 组装 StateGraph
    // ─────────────────────────────────────────────────────────
    const workflow = new StateGraph(TeamState)
      // 添加节点
      .addNode("supervisor", supervisorNode)
      .addNode("researcher", researcherNode)
      .addNode("writer", writerNode)
      .addNode("reviewer", reviewerNode)
      .addNode("synthesizer", synthesizerNode)

      // 边：入口 → 主管
      .addEdge("__start__", "supervisor")

      // 条件边：主管 → 分配给某个 Agent
      .addConditionalEdges("supervisor", routeFromSupervisor)

      // 边：工作节点 → 回到主管
      .addEdge("researcher", "supervisor")
      .addEdge("writer", "supervisor")
      .addEdge("reviewer", "supervisor")

      // 边：汇总 → 结束
      .addEdge("synthesizer", END);

    return workflow.compile();
  }

  /**
   * 执行团队任务
   */
  async run(
    task: string,
    streamCallback?: (agent: string, output: string) => void
  ): Promise<{
    finalAnswer: string;
    iterations: number;
  }> {
    console.log(`\n🏛️ TeamGraph 启动`);
    console.log(`   任务: ${task}`);
    console.log("=".repeat(50));

    const result = await this.graph.invoke({
      messages: [],
      task,
      currentAgent: "supervisor",
      research: "",
      article: "",
      review: "",
      iteration: 0,
    });

    // 从结果中提取最终答案
    const lastMessage = result.messages?.[result.messages.length - 1];
    const finalAnswer =
      lastMessage?.content || "团队未能完成任务";

    console.log("=".repeat(50));
    console.log(`🏛️ TeamGraph 完成 (${result.iteration} 轮)\n`);

    return {
      finalAnswer: String(finalAnswer),
      iterations: result.iteration,
    };
  }
}
