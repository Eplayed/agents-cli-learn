// M8 — Skills 框架：让 Agent 按需加载能力包

export default {
  id: 'M8',
  topic: 'Skills 框架',
  title: '让 Agent 拥有可插拔的"能力包"',
  subtitle: 'SKILL.md / 触发词匹配 / 渐进式加载 / 和 MCP 的区别',

  stages: [
    {
      kind: 'story',
      title: 'Skills 解决什么问题？',
      content: `
        <p>你的 Agent 有工具了（MCP），但还缺一个东西：<strong>"怎么用工具"的流程和规范</strong>。</p>

        <div class="story-box">
          🤔 <strong>场景对比：</strong>
          <ul>
            <li>没有 Skill：Agent 调了 get_weather，但回答格式随机、有时忘了给结论</li>
            <li>有 Skill：Agent 激活 weather-advisor，按固定流程"结论→依据→摘要"回答</li>
          </ul>
        </div>

        <p><strong>MCP 给的是"工具"（手脚），Skill 给的是"流程和规范"（操作手册）。</strong></p>

        <p>类比：</p>
        <ul>
          <li>MCP = 给你一把螺丝刀</li>
          <li>Skill = 告诉你"拆手机屏幕的步骤：先取 SIM 卡 → 再拆后盖 → ..."</li>
        </ul>
      `,
    },

    {
      kind: 'concept',
      title: 'Skill 的结构：SKILL.md',
      content: `
        <h3>📌 一个 Skill 长什么样</h3>
        <pre><code>skills/weather-advisor/SKILL.md

---
name: weather-advisor
description: 天气分析与洗车建议专家
triggers:
  - 天气
  - 洗车
  - 出行
---

# 天气顾问 Skill

## 工作流程
1. 必须先调用 get_weather 获取实时数据
2. 给出明确结论（适合/不适合/观望）
3. 列出 1-3 条依据
4. 附上天气摘要</code></pre>

        <h3>📌 核心字段</h3>
        <table class="compare-table">
          <thead><tr><th>字段</th><th>作用</th></tr></thead>
          <tbody>
            <tr><td><code>name</code></td><td>Skill 标识</td></tr>
            <tr><td><code>description</code></td><td>一句话描述</td></tr>
            <tr><td><code>triggers</code></td><td>触发词列表（用户消息含这些词就激活）</td></tr>
            <tr><td>正文</td><td>注入到 system prompt 的内容（流程/格式/注意事项）</td></tr>
          </tbody>
        </table>

        <h3>📌 和 MCP / Plugin 的关系</h3>
        <table class="compare-table">
          <thead><tr><th></th><th>MCP Tool</th><th>Skill</th></tr></thead>
          <tbody>
            <tr><td>给 Agent 什么</td><td>能力（函数）</td><td>流程和规范（prompt）</td></tr>
            <tr><td>存在形式</td><td>独立进程</td><td>Markdown 文件</td></tr>
            <tr><td>怎么加载</td><td>config.json 配置</td><td>按触发词自动匹配</td></tr>
            <tr><td>LLM 看到什么</td><td>工具 schema</td><td>system prompt 追加段落</td></tr>
          </tbody>
        </table>

        <div class="callout">
          💡 <strong>最佳组合</strong>：MCP 提供工具 + Skill 指导怎么用工具。
          比如 weather-advisor Skill 规定"必须先调 get_weather 再给结论"——这让 Agent 更可靠。
        </div>
      `,
    },

    {
      kind: 'build',
      title: '搭建：Skills Loader',
      content: `
        <p>核心代码（<code>app/core/skills.py</code>）：</p>

        <pre data-lang="python"><code># 1. 扫描 skills/ 目录
def load_skills():
    for skill_dir in skills_path.iterdir():
        skill_file = skill_dir / "SKILL.md"
        text = skill_file.read_text()
        meta, body = _parse_frontmatter(text)
        skills.append(Skill(name=..., triggers=..., content=body))

# 2. 匹配：用户消息含触发词就激活
def match_skills(message, skills):
    for skill in skills:
        for trigger in skill.triggers:
            if trigger in message:
                matched.append(skill)

# 3. 注入到 system prompt
def skills_to_prompt(skills):
    return "\\n--- 已激活的 Skills ---\\n" + skill.content</code></pre>

        <h3>📌 加新 Skill 的步骤</h3>
        <ol>
          <li>新建文件夹 <code>skills/my-skill/SKILL.md</code></li>
          <li>写好 frontmatter（name + triggers）和正文</li>
          <li>重启 API</li>
          <li>用户消息含触发词 → 自动激活</li>
        </ol>

        <p><strong>不需要改任何 Python 代码。</strong>和 MCP config.json 一样——配置化。</p>

        <div class="callout">
          🔍 <strong>验证</strong>：切到 M8 Skills Agent 模式，问"上海天气适合洗车吗"——
          你会看到一条"[Skills 激活: weather-advisor]"提示，然后 Agent 按 Skill 里的格式回答。
        </div>
      `,
    },

    {
      kind: 'final-quiz',
      title: '通关测验：M8 Skills',
      passLine: 0.8,
      questions: [
        {
          id: 'm8fq1',
          type: 'single',
          knowledgeTag: 'Skills',
          text: 'MCP Tool 和 Skill 的核心区别是什么？',
          options: [
            { text: '没区别', value: 'a' },
            { text: 'MCP 给 Agent 能力（工具函数），Skill 给 Agent 流程和规范（注入 system prompt 指导怎么用工具）', value: 'b' },
            { text: 'Skill 比 MCP 更高级', value: 'c' },
            { text: 'MCP 是本地的，Skill 是远程的', value: 'd' }
          ],
          answer: 'b',
          explain: 'MCP = 手脚（能做什么），Skill = 操作手册（怎么做、什么流程、什么格式）。两者配合最佳。',
        },
        {
          id: 'm8fq2',
          type: 'single',
          knowledgeTag: 'Skills',
          text: 'Skill 是怎么被激活的？',
          options: [
            { text: '用户手动选择', value: 'a' },
            { text: '根据 SKILL.md frontmatter 里的 triggers 关键词匹配用户消息，匹配到就自动激活', value: 'b' },
            { text: 'LLM 自己决定', value: 'c' },
            { text: '定时激活', value: 'd' }
          ],
          answer: 'b',
          explain: 'triggers 关键词匹配是最简单的激活方式。Anthropic 的 Skills 也是类似的"渐进式加载"——只在相关时才加载，不浪费上下文空间。',
        },
        {
          id: 'm8fq3',
          type: 'single',
          knowledgeTag: 'Skills',
          text: '加新 Skill 需要改 Python 代码吗？',
          options: [
            { text: '需要改 agent.py', value: 'a' },
            { text: '不需要。新建 skills/my-skill/SKILL.md 文件 + 重启即可', value: 'b' },
            { text: '需要改 config.json', value: 'c' },
            { text: '需要改前端', value: 'd' }
          ],
          answer: 'b',
          explain: '和 MCP 配置化加载一样的思路：加能力不改代码。Skills Loader 自动扫描目录加载所有 SKILL.md。',
        },
      ]
    }
  ]
};
