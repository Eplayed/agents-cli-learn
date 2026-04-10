# CowAgent 深度分析与可执行 PRD（Web-only 视角）

> 目标：对 CowAgent（zhayujie/chatgpt-on-wechat）做结构化拆解（架构/模块/技术栈/潜在问题），并在此基础上输出一份可执行 PRD，供你在本仓库的 Web-only 路线中择优吸收。

---

## 1. 执行摘要（Executive Summary）

CowAgent 是一个“开箱即用的多通道 AI 助理 + 可扩展 Agent 框架”。其核心卖点不在于单一模型对话能力，而在于：
- 多通道接入（微信/企微/飞书/钉钉/QQ/网页等）带来的“消息入口统一”
- Skills/插件生态（安装/启停/配置/优先级）带来的“能力扩展”
- Agent 模式（多步决策、工具链、长期记忆）带来的“任务完成闭环”
- CLI/脚本化运维（安装、启动、更新、浏览器工具安装）带来的“可运维性”

对比你的项目（agents-cli-learn / my-agent-cli）：你更偏“教学工程 + 可观察的最小可运行系统”，CowAgent 更偏“生产化能力面覆盖 + 生态与运维”。

---

## 2. 架构识别（Architecture）

### 2.1 核心形态：消息驱动的多通道运行时

CowAgent 的主路径是“消息入口 → 通道适配 → 统一消息/上下文 → 模型/插件/工具 → 输出回通道”。从代码入口可以看到它以 ChannelManager 管理多通道线程运行，并在第一次启动时加载插件体系：

- Channel 管理与并发：`app.py` 中 `ChannelManager.start()` 会为各 channel 创建独立线程，并在 first_start 时 `PluginManager().load_plugins()`。
- 插件系统：`plugins/plugin_manager.py` 负责扫描目录、动态 import、插件启停、优先级与事件分发。

### 2.2 关键模块划分（模块边界）

从 README 与配置模板可以识别出 CowAgent 的主要“子系统”：
- **Channel 子系统**：各通道接入（weixin/feishu/dingtalk/wecom/qq/web/terminal 等），统一启动/停止/重启
- **Model/Provider 子系统**：多模型供应商配置与切换（OpenAI/Claude/Gemini/DeepSeek/GLM/Qwen/Kimi 等）
- **Agent 子系统**：agent=true 时启用多步决策、长期记忆、skills 与系统工具
- **Tools 子系统**：文件读写、终端执行、浏览器、定时任务等
- **Skills/Plugins 子系统**：能力包的安装、配置、启停，事件驱动的插件运行机制
- **Workspace 子系统**：agent_workspace 存放记忆、技能、系统设定等，支持长期运行
- **运维子系统**：cow CLI / run.sh 一键安装、启动、管理

### 2.3 技术栈（Tech Stack）

从 requirements/config/run.sh 可归纳出：
- 语言：Python
- 配置：JSON 配置（config.json）+ 环境变量
- 网络：requests/aiohttp
- 多通道 SDK：wechatpy、lark-oapi、dingtalk_stream、websocket-client 等
- 定时/任务：croniter
- CLI：click
- 图像/文件：Pillow
- Web：存在 web channel（web 控制台/网页接入），但仓库整体并非单纯 Web App 架构

---

## 3. 功能模块深挖（What it actually does）

### 3.1 Plugin/Skills：事件驱动 + 优先级队列

`PluginManager` 的关键机制：
- `scan_plugins()` 扫描 `./plugins` 目录，发现包含 `__init__.py` 的插件包就导入
- `register(name, priority, ...)` 装饰器注册插件类并记录元信息（name/version/desc/author/path）
- `plugins.json` 保存插件启用状态与优先级；`plugins/config.json` 作为集中配置入口
- `emit_event(e_context)` 将事件按优先级派发到 handlers，可被 plugin 中断（break）

这一套是“可扩展生态”的核心：并不要求所有能力都写进主流程，而是通过事件总线挂载。

### 3.2 ChannelManager：多通道并发 + 可重启

ChannelManager 的关键机制：
- 多个 channel 可以同时运行，每个 `startup()` 在 daemon thread 内
- 支持动态 `restart(channel)` / `add_channel(channel)`
- 具备一定的“故障自恢复/可运维”倾向（线程中断、重启）

### 3.3 Agent 模式的关键参数（可控性/预算）

配置模板里体现了“预算/控制面”的意识：
- agent_max_context_tokens / agent_max_context_turns（上下文裁剪策略）
- agent_max_steps（单次任务最大决策步数，避免无限循环）
- agent_workspace（工作目录，承载技能与记忆）

这与“生产 Agent”常见的风险控制点一致。

---

## 4. 潜在问题与风险（Issues & Risks）

以下问题不一定是 bug，但对“学习复刻/产品化”非常关键：

### 4.1 架构复杂度：多通道+插件+agent+工具耦合成本高
- 业务链路长，入口多，排查成本高
- 线程模型（多 channel daemon threads）对资源释放、异常传播、优雅退出提出更高要求

### 4.2 协议与可观测：需要强约束才能可维护
- 插件事件与工具调用如果没有统一 schema（输入/输出/错误码/幂等），会演化为“可跑但不可测”
- Web 控制台如果不具备 Trace/回放/导出，很难让学习者理解“发生了什么”

### 4.3 供应商/依赖版本压力
- requirements 中 openai==0.27.8 等老版本依赖可能与 2025–2026 主流 SDK 存在差异，需要迁移策略
- 多供应商适配层需要统一的“最小接口”，否则每个模型差异都会渗透到业务层

### 4.4 安全边界
Agent 工具包含终端/文件/浏览器等高风险能力，必须具备：
- 权限分级（read/write/danger）
- 审计日志与回放
- 用户确认与策略约束

---

## 5. 可执行 PRD：把 CowAgent 的优势迁移到“Web-only 学习/产品”里

### 5.1 产品定位

**Web-only Agent Playground**：一个面向学习与调试的 Web 控制台，提供：
- 多会话对话（单 Agent / Multi-Agent）
- 工具调用可视化（输入/输出/耗时）
- Trace→Span→Event 的可观测日志（可搜索/筛选/导出/回放）
- 最小 Skills/Tools 抽象（可安装/启停/版本/权限）
- 最小长期记忆（摘要 + 检索）

### 5.2 目标（Goals）
- G1：让学习者能“看懂并复现”一次 Agent 执行全过程（从输入到工具到输出到落库）
- G2：具备可扩展的技能/工具机制（可控、可审计、可回归）
- G3：具备最小生产化要素（鉴权、限流、审计、错误分层、预算）

### 5.3 非目标（Non-goals）
- 不做微信/飞书/钉钉等多通道接入（Web-only 目标）
- 不做复杂的多租户/企业权限体系（先单机/单用户）

### 5.4 用户画像
- 学习者：需要“可解释、可复盘、可导出”的 Agent 学习环境
- 开发者：需要工具/技能快速迭代、回归不回退

### 5.5 核心功能需求（Functional Requirements）

#### FR-1：Web 控制台（对话 + 会话）
- 历史会话列表（标题/时间/最后预览）
- 会话切换加载历史消息
- 流式与非流式两种模式

#### FR-2：可观测日志（Trace→Span→Event）
- 每次用户操作生成 Trace
- API 请求/响应记录：path、参数、状态码、耗时
- 工具调用记录：tool name、input、output、耗时
- 支持搜索、级别过滤、导出 JSON/文本、回放（下一阶段）

#### FR-3：工具/技能抽象（Web-only 的“轻量 CowAgent”）
- Tool 定义必须包含：name、description、input_schema、permission、timeout、idempotency
- Skill（能力包）包含：manifest + 资源文件 +（可选）prompt/流程脚本
- UI 可查看已安装 Skills、启停、版本信息

#### FR-4：长期记忆（最小实现）
- 会话摘要与关键实体提取
- 语义检索（向量库或轻量 embedding 存储）
- 可在 UI 看到“本次回答引用了哪些记忆片段”

#### FR-5：治理（预算/安全/稳定性）
- 预算：max_steps、max_tool_calls、max_time、max_context
- 错误分层：用户错误/工具错误/模型错误/系统错误
- 安全：危险工具强制确认 + 审计日志

### 5.6 数据模型（建议）
- sessions / messages（已具备）
- tool_runs（tool name、input、output、error、latency、trace_id）
- traces/spans/events（结构化日志，可回放）
- skills（manifest、enabled、version、installed_at）
- memories（summary、embedding、tags、source_trace_id）

### 5.7 验收标准（Acceptance Criteria）
- 工具调用“输入/输出”在 UI 可见，且日志可导出复盘
- 任意一次对话可导出为 JSON，包含 Trace/Span/工具调用与最终输出
- 30 条最小回归集可一键跑通：工具正确率、输出结构稳定、错误分层可统计

---

## 6. 参考实现建议（从 CowAgent 借鉴但不照搬）

你可以从 CowAgent 借鉴的“工程关键点”，而不是多通道与全量生态：
- Plugin/Skills 的“可安装/可配置/可启停/可审计”框架思想
- Agent 预算与上下文裁剪参数化（agent_max_steps 等）
- 运维脚本/CLI（Web-only 也需要一键启动/重置 DB/导出数据）

