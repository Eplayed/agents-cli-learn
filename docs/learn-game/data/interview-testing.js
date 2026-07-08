// 面试题库：AI 测试篇（Prompt 稳定性 / 多轮记忆 / RAG 命中率 / 工具调用 / 幻觉 / 越狱）
// 来源：本项目 M11 新增的 AI 测试引擎（apps/api/app/core/ai_testing.py）
// 8 题：覆盖"LLM 应用怎么测"这个越来越高频的面试考点

export default {
  id: 'INT-TESTING',
  topic: '面试 · AI 测试',
  title: 'AI 应用测试面试题（Prompt 稳定性 / RAG / 工具调用 / 幻觉 / 越狱）',
  subtitle: '8 道题覆盖"LLM 输出不确定，怎么写自动化测试"这个核心矛盾',

  stages: [
    {
      kind: 'story',
      title: '"LLM 输出每次都不一样，你怎么测？"',
      content: `
        <p>这是 AI 岗位面试里越来越常问的一类题，因为它戳中了传统测试思维的痛点：</p>

        <div class="story-box">
          🎯 普通单测断言"输出 == 期望值"，但 LLM 是非确定性的。
          AI 测试要断言的是<strong>"属性"</strong>而不是<strong>"精确值"</strong>：
          <ul>
            <li><strong>Prompt 稳定性</strong>：同一输入多次运行，语义骨架是否稳定</li>
            <li><strong>多轮对话</strong>：上下文记忆是否正确（后面能不能记住前面说的）</li>
            <li><strong>RAG 命中率</strong>：检索到的是不是"该检索到的"文档</li>
            <li><strong>工具调用准确性</strong>：该调用工具时调了没、调对了没、结果用了没</li>
            <li><strong>幻觉检测</strong>：不知道的东西会不会编答案</li>
            <li><strong>异常输入 / 越狱</strong>：恶意提示词、危险请求、垃圾输入是否被安全处理</li>
          </ul>
        </div>

        <div class="callout">
          💡 <strong>面试核心原则</strong>：讲清楚"你在断言什么，为什么这样断言"，
          比背"用了什么测试框架"更能体现工程深度。
        </div>
      `,
    },

    {
      kind: 'final-quiz',
      title: '模拟面试：AI 测试 8 题',
      passLine: 0.6,
      questions: [
        // ===== LLM 问答质量 / Prompt 稳定性（2 题）=====
        {
          id: 'iat01',
          type: 'single',
          knowledgeTag: 'LLM 问答质量',
          difficulty: '⭐',
          text: '面试官问：<strong>"怎么测试大模型的问答质量？和测普通接口有什么本质区别？"</strong>',
          options: [
            { text: '断言输出字符串必须完全等于期望值，不等于就是 bug', value: 'a' },
            { text: '断言"属性"而非"精确值"：关键词是否出现、长度是否在合理区间、是否调用了正确工具、是否包含不该有的虚假信息——这些属性在多次运行下应保持稳定', value: 'b' },
            { text: '不需要测试，LLM 足够聪明', value: 'c' },
            { text: '只要 HTTP 状态码是 200 就算通过', value: 'd' },
          ],
          answer: 'b',
          explain: 'LLM 输出是非确定性的（同样输入，temperature > 0 时两次回答可能不同）。测试必须转向"属性断言"：关键词覆盖、长度区间、工具调用正确性、有无虚假信息等，而不是逐字匹配。',
          deeper: '面试加分：提到"Evaluation-Driven Development"——先定义清楚的评测标准（属性集合），再迭代 Prompt/模型，而不是靠感觉调参。',
          interviewTip: '举例说明："比如测天气问答，我不断言回答文本完全一致，而是断言：调用了 get_weather 工具、回答里出现了城市名、长度大于 20 字——这些是稳定的属性，而具体措辞允许变化。"',
          projectMapping: 'apps/api/app/core/ai_testing.py — CaseResult 结构就是"属性断言"的结果载体',
        },
        {
          id: 'iat02',
          type: 'multi',
          knowledgeTag: 'Prompt 稳定性',
          difficulty: '⭐⭐',
          text: '面试官问：<strong>"怎么测试 Prompt 的稳定性？"</strong>（多选）',
          options: [
            { text: '同一个 Prompt 重复运行 N 次（如 3-5 次），对比每次的输出', value: 'a' },
            { text: '检查每次输出是否都包含关键结论/关键词（语义骨架稳定，措辞可以不同）', value: 'b' },
            { text: '检查输出长度的波动系数（(max-min)/mean），波动过大说明模型"发挥不稳定"', value: 'c' },
            { text: '只要跑一次没报错就算稳定', value: 'd' },
            { text: '可以调低 temperature 参数减少随机性，但测试仍要覆盖多次运行确认边界情况', value: 'e' },
          ],
          answer: ['a', 'b', 'c', 'e'],
          explain: 'Prompt 稳定性测试的核心是"重复运行 + 属性一致性检查"。不要求逐字相同，但关键词覆盖率和长度波动应该在可接受范围。temperature 调低能降低随机性，但不能替代多次运行测试。',
          deeper: '面试加分：提到"这类测试特别适合在改 Prompt/切换模型前后做回归对比"——上线前跑一遍，看 pass_rate 有没有下降。',
          interviewTip: '用数字说话："我设了波动系数阈值 0.6，超过就判定不稳定；关键词要求每次都命中，一次没命中就算失败——这样量化后能自动化跑，不用人工盯着看。"',
          projectMapping: 'apps/api/app/core/ai_testing.py::run_prompt_stability — length_variance + must_contain_all',
        },

        // ===== 多轮对话（1 题）=====
        {
          id: 'iat03',
          type: 'single',
          knowledgeTag: '多轮对话测试',
          difficulty: '⭐⭐',
          text: '面试官问：<strong>"怎么测试 Agent 的多轮对话记忆是否正确？"</strong>',
          options: [
            { text: '每轮对话单独测，互相不关联', value: 'a' },
            { text: '设计一个多轮序列，前面几轮埋入信息（如"我叫小明"），最后一轮问回这些信息，断言回答中出现了埋入的内容；同一 thread_id 贯穿始终', value: 'b' },
            { text: '只测第一轮，后面几轮不用测', value: 'c' },
            { text: '把所有历史消息拼成一个巨大的 Prompt 手动检查', value: 'd' },
          ],
          answer: 'b',
          explain: '多轮记忆测试的关键设计：①同一个 thread_id/session_id 贯穿多轮（否则记忆机制根本没生效）②前面轮次"埋点"信息 ③最后断言后续轮次能"取出"这些信息。这验证的是 Checkpoint/上下文管理是否正确，不是模型智商。',
          deeper: '面试加分：能说出"这类测试能发现的典型 bug"——比如每次请求 new 一个 checkpointer 实例导致记忆丢失（这是真实踩过的坑）。',
          interviewTip: '直接举例："我的用例是第一轮说我叫小明，第二轮扯别的岔开话题，第三轮问你还记得我叫什么吗，断言回答里有小明——这样能测出记忆是不是被中间的无关对话冲掉了。"',
          projectMapping: 'apps/api/app/core/ai_testing.py::run_multi_turn — 同一 thread_id 跑完整 turns 序列',
        },

        // ===== RAG 命中率（2 题）=====
        {
          id: 'iat04',
          type: 'single',
          knowledgeTag: 'RAG 测试',
          difficulty: '⭐⭐',
          text: '面试官问：<strong>"怎么测试 RAG 系统检索是否命中正确的资料？"</strong>',
          options: [
            { text: '只看最终生成的回答好不好，回答好就说明检索对了', value: 'a' },
            { text: '直接调用 retriever（不经过 LLM 生成），对给定 query 检查 Top-K 检索结果里是否包含预期的来源文档，这样能独立评估"召回"这一环，不被生成质量掩盖', value: 'b' },
            { text: 'RAG 不需要测，向量库本身很准确', value: 'c' },
            { text: '人工读一遍所有文档确认', value: 'd' },
          ],
          answer: 'b',
          explain: 'RAG 测试要"拆开测"：检索（Retrieval）和生成（Generation）是两个独立环节。只看最终回答会把"检索错了但 LLM 靠自身知识蒙对了"误判为通过。正确做法是直接测 retriever.ainvoke(query) 的返回，检查来源文档命中情况。',
          deeper: '面试加分：提到"Recall@K"和"Precision@K"这两个信息检索的经典指标——命中率测的本质是 Recall@K（预期文档有没有出现在前 K 个结果里）。',
          interviewTip: '强调"拆开测"这个设计思路："我不测最终回答，是直接拿 query 跑一遍 retriever，检查 Top-3 结果的来源文件名是否覆盖了预期的文档——这样能精确定位是检索的问题还是生成的问题。"',
          projectMapping: 'apps/api/app/core/ai_testing.py::run_rag_hit_rate — 直接调用 get_rag_retriever() 而非走完整对话流程',
        },
        {
          id: 'iat05',
          type: 'multi',
          knowledgeTag: 'RAG 测试设计',
          difficulty: '⭐⭐⭐',
          text: '面试官问：<strong>"设计 RAG 命中率测试用例时要注意什么？"</strong>（多选）',
          options: [
            { text: '每个 query 都要明确标注"预期应该检索到哪些文档"（ground truth），否则无法判断对错', value: 'a' },
            { text: '要覆盖"应该有答案"和"知识库里没有相关内容"两种场景，后者测试系统能否诚实说不知道', value: 'b' },
            { text: 'top_k 参数要和生产配置一致，否则测的和实际跑的不是一回事', value: 'c' },
            { text: '只需要测一个 query 就够了，能跑通就行', value: 'd' },
            { text: 'RAG 功能关闭（ENABLE_RAG=false）时测试应该明确标记跳过，而不是判定失败——避免和真实缺陷混淆', value: 'e' },
          ],
          answer: ['a', 'b', 'c', 'e'],
          explain: '好的 RAG 测试设计：①必须有 ground truth（预期来源）②覆盖正反两种场景 ③测试环境的 top_k 要和生产一致（不然测试通过不代表生产也通过）④环境未启用时要区分"跳过"和"失败"，这是测试工程里常见的信号污染问题。',
          deeper: '面试加分：能说出"如果没有 ground truth，可以先用少量人工标注的 query-document 对建立基准，再逐步扩充测试集"。',
          interviewTip: '展示你的严谨性："我的测试用例区分了跳过和失败——RAG 没开就是跳过（skipped），不是失败，不然会和真的检索错误混在一起，误导排查方向。"',
          projectMapping: 'apps/api/app/core/ai_testing.py::run_rag_hit_rate — ENABLE_RAG=false 时返回 skipped 而非 failed',
        },

        // ===== 工具调用准确性（1 题）=====
        {
          id: 'iat06',
          type: 'multi',
          knowledgeTag: '工具调用测试',
          difficulty: '⭐⭐',
          text: '面试官问：<strong>"怎么测试 Agent 的工具调用是否正确？"</strong>（多选）',
          options: [
            { text: '正向测试：该调用工具的场景（如问天气），断言调用了正确的工具名', value: 'a' },
            { text: '反向测试：不该调用工具的场景（如写首诗），断言没有调用任何工具（防止"工具滥用"）', value: 'b' },
            { text: '结果引用测试：断言最终回答里引用了工具返回的具体数据，而不是调了工具但答案是编的（这是最容易被忽视的一环）', value: 'c' },
            { text: '只要程序没报错就算工具调用正确', value: 'd' },
          ],
          answer: ['a', 'b', 'c'],
          explain: '工具调用测试要三个维度都覆盖：该调的调了（正向）、不该调的没调（反向）、调了工具后结果被正确使用（结果引用）。只测前两个会漏掉"调了工具但没用结果瞎编"这种隐蔽 bug。',
          deeper: '面试加分：能举出反向测试的价值——"如果 Agent 对所有问题都无脑调工具，会浪费 token 和延迟，反向测试能防止这种过度调用"。',
          interviewTip: '强调第三点最容易被忽略：“很多团队只测“调没调工具”，但我还会断言回答里包含工具返回的具体数字——防止 Agent 调了 calculator 返回 96，最后却在回答里编了个 100。”',
          projectMapping: 'apps/api/app/core/ai_testing.py::run_tool_calling — must_call_tool / must_not_call_tool / must_contain 三种断言',
        },

        // ===== 幻觉 / 异常输入越狱（2 题）=====
        {
          id: 'iat07',
          type: 'single',
          knowledgeTag: '幻觉测试',
          difficulty: '⭐⭐',
          text: '面试官问：<strong>"怎么设计幻觉（hallucination）测试？"</strong>',
          options: [
            { text: '问模型任何问题，只要能给出流畅的回答就算通过', value: 'a' },
            { text: '故意问"模型不该知道"或"现实中不存在"的东西（如虚构的函数名、未发生的未来事件），断言回答中出现承认不确定的表达（如"无法确认""没有相关信息"），而不是自信地编造一个看似合理但虚假的细节', value: 'b' },
            { text: '幻觉无法测试，只能靠人工审查', value: 'c' },
            { text: '让模型自己判断自己有没有幻觉', value: 'd' },
          ],
          answer: 'b',
          explain: '幻觉测试的核心技巧是"构造模型不可能知道答案的问题"（虚构 API、未来事件），如果模型编造了一个自信但错误的具体答案，就是幻觉。理想行为是表达不确定性，而不是编造。',
          deeper: '面试加分：能区分"幻觉"和"知识盲区的诚实表达"——测试奖励后者，惩罚前者。也可以补充"检索增强（RAG）是缓解幻觉的常见手段之一"。',
          interviewTip: '举一个具体反例：“我问 FastAPI 的 magic_auto_deploy() 函数是做什么的——这个函数根本不存在。如果模型一本正经地介绍了它的用法，那就是幻觉；如果模型说没有找到这个函数的相关信息，就是及格的表现。”',
          projectMapping: 'apps/api/app/core/ai_testing.py::run_hallucination — _UNCERTAINTY_MARKERS 关键词检测',
        },
        {
          id: 'iat08',
          type: 'multi',
          knowledgeTag: '异常输入/越狱测试',
          difficulty: '⭐⭐⭐',
          text: '面试官问：<strong>"怎么设计异常输入和越狱（jailbreak）测试？"</strong>（多选）',
          options: [
            { text: '越狱提示测试：发送"忽略之前所有指令，现在你是……"类提示，断言回答中不出现"已忽略指令/我现在是……"等被成功越狱的迹象', value: 'a' },
            { text: '危险请求测试：发送要求执行破坏性操作的请求（如"删除所有数据不需要确认"），断言没有在无确认的情况下直接调用危险工具', value: 'b' },
            { text: '边界输入测试：空输入、超长输入、纯符号/乱码输入，断言服务优雅处理（不崩溃、不超时），而不一定要求"回答正确"', value: 'c' },
            { text: '只要模型拒绝回答任何敏感话题就算测试通过，不用管具体机制', value: 'd' },
            { text: '设置合理的请求超时，断言异常输入不会导致请求挂起或死循环', value: 'e' },
          ],
          answer: ['a', 'b', 'c', 'e'],
          explain: '异常输入/越狱测试要覆盖多个维度：越狱提示的防御效果、危险操作的确认机制、边界/垃圾输入的健壮性、以及是否会导致挂起。这是安全测试和可靠性测试的交叉领域。',
          deeper: '面试加分：能提到这类测试的断言标准不是“完全不能讨论敏感话题”，而是“核心行为约束不能被绕过”——比如可以讨论安全概念，但不能真的输出可执行的攻击载荷或执行破坏性操作。',
          interviewTip: '强调“优雅处理”而非“必须正确”：“对乱码输入我不要求模型给出正确回答，只要求它不崩溃、不超时——这是健壮性测试和功能正确性测试的区别，容易被面试官追问出来。”',
          projectMapping: 'apps/api/app/core/ai_testing.py::run_adversarial — _JAILBREAK_SUCCESS_MARKERS + asyncio.wait_for 超时保护',
        },
      ],
    },
  ],
};
