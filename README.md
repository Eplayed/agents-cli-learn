# My Agent CLI (v2.0)

阶段 2 进阶项目：带 Checkpoint 记忆的 LangGraph Agent CLI。

## 功能特性

- ✅ 基于 LangGraph 的状态机 Agent
- ✅ 支持 3 个自定义工具（天气、搜索、计算）
- ✅ 流式输出响应
- ✅ **Checkpoint 记忆持久化**
- ✅ **多会话管理**
- ✅ 会话历史恢复
- ✅ 命令行交互界面

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
# 复制示例文件
cp .env.example .env

# 编辑 .env 文件，填入你的 OpenAI API Key
OPENAI_API_KEY=sk-your-api-key-here
```

### 3. 运行

```bash
npm start
```

## 使用示例

```
╔════════════════════════════════════════════════════════╗
║         🤖 My Agent CLI v2.0.0 (带 Checkpoint 记忆)      ║
╠════════════════════════════════════════════════════════╣
║  可用工具:                                              ║
║  • get_weather - 查询天气                               ║
║  • search_web  - 联网搜索                               ║
║  • calculator  - 数学计算                               ║
╠════════════════════════════════════════════════════════╣
║  命令:                                                  ║
║  • /new       - 创建新会话                             ║
║  • /sessions  - 列出所有会话                           ║
║  • /switch    - 切换会话                               ║
║  • /history   - 查看当前会话历史                       ║
║  • /checkpoints - 列出检查点                          ║
║  • /clear     - 清空对话历史                          ║
║  • /tools     - 查看可用工具                          ║
║  • /help      - 显示帮助                              ║
║  • /exit      - 退出程序                              ║
╚════════════════════════════════════════════════════════╝

📝 当前会话: 会话 2024/1/1 12:00:00
   Session ID: session_xxx

💬 输入问题开始对话 (输入 /exit 退出)

👤 你: 北京今天天气怎么样？

🤖 Agent: 
🔧 正在调用工具: get_weather

北京今天天气晴朗，温度25°C，湿度40%，适合出行。
```

## Checkpoint 记忆功能

### 核心概念

```
┌─────────────────────────────────────────────────────────────┐
│                    Checkpoint 工作原理                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  用户提问         Agent 执行         状态保存                │
│     │               │                 │                    │
│     ▼               ▼                 ▼                    │
│  ┌────────┐     ┌────────┐        ┌─────────┐              │
│  │ 输入   │ ──→ │ Agent  │ ──→    │ Checkpoint│            │
│  │       │     │ 处理   │        │ (内存/磁盘)│            │
│  └────────┘     └────────┘        └─────────┘              │
│                          │               │                  │
│                          │  恢复          │                  │
│                          ▼               ▼                  │
│                    ┌──────────────┐                           │
│                    │ 会话历史恢复  │                           │
│                    └──────────────┘                           │
│                                                              │
│  关键特性:                                                   │
│  • thread_id: 每个会话的唯一标识                             │
│  • 自动保存: 每次对话后自动保存状态                           │
│  • 任意恢复: 可恢复到任意历史检查点                           │
│  • 多会话: 支持同时维护多个会话                              │
└─────────────────────────────────────────────────────────────┘
```

### 使用命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `/new` | 创建新会话 | 切换到新话题 |
| `/sessions` | 列出所有会话 | 查看历史会话 |
| `/switch <id>` | 切换到指定会话 | `/switch session_123` |
| `/history` | 查看当前会话历史 | 查看之前对话 |
| `/checkpoints` | 列出所有检查点 | 恢复到之前状态 |
| `/clear` | 清空当前对话 | 重新开始 |
| `/exit` | 退出 | 关闭程序 |

### 编程接口

```typescript
// 创建 Agent（已内置 Checkpoint）
const agent = new LangGraphAgent(config);

// 对话时传入 threadId
const response = await agent.invoke(messages, {
  threadId: 'my-session-123'
});

// 获取会话历史
const history = await agent.getSessionHistory('my-session-123', 10);

// 列出检查点
const checkpoints = await agent.listCheckpoints('my-session-123');

// 恢复到特定检查点
await agent.restoreCheckpoint('my-session-123', 'checkpoint-id');

// 删除会话
await agent.deleteSession('my-session-123');
```

## 项目结构

```
my-agent-cli/
├── src/
│   ├── agent/
│   │   ├── agent.ts      # Agent 核心实现（含 Checkpoint）
│   │   └── index.ts      # 模块导出
│   ├── tools/
│   │   └── index.ts      # 工具定义
│   └── cli.ts            # CLI 入口（含会话管理）
├── .sessions/            # 会话存储目录
│   └── sessions.json     # 会话列表
├── .env.example          # 环境变量示例
├── package.json
└── tsconfig.json
```

## 学习要点

通过这个项目，你将学习到：

1. **LangGraph StateGraph** - 如何构建状态机 Agent
2. **Checkpoint** - 如何持久化 Agent 状态
3. **Tool Calling** - 如何定义和使用工具
4. **流式输出** - 如何实现流式响应
5. **会话管理** - 如何管理多会话

## 下一步

完成阶段 2 后，继续学习：

- 阶段 3：CrewAI / AutoGen 多 Agent 协作
- 阶段 4：MCP / A2A 协议
- 阶段 5：垂直场景实践（代码 Agent）

## 参考资料

- [LangChain 文档](https://js.langchain.com/docs/)
- [LangGraph 文档](https://langchain-ai.github.io/langgraph/)
- [LangGraph Checkpoint](https://langchain-ai.github.io/langgraph/how-tos/checkpointing/)
- [OpenAI API 文档](https://platform.openai.com/docs/)