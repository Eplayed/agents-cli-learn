# My Agent CLI

阶段 1 学习项目：一个基于 LangGraph 的 Agent CLI 工具。

## 功能特性

- ✅ 基于 LangGraph 的状态机 Agent
- ✅ 支持 3 个自定义工具（天气、搜索、计算）
- ✅ 流式输出响应
- ✅ 多轮对话历史
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
👤 你: 北京今天天气怎么样？

🤖 Agent: 
🔧 正在调用工具: get_weather

北京今天天气晴朗，温度25°C，湿度40%，适合出行。

👤 你: 计算 123 * 456

🤖 Agent:
🔧 正在调用工具: calculator

计算结果是 56,088。

👤 你: 搜索一下 LangGraph 是什么

🤖 Agent:
🔧 正在调用工具: search_web

LangGraph 是一个用于构建有状态、多参与者应用程序的库...
```

## 命令

| 命令 | 说明 |
|------|------|
| `/clear` | 清空对话历史 |
| `/tools` | 查看可用工具 |
| `/exit` | 退出程序 |

## 项目结构

```
my-agent-cli/
├── src/
│   ├── agent/
│   │   ├── state.ts      # Agent 状态定义
│   │   ├── agent.ts      # Agent 核心实现
│   │   └── index.ts      # 模块导出
│   ├── tools/
│   │   └── index.ts      # 工具定义
│   └── cli.ts            # CLI 入口
├── .env.example          # 环境变量示例
├── package.json
└── tsconfig.json
```

## 学习要点

通过这个项目，你将学习到：

1. **LangGraph StateGraph** - 如何构建状态机 Agent
2. **Tool Calling** - 如何定义和使用工具
3. **流式输出** - 如何实现流式响应
4. **消息历史** - 如何管理多轮对话

## 下一步

完成阶段 1 后，继续学习：

- 阶段 2：添加 RAG 知识库
- 阶段 3：构建 Web API 服务
- 阶段 4：企业级后端架构

## 参考资料

- [LangChain 文档](https://js.langchain.com/docs/)
- [LangGraph 文档](https://langchain-ai.github.io/langgraph/)
- [OpenAI API 文档](https://platform.openai.com/docs/)
