# 🤖 Agent 开发学习计划

> 基于 noah-chat-svc & noah-dataset-h5 项目实践

---

## 📊 当前进度

| Phase | 内容 | 状态 |
|-------|------|------|
| Phase 1 | TypeScript CLI 基础 (LangChain) | ✅ 已完成 |
| Phase 2 | LangGraph 工作流 (状态/记忆/中断/子图) | ✅ 已完成 |
| Phase 3 | Python FastAPI 后端 (单Agent + Multi-Agent) | ✅ 已完成 |
| Phase 4 | MCP/A2A 协议 + 工具生态 | ⏳ 待开始 |
| Phase 5 | Next.js 前端 + 可视化 | ⏳ 待开始 |
| Phase 6 | Docker/K8s 生产部署 | ⏳ 待开始 |

**仓库**: https://github.com/Eplayed/agents-cli-learn

---

## 📚 Phase 1: LangChain 基础 (TypeScript)

### 目标
掌握 TypeScript 环境下的 LLM 开发基础

### 核心概念
- `ChatOpenAI` - OpenAI API 封装
- `PromptTemplate` - 提示词模板
- `LLMChain` - LLM + Prompt 链式调用
- `StructuredOutputParser` - 结构化输出

### 实践项目
- `my-agent-cli` - CLI 工具
- 文件: `src/agent/agent.ts`, `src/tools/index.ts`

### 面试题
```typescript
// Q: 如何让 LLM 调用外部工具？
const llmWithTools = llm.bind_tools([getWeather, calculator]);
const response = await llmWithTools.invoke("北京天气怎么样？");
// response.tool_calls 包含工具调用信息
```

---

## 🔀 Phase 2: LangGraph 工作流

### 目标
理解状态流图、条件边、子图编排

### 核心模块

#### 2.1 状态管理 (state.ts)
```typescript
export const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>,
  chatId: Annotation<string>,
  tools: Annotation<string[]>,
  reasoning: Annotation<string>,
});
```

#### 2.2 记忆管理 (memory.ts)
| 策略 | 原理 | 适用场景 |
|------|------|----------|
| WindowMemory | 滑动窗口保留最近 N 条 | 简单对话 |
| SummaryMemory | 压缩旧消息为摘要 | 长对话 |
| EntityMemory | 提取实体（人名、地点） | 个性化助手 |

#### 2.3 中断机制 (interrupt.ts)
- 用户输入中断 Agent 执行
- 确认后继续执行
- 用于敏感操作确认

#### 2.4 子图 (subgraph.ts)
- 独立子图模块化
- 错误处理与重试
- 状态共享

---

## 🔧 Phase 3: Python FastAPI 后端

### 架构

```
┌─────────────────────────────────────────────────────┐
│                    FastAPI Backend                    │
├─────────────────────────────────────────────────────┤
│  /api/v1/chat      → Single Agent (LangGraph)       │
│  /api/v1/team      → Multi-Agent (Crew/Team)       │
│  /api/v1/session   → Session/Message 管理          │
├─────────────────────────────────────────────────────┤
│  SQLite + SQLAlchemy (异步)                         │
│  MemorySaver (LangGraph Checkpoint)                 │
└─────────────────────────────────────────────────────┘
```

### 核心代码

#### 单 Agent (agents/single/agent.py)
```python
class SingleAgent:
    def _build_graph(self):
        workflow = StateGraph(AgentState)
        workflow.add_node("agent", self._agent_node)
        workflow.add_node("tools", self._tools_node)
        workflow.add_conditional_edges("agent", self._should_continue, 
                                       {"continue": "tools", "end": END})
        return workflow.compile(checkpointer=self.checkpointer)
```

#### Multi-Agent (agents/multi/team.py)
| 模式 | 说明 | 代码 |
|------|------|------|
| Sequential | 顺序执行 A→B→ | `await workerA.execute()` → `await workerB.execute()` |
| Parallel | 并行执行 A‖B‖C | `asyncio.gather(*tasks)` |
| Supervisor | 主管分配 | LLM 判断分配给谁 |
| Crew | 完整团队 | Task + Agent + 迭代优化 |

### SSE 流式响应
```python
async def chat_stream(request: ChatRequest):
    async for chunk in agent.stream(request.message):
        yield {"event": "message", "data": json.dumps(chunk)}
```

---

## 🌐 Phase 4: MCP/A2A 协议 (待开始)

### 4.1 MCP (Model Context Protocol)

**协议栈**:
- Server/Client 架构
- tools/resources/prompts 标准化接口
- STDIO / HTTP 传输

**实现计划**:
- [ ] MCP Server 框架
- [ ] 文件系统工具
- [ ] Git 工具
- [ ] 搜索工具 (Brave/Tavily)

### 4.2 A2A (Agent-to-Agent)

**协议栈**:
- Agent Card (能力描述)
- JSON-RPC 2.0
- Streamable HTTP

**实现计划**:
- [ ] Agent Card 注册
- [ ] 任务委托协议
- [ ] 跨 Agent 通信

### 4.3 工具生态

| 工具 | 功能 |
|------|------|
| Playwright | Browser 自动化 |
| Code Interpreter | 安全沙箱代码执行 |
| Brave Search | 联网搜索 |

---

## 💻 Phase 5: Next.js 前端 (待开始)

### 技术栈
- Next.js 14 (App Router)
- Tailwind CSS + shadcn/ui
- SSE 流式接收

### 页面规划
- [ ] 首页/仪表盘
- [ ] 对话页面 (单 Agent)
- [ ] 团队页面 (Multi-Agent)
- [ ] 会话历史
- [ ] 设置 (API Key)

### 可视化
- [ ] Agent 执行流程图
- [ ] 状态/记忆查看
- [ ] Token 消耗统计

---

## 🚀 Phase 6: 生产部署 (待开始)

### 6.1 Docker Compose
```yaml
services:
  backend:     # FastAPI
  frontend:    # Next.js
  postgres:    # 数据库
  redis:       # 缓存
  nginx:       # 反向代理
```

### 6.2 Kubernetes
- Deployment / Service / Ingress
- ConfigMap / Secret
- Helm Chart

### 6.3 监控
- Prometheus + Grafana
- JWT 认证
- Rate Limiting

---

## 📖 学习资源

### 官方文档
- [LangChain.js](https://js.langchain.com/)
- [LangGraph](https://langchain-ai.github.io/langgraph/)
- [FastAPI](https://fastapi.tiangolo.com/)
- [MCP Spec](https://modelcontextprotocol.io/)
- [A2A Protocol](https://google.github.io/A2A/)

### 项目参考
- [LangChain AI](https://github.com/langchain-ai)
- [AutoGen](https://microsoft.github.io/autogen/)
- [CrewAI](https://docs.crewai.com/)

---

## ✅ 任务清单

### 本周任务
- [ ] 理解 Phase 3 所有核心模块代码
- [ ] 配置 BRAVE_API_KEY 实现搜索
- [ ] 实现 Phase 4 MCP Server 基础框架

### 下周任务
- [ ] 实现 A2A 协议
- [ ] Next.js 前端初始化
- [ ] Docker Compose 完整编排

---

*最后更新: 2026-04-04*
