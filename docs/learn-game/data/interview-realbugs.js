// 面试题库：真实 Bug 篇（来自本项目开发过程中的实际踩坑）
// 这类题最加分——因为是真实经历，面试官追问细节你都能答

export default {
  id: 'INT-BUG',
  topic: '面试 · 真实踩坑',
  title: '我在 Agent 项目里踩过的真实坑',
  subtitle: '5 个来自真实开发的 bug + 排查过程 + 解决方案，面试官最爱问这类',

  stages: [
    {
      kind: 'story',
      title: '为什么"踩坑经历"是面试加分项？',
      content: `
        <p>面试官问"你遇到过什么技术挑战"时，大部分人说：</p>
        <ul>
          <li>❌ "没什么挑战，都很顺利"（面试官觉得你没深入做）</li>
          <li>❌ "什么都很难"（面试官觉得你能力不行）</li>
        </ul>

        <p><strong>正确答法 = 具体问题 + 排查过程 + 解决方案 + 经验教训</strong></p>

        <div class="story-box">
          🎯 本关 5 道题全部来自你这个项目的真实 bug，每道题都能用 STAR 格式讲出来。
          面试官追问细节，你都能答到代码级。
        </div>
      `,
    },

    {
      kind: 'final-quiz',
      title: '踩坑面试模拟：5 题',
      passLine: 0.6,
      questions: [
        {
          id: 'ibug01',
          type: 'single',
          knowledgeTag: '状态管理',
          difficulty: '⭐⭐⭐',
          text: `面试官问：<strong>"你做 Agent 时遇到过什么 bug？怎么排查的？"</strong><br><br>场景：同一个 session，第二次请求时 Agent 完全不记得第一次的对话。`,
          options: [
            { text: '模型太笨，记不住', value: 'a' },
            { text: 'Checkpointer 每次请求都新建了一个 MemorySaver 实例，新实例里是空的，thread_id 匹配不到任何历史', value: 'b' },
            { text: '前端没传 session_id', value: 'c' },
            { text: '数据库连接断了', value: 'd' }
          ],
          answer: 'b',
          explain: '这是本项目的真实 bug。每次 new SingleAgent 都 new MemorySaver → 新实例没有历史数据 → LangGraph 以为是全新对话。修复：把 checkpointer 提到模块级单例 / lifespan 全局共享。',
          deeper: '面试时用 STAR 讲："S-多轮对话续不上；T-定位原因；A-发现 checkpointer 生命周期和请求绑定了；R-提到 lifespan 单例后问题消失。经验教训：有状态组件必须是进程级单例。"',
          interviewTip: '这个 bug 说出来非常加分——因为它暴露了你对"状态管理生命周期"的深入理解。',
          projectMapping: 'agent.py: _FALLBACK_CHECKPOINTER 模块级 → lifespan 注入 AsyncSqliteSaver',
        },
        {
          id: 'ibug02',
          type: 'single',
          knowledgeTag: 'MCP 协议',
          difficulty: '⭐⭐⭐',
          text: `面试官问：<strong>"MCP 集成时你踩过什么坑？"</strong><br><br>场景：你以为 stdio MCP Server 启动后会常驻，但并发调用时偶尔出现"连接失败"。`,
          options: [
            { text: 'MCP 协议有 bug', value: 'a' },
            { text: 'MultiServerMCPClient 默认是无状态模式：每次工具调用都新建 ClientSession + spawn 新子进程，用完就退。不是"常驻复用"', value: 'b' },
            { text: '网络问题', value: 'c' },
            { text: 'Python 不支持多进程', value: 'd' }
          ],
          answer: 'b',
          explain: '这是 MCP 最容易误解的点。默认行为是"无状态"——每次调用独立生命周期。如果需要长连接/共享状态，要显式用 async with client.session(name)。',
          deeper: '面试时这样讲："我一开始以为 stdio server 启动后常驻，结果并发测试时偶尔报连接错误。读了 langchain-mcp-adapters 源码才发现是无状态模式——每次调用都是独立进程。修改为缓存 Tool 对象（不是进程），问题解决。"',
          interviewTip: '承认"一开始误解"反而加分——说明你会读源码排查，不是只看文档表面。',
          projectMapping: 'mcp_servers/loader.py: get_mcp_tools() 的 docstring 详细解释了无状态语义',
        },
        {
          id: 'ibug03',
          type: 'single',
          knowledgeTag: '流式协议',
          difficulty: '⭐⭐',
          text: `面试官问：<strong>"流式输出时遇到过什么问题？"</strong><br><br>场景：后端 yield 了数据，但前端一直没有输出，直到流结束才一次性全部出现。`,
          options: [
            { text: '模型生成太慢', value: 'a' },
            { text: '前端代码写错了', value: 'b' },
            { text: '后端忘了在每个 JSON 后加 \\n 分隔符，前端 buffer 找不到换行无法切行，所有数据粘成一坨直到流结束', value: 'c' },
            { text: '浏览器缓存了响应', value: 'd' }
          ],
          answer: 'c',
          explain: 'NDJSON 的分隔完全靠 \\n。没有换行 → 前端 buffer.indexOf("\\n") 永远返回 -1 → 数据一直累加 → 流结束后一次性出来（如果运气好的话）。',
          deeper: '面试时讲："排查路径是：先确认后端确实在 yield 数据（加日志确认）→ 再看前端 buffer（发现一直在增长但没切分）→ 定位到缺 \\n → 一行修复。教训：流式协议的分隔符就是生命线。"',
          interviewTip: '这种"一行代码修复"的 bug 反而适合面试讲——因为排查过程体现了系统性思维。',
          projectMapping: 'chat.py: yield (json.dumps(chunk) + "\\n").encode("utf-8") 里的 \\n',
        },
        {
          id: 'ibug04',
          type: 'single',
          knowledgeTag: '成本控制',
          difficulty: '⭐⭐',
          text: `面试官问：<strong>"Agent 成本失控怎么防？你有实际经验吗？"</strong><br><br>场景：测试时发现一个 prompt 让 Agent 反复调工具不停，一个请求花了正常 50 倍的 token。`,
          options: [
            { text: '告诉用户不要这样问', value: 'a' },
            { text: '三层预算防线：recursion_limit（限步数）+ max_tokens（限单次生成）+ timeout（限超时）。任何一层触发就强制停止', value: 'b' },
            { text: '换更便宜的模型', value: 'c' },
            { text: '禁止使用工具', value: 'd' }
          ],
          answer: 'b',
          explain: '真实场景：用户说"帮我一直搜索直到找到完美答案" → Agent 无限循环调 search → 不设 limit 就烧钱到账号限额。三层防线是生产标配。',
          deeper: '面试时讲："我在项目里设了 recursion_limit=25（最多 25 步节点执行）、max_tokens=4096（单次生成上限）、timeout=60s（防 API 卡死）。这三层缺一不可——limit 防循环、tokens 防超长、timeout 防卡死。"',
          interviewTip: '能说出"三层"比只说"加个 limit"有深度得多。',
          projectMapping: 'agent.py: config["recursion_limit"] + ChatOpenAI(max_tokens=4096, request_timeout=60)',
        },
        {
          id: 'ibug05',
          type: 'single',
          knowledgeTag: '安全',
          difficulty: '⭐⭐',
          text: `面试官问：<strong>"你的 Agent 有什么安全防护？"</strong><br><br>场景：项目部署后发现任何知道 URL 的人都能调 API，白嫖你的 OpenAI Key。`,
          options: [
            { text: '只告诉信得过的人 URL', value: 'a' },
            { text: '加鉴权中间件：AUTH_SECRET 为空时放开（开发友好），有值时必须带 Bearer Token。用 ContextVar 做协程隔离防并发串用户', value: 'b' },
            { text: '在 OpenAI 那设 IP 白名单', value: 'c' },
            { text: '关掉服务', value: 'd' }
          ],
          answer: 'b',
          explain: '设计要点：开发时不想操心鉴权（AUTH_SECRET 空 = 放行），上线时设值就启用。中间件不直接 401（/health 等不需要鉴权），由业务层 get_current_user() 决定。ContextVar 防并发时用户身份互相覆盖。',
          deeper: '面试时讲："我参考了 ToolHive 的中间件设计：①不直接拦截（健康检查要过）②ContextVar 协程隔离（10 个并发请求各自独立）③finally 里 reset 防泄漏。"',
          interviewTip: '能说出"ContextVar + finally reset"这个细节 = 你真的写过这段代码不是抄的。',
          projectMapping: 'core/auth.py: AuthMiddleware + ContextVar + get_current_user()',
        },
      ]
    }
  ]
};
