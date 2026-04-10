/**
 * ============================================================
 * 🧩 子图模块 (subgraph.ts)
 * ============================================================
 *
 * 【小白必读】什么是"子图"？
 *
 * 想象一个工厂：
 *   - 主工厂（主图）：负责接收订单、分配任务、最终交付
 *   - 车间A（子图）：专门负责焊接
 *   - 车间B（子图）：专门负责喷漆
 *   - 车间C（子图）：专门负责质检
 *
 * 子图就是"车间"：
 *   - 每个 子图 专注做一件事
 *   - 主图 负责协调各个 子图
 *   - 子图 之间可以互相调用
 *
 * 【好处】
 *   1. 代码更清晰：每个文件只做一件事
 *   2. 复用性强：同一个子图可以在多个主图中使用
 *   3. 易于测试：可以单独测试每个子图
 *
 * ============================================================
 */
import {
  StateGraph,
  END,
  Annotation,
  MessagesAnnotation,
} from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, AIMessage } from '@langchain/core/messages';

// ============================================================
// 📊 子图 1：研究子图 (Research Subgraph)
// ============================================================
//
// 【职责】搜索并整理信息
//
// 流程：
//   搜索 → 整理 → 返回结果
//
// 定义研究子图的状态
const ResearchState = Annotation.Root({
  // 输入：需要研究的问题
  question: Annotation<string>(),
  // 输出：研究结果
  findings: Annotation<string>(),
  // 来源列表
  sources: Annotation<string[]>({
    default: () => [],
    reducer: (_, y) => y,
  }),
});

/**
 * 创建研究子图
 *
 * 【概念】子图就是一个"小型状态图"
 * 它有自己的节点、边、状态
 */
export function createResearchSubgraph() {
  // 节点 1：搜索信息
  const searchNode = async (state: typeof ResearchState.State) => {
    console.log('🔍 研究子图：正在搜索...');

    // 【模拟】实际项目中应该调用搜索 API
    const mockResults = [
      `关于"${state.question}"的结果1`,
      `关于"${state.question}"的结果2`,
    ];

    return {
      sources: mockResults,
    };
  };

  // 节点 2：整理信息
  const summarizeNode = async (state: typeof ResearchState.State) => {
    console.log('📝 研究子图：正在整理...');

    // 把搜索结果整理成摘要
    const findings = state.sources.join('\n');

    return {
      findings,
    };
  };

  // 构建子图
  const subgraph = new StateGraph(ResearchState)
    .addNode('search', searchNode)
    .addNode('summarize', summarizeNode)
    .addEdge('__start__', 'search')
    .addEdge('search', 'summarize')
    .addEdge('summarize', END);

  return subgraph.compile();
}

// ============================================================
// ✍️ 子图 2：写作子图 (Writing Subgraph)
// ============================================================
//
// 【职责】根据研究结果写文章
//
// 流程：
//   接收素材 → 写草稿 → 润色 → 返回文章
//
const WritingState = Annotation.Root({
  // 输入：素材
  materials: Annotation<string>(),
  // 输出：文章
  article: Annotation<string>(),
  // 风格
  style: Annotation<string>({
    default: () => '简洁',
    reducer: (_, y) => y,
  }),
});

/**
 * 创建写作子图
 */
export function createWritingSubgraph(apiKey: string) {
  const llm = new ChatOpenAI({
    modelName: 'gpt-4o-mini',
    temperature: 0.7,
    openAIApiKey: apiKey,
  });

  // 节点 1：写草稿
  const draftNode = async (state: typeof WritingState.State) => {
    console.log('✍️ 写作子图：正在写草稿...');

    const prompt = `请用${state.style}的风格，根据以下素材写一篇文章：

${state.materials}

文章：`;

    const response = await llm.invoke([new HumanMessage(prompt)]);

    return {
      article: response.content as string,
    };
  };

  // 节点 2：润色
  const polishNode = async (state: typeof WritingState.State) => {
    console.log('✨ 写作子图：正在润色...');

    // 【简化】实际可以调用 LLM 进行润色
    const polished = state.article.replace(/\s+/g, ' ').trim();

    return {
      article: polished,
    };
  };

  // 构建子图
  const subgraph = new StateGraph(WritingState)
    .addNode('draft', draftNode)
    .addNode('polish', polishNode)
    .addEdge('__start__', 'draft')
    .addEdge('draft', 'polish')
    .addEdge('polish', END);

  return subgraph.compile();
}

// ============================================================
// 🏗️ 主图：协调子图 (Main Graph)
// ============================================================
//
// 【概念】主图就像"项目经理"
//   - 接收用户需求
//   - 分配给子图（车间）
//   - 整合结果返回给用户
//
// 主图状态
const MainState = Annotation.Root({
  // 用户输入
  userInput: Annotation<string>(),
  // 研究结果
  research: Annotation<string>(),
  // 最终文章
  article: Annotation<string>(),
  // 当前阶段
  stage: Annotation<string>({
    default: () => 'init',
    reducer: (_, y) => y,
  }),
});

/**
 * 创建主图（包含子图）
 *
 * 【关键】如何把子图嵌入主图？
 *   1. 创建子图实例
 *   2. 在主图节点中调用子图
 *   3. 传递状态
 */
export function createMainGraph(apiKey: string) {
  // 创建子图实例
  const researchSubgraph = createResearchSubgraph();
  const writingSubgraph = createWritingSubgraph(apiKey);

  // 节点 1：研究（调用研究子图）
  const researchNode = async (state: typeof MainState.State) => {
    console.log('\n📚 主图：调用研究子图');

    // 调用子图，传入问题
    const result = await researchSubgraph.invoke({
      question: state.userInput,
    });

    return {
      research: result.findings,
      stage: 'research_done',
    };
  };

  // 节点 2：写作（调用写作子图）
  const writingNode = async (state: typeof MainState.State) => {
    console.log('\n✍️ 主图：调用写作子图');

    // 调用子图，传入研究结果
    const result = await writingSubgraph.invoke({
      materials: state.research,
    });

    return {
      article: result.article,
      stage: 'writing_done',
    };
  };

  // 构建主图
  const mainGraph = new StateGraph(MainState)
    .addNode('research', researchNode)
    .addNode('writing', writingNode)
    .addEdge('__start__', 'research')
    .addEdge('research', 'writing')
    .addEdge('writing', END);

  return mainGraph.compile();
}

// ============================================================
// 💡 使用示例
// ============================================================
/*
// 使用主图（自动协调子图）

const mainGraph = createMainGraph(process.env.OPENAI_API_KEY);

const result = await mainGraph.invoke({
  userInput: '请帮我写一篇关于 AI Agent 的文章',
});

console.log(result.article);

// 执行流程：
// 主图: START → research节点 → writing节点 → END
//                ↓                  ↓
//           研究子图            写作子图
//         搜索→整理            草稿→润色
*/