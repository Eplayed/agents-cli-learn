// M4 — MCP 协议：把工具变成"AI 的 USB-C"

export default {
  id: 'M4',
  topic: 'MCP 协议',
  title: 'MCP：让工具协议化',
  subtitle: '从内嵌 @tool 到 MCP server，工具治理的范式转变',

  stages: [
    // ============ Stage 1: 故事 ============
    {
      kind: 'story',
      title: '从一个真实痛点开始：工具怎么治理？',
      content: `
        <p>M3 你已经会用 <code>@tool</code> 装饰器写工具了：</p>

        <pre data-lang="python"><code>@tool
def get_weather(city: str) -> str:
    """查询天气"""
    return weather_api.get(city)
</code></pre>

        <p>能跑，但用一阵子你会发现一堆问题：</p>

        <div class="story-box">
          😩 <strong>@tool 的工程化痛点：</strong>
          <ol>
            <li><strong>耦合死了</strong>：工具代码绑在 agent 进程里，工具崩了 agent 跟着崩</li>
            <li><strong>无法跨项目复用</strong>：你写的 get_weather，朋友的项目用不了</li>
            <li><strong>没法独立部署</strong>：想把"重型工具"放到独立机器？没办法</li>
            <li><strong>没有标准元数据</strong>：权限分级、审计、版本号都得自己加</li>
            <li><strong>不能被外部 Host 用</strong>：Claude Desktop / Cursor 想用你的工具？做不到</li>
          </ol>
        </div>

        <p>2024 年 11 月，Anthropic 发了 <strong>Model Context Protocol (MCP)</strong>。
        2026 年它已经是<strong>事实标准</strong>。</p>

        <p>一句话：<strong>MCP 让工具变成"AI 的 USB-C"</strong>—— 写一次工具，
        Claude Desktop / Cursor / Codex / 任何 MCP Host 都能用。</p>

        <div class="story-box">
          🎯 <strong>本关你将掌握：</strong>
          <ul>
            <li>MCP 三个原语：Tools / Resources / Prompts</li>
            <li>FastMCP：5 行代码写一个 MCP server</li>
            <li>stdio vs http transport 的取舍</li>
            <li>MultiServerMCPClient 怎么把 MCP 工具接入 LangGraph</li>
            <li>容易记错的"无状态 session"语义</li>
          </ul>
        </div>
      `,
    },

    // ============ Stage 2: 概念 - MCP 三原语 ============
    {
      kind: 'concept',
      title: 'MCP 协议：三个原语 + 两种 Transport',
      content: `
        <h3>📌 Anthropic 的官方定义</h3>
        <p>MCP 是开放标准，让 AI 应用（host）以统一协议访问外部数据源和工具（server）。</p>

        <h3>📌 三大原语（primitives）</h3>

        <table class="compare-table">
          <thead><tr><th>原语</th><th>作用</th><th>例子</th><th>本项目用了吗</th></tr></thead>
          <tbody>
            <tr>
              <td><strong>Tools</strong></td>
              <td>可调用函数（带 input schema + 描述）</td>
              <td>get_weather / send_email / run_sql</td>
              <td>✅</td>
            </tr>
            <tr>
              <td><strong>Resources</strong></td>
              <td>可读取上下文（只读）</td>
              <td>文件 / DB 记录 / API 数据</td>
              <td>❌（暂未用）</td>
            </tr>
            <tr>
              <td><strong>Prompts</strong></td>
              <td>可复用的提示词模板</td>
              <td>"代码评审" / "写邮件" 模板</td>
              <td>❌（暂未用）</td>
            </tr>
          </tbody>
        </table>

        <h3>📌 两种 Transport</h3>

        <table class="compare-table">
          <thead><tr><th>Transport</th><th>怎么通信</th><th>典型场景</th></tr></thead>
          <tbody>
            <tr>
              <td><strong>stdio</strong></td>
              <td>本地子进程，stdin/stdout 通信</td>
              <td>本项目（最常见，启动快）</td>
            </tr>
            <tr>
              <td><strong>http / streamable_http</strong></td>
              <td>远程 HTTP 服务</td>
              <td>需要远程部署或多 agent 共享 server</td>
            </tr>
          </tbody>
        </table>

        <h3>⚠️ 最容易记错的点：stdio 不是"常驻"</h3>

        <p>很多人以为：<strong>"我配了 stdio MCP server，启动一次后子进程就常驻了，所有请求复用"</strong>。
        <span class="hl">这是错的。</span></p>

        <p>真相：</p>
        <pre>MultiServerMCPClient 默认【无状态模式】：
- 每次工具调用都新建一个 ClientSession
- stdio 子进程跑完该次工具就退出
- 不存在"启动一次永远在那"

要长会话/共享上下文，必须显式：
async with client.session("weather") as session:
    tools = await load_mcp_tools(session)
    # 在这个 with 块内，session 是同一个，子进程也是同一个</pre>

        <div class="callout">
          💡 <strong>为什么默认无状态？</strong>
          因为大部分工具调用是"一次性"的（查天气、算加法），无状态最简单可靠。
          有状态（数据库长事务、流式读文件）才是少数情况，需要显式声明。
        </div>
      `,
    },

    // ============ Stage 3: 项目代码 - FastMCP server ============
    {
      kind: 'build',
      title: '搭建 Step 1：写一个 MCP server',
      content: `
        <p>看 <code>apps/api/app/mcp_servers/weather_server.py</code> 的核心：</p>

        <pre data-lang="python"><code>from mcp.server.fastmcp import FastMCP
import urllib.request, json

# 1️⃣ 创建 FastMCP 实例（server 名字 = "Weather"）
mcp = FastMCP("Weather")

@mcp.tool()
def get_weather(city: str) -> str:
    """查询指定城市的天气信息。

    Args:
        city: 城市名称（中文或拼音都可）

    Returns:
        包含温度、降水、风速的天气摘要字符串
    """
    # 2️⃣ 业务逻辑：调外部 API
    name = aliases.get(city, city)
    geo = _get_json(f"https://geocoding-api.open-meteo.com/v1/search?name={name}")
    if not geo.get("results"):
        return f"未找到城市：{city}"

    r0 = geo["results"][0]
    fc = _get_json(f"https://api.open-meteo.com/v1/forecast?lat={r0['latitude']}...")
    return format_weather(fc)

# 3️⃣ 入口：作为子进程运行
if __name__ == "__main__":
    mcp.run(transport="stdio")
</code></pre>

        <h3>逐部分解读</h3>

        <div class="code-explain">
          <div class="line">
            <strong>1️⃣ FastMCP("Weather")</strong>：FastMCP 是 mcp 库的高阶 API，类似 FastAPI。
            <ul>
              <li>"Weather" 是 server 显示名</li>
              <li>所有 @mcp.tool() 装饰的函数自动注册成工具</li>
            </ul>
          </div>
          <div class="line">
            <strong>2️⃣ docstring 的重要性</strong>：
            <span class="hl">这是模型决定"何时调"的关键依据</span>。MCP 把 docstring 作为
            tool description 发给 LLM。
            <ul>
              <li>没 docstring → LLM 拿不到描述 → 可能不知道工具用途</li>
              <li>docstring 写得越清楚，调用准确率越高</li>
              <li>建议格式：用途 + Args + Returns，照 Google docstring 规范</li>
            </ul>
          </div>
          <div class="line">
            <strong>3️⃣ mcp.run(transport="stdio")</strong>：
            <ul>
              <li>启动 server，从 stdin 读消息，往 stdout 写响应</li>
              <li>stdio = 标准输入/输出，被 host 进程用 spawn 子进程的方式启动</li>
              <li>换 <code>transport="http"</code> 就能远程部署</li>
            </ul>
          </div>
        </div>

        <h3>📌 这个 server 也能直接给 Claude Desktop 用</h3>

        <p>编辑 <code>~/Library/Application Support/Claude/claude_desktop_config.json</code>：</p>

        <pre><code>{
  "mcpServers": {
    "local-weather": {
      "command": "/path/to/python",
      "args": ["-m", "app.mcp_servers.weather_server"],
      "cwd": "/your/path/to/agents-cli-learn/apps/api"
    }
  }
}</code></pre>

        <div class="callout">
          🎯 <strong>这就是 MCP 的杀手级特性</strong>：你写的 weather_server，
          不仅你的 LangGraph agent 能用，<strong>任何 MCP Host 都能用</strong>。
          一份代码，整个生态复用。
        </div>
      `,
    },

    // ============ Stage 4: 项目代码 - 配置 + 加载器 ============
    {
      kind: 'build',
      title: '搭建 Step 2：MCP 配置化加载',
      content: `
        <h3>📌 关键设计：工具治理 vs 业务代码解耦</h3>

        <p>工具和 agent 怎么连？看 <code>apps/api/app/mcp_servers/config.json</code>：</p>

        <pre data-lang="json"><code>{
  "mcpServers": {
    "weather": {
      "command": "python",
      "args": ["-m", "app.mcp_servers.weather_server"],
      "transport": "stdio"
    },
    "utils": {
      "command": "python",
      "args": ["-m", "app.mcp_servers.utils_server"],
      "transport": "stdio"
    }
  }
}</code></pre>

        <p>看 <code>apps/api/app/mcp_servers/loader.py</code>：</p>

        <pre data-lang="python"><code>from langchain_mcp_adapters.client import MultiServerMCPClient

# 1️⃣ 全局缓存：避免每次请求重连
_TOOLS_CACHE = None
_CLIENT = None

def _load_config():
    """读 config.json，过滤掉 _ 开头的注释字段"""
    cfg_path = Path(__file__).parent / "config.json"
    raw = json.loads(cfg_path.read_text())
    servers = raw.get("mcpServers", {})
    return {
        name: {k: v for k, v in spec.items() if not k.startswith("_")}
        for name, spec in servers.items()
    }

async def get_mcp_tools():
    """获取所有 MCP server 暴露的工具，转成 LangChain Tool。"""
    global _TOOLS_CACHE, _CLIENT
    if _TOOLS_CACHE is not None:
        return _TOOLS_CACHE

    config = _load_config()
    if not config:
        _TOOLS_CACHE = []
        return _TOOLS_CACHE

    # 2️⃣ MultiServerMCPClient 一次连多个 server
    _CLIENT = MultiServerMCPClient(config)

    # 3️⃣ get_tools 短暂启动每个 server，拿到 schema
    _TOOLS_CACHE = await _CLIENT.get_tools()
    return _TOOLS_CACHE
</code></pre>

        <h3>逐部分解读</h3>

        <div class="code-explain">
          <div class="line">
            <strong>1️⃣ 全局缓存</strong>：MCP server 启动有开销（fork 子进程 + 握手）。
            缓存让"加载工具"只发生一次。
          </div>
          <div class="line">
            <strong>2️⃣ MultiServerMCPClient(config)</strong>：传入配置 dict 就行。
            stdio + http 可以混用。
          </div>
          <div class="line">
            <strong>3️⃣ get_tools 在做什么</strong>：
            <ol>
              <li>spawn 每个 server 子进程（短暂）</li>
              <li>调 list_tools() 拿 schema</li>
              <li>把每个 MCP tool 包装成 LangChain BaseTool</li>
              <li>返回 LangChain Tool 列表，LangGraph 能直接用</li>
              <li>子进程退出</li>
            </ol>
          </div>
        </div>

        <h3>📌 Agent 怎么用这些工具</h3>

        <p>看 <code>apps/api/app/agents/single/agent.py</code>：</p>

        <pre data-lang="python"><code>def _resolve_tools_sync():
    try:
        from app.mcp_servers.loader import get_mcp_tools
        # 同步入口里跑 async 函数
        tools = run_async(get_mcp_tools())
        if tools:
            return tools
    except Exception as e:
        print(f"MCP 加载失败，回退内嵌工具: {e}")

    return _get_fallback_tools()  # 内嵌 fallback

class SingleAgent:
    def __init__(self, ...):
        self.tools = _resolve_tools_sync()  # ← 自动选 MCP 或 fallback
        self.llm_with_tools = self.llm.bind_tools(self.tools)
</code></pre>

        <div class="callout">
          🎯 <strong>注意 fallback 机制</strong>：MCP 加载失败时回退到内嵌 @tool。
          这让"MCP 没装好"不至于让整个 agent 跑不起来——开发友好。
        </div>

        <h3>📌 加新工具的成本</h3>

        <p>想加一个 GitHub MCP server？步骤：</p>
        <ol>
          <li>新建 <code>app/mcp_servers/github_server.py</code></li>
          <li>在 <code>config.json</code> 加一段</li>
          <li>重启 API</li>
        </ol>

        <p>就这两步！<strong>agent 代码完全不动</strong>。
        这就是配置化加载的价值。</p>
      `,
    },

    // ============ Stage 5: Mini-Quiz ============
    {
      kind: 'mini-quiz',
      title: '小测：MCP 核心概念',
      questions: [
        {
          id: 'm4s5q1',
          type: 'single',
          knowledgeTag: 'MCP vs @tool',
          text: '相比 LangChain 的 <code>@tool</code> 装饰器，MCP 最大的工程优势是什么？',
          options: [
            { text: 'MCP 工具跑得更快', value: 'a' },
            { text: 'MCP 工具是独立进程 + 标准协议：可被任何 MCP Host 复用（Claude Desktop / Cursor / 你的 Agent），支持独立部署和权限分级', value: 'b' },
            { text: '@tool 不支持参数', value: 'c' },
            { text: 'MCP 不需要写 Python' , value: 'd' }
          ],
          answer: 'b',
          explain: '@tool 绑死在你的进程里，只有你的 agent 能用。MCP 是"工具 PaaS"：写一次，整个生态复用。',
          deeper: '这就是 CowAgent 的 plugin 系统想做但没做到的事——MCP 用行业标准实现了"可启停/可复用/可审计"。'
        },
        {
          id: 'm4s5q2',
          type: 'single',
          knowledgeTag: 'FastMCP',
          text: 'MCP server 的 <code>@mcp.tool()</code> 装饰器下面的函数 docstring 有什么特殊作用？',
          options: [
            { text: '只是给开发者看的注释，运行时被忽略', value: 'a' },
            { text: 'MCP 把 docstring 作为 tool description 发给 LLM，是模型决定"何时调用"的关键依据', value: 'b' },
            { text: '用来生成 API 文档', value: 'c' },
            { text: '用来做单元测试' , value: 'd' }
          ],
          answer: 'b',
          explain: 'docstring 写得越清楚（用途 + 参数说明 + 返回值），LLM 调用准确率越高。删掉 docstring 模型可能不知道工具用途。',
          deeper: 'OpenAI 官方建议：tool description 要包含"何时调用"和"参数取值范围"。MCP 的 docstring 就是这个。'
        }
      ]
    },

    // ============ Stage 6: 动手挑战 ============
    {
      kind: 'concept',
      title: '🏋️ 动手挑战：新建一个 MCP Server',
      content: `
        <div class="story-box">
          🎯 <strong>挑战目标</strong>：新建一个独立的 MCP Server，让 Agent 能用它，
          <strong>不改 agent.py</strong>。
        </div>

        <h3>📌 步骤提示</h3>
        <ol>
          <li>新建 <code>apps/api/app/mcp_servers/joke_server.py</code></li>
          <li>用 <code>FastMCP("Jokes")</code> 创建 server</li>
          <li>写一个 <code>tell_joke(topic: str)</code> 工具（返回一个固定的笑话就行）</li>
          <li>给它加 annotations（只读 + 无外部调用）和规范 description</li>
          <li>末尾加 <code>mcp.run(transport="stdio")</code></li>
          <li>在 <code>config.json</code> 注册这个新 server</li>
          <li>重启 API，问"讲个关于程序员的笑话"</li>
        </ol>

        <h3>📌 验证成功的标志</h3>
        <ul>
          <li>NDJSON 里出现 <code>tool_calls: tell_joke</code></li>
          <li>你<strong>没改过 agent.py</strong>——这就是 MCP 配置化加载的价值</li>
        </ul>

        <h3>📌 如果卡住了</h3>
        <details>
          <summary>点击展开 joke_server.py 参考</summary>
          <pre><code>from mcp.server.fastmcp import FastMCP

mcp = FastMCP("Jokes")

@mcp.tool(annotations={"readOnlyHint": True, "openWorldHint": False})
def tell_joke(topic: str) -> str:
    """讲一个指定主题的笑话。适用于用户想放松的场景。返回笑话文本。

    Args:
        topic: 笑话主题，如"程序员""产品经理""AI"
    """
    jokes = {
        "程序员": "为什么程序员总是分不清万圣节和圣诞节？因为 Oct 31 = Dec 25。",
        "AI": "AI 面试官：你最大的缺点是什么？候选人：我太诚实了。AI：我不认为这是缺点。候选人：我不在乎你怎么想。",
    }
    return jokes.get(topic, f"关于{topic}的笑话：还在学习中...")

if __name__ == "__main__":
    mcp.run(transport="stdio")</code></pre>
        </details>

        <details>
          <summary>点击展开 config.json 修改</summary>
          <pre><code>"jokes": {
  "command": "python",
  "args": ["-m", "app.mcp_servers.joke_server"],
  "transport": "stdio"
}</code></pre>
        </details>

        <div class="callout">
          💡 <strong>这个挑战证明了 MCP 的核心价值</strong>：加新工具 = 新建文件 + 改配置。
          Agent 代码完全不动。面试时说"我项目里加工具不用改 agent"很有说服力。
        </div>
      `,
    },

    // ============ Stage 7: Final Quiz ============
    {
      kind: 'final-quiz',
      title: '通关测验：M4 MCP 协议',
      passLine: 0.8,
      questions: [
        {
          id: 'm4fq1',
          type: 'single',
          knowledgeTag: 'MCP',
          text: '下面对 MCP 最准确的描述？',
          options: [
            { text: 'OpenAI 的工具调用协议', value: 'a' },
            { text: 'Anthropic 提出的工具/资源/提示词标准协议，让任何 LLM 客户端能用任何 MCP server 的能力', value: 'b' },
            { text: 'LLM 微调技术', value: 'c' },
            { text: 'Python 的 DI 框架' , value: 'd' }
          ],
          answer: 'b',
          explain: 'MCP = Model Context Protocol，Anthropic 2024.11 发布，2025-2026 已被广泛支持。',
        },
        {
          id: 'm4fq2',
          type: 'multi',
          knowledgeTag: 'MCP',
          text: 'MCP 三大原语是？（多选）',
          options: [
            { text: 'Tools', value: 'a' },
            { text: 'Resources', value: 'b' },
            { text: 'Prompts', value: 'c' },
            { text: 'Sampling', value: 'd' },
            { text: 'Embeddings', value: 'e' }
          ],
          answer: ['a', 'b', 'c'],
          explain: 'Tools / Resources / Prompts 是核心。本项目目前只用了 Tools。',
        },
        {
          id: 'm4fq3',
          type: 'single',
          knowledgeTag: 'FastMCP',
          text: '把 weather_server.py 里 get_weather 的 docstring 删掉会怎样？',
          options: [
            { text: 'Server 启动时报错', value: 'a' },
            { text: '工具仍能注册，但 LLM 拿不到 description，调用准确率下降', value: 'b' },
            { text: '工具被自动屏蔽', value: 'c' },
            { text: '没影响' , value: 'd' }
          ],
          answer: 'b',
          explain: 'MCP 把 docstring 作为 tool description 发给 LLM。这是模型决定"何时调"的关键依据。',
        },
        {
          id: 'm4fq4',
          type: 'single',
          knowledgeTag: 'Transport',
          text: '"stdio MCP server 启动一次会常驻"对吗？',
          options: [
            { text: '对', value: 'a' },
            { text: '错。默认无状态模式：每次工具调用新建 ClientSession，子进程跑完就退出', value: 'b' },
            { text: '对，需要 keepalive=true', value: 'c' },
            { text: '错，stdio 不能跑 Python' , value: 'd' }
          ],
          answer: 'b',
          explain: '要常驻必须显式 async with client.session(name)。',
        },
        {
          id: 'm4fq5',
          type: 'multi',
          knowledgeTag: 'MCP 工程',
          text: '加一个 GitHub MCP server 需要改哪些地方？（多选）',
          options: [
            { text: '新增 app/mcp_servers/github_server.py', value: 'a' },
            { text: '在 mcp_servers/config.json 注册新条目', value: 'b' },
            { text: '在 agents/single/agent.py 手动 import', value: 'c' },
            { text: '修改 chat.py 路由', value: 'd' },
            { text: '改 system prompt 告诉模型多了工具' , value: 'e' }
          ],
          answer: ['a', 'b'],
          explain: '配置化加载的核心价值：加新工具 = a + b。agent 完全不用动。',
        },
        {
          id: 'm4fq6',
          type: 'fill',
          knowledgeTag: 'FastMCP',
          text: '用 FastMCP 写 server，文件末尾用什么调用启动？（含 transport 参数）',
          hint: '完整一行 Python 代码',
          answer: [
            'mcp.run(transport="stdio")',
            "mcp.run(transport='stdio')",
            'mcp.run(transport="stdio");',
            'mcp.run(transport = "stdio")',
          ],
          explain: 'FastMCP 实例 .run(transport="stdio")。换 "http" 就能远程部署。',
        },
        {
          id: 'm4fq7',
          type: 'single',
          knowledgeTag: 'MCP 工程',
          text: '为什么 MCP 比 LangChain @tool 装饰器更适合"工具治理"？',
          options: [
            { text: 'MCP 跑得更快', value: 'a' },
            { text: 'MCP 工具是独立进程 + 标准协议：可独立启停、可被任意 MCP Host 复用、支持远程部署、可加权限分级', value: 'b' },
            { text: '@tool 不能传参', value: 'c' },
            { text: 'LangGraph 不支持 @tool' , value: 'd' }
          ],
          answer: 'b',
          explain: '@tool 是"内部工具"，绑死在 agent 里。MCP 是"工具 PaaS"：标准化 + 独立部署 + 跨生态复用。',
        }
      ]
    }
  ]
};
