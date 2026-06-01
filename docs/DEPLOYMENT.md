# GitHub Pages 部署指南

> 本项目的 **学习游戏 / 架构图查看器 / 文档门户** 都是纯静态资源，
> 可以零成本通过 GitHub Pages 公开访问。
> 后端 FastAPI 服务 **不部署到 Pages**（Pages 只支持静态站）。

---

## 部署架构

```
GitHub Pages 上：
  https://eplayed.github.io/agents-cli-learn/
    ├── 门户首页（docs/index.html）
    ├── 学习游戏（docs/learn-game/）
    └── 架构图查看器（docs/diagrams.html）

本地开发用：
  apps/api/  ← 后端服务（自己电脑运行，不上 Pages）
```

后端只对自己/团队开放，不通过 Pages 暴露 OpenAI API Key。

---

## 配置（一次性）

### 1. 仓库已有的关键文件（不要删）

| 文件 | 作用 |
|---|---|
| `docs/index.html` | Pages 默认入口 |
| `docs/.nojekyll` | **关键**：禁用 Jekyll，否则下划线开头的文件（如 `_layout.js`）会 404 |
| `docs/learn-game/index.html` | 学习游戏入口 |

### 2. 在 GitHub 仓库启用 Pages

1. 打开 `https://github.com/Eplayed/agents-cli-learn/settings/pages`
2. **Source**：Deploy from a branch
3. **Branch**：`main`，目录选 `/docs`
4. 点 **Save**
5. 等 1-2 分钟，Pages 会构建。完成后顶部会出现 `Your site is live at https://eplayed.github.io/agents-cli-learn/`

### 3. 验证

访问下面 3 个 URL，应该都能打开：
- `https://eplayed.github.io/agents-cli-learn/` — 门户首页
- `https://eplayed.github.io/agents-cli-learn/learn-game/` — 学习游戏
- `https://eplayed.github.io/agents-cli-learn/diagrams.html` — 架构图

---

## 后续更新流程

每次改了 `docs/` 下的文件后：

```bash
git add docs/
git commit -m "docs: update something"
git push
```

push 后约 30-60 秒，Pages 会自动重新构建。可以在仓库的 **Actions** 标签页看到 "pages build and deployment" 进度。

---

## 常见问题

### Q: 访问 `/learn-game/` 显示 404
**A**：检查 `docs/.nojekyll` 是否存在。Jekyll 会忽略 `_` 开头的文件，导致下划线开头的 JS 模块 404。

### Q: 学习游戏白屏
**A**：F12 看 Console。常见原因：
- 浏览器开了缓存。Cmd+Shift+R 硬刷新
- ES Module 路径错。Pages 的子路径是 `/agents-cli-learn/learn-game/`，所有相对路径（`./css/...` `./js/...`）必须正确

### Q: 别人能看到我的 OpenAI Key 吗？
**A**：**不会**。Pages 上只有静态文件（HTML/CSS/JS）。后端 `apps/api/` 完全不上传到 Pages。
但要注意：`.env.dev` / `.env` 已在 `.gitignore` 里，**绝对不能 commit**。

### Q: 我想绑自定义域名
**A**：在仓库 Settings → Pages → Custom domain 填域名，并按提示在 DNS 加 CNAME 记录。
然后会自动在 `docs/` 生成 `CNAME` 文件（保留它，别删）。

---

## 安全检查清单（push 前）

- [ ] `.gitignore` 里有 `.env*`
- [ ] `git status` 看不到 `.env.dev` 这种文件
- [ ] 静态站里没硬编码 `OPENAI_API_KEY`、内网 URL 等敏感信息
- [ ] `apps/api/app/core/config.py` 的默认值不含真实 key
