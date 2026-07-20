// 面试题库：生产化进阶篇（Trace-ID / 断线续传 / 多用户鉴权 / Postgres迁移 / 安全加固）
// 来源：本项目 M12（P1/P2）+ M13 / M13.5 / M13.6 新增的生产化能力
// 8 题：覆盖"从单机 demo 到可水平扩展、可观测、可鉴权、够安全的服务"这段升级

export default {
  id: 'INT-PRODUCTION',
  topic: '面试 · 生产化进阶',
  title: '生产化进阶面试题（Trace-ID / 断线续传 / JWT / Postgres / 安全加固）',
  subtitle: '8 道题覆盖可观测、可扩展、可鉴权、够安全——把 Agent 服务真正推向生产',

  stages: [
    {
      kind: 'story',
      title: '"上生产还差哪几步？"',
      content: `
        <p>前面几关解决了"能跑"和"基础生产设施"，这一关是<strong>"真正上生产"</strong>的进阶话题：</p>

        <div class="story-box">
          🎯 本关覆盖 6 个进阶能力：
          <ul>
            <li><strong>全链路 Trace-ID</strong>：一个请求跨中间件/日志/Langfuse 用同一个 ID 串起来</li>
            <li><strong>流式断线续传</strong>：任务化 SSE + 事件重放，网络抖动后从断点接着收</li>
            <li><strong>多用户鉴权</strong>：JWT + bcrypt，让 per-user 配额真正生效</li>
            <li><strong>Postgres + Alembic</strong>：从 SQLite 单机走向可水平扩展</li>
            <li><strong>安全加固</strong>：去 eval、恢复证书校验、高危工具默认禁用</li>
            <li><strong>生产启动校验</strong>：不安全配置直接 fail-fast 拒绝启动</li>
          </ul>
        </div>

        <div class="callout">
          💡 <strong>面试核心原则</strong>：这些题最能区分"做过玩具项目"和"做过线上服务"。
          答的时候多讲"为什么这么设计""踩过什么坑""怎么权衡"，而不是只说"我用了 X"。
        </div>
      `,
    },

    {
      kind: 'final-quiz',
      title: '模拟面试：生产化进阶 8 题',
      passLine: 0.6,
      questions: [
        // ===== 全链路 Trace-ID（M12 P1）=====
        {
          id: 'ipr01',
          type: 'multi',
          knowledgeTag: '全链路 Trace-ID',
          difficulty: '⭐⭐',
          text: '面试官问：<strong>"怎么做一个请求的全链路 trace-id，让日志和监控能串起来？"</strong>（多选）',
          options: [
            { text: '入口中间件生成/复用 trace-id：入站带了 X-Trace-Id 就复用（跨服务关联），否则新生成', value: 'a' },
            { text: '用 ContextVar 存 trace-id，做协程级隔离——并发请求各自独立，不会串', value: 'b' },
            { text: '响应头回传 X-Trace-Id / X-Request-Id，前端/调用方可记录用于排查', value: 'c' },
            { text: '把同一个 trace-id 写进 Langfuse callback 的 metadata，日志和 Langfuse trace 用同一 ID 关联', value: 'd' },
            { text: '用一个全局变量存 trace-id，简单省事', value: 'e' },
          ],
          answer: ['a', 'b', 'c', 'd'],
          explain: '全链路 trace 的四要素：入口注入（复用或新生成）、ContextVar 协程隔离、响应头回传、下游（日志/Langfuse）带同一 ID。全局变量在并发下会被别的请求覆盖，绝对不能用。',
          deeper: '面试加分：能说出"为什么不用全局变量而用 ContextVar"——FastAPI 单进程内多个请求跑在不同协程，全局变量会互相覆盖，ContextVar 每个协程一份，天然隔离。',
          interviewTip: '讲清"复用 vs 新生成"这个细节："入站带了 X-Trace-Id 我就复用，这样上游服务的调用链能和我这段串起来；没带才新生成。前端一次交互的多个请求也可以共享一个 trace-id。"',
          projectMapping: 'apps/api/app/core/trace.py — TraceMiddleware + ContextVar + get_logger + tracing.py 注入 Langfuse metadata',
        },
        {
          id: 'ipr02',
          type: 'single',
          knowledgeTag: 'ContextVar 与流式的坑',
          difficulty: '⭐⭐⭐',
          text: '面试官追问：<strong>"你用 BaseHTTPMiddleware + ContextVar 存 trace-id，流式响应（SSE）里为什么可能读不到它？"</strong>',
          options: [
            { text: '不会有问题，ContextVar 到处都能读到', value: 'a' },
            { text: '流式响应体是在中间件 dispatch 返回之后才逐步产出的，此时 finally 里 reset 掉的 ContextVar 已经失效，所以流式生成器内部再读 trace-id 可能拿到空——响应头和请求首尾日志不受影响（在 dispatch 内完成），但流内日志要显式从 request.state 取', value: 'b' },
            { text: '因为 SSE 不支持自定义头', value: 'c' },
            { text: '因为 trace-id 太长了', value: 'd' },
          ],
          answer: 'b',
          explain: 'BaseHTTPMiddleware 的 dispatch 在 call_next 返回后就结束（finally 里 reset ContextVar），而流式响应体是之后由 ASGI server 消费生成器时才产出的。所以流内再读 ContextVar 可能已被重置。要在流里带 trace-id，需显式从 request.state 传进去。',
          deeper: '面试加分：这是 BaseHTTPMiddleware + ContextVar + 流式响应的经典陷阱，能主动指出说明你真在生产里踩过流式的坑，而不只是跑过 hello world。',
          interviewTip: '诚实说明边界："响应头和请求级日志是对的（都在 dispatch 内），但如果要在流式 token 的日志里也带 trace-id，我会从 request.state.trace_id 显式取，不依赖 ContextVar。"',
          projectMapping: 'apps/api/app/core/trace.py — dispatch 里 _trace_id.reset(token) 在 finally；request.state.trace_id 作为流内取值来源',
        },

        // ===== 架构守护（M12 P1）=====
        {
          id: 'ipr03',
          type: 'single',
          knowledgeTag: '架构守护测试',
          difficulty: '⭐⭐',
          text: '面试官问：<strong>"怎么用测试守住分层架构，防止核心层被业务层污染？"</strong>',
          options: [
            { text: '靠 code review 人工把关就够了', value: 'a' },
            { text: '写一个静态检查测试：用 AST 解析核心层（agents/、core/）所有文件的 import，断言它们不 import 业务层（app.api / app.main）。核心层反向依赖业务层就让 CI 挂掉', value: 'b' },
            { text: '用字符串搜索 grep "app.api" 就行', value: 'c' },
            { text: '架构边界不需要测试', value: 'd' },
          ],
          answer: 'b',
          explain: '架构边界靠人工 review 迟早会破。用 AST 静态检查把"核心层不许 import 业务层"变成一条 CI 里能跑的测试，是把架构约束固化下来的标准做法。用 AST 而非 grep，是为了避免误伤注释/字符串里出现的 "app.api"。',
          deeper: '面试加分：能说出"为什么用 AST 不用 grep"——AST 精确识别 import x / from x import y 两种语法，不会被注释、文档字符串里的 app.api 误伤。',
          interviewTip: '把它上升到方法论："能用测试固化的约束就不要靠自觉。我给核心层写了 test_harness_boundary，谁不小心让 core 反向依赖了 api，CI 直接红，不用等 review。"',
          projectMapping: 'apps/api/tests/test_harness_boundary.py — ast.walk 提取 import，断言不含 app.api/app.main',
        },

        // ===== 流式断线续传（M12 P2）=====
        {
          id: 'ipr04',
          type: 'single',
          knowledgeTag: '流式断线续传',
          difficulty: '⭐⭐⭐',
          text: '面试官问：<strong>"你的流式对话怎么做断线续传？网络抖一下能从断点接着收吗？"</strong>',
          options: [
            { text: '断了就重发整个请求，重新生成一遍', value: 'a' },
            { text: '改成"任务化"两步式：POST 建任务（后台跑 Agent，和 HTTP 连接解耦，客户端断了也不停），GET 用 SSE 观察且每个事件带单调 id；断线后带 Last-Event-ID / ?after_id= 重连，服务端从该 id 之后重放事件', value: 'b' },
            { text: '让用户刷新页面重新问', value: 'c' },
            { text: '把整段回答缓存到前端 localStorage', value: 'd' },
          ],
          answer: 'b',
          explain: '断线续传的关键是"任务与连接解耦"+"事件带序号可重放"。POST 建任务让 Agent 在后台独立跑，GET SSE 只是观察；事件有单调 id，重连时带 Last-Event-ID/after_id，服务端跳过已收到的、从断点继续推。重发整个请求既浪费又会重复扣费。',
          deeper: '面试加分：能说出内存缓冲 + DB 兜底的分层——在线重连从进程内缓冲区全保真回放（含 text token）；进程重启后从持久化的事件表回放（只存非 text）+ 补发最终答案。',
          interviewTip: '强调"解耦"这个设计核心："以前是一个 POST 边发边收，连接一断 Agent 也停了。改成 task + GET SSE 后，Agent 在后台跑，前端断开重连只是换一条观察流，带上 after_id 就能续。"',
          projectMapping: 'apps/api/app/core/task_stream.py（StreamTask.follow/事件缓冲）+ chat.py::/tasks、/tasks/{id}/stream + 前端 useResumableStream.ts',
        },
        {
          id: 'ipr05',
          type: 'multi',
          knowledgeTag: 'SSE vs NDJSON',
          difficulty: '⭐⭐',
          text: '面试官问：<strong>"SSE 和 NDJSON 做流式各有什么取舍？你怎么选？"</strong>（多选）',
          options: [
            { text: 'SSE 有原生的事件分类（event:）和断线续传语义（id: + Last-Event-ID），适合"服务端持续推 + 需要续传"的场景', value: 'a' },
            { text: '浏览器原生 EventSource 只能 GET、不能带请求体和自定义头，所以"单个 POST 边发边收"用不了原生 SSE', value: 'b' },
            { text: 'NDJSON（每行一个 JSON）解析简单：切 \\n + JSON.parse 即可，适合 fetch + POST body 的单请求流式', value: 'c' },
            { text: 'SSE 一定比 NDJSON 快很多', value: 'd' },
            { text: '负载格式可以设计成传输无关的：同一份 chunk，既能包成 SSE 帧也能按 NDJSON 行输出，切换传输成本很低', value: 'e' },
          ],
          answer: ['a', 'b', 'c', 'e'],
          explain: 'SSE 的优势是事件分类 + 原生续传；代价是原生 EventSource 只能 GET。本项目单 POST 流式用 NDJSON（fetch 解析简单），需要断线续传的场景改成 task + GET SSE。两者性能差异不是重点，选型看"是否需要 SSE 的续传/事件语义"和"是否要 POST body"。',
          deeper: '面试加分：能指出"想在单 POST 上用 SSE，就得用 fetch 手解 SSE 帧，此时 SSE 相对 NDJSON 的解析优势就没了"——所以本项目单 POST 走 NDJSON、续传场景才上 task+SSE。',
          interviewTip: '展示你对两种方案都想清楚了："我不是无脑选一个。单 POST 边发边收用 NDJSON 最省事；要断线续传就换成任务化 + GET SSE，因为那时才用得上 SSE 的 id/Last-Event-ID。"',
          projectMapping: 'apps/api/app/api/v1/chat.py — /stream_ndjson（NDJSON）vs /tasks/{id}/stream（SSE）；chunk 负载两者一致',
        },

        // ===== 多用户鉴权（M13）=====
        {
          id: 'ipr06',
          type: 'multi',
          knowledgeTag: '多用户 JWT 鉴权',
          difficulty: '⭐⭐',
          text: '面试官问：<strong>"从共享一个密钥升级成多用户鉴权，你做了哪些关键点？"</strong>（多选）',
          options: [
            { text: '密码用 bcrypt 哈希存储（自带每用户 salt + 慢哈希），从不存明文', value: 'a' },
            { text: 'JWT 签发/验签：sub 放用户 id，带 exp 过期；验签用恒定时间比较防时序侧信道', value: 'b' },
            { text: '真实 user_id 一路带进配额，per-user 每日 token 限额才真正生效（共享密钥时所有人是同一个身份，配额形同虚设）', value: 'c' },
            { text: '向后兼容：中间件同时接受遗留共享密钥和新版 JWT，平滑迁移', value: 'd' },
            { text: '直接把密码明文存数据库，方便找回', value: 'e' },
          ],
          answer: ['a', 'b', 'c', 'd'],
          explain: '多用户鉴权关键点：bcrypt 存哈希（永不存明文）、JWT 带 sub/exp 且恒定时间验签、真实 user_id 打通配额、迁移期向后兼容。共享单密钥最大的问题是"所有人是同一个身份"，配额/审计都失去意义。',
          deeper: '面试加分：能说出 JWT 的三段结构（header.payload.signature，前两段是 base64url 明文、第三段是 HMAC 签名），以及"JWT 是防篡改不是防偷看，敏感信息别放 payload"。',
          interviewTip: '点出"配额为什么之前没用"这个洞察："共享密钥时所有请求都是同一个 user_id，per-user 配额根本区分不了人。上了 JWT 之后，sub 是真实用户，配额、运行历史才能按人隔离。"',
          projectMapping: 'apps/api/app/core/security.py（bcrypt + HS256 JWT）+ auth.py（中间件解析，兼容遗留密钥）+ api/v1/auth.py',
        },

        // ===== Postgres + Alembic（M13.5）=====
        {
          id: 'ipr07',
          type: 'single',
          knowledgeTag: 'DB 迁移与水平扩展',
          difficulty: '⭐⭐⭐',
          text: '面试官问：<strong>"你的项目怎么从 SQLite 单机走向可水平扩展？迁移怎么管？"</strong>',
          options: [
            { text: '一直用 create_all 自动建表，改了模型手动 ALTER', value: 'a' },
            { text: '业务库支持 SQLite(dev)/Postgres(生产)双库，schema 用 Alembic 版本化迁移；init_db 分方言（SQLite 保留 create_all 零配置，Postgres 交给 alembic upgrade head，不自动建表以免和版本管理打架）；对话状态 Checkpointer 在 Postgres 下用 AsyncPostgresSaver 多机共享', value: 'b' },
            { text: '把 SQLite 文件放到共享网盘让多台机器读', value: 'c' },
            { text: '每台机器一个独立 SQLite，各写各的', value: 'd' },
          ],
          answer: 'b',
          explain: '水平扩展的前提是"状态外置到共享存储"。业务库换 Postgres + Alembic 管迁移；关键是 LangGraph 的对话状态（checkpointer）也要换成 AsyncPostgresSaver 多机共享，否则业务库共享了、对话状态还锁在某台机器的本地 SQLite 文件上，照样没法多副本。共享网盘放 SQLite 会有锁/一致性问题。',
          deeper: '面试加分：能说出"为什么测试环境要用 NullPool"——pytest-asyncio 每个用例一个 event loop，连接池会在多 loop 间保留连接，跨 loop 被 GC 时报错；NullPool 用完即关避免这问题。',
          interviewTip: '强调"两个状态都要外置"这个容易漏的点："很多人只把业务库换成 Postgres，忘了 LangGraph 的 checkpointer 还在本地 SQLite——那样多副本之间对话记忆不共享，等于没真正水平扩展。"',
          projectMapping: 'apps/api/migrations/（Alembic）+ core/database.py（init_db 分方言 + NullPool）+ core/checkpointer.py（AsyncPostgresSaver）',
        },

        // ===== 安全加固 + 启动校验（M13.6）=====
        {
          id: 'ipr08',
          type: 'multi',
          knowledgeTag: '安全加固与启动校验',
          difficulty: '⭐⭐⭐',
          text: '面试官问：<strong>"上生产前你做了哪些安全加固？"</strong>（多选）',
          options: [
            { text: '计算器工具用 AST 白名单求值替代 eval：显式禁用 ** 幂运算（防 9**9**9 打满 CPU）、禁变量/函数调用，杜绝任意代码执行', value: 'a' },
            { text: '恢复 HTTPS 证书校验：用 certifi 的 create_default_context 替代 ssl._create_unverified_context()，防中间人攻击', value: 'b' },
            { text: '高危工具（删除/转账）默认不加载（default deny），需显式开开关才启用，Agent 无法自主调用', value: 'c' },
            { text: '生产启动校验（fail-fast）：ENVIRONMENT=production 且 SECRET_KEY 仍是默认值时直接拒绝启动，因为默认签名密钥意味着 JWT 可被伪造', value: 'd' },
            { text: '把 API Key 硬编码进代码，省得配环境变量', value: 'e' },
          ],
          answer: ['a', 'b', 'c', 'd'],
          explain: '安全加固要点：去 eval（AST 白名单，禁幂运算防 DoS）、恢复证书校验（防 MITM）、高危工具默认拒绝、生产配置 fail-fast（默认 SECRET_KEY 能伪造 JWT，必须拒绝启动）。硬编码密钥是典型反面教材。',
          deeper: '面试加分：能解释"为什么禁 **"——eval 的字符白名单挡不住 9**9**9 这种表达式，它字符都合法但会瞬间吃满 CPU/内存，属于算法复杂度攻击（DoS）。AST 白名单能精确禁掉 Pow 节点。',
          interviewTip: '讲一个具体的攻击面："eval 就算加了字符白名单，9**9**9 也能打满 CPU——这是 DoS。所以我用 AST 遍历，只放行加减乘除取模，Pow 节点直接拒绝。安全加固要针对具体攻击面，不是笼统说我很安全。"',
          projectMapping: 'apps/api/app/core/safe_tools.py（safe_eval_math + secure_ssl_context）+ mcp_servers/loader.py（高危工具门禁）+ config.py::validate_runtime',
        },
      ],
    },
  ],
};
