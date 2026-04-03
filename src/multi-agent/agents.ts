/**
 * ============================================================
 * 👥 Multi-Agent 定义模块 (agents.ts)
 * ============================================================
 *
 * 【小白必读】什么是 Multi-Agent？
 *
 * 单个 Agent = 一个人干活（全能但可能不专业）
 * Multi-Agent = 一个团队协作（每个人各司其职）
 *
 * 类比：
 *   单 Agent：一个人开个小店，进货、卖货、算账全自己来
 *   Multi-Agent：开个公司，有采购员、销售员、会计...
 *
 * 本模块定义三种角色：
 *   1. ResearcherAgent - 研究员（负责搜索和整理信息）
 *   2. WriterAgent     - 作家（负责写文章）
 *   3. ReviewerAgent   - 审稿人（负责检查和修改）
 *
 * ============================================================
 */

import { BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";

// ============================================================
// 📋 Agent 角色定义接口
// ============================================================

/**
 * Agent 的"简历"
 * 包含：名字、角色、职责、系统提示
 */
export interface AgentProfile {
  /** Agent 的名字 */
  name: string;
  /** Agent 的角色（职位） */
  role: string;
  /** Agent 的目标（KPI） */
  goal: string;
  /** Agent 的人设（背景故事） */
  backstory: string;
  /** Agent 的系统提示（给 LLM 的指令） */
  systemPrompt: string;
  /** Agent 擅长使用的工具 */
  tools: string[];
}

// ============================================================
// 📦 Agent 实例（运行时的 Agent）
// ============================================================

/**
 * 一个 Agent 实例，包含 LLM 和角色信息
 *
 * 【概念】Agent 实例 = 简历 + AI 大脑 + 工具箱
 *   - profile: 简历（告诉别人"我是谁"）
 *   - llm: AI 大脑（实际处理任务的）
 *   - lastOutput: 上一次的输出结果
 */
export class AgentInstance {
  public profile: AgentProfile;
  public llm: ChatOpenAI;
  public lastOutput: string = "";

  constructor(profile: AgentProfile, llm: ChatOpenAI) {
    this.profile = profile;
    this.llm = llm;
  }

  /**
   * 执行任务
   * @param task 任务描述
   * @returns Agent 的输出结果
   */
  async execute(task: string): Promise<string> {
    // 构建消息：系统提示 + 任务
    const messages: BaseMessage[] = [
      new SystemMessage(this.profile.systemPrompt),
      new HumanMessage(
        `你的任务：${task}\n\n` +
        `你是${this.profile.role}，目标是${this.profile.goal}。\n` +
        `请用专业的方式完成任务，输出完整的结果。`
      ),
    ];

    // 调用 LLM
    const response = await this.llm.invoke(messages);
    this.lastOutput = response.content as string;
    return this.lastOutput;
  }
}

// ============================================================
// 👤 预定义的角色模板
// ============================================================

/**
 * 【场景】一个内容创作团队：
 *   研究员 → 作家 → 审稿人
 */
export const AGENT_TEMPLATES = {
  /**
   * 🔍 研究员 Agent
   * 负责搜索信息、整理数据、提炼要点
   */
  researcher: (): AgentProfile => ({
    name: "Researcher",
    role: "高级研究员",
    goal: "收集并分析信息，提供结构化的研究结果",
    backstory:
      "你是一个拥有10年经验的高级研究员，擅长从海量信息中提取关键要点。" +
      "你总是用数据说话，注重事实的准确性。",
    systemPrompt: `你是一个专业的研究员。你的职责是：
1. 根据给定的主题，进行深入的研究和分析
2. 收集相关的数据、案例和引用
3. 整理成结构化的研究报告
4. 确保信息的准确性和可靠性

输出格式要求：
- 使用 Markdown 格式
- 包含数据来源引用
- 按逻辑分组组织信息
- 在结尾给出关键发现总结`,
    tools: ["search_web"],
  }),

  /**
   * ✍️ 作家 Agent
   * 负责根据素材创作内容
   */
  writer: (): AgentProfile => ({
    name: "Writer",
    role: "技术作家",
    goal: "将研究和数据转化为高质量的易读文章",
    backstory:
      "你是一个资深的技术作家，擅长把复杂的概念用通俗易懂的语言解释清楚。" +
      "你的文章既有深度又有温度。",
    systemPrompt: `你是一个专业的技术作家。你的职责是：
1. 根据提供的研究素材，撰写高质量的文章
2. 用通俗易懂的语言解释复杂概念
3. 使用比喻和例子帮助读者理解
4. 确保文章结构清晰、逻辑连贯

输出格式要求：
- 使用 Markdown 格式
- 包含标题、小标题
- 适当使用列表和表格
- 字数控制在 1500-2000 字`,
    tools: [],
  }),

  /**
   * 📝 审稿人 Agent
   * 负责审查和修改内容
   */
  reviewer: (): AgentProfile => ({
    name: "Reviewer",
    role: "资深审稿人",
    goal: "审查文章质量，提出修改建议并润色",
    backstory:
      "你是一个严格的审稿人，拥有敏锐的文字洞察力。" +
      "你既能发现逻辑漏洞，也能提出建设性的改进建议。",
    systemPrompt: `你是一个严格的审稿人。你的职责是：
1. 检查文章的逻辑连贯性
2. 发现并修正事实错误
3. 提出结构和表达上的改进建议
4. 对文章进行最终润色

审查标准：
- ✅ 逻辑是否通顺
- ✅ 事实是否准确
- ✅ 语言是否简洁明了
- ✅ 是否有错别字或语法错误
- ✅ 是否面向目标读者群体

输出格式：
1. 总体评价（优/良/中/差）
2. 具体问题列表
3. 修改建议
4. 润色后的最终版本`,
    tools: [],
  }),

  /**
   * 💻 代码 Agent
   * 负责编写和审查代码
   */
  coder: (): AgentProfile => ({
    name: "Coder",
    role: "高级工程师",
    goal: "编写高质量、可维护的代码",
    backstory:
      "你是一个有15年经验的高级工程师，精通多种编程语言。" +
      "你写的代码简洁优雅，注重可读性和可维护性。",
    systemPrompt: `你是一个高级工程师。你的职责是：
1. 根据需求编写高质量的代码
2. 遵循最佳实践和设计模式
3. 添加必要的注释
4. 确保代码的可读性和可维护性

编码规范：
- 使用有意义的变量名和函数名
- 函数不超过 30 行
- 添加 JSDoc 注释
- 处理边界情况`,
    tools: [],
  }),

  /**
   * 🧪 测试 Agent
   * 负责编写测试用例
   */
  tester: (): AgentProfile => ({
    name: "Tester",
    role: "测试工程师",
    goal: "编写全面的测试用例，确保代码质量",
    backstory:
      "你是一个经验丰富的测试工程师，擅长发现边界情况和潜在 bug。",
    systemPrompt: `你是一个测试工程师。你的职责是：
1. 分析代码逻辑，设计测试用例
2. 覆盖正常流程和边界情况
3. 编写单元测试和集成测试
4. 报告发现的潜在问题

测试原则：
- 覆盖所有公开 API
- 测试边界条件（空值、最大值、最小值）
- 测试错误处理路径
- 使用清晰的测试描述`,
    tools: [],
  }),
};

// ============================================================
// 🏭 Agent 工厂（创建 Agent 实例）
// ============================================================

/**
 * Agent 工厂类
 *
 * 【概念】工厂模式：
 *   就像"汽车工厂"一样，你告诉它要什么型号，
 *   它就给你生产一个对应的 Agent。
 *
 * 用法：
 *   const agent = AgentFactory.create("researcher", { apiKey: "xxx" });
 *   const result = await agent.execute("研究 AI Agent 的发展趋势");
 */
export class AgentFactory {
  private static llmCache: Map<string, ChatOpenAI> = new Map();

  /**
   * 获取或创建 LLM 实例（避免重复创建）
   */
  private static getLLM(apiKey: string, model: string = "gpt-4o-mini"): ChatOpenAI {
    const cacheKey = `${apiKey.slice(0, 8)}-${model}`;
    if (!this.llmCache.has(cacheKey)) {
      this.llmCache.set(cacheKey, new ChatOpenAI({
        modelName: model,
        temperature: 0.7,
        openAIApiKey: apiKey,
      }));
    }
    return this.llmCache.get(cacheKey)!;
  }

  /**
   * 根据"角色名"创建 Agent 实例
   * @param role 角色名（researcher/writer/reviewer/coder/tester）
   * @param apiKey OpenAI API Key
   * @param model 模型名
   */
  static create(
    role: keyof typeof AGENT_TEMPLATES,
    apiKey: string,
    model?: string
  ): AgentInstance {
    // 获取角色模板
    const template = AGENT_TEMPLATES[role]();
    // 创建 LLM
    const llm = this.getLLM(apiKey, model);
    // 组装 Agent 实例
    return new AgentInstance(template, llm);
  }
}
