// 面试题库：生产 Runtime 篇（运行持久化 / 幂等性 / 配额治理）
// 来源：本项目参考 noah-chat-svc 企业级实现后新增的 M10+ 能力
// 6 题：覆盖"从 demo 到生产"最关键的 3 个基础设施

export default {
  id: 'INT-RUNTIME',
  topic: '面试 · 生产 Runtime',
  title: 'Agent 生产化面试题（运行持久化 / 幂等 / 配额）',
  subtitle: '6 道题覆盖"从能跑的 demo 到可上线的服务"之间最关键的基础设施',

  stages: [
    {
      kind: 'story',
      title: '"你这 Agent 能上生产吗？"',
      content: `
        <p>面试官最喜欢追问的一类题：<strong>"你这 Agent 在生产环境怎么跑？"</strong></p>

        <div class="story-box">
          🎯 本关覆盖 3 个生产必备能力：
          <ul>
            <li><strong>运行持久化（Run/Event）</strong>：每次 Agent 执行的完整事件链落库，可审计、可回放、可计费</li>
            <li><strong>幂等性（Idempotency）</strong>：重复请求只执行一次，不重复扣费、不重复调 LLM</li>
            <li><strong>配额治理（Quota）</strong>：按用户/天限制 token 消耗，防止被刷爆</li>
          </ul>
        </div>

        <div class="callout">
          💡 <strong>面试核心原则</strong>：说"我做了 Agent"只是 60 分，说"我的 Agent 有幂等防重、事件溯源、成本管控"才是 90 分。
          这些是区分"会调 API"和"能做服务"的关键。
        </div>
      `,
    },

    {
      kind: 'final-quiz',
      title: '模拟面试：生产 Runtime 6 题',
      passLine: 0.6,
      questions: [
        // ===== 运行持久化（2 题）=====
        {
          id: 'irt01',
          type: 'multi',
          knowledgeTag: 'Run 持久化',
          difficulty: '⭐⭐',
          text: '面试官问：<strong>"为什么生产 Agent 需要把每次运行（Run）和事件（Event）持久化到数据库？只存最终回复不够吗？"</strong>（多选）',
          options: [
            { text: '可审计：用户投诉"回答不对"时，能查到完整的执行过程（调了什么工具、返回了什么）', value: 'a' },
            { text: '可回放：历史 run 的事件流可以重新推给前端，不需要重新调 LLM', value: 'b' },
            { text: '可计费：基于 run 级别统计 token 消耗，精确到每次调用', value: 'c' },
            { text: '为了让页面显示更好看', value: 'd' },
            { text: '可恢复：中断后能从 DB 恢复上下文继续执行，而不是从头开始', value: 'e' },
            { text: '可观测：定位"Agent 在哪一步出错了"——是工具返错数据、还是 LLM 没用工具结果', value: 'f' },
          ],
          answer: ['a', 'b', 'c', 'e', 'f'],
          explain: '只存最终回复 = 只知道"最后端了一盘菜"，不知道"厨师中间做了什么"。生产环境必须有完整的执行链路（事件溯源），才能排查问题、统计成本、支持恢复。',
          deeper: '面试加分：提到"事件溯源（Event Sourcing）"这个架构模式——Event 表是 append-only 的，通过 seq_no 保证顺序，可以像数据库 binlog 一样回放任何时刻的状态。',
          interviewTip: '用真实场景举例："我项目里用户问天气，如果只存最终回复，排查时不知道是工具返错了还是 LLM 幻觉。有了 Event 链，一眼就能看到 tool_calls→tool_result→text 的完整流。"',
          projectMapping: 'apps/api/app/models/models.py — AgentRun + AgentEvent 两张表',
        },
        {
          id: 'irt02',
          type: 'single',
          knowledgeTag: '事件溯源设计',
          difficulty: '⭐⭐⭐',
          text: '面试官问：<strong>"你的 AgentEvent 表为什么用 seq_no 而不是靠 created_at 排序？"</strong>',
          options: [
            { text: '没区别，用时间戳也行', value: 'a' },
            { text: 'seq_no 是在同一个 run 内严格递增的序号，保证事件顺序绝对正确；时间戳在高并发下可能重复（同毫秒多个事件）', value: 'b' },
            { text: '因为时间戳占用空间更大', value: 'c' },
            { text: '为了兼容不同数据库', value: 'd' },
          ],
          answer: 'b',
          explain: '事件溯源的核心要求是"事件顺序不可乱"。时间戳精度有限（毫秒级），高并发下多个事件可能同时产生。seq_no 由应用层维护递增，保证回放时顺序和实际执行一致。',
          deeper: '面试加分：类比 Kafka 的 offset——消费者靠 offset 而不是时间戳来保证消息顺序。数据库 binlog 也是用位点（position）不是时间戳。',
          interviewTip: '说一句有深度的话："seq_no 是逻辑时钟，created_at 是物理时钟。分布式系统里逻辑时钟比物理时钟更可靠。"',
          projectMapping: 'apps/api/app/models/models.py — AgentEvent.seq_no = Column(Integer)',
        },

        // ===== 幂等性（2 题）=====
        {
          id: 'irt03',
          type: 'single',
          knowledgeTag: '幂等性',
          difficulty: '⭐⭐',
          text: '面试官问：<strong>"什么是幂等性？你的 Agent API 怎么实现的？"</strong>',
          options: [
            { text: '幂等性 = 同一个请求执行多次和执行一次的效果一样。通过客户端传 idempotency_key，服务端用这个 key 去重：第一次执行并缓存结果，后续相同 key 直接返回缓存', value: 'a' },
            { text: '幂等性 = 请求必须成功', value: 'b' },
            { text: '幂等性 = 每次返回不同的结果', value: 'c' },
            { text: '幂等性 = 用 POST 代替 GET', value: 'd' },
          ],
          answer: 'a',
          explain: '幂等性的核心：f(x) = f(f(x))。在 API 场景下 = 重复提交同一个请求不会产生副作用（不会重复扣钱、不会重复调 LLM、不会创建重复数据）。',
          deeper: '面试加分：说出三层防重策略——① 客户端生成 UUID 作为 key ② 服务端在 DB 建唯一索引 ③ 匹配到已有 key 时直接回放缓存的事件流而不是返回空。',
          interviewTip: '用支付类比最清楚："就像支付宝转账，你连点三次确认只扣一次钱——靠的就是每笔交易有唯一的交易号。我的 Agent 也一样，每次对话带一个 idempotency_key。"',
          projectMapping: 'apps/api/app/api/v1/chat.py — 幂等检查在 stream_ndjson 入口',
        },
        {
          id: 'irt04',
          type: 'single',
          knowledgeTag: '幂等性实现',
          difficulty: '⭐⭐⭐',
          text: '面试官问：<strong>"幂等命中时你返回什么？直接返回 200 空响应？还是有别的设计？"</strong>',
          options: [
            { text: '返回 200 空响应就行', value: 'a' },
            { text: '返回 409 冲突', value: 'b' },
            { text: '回放第一次执行的完整事件流（从 DB 读 AgentEvent 按 seq_no 顺序返回），响应头加 X-Idempotency-Status: hit 标识命中缓存', value: 'c' },
            { text: '重新执行一次', value: 'd' },
          ],
          answer: 'c',
          explain: '空响应对客户端没用——它不知道上次执行的结果是什么。正确做法是"回放"：从 Event 表读出第一次执行的所有事件，原样返回给客户端。客户端体验和第一次完全一样。',
          deeper: '面试加分：补充"响应头 X-Idempotency-Status: hit 让客户端能区分是真执行还是缓存命中——对调试和日志很重要"。',
          interviewTip: '强调"回放而非空响应"这个设计决策："我的设计是把第一次的事件流完整回放，客户端无感——它不需要知道这是第几次请求。"',
          projectMapping: 'apps/api/app/api/v1/chat.py — replay() 函数 + X-Idempotency-Status header',
        },

        // ===== 配额治理（2 题）=====
        {
          id: 'irt05',
          type: 'multi',
          knowledgeTag: '配额治理',
          difficulty: '⭐⭐',
          text: '面试官问：<strong>"你怎么防止某个用户把你的 LLM API 额度刷爆？"</strong>（多选）',
          options: [
            { text: 'Per-user 每日 token 配额：超过阈值返回 429', value: 'a' },
            { text: '白名单机制：核心用户/管理员不受限制', value: 'b' },
            { text: '靠 LLM 提供商自己的 rate limit', value: 'c' },
            { text: '请求级预算控制：max_tokens + recursion_limit 防止单次烧太多', value: 'd' },
            { text: '监控告警：异常消耗自动通知（单用户突增 10x）', value: 'e' },
          ],
          answer: ['a', 'b', 'd', 'e'],
          explain: '不能只靠 LLM 提供商的 rate limit——那是按 API Key 整体限流的，不区分用户。你需要自己做 per-user 限流。多层防御：用户级配额 + 请求级预算 + 异常监控，缺一不可。',
          deeper: '面试加分：能说出"配额 ≠ 限流"的区别——配额是资源量（今天总共能用多少 token），限流是速率（每秒最多几个请求）。两个都需要但解决的问题不同。',
          interviewTip: '展示你的多层思路："我做了三层——① 单请求 max_tokens+recursion_limit 防单次烧钱 ② 每日 token 配额防累积刷量 ③ 白名单让管理员不受影响。"',
          projectMapping: 'apps/api/app/core/quota.py — check_quota() + record_usage()',
        },
        {
          id: 'irt06',
          type: 'single',
          knowledgeTag: '配额重置',
          difficulty: '⭐⭐',
          text: '面试官问：<strong>"你的配额是怎么重置的？如果要支持更复杂的配额策略（月度/按项目/按模型）怎么扩展？"</strong>',
          options: [
            { text: '用定时任务每天清一次数据库', value: 'a' },
            { text: '当前用时间窗口判断（检查 day 字段是否为今天，跨天自动归零）；扩展方向是把计数存到 Redis 并用 TTL 做过期，按 user_id + model + project 做多维度 key', value: 'b' },
            { text: '不需要重置，用完就用完了', value: 'c' },
            { text: '让前端自己计算', value: 'd' },
          ],
          answer: 'b',
          explain: '时间窗口法 = 每次检查时比对"当前日期"和"记录日期"，不一致就视为新窗口自动归零。不需要定时任务（定时任务挂了就没有重置了）。Redis TTL 是生产标配。',
          deeper: '面试加分：提到"滑动窗口 vs 固定窗口"——固定窗口（每天0点重置）实现简单但有边界突增问题，滑动窗口（过去24小时）更平滑但实现复杂。',
          interviewTip: '展示扩展思路："当前用内存 dict 做 MVP 验证，生产切 Redis 只需要改存储层。key 设计为 quota:{user}:{model}:{date}，天然支持多维度。"',
          projectMapping: 'apps/api/app/core/quota.py — _today() + _get_user_usage()',
        },
      ],
    },
  ],
};
