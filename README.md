# My Agent CLI (v3.0 - Multi-Agent)

> 阶段 3 完成：支持 5 种 Multi-Agent 协作模式

---

## 🎯 阶段 3 新增功能

### Multi-Agent 协作模式

| 模式 | 命令 | 说明 |
|------|------|------|
| **Sequential** | `/team sequential <主题>` | 顺序执行：研究员 → 作家 → 审稿人 |
| **Parallel** | `/team parallel <主题>` | 并行执行：多个 Agent 同时处理 |
| **Supervisor** | `/team supervisor <主题>` | 主管模式：主管分配任务 |
| **GroupChat** | `/team groupchat <主题>` | 群聊模式：Agent 自由讨论 |
| **TeamGraph** | `/team graph <主题>` | LangGraph 状态机驱动 |

---

## 🗺️ 核心流程图

### Multi-Agent 模式对比

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        5 种协作模式                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1️⃣ Sequential（顺序执行）                                              │
│  ────────────────────────────                                           │
│  START → [研究员] → [作家] → [审稿人] → END                             │
│           (等上一个) (等上一个)                                          │
│                                                                         │
│  2️⃣ Parallel（并行执行）                                                │
│  ────────────────────────────                                           │
│  START                                                                    │
│     │                                                                     │
│  ┌──┼──┐                                                                │
│  ▼  ▼  ▼                                                                │
│ [研究] [写作] [审稿]  ← 同时执行！                                       │
│  └────┬────┘                                                             │
│       ▼                                                                  │
│      END                                                                 │
│                                                                         │
│  3️⃣ Supervisor（主管模式）                                               │
│  ────────────────────────────                                           │
│        [主管]                                                            │
│         │ 分配                                                           │
│    ┌────┼────┐                                                          │
│    ▼    ▼    ▼                                                          │
│  [研究] [写作] [审稿]                                                    │
│    │    │    │                                                          │
│    └────┼────┘                                                          │
│         ▼                                                               │
│     [主管汇总] → END                                                     │
│                                                                         │
│  4️⃣ GroupChat（群聊模式）                                               │
│  ────────────────────────────                                           │
│  START → Manager 选择发言者 → Agent A 发言 → Manager 判断                │
│          → Agent B 发言 → ... → Manager 说 END → END                    │
│                                                                         │
│  5️⃣ TeamGraph（LangGraph 驱动）                                         │
│  ────────────────────────────                                           │
│        ┌──────────┐                                                     │
│   START┤ Supervisor│ → Router → [研究] → [写作] → [审稿]                │
│        │  (LLM)   │                │       │       │                    │
│        └──────────┘                └───────┴───────┘                    │
│                                      │                                  │
│                                      ▼                                  │
│                                  [汇总] → END                            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Multi-Agent 类比

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          类比：开公司                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  单 Agent = 一个人开店 (全自己干)                                         │
│                                                                         │
│  Multi-Agent = 公司团队                                                 │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  角色                     工作内容                               │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │  研究员 (Researcher)    搜索信息、整理数据                      │  │
│  │  作家 (Writer)          根据素材写文章                          │  │
│  │  审稿人 (Reviewer)       检查文章质量、润色                     │  │
│  │  主管 (Supervisor)       分析任务、分配给下属                    │  │
│  │  经理 (Manager)          主持群聊、决定谁说话                   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入你的 OpenAI API Key
```

### 3. 运行

```bash
npm start
```

---

## 💬 使用示例

### 单 Agent 模式（阶段 1-2）

```
👤 你: 今天北京天气怎么样？
🤖 Agent: 🔧 正在调用工具: get_weather
   北京今天天气晴，温度 15-25°C...
```

### Multi-Agent 模式（阶段 3）

```
👤 你: /team sequential AI 的未来发展
🔄 ===== Sequential 模式 =====
   主题: AI 的未来发展

👑 [Round 1] Supervisor 分析中...
   → 分配给: researcher
🔍 Researcher 开始研究...
   ✅ 研究完成 (1500 字)

👑 [Round 2] Supervisor 分析中...
   → 分配给: writer
✍️ Writer 开始写作...
   ✅ 写作完成 (2000 字)

👑 [Round 3] Supervisor 分析中...
   → 分配给: reviewer
📝 Reviewer 开始审稿...
   ✅ 审稿完成 (1800 字)
```

---

## 📂 项目结构

```
my-agent-cli/
├── src/
│   ├── agent/
│   │   ├── agent.ts      ← 单 Agent 核心（StateGraph + Checkpoint）
│   │   ├── memory.ts     ← 记忆管理（Window/Summary/Entity）
│   │   ├── interrupt.ts  ← 中断点（人工确认）
│   │   ├── subgraph.ts   ← 子图（模块化）
│   │   └── index.ts      ← 模块导出
│   ├── multi-agent/                   ← 阶段 3 新增
│   │   ├── agents.ts      ← Agent 角色定义 + 工厂
│   │   ├── crew.ts        ← Crew 编排（Sequential/Parallel/Supervisor）
│   │   ├── groupchat.ts   ← GroupChat 群聊
│   │   ├── team.ts        ← LangGraph TeamGraph
│   │   └── index.ts       ← 模块导出
│   ├── tools/
│   │   └── index.ts       ← 工具箱（天气/搜索/计算）
│   └── cli.ts            ← CLI 入口（Multi-Agent 支持）
```

---

## 📖 学习要点

### 阶段 1: LangChain 基础
- [x] OpenAI API 调用
- [x] 流式响应
- [x] Prompt Template
- [x] Tool Calling

### 阶段 2: LangGraph 工作流
- [x] StateGraph 状态图
- [x] Checkpoint 状态持久化
- [x] Memory 记忆管理
- [x] Interrupt 中断点
- [x] Subgraph 子图

### 阶段 3: Multi-Agent 协作
- [x] Agent 角色定义（AgentProfile + AgentFactory）
- [x] Sequential 顺序执行
- [x] Parallel 并行执行
- [x] Supervisor 主管模式
- [x] GroupChat 群聊（AutoGen 风格）
- [x] TeamGraph LangGraph 驱动

---

## 🔗 参考资料

- [LangChain 文档](https://js.langchain.com/docs/)
- [LangGraph 文档](https://langchain-ai.github.io/langgraph/)
- [CrewAI 文档](https://docs.crewai.com/)
- [AutoGen 文档](https://microsoft.github.io/autogen/)
