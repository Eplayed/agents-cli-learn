# 从这里开始 · START HERE

> 又忘了怎么学这个项目？**只看这一页就够。** 忘了就回来。

## 30 秒 TL;DR

1. 你不是从零学，是**回地图上找当前位置**——项目已从 M0 建到 M14。
2. 学习靠**一个固定循环**：跑起来玩 → 挑一个里程碑 → 读那块代码 → 动手验证 → 做题检验。
3. 今天最省事的动作：`npm run dev` + `npm run diagrams` + `npm run learn`，打闯关游戏找回状态。

---

## 今天就跑这三条（各开一个终端）

```bash
npm run dev          # 起后端服务（http://localhost:8000/ui 可对话）
npm run diagrams     # 起静态站（:9000，托管 docs/ 下的学习站点）
npm run learn        # 打开闯关游戏，从没通的关卡接着打
```

- 对话界面：http://localhost:8000/ui
- 闯关游戏：http://localhost:9000/docs/learn-game/index.html
- 面试题站：http://localhost:9000/docs/interview/index.html
- 架构图：http://localhost:9000/docs/diagrams.html

---

## 学习循环（每次坐下来照着走）

1. **跑起来玩** — 打开 `/ui`，发几条消息（问天气看工具卡片、开个 AI 测试、逛 Skill 商店），先有体感。
2. **挑一个里程碑** — 打开 `LEARNING-PLAN.md`，挑一个想搞懂的（如「M12 断线续传」「M14 HITL」），读它的"要解决什么问题 + 设计思路"。
3. **读那块代码** — 用 `PROJECT-MAP.md` 的"核心文件索引"定位到具体文件，读实现。
4. **动手验证** — 打开 `docs/VERIFICATION.md`，找对应章节跑命令看真实行为；改个参数（如 `top_k`、`HITL_APPROVAL_TIMEOUT`）看变化。
5. **检验理解** — 去闯关游戏打对应关卡 / 做面试题。答不上来就回到第 3 步。

---

## 四样学习工具（各管一件事）

| 工具 | 干什么 |
|------|--------|
| `LEARNING-PLAN.md` | 路线图：每个里程碑"为什么做 + 验收标准" |
| `docs/learn-game/`（闯关游戏） | 边玩边学，10 关 + 7 套面试题（`npm run learn`） |
| `docs/interview/`（面试题站） | 用面试题检验理解 |
| `PROJECT-MAP.md` | 代码地图："某功能在哪个文件" |

专题深挖（`docs/` 下）：`ARCHITECTURE.md`（架构图）、`AI-TESTING.md`、`DATABASE.md`（迁移/双库）、`GAP-ANALYSIS.md`（对标差距）、`VERIFICATION.md`（全功能验证清单）。

---

## 当前进度（截至最近）

**已完成（可读代码 + 验证）：**
- M0–M4 基础：对话 / Tool Calling / MCP / Multi-Agent
- M5 Checkpoint 持久化 + 预算控制 + 鉴权
- M6 Langfuse 可观测 ｜ M7 评测体系 ｜ M8 Skills ｜ M9 RAG
- M11 AI 应用测试（6 类型）
- M12 工具可视化 / 全链路 Trace-ID / 流式断线续传
- M13 多用户鉴权 ｜ M13.5 Postgres + Alembic ｜ M13.6 安全加固 + 启动校验
- M14 HITL 人审闭环 + 内容安全（PII/敏感词）

**草案（先设计未实现）：** M15 限流+配置热更新 ｜ M16 长期记忆+文件链路 ｜ M17 企业基建 ｜ M18 定时任务+MCP双层JSON

> 想继续往前做：优先级最高的是 **M15（请求级限流 + 配置热更新）**。

---

## 迷路时的三个问句

- **"这功能在哪？"** → 查 `PROJECT-MAP.md`
- **"这功能为什么这么设计？"** → 查 `LEARNING-PLAN.md` 对应里程碑
- **"这功能真的能跑吗？"** → 查 `docs/VERIFICATION.md` 对应章节跑命令
