// 面试题库：进阶篇（上下文工程 + Harness + 系统设计 + 项目表达）
// 参考：adongwanai/AgentGuide 的核心理念
// 13 题，覆盖面试中"区分度最高"的考点

export default {
  id: 'INT-ADV',
  topic: '面试 · 进阶',
  title: 'Agent 进阶面试题（上下文工程 / Harness / 系统设计）',
  subtitle: '13 道高区分度题 + STAR 项目表达训练，这些题答好了面试官会追着问',

  stages: [
    {
      kind: 'story',
      title: '进阶面试考什么？',
      content: `
        <p>基础题（Agent 定义/ReAct/bind_tools）大家都能答。<strong>区分度</strong>在这 3 个方向：</p>

        <div class="story-box">
          🎯 <strong>高区分度面试方向：</strong>
          <ol>
            <li><strong>上下文工程</strong>：Agent 开发的本质不是调 API，是控制"什么信息、以什么格式、在什么时机送给 LLM"</li>
            <li><strong>Harness 工程</strong>：模型是大脑，但"手脚/记忆/权限/反馈"全靠 Harness</li>
            <li><strong>系统设计</strong>：不只会写代码，能设计一个可扩展、可观测、可回退的 Agent 服务</li>
          </ol>
        </div>

        <p>另外，<strong>怎么讲项目</strong>和技术能力一样重要。本关最后 3 题是<strong>STAR 表达训练</strong>：</p>
        <ul>
          <li><strong>S</strong>ituation：项目背景</li>
          <li><strong>T</strong>ask：你的任务/目标</li>
          <li><strong>A</strong>ction：你做了什么（技术决策）</li>
          <li><strong>R</strong>esult：结果（最好量化）</li>
        </ul>

        <div class="callout">
          💡 面试不是背答案，是<strong>展示你的工程判断力</strong>。
          每道题想想：如果面试官追问"为什么这么选"，你怎么答？
        </div>
      `,
    },

    {
      kind: 'final-quiz',
      title: '进阶面试模拟：13 题',
      passLine: 0.5,
      questions: [
        // ===== 上下文工程（4 题）=====
        {
          id: 'iadv01',
          type: 'single',
          knowledgeTag: '上下文工程',
          difficulty: '⭐⭐⭐',
          text: '面试官问：<strong>"Context Engineering 和 Prompt Engineering 的区别是什么？"</strong>',
          options: [
            { text: '没区别，都是写提示词', value: 'a' },
            { text: 'Prompt Engineering 只关注单条提示词怎么写；Context Engineering 是系统级设计——控制什么信息、以什么格式、在什么时机进入 LLM 上下文', value: 'b' },
            { text: 'Context Engineering 是前端技术', value: 'c' },
            { text: 'Prompt Engineering 更高级', value: 'd' }
          ],
          answer: 'b',
          explain: 'Prompt Engineering 是"写一条好的 prompt"。Context Engineering 是"设计整个信息管线"：哪些放 system prompt、哪些放 RAG 结果、哪些放工具返回、何时压缩历史、何时检索记忆。',
          deeper: 'Anthropic 的 Amanda Askell 2025 年提出：Agent 的核心不是模型多强，而是你给它什么信息。Claude Code 的强大很大程度来自 harness 的上下文管理。',
          interviewTip: '用 STAR：S-你做 Agent 项目时发现 prompt 越来越长效果越来越差；T-需要系统化管理上下文；A-引入分层（system/tools/RAG/memory）+ 压缩策略；R-回答质量提升，token 成本降低。',
          projectMapping: 'agent.py::stream 里的 SystemMessage + HumanMessage 分层就是最简版上下文工程',
        },
        {
          id: 'iadv02',
          type: 'multi',
          knowledgeTag: '上下文工程',
          difficulty: '⭐⭐',
          text: '面试官问：<strong>"Agent 上下文的 7 个组成部分有哪些？"</strong>（多选）',
          options: [
            { text: '系统指令（System Prompt）', value: 'a' },
            { text: '用户输入（User Prompt）', value: 'b' },
            { text: '短期记忆（对话窗口）', value: 'c' },
            { text: '长期记忆（跨会话）', value: 'd' },
            { text: '检索信息（RAG）', value: 'e' },
            { text: '工具调用结果（Tool Results）', value: 'f' },
            { text: '结构化输出控制', value: 'g' },
            { text: 'CSS 样式', value: 'h' }
          ],
          answer: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
          explain: '这 7 个来自 AgentGuide 的上下文工程体系：System Prompt / User Prompt / Short-term Memory / Long-term Memory / RAG / Tools / Structured Output。每一个都是"送给 LLM 的信息源"。',
          deeper: '面试加分：能说出"我项目里目前实现了 System Prompt + 短期记忆（Checkpoint）+ 工具结果（MCP）三个，RAG 和长期记忆是下一步"。',
          interviewTip: '不需要 7 个全做了才能答。展示你理解全景并知道下一步做什么，比"全做了但讲不清"强。',
          projectMapping: 'agent.py 的 SystemMessage（指令层）+ MessagesState（短期记忆）+ ToolNode（工具结果）',
        },
        {
          id: 'iadv03',
          type: 'single',
          knowledgeTag: '上下文工程',
          difficulty: '⭐⭐⭐',
          text: '面试官问：<strong>"对话历史太长导致 LLM 性能下降，你怎么处理？"</strong>',
          options: [
            { text: '直接截断最早的消息', value: 'a' },
            { text: '上下文压缩策略组合：滑动窗口（保留最近 N 轮）+ 摘要压缩（旧对话生成摘要）+ Token 预算控制（超限时触发压缩）', value: 'b' },
            { text: '换一个支持更长上下文的模型', value: 'c' },
            { text: '让用户新建会话', value: 'd' }
          ],
          answer: 'b',
          explain: '简单截断会丢重要信息。最佳实践是多策略组合：窗口保留近期对话 + 旧内容用 LLM 生成摘要 + 设 token 预算上限自动触发压缩。',
          deeper: 'Claude Code 用"三层记忆"解决：CLAUDE.md（持久指令）+ 会话上下文（当前窗口）+ 长期记忆（跨会话摘要）。',
          interviewTip: '展示你知道多种策略并能说清 trade-off："截断简单但丢信息；摘要保留语义但有额外 LLM 调用成本；我项目里用 M5 的 Checkpoint + 未来 M9 的 RAG 来分层解决。"',
          projectMapping: 'M9 待实现。当前 MessagesState 会无限增长，M9 会加 pre_model_hook 做摘要压缩。',
        },
        {
          id: 'iadv04',
          type: 'single',
          knowledgeTag: '上下文工程',
          difficulty: '⭐⭐',
          text: '面试官问：<strong>"为什么工具的 description 质量直接影响 Agent 性能？"</strong>',
          options: [
            { text: 'description 只是给开发者看的注释', value: 'a' },
            { text: 'description 是 LLM 上下文的一部分——模型通过它判断"何时调用、参数怎么填"。写得差 = 模型选错工具或参数错', value: 'b' },
            { text: '好的 description 让工具跑得更快', value: 'c' },
            { text: '只影响文档生成', value: 'd' }
          ],
          answer: 'b',
          explain: 'bind_tools 把工具 schema（含 description）注入 LLM 上下文。description 越清晰（what + when + output），模型选择工具和填参的准确率越高。这就是上下文工程在工具层的体现。',
          deeper: 'OpenAI 官方建议：description 里写"何时该用"比"这个工具做什么"更重要。MCP 的 annotations 则告诉客户端（非 LLM）工具的风险等级。',
          interviewTip: '直接举例："我项目里 get_weather 的 description 从一句话改成 what+when+output 三段式后，调用准确率明显提升。"',
          projectMapping: 'mcp_servers/weather_server.py 的 docstring = MCP 的 tool description',
        },

        // ===== Harness 工程（4 题）=====
        {
          id: 'iadv05',
          type: 'multi',
          knowledgeTag: 'Agent Harness',
          difficulty: '⭐⭐⭐',
          text: '面试官问：<strong>"Agent Harness 是什么？包含哪些层？"</strong>（选出属于 Harness 的）',
          options: [
            { text: 'L1 模型层：provider 抽象（多模型切换）', value: 'a' },
            { text: 'L2 循环层：agent loop / interrupt / resume', value: 'b' },
            { text: 'L3 工具层：tools / skills / MCP', value: 'c' },
            { text: 'L4 记忆层：checkpoint / vector store', value: 'd' },
            { text: 'L5 CSS 样式层', value: 'e' },
            { text: 'L6 通道层：CLI / Web / IM', value: 'f' },
            { text: 'L7 可靠性层：timeout / retry / cost guard / permission', value: 'g' }
          ],
          answer: ['a', 'b', 'c', 'd', 'f', 'g'],
          explain: 'Agent Harness = 除模型推理能力外，让 Agent 真正能工作的所有工程基础设施。AgentGuide 定义了 7 层。你项目已经覆盖了大部分：L1（多模型切换）、L2（LangGraph loop）、L3（MCP）、L4（AsyncSqliteSaver）、L6（Web UI）、L7（recursion_limit / auth）。',
          deeper: 'Anthropic 说"Claude Code 90% 的代码是 harness，不是 prompt"。这个比例在所有成熟 Agent 项目里都差不多。',
          interviewTip: '用你项目举例："我项目覆盖了 7 层中的 6 层：模型切换用 config.py、循环用 LangGraph StateGraph、工具用 MCP、记忆用 AsyncSqliteSaver、通道是 Web、可靠性有 recursion_limit + auth。"',
          projectMapping: '整个项目就是一个 harness 实现',
        },
        {
          id: 'iadv06',
          type: 'single',
          knowledgeTag: 'Agent Harness',
          difficulty: '⭐⭐',
          text: '面试官问：<strong>"为什么说模型能力只占 Agent 系统的 10%？"</strong>',
          options: [
            { text: '因为模型很便宜', value: 'a' },
            { text: '模型只负责"思考"，但工具执行、状态管理、权限控制、错误恢复、可观测、流式输出等 90% 的工程工作由 harness 完成', value: 'b' },
            { text: '因为模型经常出错', value: 'c' },
            { text: '因为用的是开源模型', value: 'd' }
          ],
          answer: 'b',
          explain: '换个角度理解：如果 LLM 是大脑，harness 就是整个身体——眼睛（输入）、手脚（工具）、记忆（checkpoint）、免疫系统（权限/预算）、神经系统（可观测）。只有大脑没有身体，什么也做不了。',
          deeper: 'Claude Code 的工程团队说过：prompt 不到 500 行，但 harness 代码超过 5 万行。这就是为什么"会写 prompt"不等于"会做 Agent"。',
          interviewTip: '把这个洞察说出来会加分："Agent 工程师的核心价值不是写 prompt，是搭建让模型能力真正落地的 harness。"',
          projectMapping: 'agent.py 的 LLM 调用只有几行，但 registry + MCP + checkpoint + auth + streaming 加起来 1000+ 行',
        },
        {
          id: 'iadv07',
          type: 'single',
          knowledgeTag: '12-Factor Agent',
          difficulty: '⭐⭐⭐',
          text: '面试官问：<strong>"你认为生产级 Agent 系统最重要的 3 个'因子'是什么？"</strong>',
          options: [
            { text: '好的模型 + 好的 prompt + 好的数据', value: 'a' },
            { text: '可观测性（trace 贯穿全链路）+ 可恢复性（checkpoint 不丢状态）+ 可控性（预算/权限/HITL）', value: 'b' },
            { text: '速度快 + 成本低 + 准确率高', value: 'c' },
            { text: '代码简洁 + 文档完善 + 测试覆盖', value: 'd' }
          ],
          answer: 'b',
          explain: '这三个是"生产 vs demo"的分水岭。没有 trace 出了 bug 找不到原因；没有 checkpoint 崩了全丢；没有预算/权限，一个恶意 prompt 能烧光你的钱。',
          deeper: '类比 12-Factor App：Agent 世界的 12 Factor 包括 stateless runtime、tool registry、context budget、checkpoint、observability、permission gate 等。',
          interviewTip: '这是开放题，答案不唯一。关键是展示你有"生产化思维"而不是只会写 demo。用你项目佐证："我项目里做了 Langfuse trace（M6 计划）+ AsyncSqliteSaver + recursion_limit + auth 中间件。"',
          projectMapping: 'checkpoint=core/checkpointer.py, 预算=agent.py, 权限=core/auth.py',
        },
        {
          id: 'iadv08',
          type: 'single',
          knowledgeTag: 'Agent Harness',
          difficulty: '⭐⭐',
          text: '面试官问：<strong>"工具注册应该用 dispatch 表还是 if-elif 长链？为什么？"</strong>',
          options: [
            { text: '用 if-elif，简单直观', value: 'a' },
            { text: '用 dispatch 表（字典/注册中心）：加工具不需要改调度逻辑，只需注册；支持动态发现和启停', value: 'b' },
            { text: '用 match-case', value: 'c' },
            { text: '没区别', value: 'd' }
          ],
          answer: 'b',
          explain: 'if-elif 每加一个工具就多一个分支，修改调度逻辑 = 可能引入 bug。Dispatch 表（如你项目的 MCP config.json）让"注册"和"调度"解耦——加工具只改配置不改代码。',
          deeper: 'AgentGuide 强调这是"harness 工程的基本功"。你项目用了两层 dispatch：Agent Registry（选 agent）+ MCP config（选工具）。',
          interviewTip: '引申到你的项目："我项目用了两层注册中心：Agent 级（registry.py，前端切换不同能力等级）和 Tool 级（MCP config.json，加工具不改代码）。"',
          projectMapping: 'agents/registry.py（Agent 注册）+ mcp_servers/config.json（Tool 注册）',
        },

        // ===== 系统设计（2 题）=====
        {
          id: 'iadv09',
          type: 'multi',
          knowledgeTag: '系统设计',
          difficulty: '⭐⭐⭐',
          text: '面试官问：<strong>"设计一个生产级 Agent 服务，你会包含哪些组件？"</strong>（多选）',
          options: [
            { text: 'HTTP 网关（鉴权 + 限流 + CORS）', value: 'a' },
            { text: 'Agent Runtime（LangGraph 图执行）', value: 'b' },
            { text: 'Checkpoint Store（对话状态持久化）', value: 'c' },
            { text: '工具池（MCP Server 集群）', value: 'd' },
            { text: '可观测平台（Langfuse / OpenTelemetry）', value: 'e' },
            { text: '评测 CI（每次改 prompt 跑回归）', value: 'f' },
            { text: '只要一个 Python 脚本', value: 'g' }
          ],
          answer: ['a', 'b', 'c', 'd', 'e', 'f'],
          explain: '生产级 Agent 服务 = 网关 + Runtime + 状态 + 工具 + 可观测 + 评测。这就是你项目的目标架构（docs/ARCHITECTURE.md 图 6）。',
          deeper: '面试加分：能画出来并说清各层的技术选型和 trade-off。',
          interviewTip: '先画图再讲："我项目的架构分 5 层（展示 ARCHITECTURE.md 的整体图），当前实现了前 4 层，M6/M7 补可观测和评测。"',
          projectMapping: 'docs/ARCHITECTURE.md 图 1 + 图 6',
        },
        {
          id: 'iadv10',
          type: 'single',
          knowledgeTag: '系统设计',
          difficulty: '⭐⭐⭐',
          text: '面试官问：<strong>"Agent 什么时候不该用？什么场景 workflow 就够了？"</strong>',
          options: [
            { text: 'Agent 永远比 workflow 好', value: 'a' },
            { text: '如果任务步骤固定、不需要 LLM 判断下一步做什么，用 workflow（确定性管道）更可靠更便宜；Agent 适合需要动态决策的场景', value: 'b' },
            { text: 'workflow 已经过时了', value: 'c' },
            { text: '看数据量大小决定', value: 'd' }
          ],
          answer: 'b',
          explain: 'Agent 的"自主决策"是优势也是风险——不确定性高、token 消耗大、难以保证一致性。如果步骤确定（如 ETL 管道），用 workflow 更好。Anthropic 的最佳实践原文："Start with workflows, add agents only where flexibility is needed."',
          deeper: 'AgentGuide Stage 0 的第一个问题就是："我的场景为什么需要 Agent，而不是普通 workflow？" 能回答这个问题说明你理解了 Agent 的边界。',
          interviewTip: '展示克制："并不是所有 AI 功能都需要 Agent。我项目里天气查询用 Agent 合理（需要 LLM 判断是否需查天气），但如果只是定时抓取天气数据，workflow 就够了。"',
          projectMapping: '整个项目的定位选择：SingleAgent 用于需要动态工具决策的场景',
        },

        // ===== STAR 项目表达（3 题）=====
        {
          id: 'iadv11',
          type: 'single',
          knowledgeTag: 'STAR 表达',
          difficulty: '⭐⭐',
          text: '面试官说：<strong>"用 2 分钟介绍你的 Agent 项目"</strong>。以下哪个回答结构最好？',
          options: [
            { text: '"我用了 LangGraph、FastAPI、MCP、SQLAlchemy……"（列技术栈）', value: 'a' },
            { text: '"这是一个学习项目，实现了 Agent 对话……"（说功能）', value: 'b' },
            { text: 'STAR：背景（学 Agent 缺乏完整实践项目）→ 目标（搭建生产级 Agent 服务 + 学习游戏）→ 行动（5 个里程碑：基础→流式→LangGraph→MCP→持久化）→ 结果（6 种 Agent 模式可切换 + GitHub Pages 公开）', value: 'c' },
            { text: '"这个项目很复杂，我从零开始……"（流水账）', value: 'd' }
          ],
          answer: 'c',
          explain: 'STAR 结构让面试官在 2 分钟内听懂：你做了什么、为什么做、怎么做、做到了什么程度。列技术栈没有上下文，说功能没有深度，流水账没有重点。',
          deeper: '面试经验：前 30 秒决定面试官对你的印象。STAR 结构的 S（背景）用 1 句话，T（目标）用 1 句话，A（行动）用 3-4 个关键决策，R（结果）用数字量化。',
          interviewTip: '背一段标准答案："我做了一个从 0 到生产级的 AI Agent 学习项目。背景是市面上缺乏完整的实战型 Agent 工程教程。我的目标是对齐 2026 主流栈搭一个可运行的 Agent 服务。技术选型 LangGraph + FastAPI + MCP，分 5 个里程碑迭代。成果是 6 种 Agent 模式可切换、对话可持久化、有鉴权、GitHub Pages 上有交互式学习游戏。"',
          projectMapping: '整个项目',
        },
        {
          id: 'iadv12',
          type: 'single',
          knowledgeTag: 'STAR 表达',
          difficulty: '⭐⭐',
          text: '面试官追问：<strong>"你做这个项目遇到的最大技术挑战是什么？"</strong>最佳回答方式是？',
          options: [
            { text: '"没什么挑战，都很顺利"', value: 'a' },
            { text: '"最大挑战是 MCP 的 stdio 无状态语义——我一开始以为子进程常驻，导致并发时偶现工具调用失败。排查后发现是每次调用都新建 session，改为在 loader 层缓存 Tool 对象后解决。"', value: 'b' },
            { text: '"什么都很难"', value: 'c' },
            { text: '"主要是搭环境"', value: 'd' }
          ],
          answer: 'b',
          explain: '好的"挑战回答"必须包含：具体问题 → 排查过程 → 解决方案。这展示了你的调试能力和对技术的深入理解。说"没挑战"让面试官觉得你没深入做。',
          deeper: '准备 2-3 个"踩坑故事"：MCP stdio 语义、MemorySaver 跨请求失效、NDJSON 流式 \\n 遗漏。每个都是真实 bug，面试官问来你能讲得很细。',
          interviewTip: '这道题的答案 B 就是模板。把你自己的 bug 经历套进去即可。',
          projectMapping: 'mcp_servers/loader.py 的 docstring 就是这次踩坑的记录',
        },
        {
          id: 'iadv13',
          type: 'single',
          knowledgeTag: 'STAR 表达',
          difficulty: '⭐⭐',
          text: '面试官问：<strong>"如果给你 3 个月继续做这个项目，你会做什么？"</strong>',
          options: [
            { text: '"不知道，看需求"', value: 'a' },
            { text: '"加更多功能"', value: 'b' },
            { text: '"三个方向：1) 可观测（Langfuse + trace 贯穿）让每次失败都能复现；2) RAG + 长期记忆让 Agent 能检索知识库；3) 评测 CI（DeepEval）让每次改 prompt 都有回归保护。优先级按业务价值排。"', value: 'c' },
            { text: '"重写一遍"', value: 'd' }
          ],
          answer: 'c',
          explain: '好的回答要展示：你有规划、有优先级、有判断力。说出具体方向 + 为什么这么排序，比"加功能"有说服力 100 倍。',
          deeper: '这道题本质在考：你是不是只会跟着教程做，还是能独立规划。能说出 M6/M7/M9 的优先级和理由 = 高级工程师思维。',
          interviewTip: '直接用 LEARNING-PLAN.md 的 M6/M7/M9 回答。面试官如果追"为什么先做可观测？"你说："没有 trace 的 Agent 出 bug 只能靠猜，不可维护。"',
          projectMapping: 'LEARNING-PLAN.md 的 M6/M7/M9 章节',
        },
      ]
    }
  ]
};
