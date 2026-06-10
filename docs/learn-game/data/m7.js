// M7 — 评测体系：防止 Agent 能力退化

export default {
  id: 'M7',
  topic: '评测体系',
  title: '用回归测试防止 Agent 变差',
  subtitle: '用例设计 / 断言类型 / trajectory eval / CI 集成',

  stages: [
    {
      kind: 'story',
      title: '为什么 Agent 需要评测？',
      content: `
        <p>你改了一行 prompt，Agent 的天气回答变好了。但你没注意到：计算题的准确率从 100% 掉到 60% 了。</p>

        <div class="story-box">
          😱 <strong>没有评测的后果：</strong>
          <ul>
            <li>改 prompt → 不知道有没有副作用</li>
            <li>升级模型 → 不知道是变好还是变差</li>
            <li>加新工具 → 不知道会不会干扰旧工具的调用</li>
            <li>线上出 bug → 不知道什么时候引入的</li>
          </ul>
        </div>

        <p><strong>评测 = Agent 的"单元测试"</strong>。每次改动后跑一遍，确保没有退化。</p>

        <div class="story-box">
          🎯 本关你将掌握：
          <ul>
            <li>怎么设计评测用例（input + assertions）</li>
            <li>4 种断言类型（必须调工具 / 禁止调工具 / 必须包含 / 最小长度）</li>
            <li>怎么跑评测 + 看通过率</li>
            <li>什么是 Trajectory Evaluation</li>
          </ul>
        </div>
      `,
    },

    {
      kind: 'concept',
      title: '评测用例设计',
      content: `
        <h3>📌 一个用例长什么样</h3>
        <pre><code>{
  "id": "eval_001",
  "input": "上海天气怎么样",
  "assertions": {
    "must_call_tool": "get_weather",
    "must_contain": ["上海", "°C"]
  },
  "tags": ["weather", "tool-calling"]
}</code></pre>

        <h3>📌 4 种断言类型</h3>
        <table class="compare-table">
          <thead><tr><th>断言</th><th>检查什么</th><th>例子</th></tr></thead>
          <tbody>
            <tr><td><code>must_call_tool</code></td><td>必须调用指定工具</td><td>天气问题必须调 get_weather</td></tr>
            <tr><td><code>must_not_call_tool</code></td><td>不应调用任何工具</td><td>"写首诗"不应调工具</td></tr>
            <tr><td><code>must_contain</code></td><td>回答必须包含关键词</td><td>天气回答必须含城市名</td></tr>
            <tr><td><code>min_length</code></td><td>回答最少多长</td><td>知识问答至少 50 字</td></tr>
          </tbody>
        </table>

        <h3>📌 Trajectory Evaluation 是什么</h3>
        <p>普通评测只看"最终回答对不对"。<strong>Trajectory Eval 看整个过程</strong>：</p>
        <ul>
          <li>该调工具时调了没？（工具触发率）</li>
          <li>参数传对了没？（参数正确率）</li>
          <li>工具结果用了没？（不是拿到结果然后自己编）</li>
          <li>多余调用了没？（效率）</li>
        </ul>

        <div class="callout">
          💡 Trajectory Eval 是 Agent 评测和普通 LLM 评测的核心区别。
          面试被问到"怎么评测 Agent"时说出这个 = 加分。
        </div>
      `,
    },

    {
      kind: 'build',
      title: '搭建：评测脚本',
      content: `
        <p>你项目里的评测实现（<code>eval/run_eval.py</code>）：</p>

        <pre data-lang="python"><code># 核心逻辑
async def run_agent(message):
    agent = SingleAgent(session_id="eval-session")
    result = {"tool_calls": [], "text": "", "error": None}
    async for chunk in agent.stream(message):
        if chunk["type"] == "tool_calls":
            result["tool_calls"].append(chunk["data"]["name"])
        elif chunk["type"] == "text":
            result["text"] += chunk["content"]
    return result

def check_assertions(result, assertions):
    failures = []
    if "must_call_tool" in assertions:
        if assertions["must_call_tool"] not in result["tool_calls"]:
            failures.append("应调用工具但未调用")
    return failures</code></pre>

        <h3>📌 运行方式</h3>
        <pre><code>cd apps/api
.venv/bin/python -m eval.run_eval</code></pre>

        <h3>📌 输出示例</h3>
        <pre><code>📋 加载了 10 个评测用例
▶ [eval_001] 上海天气怎么样
  ✅ PASS (tools: ['get_weather'], len: 156)
▶ [eval_003] 帮我写首诗
  ✅ PASS (tools: [], len: 89)
━━━━━━━━━━━━━━━━━━━━
📊 评测结果：9/10 通过 (90%)</code></pre>

        <div class="callout">
          🔍 <strong>CI 集成</strong>：返回码 0=全通过，1=有失败。
          直接放 GitHub Actions：<code>run: python -m eval.run_eval</code>，
          PR 合并前自动跑，失败就阻止合并。
        </div>
      `,
    },

    {
      kind: 'final-quiz',
      title: '通关测验：M7 评测',
      passLine: 0.8,
      questions: [
        {
          id: 'm7fq1',
          type: 'single',
          knowledgeTag: 'Agent 评测',
          text: 'Agent 评测和普通 LLM 评测的核心区别是什么？',
          options: [
            { text: '评测速度不同', value: 'a' },
            { text: 'Agent 有"过程"——Trajectory Eval 不只看最终回答，还检查每一步（工具是否正确调用、参数是否正确、结果是否被使用）', value: 'b' },
            { text: '用不同的评分标准', value: 'c' },
            { text: '需要更多数据', value: 'd' }
          ],
          answer: 'b',
          explain: 'LLM 评测只看输出。Agent 评测要看轨迹（trajectory）：过程中的每个决策是否合理。',
        },
        {
          id: 'm7fq2',
          type: 'multi',
          knowledgeTag: 'Agent 评测',
          text: '以下哪些是合理的 Agent 评测断言？（多选）',
          options: [
            { text: '天气问题必须调用 get_weather 工具', value: 'a' },
            { text: '写诗请求不应调用任何工具', value: 'b' },
            { text: '回答必须包含用户提到的城市名', value: 'c' },
            { text: '每次回答必须超过 1000 字', value: 'd' },
            { text: '不应泄露 API Key 等敏感信息', value: 'e' }
          ],
          answer: ['a', 'b', 'c', 'e'],
          explain: '合理的断言要有业务意义。"必须超过 1000 字"太武断，不是好的断言。',
        },
        {
          id: 'm7fq3',
          type: 'single',
          knowledgeTag: 'Agent 评测',
          text: '评测脚本应该在什么时候跑？',
          options: [
            { text: '上线后每天跑一次', value: 'a' },
            { text: '每次改 prompt / 加工具 / 升级模型后跑，最好接入 CI 在 PR 合并前自动跑', value: 'b' },
            { text: '只在开发完成时跑一次', value: 'c' },
            { text: '不需要跑，手动测试就行', value: 'd' }
          ],
          answer: 'b',
          explain: '评测是"防回退"的安全网。每次改动都跑 = 立刻知道有没有副作用。接入 CI = 自动化，不依赖人记得跑。',
        },
      ]
    }
  ]
};
