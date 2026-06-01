// 每个关卡的技术架构流程图数据
// 用于通关后预览"下一关要学的技术链路"
// nodes: 技术组件节点
// edges: 数据流向（带标签说明流的是什么）

export const TECH_FLOWS = {
  M1: {
    title: '你将搭建的 Agent 服务架构',
    description: '从 HTTP 请求到 LLM 响应的完整链路',
    nodes: [
      { id: 'browser', label: '浏览器', icon: '🌐', color: '#3b82f6' },
      { id: 'fastapi', label: 'FastAPI', icon: '⚡', color: '#10b981' },
      { id: 'pydantic', label: 'Pydantic\n校验', icon: '🛡', color: '#8b5cf6' },
      { id: 'agent', label: 'SingleAgent\nLangGraph', icon: '🤖', color: '#6366f1' },
      { id: 'llm', label: 'OpenAI\nLLM', icon: '🧠', color: '#f59e0b' },
      { id: 'db', label: 'SQLite\nDB', icon: '💾', color: '#06b6d4' },
    ],
    edges: [
      { from: 'browser', to: 'fastapi', label: 'HTTP POST' },
      { from: 'fastapi', to: 'pydantic', label: '请求体' },
      { from: 'pydantic', to: 'agent', label: '校验通过' },
      { from: 'agent', to: 'llm', label: 'ainvoke' },
      { from: 'llm', to: 'agent', label: 'AIMessage' },
      { from: 'agent', to: 'db', label: '落库' },
    ],
  },

  M2: {
    title: '你将实现的流式数据流',
    description: 'LLM token 如何一个个推到浏览器',
    nodes: [
      { id: 'llm', label: 'ChatOpenAI\nstreaming', icon: '🧠', color: '#f59e0b' },
      { id: 'langgraph', label: 'LangGraph\nastream_events', icon: '🔄', color: '#6366f1' },
      { id: 'gen', label: 'async gen()\nyield bytes', icon: '⚙️', color: '#8b5cf6' },
      { id: 'response', label: 'Streaming\nResponse', icon: '📡', color: '#10b981' },
      { id: 'fetch', label: 'fetch()\nReadableStream', icon: '🌐', color: '#3b82f6' },
      { id: 'ui', label: 'UI 增量\n渲染', icon: '✨', color: '#ec4899' },
    ],
    edges: [
      { from: 'llm', to: 'langgraph', label: 'token' },
      { from: 'langgraph', to: 'gen', label: '事件' },
      { from: 'gen', to: 'response', label: 'NDJSON\\n行' },
      { from: 'response', to: 'fetch', label: 'HTTP 流' },
      { from: 'fetch', to: 'ui', label: 'JSON.parse' },
    ],
  },

  M3: {
    title: '你将构建的 LangGraph 状态机',
    description: 'Agent 的 ReAct 循环如何用图表达',
    nodes: [
      { id: 'start', label: 'START', icon: '▶', color: '#10b981' },
      { id: 'agent', label: 'agent 节点\n(调 LLM)', icon: '🤖', color: '#6366f1' },
      { id: 'condition', label: 'tools_condition\n有 tool_calls?', icon: '❓', color: '#f59e0b' },
      { id: 'tools', label: 'ToolNode\n(执行工具)', icon: '🔧', color: '#8b5cf6' },
      { id: 'end', label: 'END', icon: '⏹', color: '#ef4444' },
    ],
    edges: [
      { from: 'start', to: 'agent', label: '' },
      { from: 'agent', to: 'condition', label: '' },
      { from: 'condition', to: 'tools', label: 'yes' },
      { from: 'condition', to: 'end', label: 'no' },
      { from: 'tools', to: 'agent', label: 'ToolMessage' },
    ],
  },

  M4: {
    title: '你将接入的 MCP 工具协议',
    description: '工具从"内嵌代码"变成"独立 Server"',
    nodes: [
      { id: 'agent', label: 'SingleAgent\nLangGraph', icon: '🤖', color: '#6366f1' },
      { id: 'client', label: 'MCP Client\nMultiServer', icon: '🔌', color: '#8b5cf6' },
      { id: 'weather', label: 'Weather\nMCP Server', icon: '🌤', color: '#f59e0b' },
      { id: 'utils', label: 'Utils\nMCP Server', icon: '🧮', color: '#10b981' },
      { id: 'api', label: 'Open-Meteo\nAPI', icon: '☁️', color: '#06b6d4' },
      { id: 'claude', label: 'Claude Desktop\n也能用', icon: '💬', color: '#ec4899' },
    ],
    edges: [
      { from: 'agent', to: 'client', label: 'tool_call' },
      { from: 'client', to: 'weather', label: 'stdio' },
      { from: 'client', to: 'utils', label: 'stdio' },
      { from: 'weather', to: 'api', label: 'HTTP' },
      { from: 'claude', to: 'weather', label: 'MCP 复用' },
    ],
  },

  // M5 预留（Checkpoint + 预算控制）
  M5: {
    title: '你将实现的持久化 + 预算控制',
    description: '对话状态跨重启保留，LLM 循环不失控',
    nodes: [
      { id: 'request', label: '第 N 次\n请求', icon: '📨', color: '#3b82f6' },
      { id: 'graph', label: 'LangGraph\n图执行', icon: '🔄', color: '#6366f1' },
      { id: 'saver', label: 'AsyncSqlite\nSaver', icon: '💾', color: '#10b981' },
      { id: 'budget', label: '预算控制\nmax_steps', icon: '🛑', color: '#ef4444' },
      { id: 'resume', label: '下次请求\n自动恢复', icon: '♻️', color: '#8b5cf6' },
    ],
    edges: [
      { from: 'request', to: 'graph', label: 'thread_id' },
      { from: 'graph', to: 'saver', label: '每步存档' },
      { from: 'graph', to: 'budget', label: '检查限制' },
      { from: 'saver', to: 'resume', label: '持久化' },
      { from: 'resume', to: 'graph', label: '加载历史' },
    ],
  },
};
