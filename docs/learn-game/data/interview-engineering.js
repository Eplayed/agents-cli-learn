// 面试题库：工程深入篇（工具选择机制 / RAG / 评测 / 调试 / 成本）
// 补齐之前缺失的高频考点
// 12 题

export default {
  id: 'INT-ENG',
  topic: '面试 · 工程深入',
  title: 'Agent 工程落地面试题（工具选择 / RAG / 评测 / 调试）',
  subtitle: '12 道工程实战题，覆盖"怎么让 Agent 在生产环境可靠工作"',

  stages: [
    {
      kind: 'story',
      title: '工程面试考什么',
      content: `
        <p>前两关面试题考的是"你知不知道"。这一关考的是<strong>"你遇到过什么问题、怎么解决的"</strong>。</p>

        <div class="story-box">
          🎯 本关覆盖 4 个方向：
          <ul>
            <li><strong>工具选择机制</strong>：LLM 怎么从 N 个工具里选？选错了怎么办？没有匹配的呢？</li>
            <li><strong>RAG（检索增强）</strong>：怎么让 Agent 查知识库？chunking / embedding / rerank</li>
            <li><strong>评测与调试</strong>：怎么知道 Agent 变好了还是变差了？出 bug 怎么排查？</li>
            <li><strong>成本与性能</strong>：token 烧太多怎么办？延迟怎么优化？</li>
          </ul>
        </div>
      `,
    },

    {
      kind: 'final-quiz',
      title: '工程面试模拟：12 题',
      passLine: 0.5,
      questions: [
        // ===== 工具选择机制（4 题）=====
        {
          id: 'ieng01',
          type: 'single',
          knowledgeTag: '工具选择',
          difficulty: '⭐⭐',
          text: `面试官问：<strong>"LLM 怎么从 10 个工具里决定调哪个？"</strong>`,
          options: [
            { text: '随机选一个', value: 'a' },
            { text: '开发者写 if-else 规则匹配', value: 'b' },
            { text: 'bind_tools 把所有工具的 name + description + 参数 schema 注入上下文，LLM 根据用户意图和工具描述做语义匹配，输出最相关的 tool_calls', value: 'c' },
            { text: '按工具注册顺序依次尝试', value: 'd' }
          ],
          answer: 'c',
          explain: 'Function Calling 的核心机制：所有工具 schema 随请求一起发给 LLM，模型做"用户意图 ↔ 工具描述"的语义匹配。这就是为什么 description 写得好很重要。',
          interviewTip: '强调"不需要写 if-else 路由"——这是 Agent 比传统系统灵活的关键。',
          projectMapping: 'agent.py: self.llm_with_tools = self.llm.bind_tools(self.tools) 把 schema 注入',
        },
        {
          id: 'ieng02',
          type: 'single',
          knowledgeTag: '工具选择',
          difficulty: '⭐⭐',
          text: `面试官问：<strong>"如果用户问的问题没有任何工具能匹配，LLM 会怎么做？"</strong>`,
          options: [
            { text: '报错崩溃', value: 'a' },
            { text: '随机调一个工具', value: 'b' },
            { text: '不输出 tool_calls，直接用自身知识生成回答（走 END 分支）', value: 'c' },
            { text: '返回空消息', value: 'd' }
          ],
          answer: 'c',
          explain: 'LLM 判断没有工具匹配时，AIMessage 不含 tool_calls → tools_condition 走 END → 直接返回 LLM 生成的文本。Agent 此时退化为普通 Chatbot。',
          interviewTip: '用你项目举例："在我项目里切到 M0 Basic Chatbot 模式就是这个状态——没有工具时 LLM 只能用自己知识回答。"',
          projectMapping: 'agent.py: tools_condition 检查无 tool_calls → END',
        },
        {
          id: 'ieng03',
          type: 'single',
          knowledgeTag: '工具选择',
          difficulty: '⭐⭐⭐',
          text: `面试官问：<strong>"LLM 选错了工具怎么办？有什么工程手段降低误调？"</strong>`,
          options: [
            { text: '没办法，只能换更好的模型', value: 'a' },
            { text: '多种手段：①优化 description（写清 when）②减少工具数量（只暴露相关的）③在 system prompt 里加路由规则④用 MCP annotations 标注风险等级⑤对高危工具加 HITL 确认', value: 'b' },
            { text: '禁止 LLM 调工具', value: 'c' },
            { text: '每次都让用户手动选', value: 'd' }
          ],
          answer: 'b',
          explain: '工具误调是 Agent 最常见的问题之一。工程手段组合：description 精确化 + 工具数量控制 + prompt 引导 + annotations 风险标注 + HITL 兜底。',
          interviewTip: '展示你有"多层防御"思维。能说出 3 种以上手段 = 有实战经验。',
          projectMapping: 'weather_server.py 的 description 优化 + dangerous_server 的 HITL 确认机制',
        },
        {
          id: 'ieng04',
          type: 'single',
          knowledgeTag: '工具选择',
          difficulty: '⭐⭐',
          text: `面试官问：<strong>"工具太多（50+）会有什么问题？怎么解决？"</strong>`,
          options: [
            { text: '没问题，越多越好', value: 'a' },
            { text: '工具太多→ description 挤占上下文窗口 + LLM 选择准确率下降 + 延迟增加。解决：按场景分组只暴露相关子集、用路由 Agent 先判断领域再选工具池', value: 'b' },
            { text: '把所有工具合成一个超级工具', value: 'c' },
            { text: '只影响启动速度', value: 'd' }
          ],
          answer: 'b',
          explain: '工具数量膨胀是生产 Agent 的典型挑战。核心思路是"分层路由"：先用轻量模型判断意图所属领域，再只加载对应领域的工具子集。MCP 的 toolsFilter 就是做这事的。',
          interviewTip: '提到 ToolHive 的 toolsFilter 或 "Agent of Agents" 架构（Supervisor 选 Worker，每个 Worker 只带自己领域的工具）。',
          projectMapping: 'catalog.py 的 multi-agent 模式 = Supervisor 路由到不同 Worker',
        },

        // ===== RAG 基础（3 题）=====
        {
          id: 'ieng05',
          type: 'order',
          knowledgeTag: 'RAG',
          difficulty: '⭐⭐',
          text: `面试官问：<strong>"RAG 的标准流程是什么？按顺序排列。"</strong>`,
          items: [
            { id: 'chunk', text: 'Chunking：把长文档切成小块' },
            { id: 'embed', text: 'Embedding：文本块 → 向量' },
            { id: 'store', text: 'Store：向量存入向量数据库' },
            { id: 'query', text: 'Query：用户问题 → 向量 → 检索相似块' },
            { id: 'inject', text: 'Inject：检索结果注入 LLM 上下文' },
            { id: 'generate', text: 'Generate：LLM 基于检索结果生成回答' },
          ],
          answer: ['chunk', 'embed', 'store', 'query', 'inject', 'generate'],
          explain: 'RAG 6 步：切块→向量化→存储→检索→注入→生成。前 3 步是离线（索引建设），后 3 步是在线（每次查询）。',
          interviewTip: '能说出"离线 vs 在线"的划分 + 每步的技术选型（如 chunking 用 RecursiveCharacterTextSplitter、embedding 用 text-embedding-3-small）。',
          projectMapping: 'M9 待实现。当前项目无 RAG。',
        },
        {
          id: 'ieng06',
          type: 'single',
          knowledgeTag: 'RAG',
          difficulty: '⭐⭐⭐',
          text: `面试官问：<strong>"RAG 检索回来的内容不相关怎么办？"</strong>`,
          options: [
            { text: '换更大的模型就好了', value: 'a' },
            { text: '加 Reranker：先用向量检索召回 top-20，再用 cross-encoder 精排取 top-5 注入 LLM', value: 'b' },
            { text: '增大 chunk size', value: 'c' },
            { text: '去掉 RAG 直接让 LLM 回答', value: 'd' }
          ],
          answer: 'b',
          explain: '向量检索是"粗召回"（快但不精确），Reranker 是"精排"（慢但准确）。二阶段检索是 RAG 生产标配：先广后精。',
          interviewTip: '提到"二阶段检索"和具体工具（如 Cohere Rerank / BGE-Reranker）会加分。',
          projectMapping: 'M9 待实现',
        },
        {
          id: 'ieng07',
          type: 'multi',
          knowledgeTag: 'RAG',
          difficulty: '⭐⭐',
          text: `面试官问：<strong>"RAG 回答里怎么做引用标注（citation）？"</strong>（多选）`,
          options: [
            { text: '在 system prompt 里要求模型标注来源编号 [1][2]', value: 'a' },
            { text: '检索结果注入时带上文档 ID 和页码', value: 'b' },
            { text: '生成后用后处理匹配回答中的句子和源文档', value: 'c' },
            { text: '让用户自己去找来源', value: 'd' },
            { text: '用结构化输出强制模型输出 answer + citations 两个字段', value: 'e' }
          ],
          answer: ['a', 'b', 'c', 'e'],
          explain: '引用标注有多种实现方式可组合：prompt 引导 + 注入来源元信息 + 后处理比对 + 结构化输出。关键是让用户能验证回答的真实性。',
          interviewTip: '强调"可验证性"："用户能点引用跳到原文验证——这是 RAG 比纯 LLM 可信的关键。"',
          projectMapping: 'M9 待实现',
        },

        // ===== 评测与调试（3 题）=====
        {
          id: 'ieng08',
          type: 'single',
          knowledgeTag: 'Agent 评测',
          difficulty: '⭐⭐⭐',
          text: `面试官问：<strong>"怎么评测一个 Agent 的质量？不只看最终回答，还要看过程。"</strong>`,
          options: [
            { text: '只看最终回答是否正确', value: 'a' },
            { text: 'Trajectory Evaluation：评估整个执行轨迹——是否调了该调的工具、参数是否正确、是否有多余调用、最终回答是否基于工具结果而非幻觉', value: 'b' },
            { text: '看执行速度', value: 'c' },
            { text: '让用户打分', value: 'd' }
          ],
          answer: 'b',
          explain: 'Agent 评测和 LLM 评测的核心区别：Agent 有"过程"。Trajectory Eval 检查每一步：该调工具时调了没？参数对不对？结果用了没？比只看最终答案更精确。',
          interviewTip: '提到 DeepEval 的 trajectory metric 或 LangSmith 的 run evaluation。',
          projectMapping: 'M7 待实现。当前有测试但无 trajectory eval。',
        },
        {
          id: 'ieng09',
          type: 'single',
          knowledgeTag: '调试',
          difficulty: '⭐⭐',
          text: `面试官问：<strong>"Agent 回答了错误信息，你怎么排查？"</strong>`,
          options: [
            { text: '看日志猜', value: 'a' },
            { text: '查 trace：定位到该次请求的完整执行树（LLM 输入/输出 → 工具调用 → 工具返回 → 最终生成），看是哪一步出了问题', value: 'b' },
            { text: '重启试试', value: 'c' },
            { text: '问用户重新描述需求', value: 'd' }
          ],
          answer: 'b',
          explain: '可观测的核心价值：每次请求有 trace_id → 能查到完整执行树 → 定位是"工具返回了错数据"还是"LLM 没用工具结果自己编了"还是"模型幻觉"。',
          interviewTip: '说出具体工具："我计划用 Langfuse 做 trace，目前项目的 NDJSON 事件流已经包含了 tool_calls/tool_result，相当于简化版 trace。"',
          projectMapping: 'NDJSON 流里的 tool_calls/tool_result 事件就是最简版 trace',
        },
        {
          id: 'ieng10',
          type: 'single',
          knowledgeTag: '调试',
          difficulty: '⭐⭐⭐',
          text: `面试官问：<strong>"Agent 调了工具但回答里没用工具结果，而是自己编了个答案。这叫什么？怎么防？"</strong>`,
          options: [
            { text: '正常现象', value: 'a' },
            { text: '这叫"工具结果幻觉"。防御：①在 system prompt 强调"必须基于工具返回的数据回答"②用结构化输出约束格式③在评测里加断言"回答必须包含工具返回的关键数据"', value: 'b' },
            { text: '模型太小导致的', value: 'c' },
            { text: '工具本身的问题', value: 'd' }
          ],
          answer: 'b',
          explain: '这是 Agent 特有的幻觉模式：工具给了正确数据，但 LLM 生成时忽略了工具结果用自己的"知识"回答。多层防御：prompt 约束 + 结构化输出 + 评测断言。',
          interviewTip: '这是高区分度题。能说出这个具体幻觉模式 + 3 种防御手段 = 有实战经验。',
          projectMapping: 'agent.py 的 SystemMessage 里"必须先调用 get_weather 获取数据后再给结论"就是防这个',
        },

        // ===== 成本与性能（2 题）=====
        {
          id: 'ieng11',
          type: 'multi',
          knowledgeTag: '成本控制',
          difficulty: '⭐⭐',
          text: `面试官问：<strong>"Agent 的 token 成本怎么控制？"</strong>（多选）`,
          options: [
            { text: '限制 max_tokens（单次生成上限）', value: 'a' },
            { text: '限制 recursion_limit（防死循环）', value: 'b' },
            { text: '用更便宜的小模型处理简单路由', value: 'c' },
            { text: '上下文压缩（摘要/窗口/只保留相关部分）', value: 'd' },
            { text: 'Prompt Caching（稳定 system prompt 缓存）', value: 'e' },
            { text: '关掉所有工具', value: 'f' }
          ],
          answer: ['a', 'b', 'c', 'd', 'e'],
          explain: '成本控制是多层的：生成限制 + 循环限制 + 模型分级 + 上下文压缩 + 缓存。Agent 成本 = 轮数 × 每轮 token，控制任何一个维度都有效。',
          interviewTip: '你项目里已有 a 和 b。展示"我知道还有 c/d/e 但当前项目还没做"比"假装都做了"更诚实更好。',
          projectMapping: 'agent.py: max_tokens=4096 + recursion_limit=25',
        },
        {
          id: 'ieng12',
          type: 'single',
          knowledgeTag: '性能优化',
          difficulty: '⭐⭐',
          text: `面试官问：<strong>"用户等 Agent 回答要 10 秒，怎么优化体验？"</strong>`,
          options: [
            { text: '让用户等就行', value: 'a' },
            { text: '用流式输出：第一个 token 0.5 秒就出现，用户感知延迟从 10 秒降到 0.5 秒；同时工具调用过程实时展示让用户知道"Agent 在干活"', value: 'b' },
            { text: '换更快的服务器', value: 'c' },
            { text: '减少回答长度', value: 'd' }
          ],
          answer: 'b',
          explain: '流式 + 过程可见 是 Agent UX 的核心。总延迟可能没变（还是 10 秒），但用户感知的"等待"从 10 秒降到 0.5 秒。这就是 M2 学的 NDJSON 流式的价值。',
          interviewTip: '直接关联你的项目："我项目用 NDJSON 流式，第一个 token 毫秒级出现，工具调用中间状态（tool_calls/tool_result）也实时推送给前端做折叠展示。"',
          projectMapping: 'chat.py::chat_stream_ndjson + 前端 streamNDJSON 函数',
        },
      ]
    }
  ]
};
