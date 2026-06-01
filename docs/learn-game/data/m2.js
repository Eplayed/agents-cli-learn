// M2 — 流式协议：让 Agent UI"活起来"

export default {
  id: 'M2',
  topic: '流式协议',
  title: '让 Agent 的输出"活起来"',
  subtitle: 'NDJSON 流式 / 事件类型设计 / 前后端协议',

  stages: [
    // ============ Stage 1: 故事 ============
    {
      kind: 'story',
      title: '为什么"流式"是 Agent UI 的命脉？',
      content: `
        <p>M1 后你的 Agent 服务已经能回话了。但用一下你会立刻不爽：</p>

        <div class="story-box">
          😩 <strong>非流式 Agent 的体验：</strong>
          <ol>
            <li>用户：今天上海适合洗车吗？</li>
            <li>UI：<span style="color: var(--muted);">⏳ 转圈圈…</span>（30 秒）</li>
            <li>UI：<span style="color: var(--muted);">⏳ 还在转…</span></li>
            <li>UI：<span style="color: var(--muted);">⏳ 用户已经切去刷抖音了</span></li>
            <li>UI：💥 完整回答一次性蹦出来</li>
          </ol>
        </div>

        <p>对比看 ChatGPT / Claude.ai 是怎么做的：</p>
        <ul>
          <li>0.5 秒后第一个字就出现</li>
          <li>用户能看到 Agent 在思考、调工具、读结果</li>
          <li><strong>把"30 秒空白等待"变成"30 秒持续反馈"</strong></li>
        </ul>

        <p>这就是流式协议的价值。Agent 应用基本不存在"非流式"的 —— 流式是<strong>事实标准</strong>。</p>

        <div class="story-box">
          🎯 <strong>本关你将掌握：</strong>
          <ul>
            <li>三种流式协议的区别：SSE / NDJSON / WebSocket</li>
            <li>为什么本项目选了 NDJSON</li>
            <li>事件类型设计（text / tool_calls / tool_result / error / done）</li>
            <li>前后端怎么用 fetch + ReadableStream 对接</li>
          </ul>
        </div>
      `,
    },

    // ============ Stage 2: 概念对比 ============
    {
      kind: 'concept',
      title: '三种流式协议对比',
      content: `
        <h3>📌 主流方案</h3>

        <table class="compare-table">
          <thead>
            <tr><th>协议</th><th>媒体类型</th><th>特点</th><th>典型场景</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>SSE</strong><br>(Server-Sent Events)</td>
              <td>text/event-stream</td>
              <td>HTML5 标准；浏览器原生 EventSource API</td>
              <td>OpenAI ChatGPT 网页版</td>
            </tr>
            <tr>
              <td><strong>NDJSON</strong><br>(Newline-Delimited JSON)</td>
              <td>application/x-ndjson</td>
              <td>每行一个 JSON；用 fetch + ReadableStream 解析</td>
              <td>Vercel AI SDK / 你的项目</td>
            </tr>
            <tr>
              <td><strong>WebSocket</strong></td>
              <td>ws://</td>
              <td>双向通信；连接持久化</td>
              <td>需要客户端→服务端实时推送（如游戏、协作编辑）</td>
            </tr>
          </tbody>
        </table>

        <h3>📌 为什么本项目选 NDJSON？</h3>

        <p>SSE 在标准上更"正统"，但实际工程中有几个坑：</p>
        <ul>
          <li>某些 Electron / 嵌入浏览器对 EventSource 支持差，会报 ERR_ABORTED</li>
          <li>EventSource 不支持自定义 header（鉴权很难加）</li>
          <li>EventSource 不支持 POST，只能 GET（参数会暴露在 URL）</li>
        </ul>

        <p>NDJSON 用纯 fetch + ReadableStream，<strong>这些坑全部绕开</strong>：</p>
        <ul>
          <li>fetch 任何环境都能跑</li>
          <li>fetch 支持 POST + 自定义 header</li>
          <li>"每行一个 JSON" 简单到不可能解析错</li>
        </ul>

        <div class="callout">
          💡 <strong>注意</strong>：NDJSON 不是 W3C 标准，只是"约定俗成的格式"。
          但好处恰好就是它简单——简单到任何语言/平台都能 5 分钟实现解析。
        </div>

        <h3>📌 NDJSON 长什么样</h3>
        <pre><code>{"type": "tool_calls", "data": {"name": "get_weather", "input": {"city": "上海"}}}
{"type": "tool_result", "data": {"name": "get_weather", "output": "晴，10%降雨"}}
{"type": "text", "content": "今天上海"}
{"type": "text", "content": "适合洗车…"}
{"type": "done", "content": ""}</code></pre>

        <p>就是这么简单：每一行是独立 JSON，行之间用 <code>\\n</code> 分隔。</p>
      `,
    },

    // ============ Stage 3: 概念 - 事件设计 ============
    {
      kind: 'concept',
      title: 'Agent 流式事件类型设计',
      content: `
        <h3>📌 行业共识的事件类型</h3>

        <p>不只是 token 流。一个 Agent 流式响应里，前端要识别 5 种事件：</p>

        <table class="compare-table">
          <thead><tr><th>事件类型</th><th>含义</th><th>UI 渲染策略</th></tr></thead>
          <tbody>
            <tr>
              <td><code>text</code> / <code>token</code></td>
              <td>LLM 输出的增量文本</td>
              <td>追加到对话气泡</td>
            </tr>
            <tr>
              <td><code>tool_calls</code></td>
              <td>模型决定调工具，含工具名 + 参数</td>
              <td><strong>可折叠卡片</strong>（默认折起，避免打断对话）</td>
            </tr>
            <tr>
              <td><code>tool_result</code></td>
              <td>工具执行结果</td>
              <td>展开 tool_calls 卡片显示结果</td>
            </tr>
            <tr>
              <td><code>error</code></td>
              <td>出错信息</td>
              <td>红色提示框</td>
            </tr>
            <tr>
              <td><code>done</code></td>
              <td>流结束信号</td>
              <td>停止"AI 正在输入"动画</td>
            </tr>
          </tbody>
        </table>

        <div class="callout">
          🎯 <strong>关键设计原则</strong>：tool_calls 不要直接拼到对话气泡里。
          模型调了什么工具、参数是什么、结果怎样——这些信息<strong>对调试和信任很重要</strong>，
          但<strong>不该当成对话内容塞给用户</strong>。
        </div>

        <h3>📌 看你项目的真实流式输出</h3>

        <p>启动项目后跑一下：</p>
        <pre><code>curl -X POST http://localhost:8000/api/v1/chat/stream_ndjson \\
  -H "Content-Type: application/json" \\
  -d '{"message": "上海今天天气怎么样"}'</code></pre>

        <p>你会看到类似：</p>
        <pre><code>{"type":"tool_calls","data":{"name":"get_weather","input":{"city":"上海"}}}
{"type":"tool_result","data":{"name":"get_weather","output":"Shanghai 晴..."}}
{"type":"text","content":"今天"}
{"type":"text","content":"上海"}
{"type":"text","content":"天气晴朗..."}
{"type":"done","content":""}</code></pre>

        <p>这就是<strong>一次完整的 Agent 流式生命周期</strong>。</p>
      `,
    },

    // ============ Stage 4: 项目代码 - 后端 ============
    {
      kind: 'build',
      title: '搭建 Step 1：后端 NDJSON 流式',
      content: `
        <p>看 <code>apps/api/app/api/v1/chat.py</code> 的核心流式逻辑：</p>

        <pre data-lang="python"><code>from fastapi.responses import StreamingResponse
import json

@router.post("/stream_ndjson")
async def chat_stream_ndjson(
    request: ChatRequest,
    db: AsyncSession = Depends(get_db),
):
    session, _ = await get_or_create_session(request.session_id, db)
    user_msg = Message(session_id=session.id, role="user",
                       content=request.message)
    db.add(user_msg)
    await db.commit()

    # 1️⃣ 定义异步生成器
    async def gen():
        agent = SingleAgent(session_id=session.id, model=request.model)
        full_response = ""

        try:
            async for chunk in agent.stream(request.message):
                if chunk["type"] == "done":
                    break
                if chunk["type"] == "text":
                    full_response += chunk.get("content", "")
                # 2️⃣ 关键：每行一个 JSON + \\n
                yield (json.dumps(chunk) + "\\n").encode("utf-8")

            # 3️⃣ 流结束后写入助手消息
            from app.core.database import AsyncSessionLocal
            async with AsyncSessionLocal() as inner_db:
                agent_msg = Message(session_id=session.id,
                                    role="assistant",
                                    content=full_response)
                inner_db.add(agent_msg)
                await inner_db.commit()
        except Exception as e:
            yield (json.dumps({"type": "error",
                               "content": str(e)}) + "\\n").encode("utf-8")

        # 4️⃣ done 信号
        yield (json.dumps({"type": "done", "content": ""}) + "\\n").encode("utf-8")

    # 5️⃣ 用 StreamingResponse 包装
    return StreamingResponse(
        gen(),
        media_type="application/x-ndjson; charset=utf-8",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
</code></pre>

        <h3>关键解读</h3>

        <div class="code-explain">
          <div class="line">
            <strong>1️⃣ async def gen()</strong>：异步生成器。<code>yield</code> 一次 = 推一行给前端。
            <span class="hl">注意是 generator，不是 async generator？错——是 async generator</span>，
            因为我们要 <code>async for chunk in agent.stream()</code>。
          </div>
          <div class="line">
            <strong>2️⃣ json.dumps + "\\n" + encode</strong>：
            <ul>
              <li>每个 chunk 序列化为 JSON</li>
              <li>必须加 <code>\\n</code>（不加前端没法切分）</li>
              <li>encode 成 bytes（StreamingResponse 要 bytes）</li>
            </ul>
          </div>
          <div class="line">
            <strong>3️⃣ inner_db</strong>：流式响应可能持续很久（LLM 30 秒+）。
            原始的 <code>db</code> 依赖会一直占着，所以单独开新 session 写入。
            这是 async generator + 依赖注入的常见模式。
          </div>
          <div class="line">
            <strong>4️⃣ done 信号</strong>：明确告诉前端"我说完了"。前端收到 done 才停止"AI 正在输入"。
          </div>
          <div class="line">
            <strong>5️⃣ X-Accel-Buffering: no</strong>：<span class="hl">关键 Nginx 头</span>——
            告诉 Nginx 不要缓冲响应。否则你流式发出去，Nginx 攒到完整再转给客户端，
            流式效果完全失效。
          </div>
        </div>

        <div class="callout">
          🐛 <strong>常见 bug</strong>：
          <ul>
            <li>忘了加 <code>\\n</code> → 前端粘成一坨</li>
            <li>没设 X-Accel-Buffering → 生产 Nginx 后端流式失效</li>
            <li>用普通 Response 而不是 StreamingResponse → 直接 OOM</li>
          </ul>
        </div>
      `,
    },

    // ============ Stage 5: 项目代码 - 前端 ============
    {
      kind: 'build',
      title: '搭建 Step 2：前端解析 NDJSON',
      content: `
        <p>看 <code>apps/web/public/ui/index.html</code> 里 <code>streamNDJSON</code> 函数（精简版）：</p>

        <pre data-lang="javascript"><code>async function streamNDJSON(path, payload, onChunk) {
  // 1️⃣ 普通 fetch
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/x-ndjson",
    },
    body: JSON.stringify(payload),
  });

  // 2️⃣ 拿 ReadableStream
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  // 3️⃣ 逐块读取
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    // 4️⃣ 累加到 buffer 并按行切分
    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const idx = buffer.indexOf("\\n");
      if (idx === -1) break;

      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);

      if (!line) continue;

      // 5️⃣ 解析 + 回调
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        obj = { type: "raw", content: line };
      }
      onChunk("message", obj);

      if (obj.type === "done") return;
    }
  }
}</code></pre>

        <h3>关键解读</h3>

        <div class="code-explain">
          <div class="line">
            <strong>1️⃣ 普通 fetch</strong>：<span class="hl">和普通请求完全一样</span>——
            这就是 NDJSON 相对 SSE 的最大优势。任何能用 fetch 的环境都能用。
          </div>
          <div class="line">
            <strong>2️⃣ res.body.getReader()</strong>：ReadableStream API。
            res.body 不是字符串，是流对象。<code>getReader()</code> 把它当成一个"逐 chunk 读"的接口。
          </div>
          <div class="line">
            <strong>3️⃣ while loop + reader.read()</strong>：
            每次返回 <code>{value, done}</code>。<code>value</code> 是 Uint8Array（bytes），
            <code>done</code> 是 true 时表示流结束。
          </div>
          <div class="line">
            <strong>4️⃣ buffer + indexOf("\\n")</strong>：<span class="hl">关键技巧</span>——
            网络数据可能"半行半行"地来。比如第一次 read 拿到 <code>{"type":"text","con</code>，
            第二次才拿到 <code>tent":"今天"}\\n</code>。所以必须用 buffer 累加，
            等遇到 <code>\\n</code> 才切一行。
          </div>
          <div class="line">
            <strong>5️⃣ try/catch + onChunk</strong>：JSON.parse 失败时不要崩，
            包装成 raw 类型让上层决定怎么处理。
          </div>
        </div>

        <h3>📌 怎么用这个函数</h3>

        <pre data-lang="javascript"><code>await streamNDJSON("/api/v1/chat/stream_ndjson",
  { message: "上海天气" },
  (_evt, chunk) => {
    if (chunk.type === "text") {
      // 追加到对话气泡
      bodyEl.textContent += chunk.content;
    } else if (chunk.type === "tool_calls") {
      // 渲染工具调用卡片（可折叠）
      addToolBlock(chunk.data.name, chunk.data.input);
    } else if (chunk.type === "tool_result") {
      // 更新对应卡片的结果
      updateToolBlock(chunk.data.name, chunk.data.output);
    }
  }
);</code></pre>

        <div class="callout">
          🎯 <strong>到这里你已经搭好了完整的流式链路</strong>：
          后端 LangGraph → SingleAgent.stream → NDJSON 推送 → fetch ReadableStream → UI 增量渲染。
          下一关 M3 我们深入 LangGraph 内部，看 Agent 怎么"决策"。
        </div>
      `,
    },

    // ============ Stage 6: Mini-Quiz ============
    {
      kind: 'mini-quiz',
      title: '小测：流式协议',
      questions: [
        {
          id: 'm2s6q1',
          type: 'single',
          knowledgeTag: '流式协议',
          text: 'Agent 流式输出的核心价值是什么？',
          options: [
            { text: '减少服务器带宽消耗', value: 'a' },
            { text: '把"30 秒空白等待"变成"30 秒持续反馈"，用户能实时看到 Agent 在做什么', value: 'b' },
            { text: '让模型生成速度更快', value: 'c' },
            { text: '防止请求超时' , value: 'd' }
          ],
          answer: 'b',
          explain: '流式不是为了"快"，是为了"反馈"。用户看到第一个字出现的时间从 30 秒变成 0.5 秒。',
          deeper: 'ChatGPT / Claude.ai / Cursor 全部流式。这是 Agent 应用的 UX 事实标准。'
        },
        {
          id: 'm2s6q2',
          type: 'single',
          knowledgeTag: '前后端协作',
          text: '前端用 fetch + ReadableStream 解析 NDJSON 时，为什么需要一个 buffer 变量？',
          options: [
            { text: '为了缓存所有数据最后一次性渲染', value: 'a' },
            { text: '网络数据可能"半行半行"地来，需要累加直到遇到 \\n 才能切出完整 JSON', value: 'b' },
            { text: '为了实现断点续传', value: 'c' },
            { text: '浏览器要求必须有 buffer' , value: 'd' }
          ],
          answer: 'b',
          explain: 'TCP 不保证按行送达。一次 read() 可能拿到半行，也可能拿到两行半。buffer 累加 + indexOf("\\n") 切分是标准模式。',
          deeper: '这个 buffer 模式在所有流式解析场景都通用：SSE / WebSocket 消息分帧 / 日志 tail 等。'
        }
      ]
    },

    // ============ Stage 7: Final Quiz ============
    {
      kind: 'final-quiz',
      title: '通关测验：M2 流式协议',
      passLine: 0.8,
      questions: [
        {
          id: 'm2fq1',
          type: 'single',
          knowledgeTag: '流式协议',
          text: '为什么 Agent 应用基本不用"等模型生成完一次性返回"？',
          options: [
            { text: '会被 OpenAI 限流', value: 'a' },
            { text: '一次生成可能 5-30 秒，UI 卡死不可接受；流式让用户立刻看到反馈', value: 'b' },
            { text: '一次性返回会丢工具调用信息', value: 'c' },
            { text: 'HTTP/1.1 不支持长连接' , value: 'd' }
          ],
          answer: 'b',
          explain: 'Agent UX 的命脉就是流式：把"30 秒空白"变成"30 秒持续反馈"。',
        },
        {
          id: 'm2fq2',
          type: 'single',
          knowledgeTag: '流式协议',
          text: '为什么本项目用 NDJSON 而不是 SSE？',
          options: [
            { text: 'NDJSON 是标准', value: 'a' },
            { text: 'SSE 部分环境兼容差，且 EventSource 不支持 POST + 自定义 header', value: 'b' },
            { text: 'NDJSON 更快', value: 'c' },
            { text: 'SSE 不能传 JSON' , value: 'd' }
          ],
          answer: 'b',
          explain: 'fetch + ReadableStream 是最通用的方案。',
        },
        {
          id: 'm2fq3',
          type: 'multi',
          knowledgeTag: '事件类型',
          text: '一个 Agent 流式响应里，下面哪些是合理的事件类型？（多选）',
          options: [
            { text: 'text / token（增量文本）', value: 'a' },
            { text: 'tool_calls（模型决定调工具）', value: 'b' },
            { text: 'tool_result（工具执行结果）', value: 'c' },
            { text: 'http_500（HTTP 状态码）', value: 'd' },
            { text: 'done（流结束信号）', value: 'e' }
          ],
          answer: ['a', 'b', 'c', 'e'],
          explain: 'http_500 是 HTTP 状态码，不是流内事件。错误用 type:"error" 单独定义。',
        },
        {
          id: 'm2fq4',
          type: 'single',
          knowledgeTag: '前后端协作',
          text: '前端收到 <code>{"type": "tool_calls", "data": {"name": "get_weather"}}</code>，最佳渲染策略？',
          options: [
            { text: '直接拼到对话气泡里', value: 'a' },
            { text: '丢弃，只显示 type:text', value: 'b' },
            { text: '渲染为可折叠的工具调用块（默认折叠，展开看名+参+结果）', value: 'c' },
            { text: '弹模态框确认' , value: 'd' }
          ],
          answer: 'c',
          explain: '工具调用对调试/信任重要，但不该当对话内容。可折叠是行业最佳实践。',
        },
        {
          id: 'm2fq5',
          type: 'fill',
          knowledgeTag: '后端实现',
          text: 'StreamingResponse 的 media_type 应该填什么完整值？（参考你项目代码）',
          hint: '完整 media-type 字符串，含 charset',
          answer: ['application/x-ndjson; charset=utf-8', 'application/x-ndjson;charset=utf-8', 'application/x-ndjson', 'application/x-ndjson;charset=UTF-8'],
          explain: 'application/x-ndjson 告诉客户端这是 NDJSON 流，加 charset=utf-8 防中文乱码。',
        }
      ]
    }
  ]
};
