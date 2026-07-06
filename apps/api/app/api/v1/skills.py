"""
Skills Store API — Skill 商店 + 管理（文件夹方式）

Skill 以文件夹形式存储（符合 Anthropic Agent Skills 标准）：
- 内置 Skill：    apps/api/skills/<name>/SKILL.md（git 管理）
- 安装的 Skill：  apps/api/skills/_installed/<name>/SKILL.md（用户通过商店安装）

端点：
- GET  /api/v1/skills/installed     — 已安装列表（读 _installed/ 目录）
- GET  /api/v1/skills/local         — 内置 Skill（只读）
- POST /api/v1/skills/install       — 安装（写 SKILL.md 文件）
- POST /api/v1/skills/{slug}/toggle — 启用/禁用（改 frontmatter）
- DELETE /api/v1/skills/{slug}      — 卸载（删文件夹）
- GET  /api/v1/skills/online-search — GitHub 在线搜索
"""
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.core.skills import (
    load_skills,
    load_installed_skills,
    install_skill_file,
    uninstall_skill_file,
    toggle_skill_file,
    _slugify,
)

router = APIRouter()


# ===== Schemas =====

class SkillInstallRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    display_name: Optional[str] = None
    description: Optional[str] = None
    version: str = "1.0.0"
    author: Optional[str] = None
    category: Optional[str] = None
    icon: Optional[str] = None
    triggers: list[str] = []
    content: str = Field(..., min_length=1)
    source: str = "online"
    source_url: Optional[str] = None


# ===== 已安装（读 skills/_installed/ 目录）=====

@router.get("/installed")
async def list_installed():
    """列出所有已安装的 Skill（含禁用的）"""
    skills = load_installed_skills(include_disabled=True)
    return {
        "skills": [
            {
                "id": _slugify(s.name),           # slug 作为 id，用于 toggle/uninstall
                "name": s.name,
                "display_name": s.name,
                "description": s.description,
                "version": s.version,
                "triggers": s.triggers,
                "icon": "🔧",
                "enabled": 1 if s.enabled else 0,
                "source": "installed",
                "path": s.path,
            }
            for s in skills
        ],
        "count": len(skills),
    }


# ===== 内置 Skills（只读）=====

@router.get("/local")
async def list_local():
    """列出内置 skills/ 目录中的 Skill（只读展示）"""
    local_skills = load_skills()
    return {
        "skills": [
            {
                "name": s.name,
                "display_name": s.name,
                "description": s.description,
                "version": s.version,
                "triggers": s.triggers,
                "source": "local",
                "path": s.path,
                "enabled": 1,
            }
            for s in local_skills
        ],
        "count": len(local_skills),
    }


async def _fetch_github_skill(source_url: str) -> Optional[dict]:
    """从 GitHub 仓库抓取真实的 Skill 内容。

    优先找真正的 SKILL.md（agent-skill 仓库），否则退回 README.md。
    返回 {content, triggers, description}，失败返回 None。
    """
    import re
    import httpx

    m = re.match(r"https?://github\.com/([^/]+)/([^/]+)", source_url or "")
    if not m:
        return None
    owner, repo = m.group(1), m.group(2).replace(".git", "")

    # 候选文件（按优先级）：真正的 SKILL.md 最理想，README 兜底
    candidates = ["SKILL.md", "skill.md", ".claude/SKILL.md", "README.md", "readme.md"]
    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        for path in candidates:
            url = f"https://raw.githubusercontent.com/{owner}/{repo}/HEAD/{path}"
            try:
                resp = await client.get(url)
            except Exception:
                continue
            if resp.status_code != 200 or not resp.text.strip():
                continue

            text = resp.text[:8000]  # 截断，避免超长
            is_skill_md = path.lower().endswith("skill.md")

            # 若是真正的 SKILL.md，解析 frontmatter 拿 triggers/description
            triggers, description = [], None
            if is_skill_md:
                from app.core.skills import _parse_frontmatter
                meta, _ = _parse_frontmatter(text)
                triggers = meta.get("triggers", []) or []
                description = meta.get("description")

            return {"content": text, "triggers": triggers, "description": description, "is_skill_md": is_skill_md}
    return None


# ===== 安装（写文件）=====

@router.post("/install")
async def install_skill(req: SkillInstallRequest):
    """安装一个 Skill —— 写入 skills/_installed/<slug>/SKILL.md

    对于在线（GitHub）来源，安装时会尝试抓取仓库里真正的 SKILL.md / README，
    避免只存一行描述、装了却没实际能力。
    """
    content = req.content
    triggers = req.triggers
    description = req.description or ""

    # 在线来源：抓取真实内容
    if req.source in ("github", "online") and req.source_url:
        fetched = await _fetch_github_skill(req.source_url)
        if fetched:
            content = fetched["content"]
            if fetched["triggers"]:
                triggers = fetched["triggers"]
            if fetched["description"]:
                description = fetched["description"]
            # README 类内容：补一段说明，并用仓库名/topics 作为触发词兜底
            if not fetched["is_skill_md"]:
                content = (
                    f"# {req.display_name or req.name}\n\n"
                    f"> 来源：{req.source_url}\n\n"
                    + content
                )
                if not triggers:
                    triggers = req.triggers or [req.name.replace("-", " ")]

    meta = {
        "name": req.name,
        "description": description,
        "version": req.version,
        "author": req.author,
        "category": req.category,
        "icon": req.icon,
        "source": req.source,
        "source_url": req.source_url,
        "triggers": triggers,
        "enabled": True,
    }
    success, result = install_skill_file(meta, content)
    if not success:
        raise HTTPException(status_code=409, detail=result)
    return {"status": "installed", "id": result, "name": req.name, "content_len": len(content)}


# ===== 启用/禁用（改 frontmatter）=====

@router.post("/{slug}/toggle")
async def toggle_skill(slug: str):
    """切换 Skill 启用/禁用状态"""
    success, new_state = toggle_skill_file(slug)
    if not success:
        raise HTTPException(status_code=404, detail="Skill not found")
    return {"status": "toggled", "id": slug, "enabled": 1 if new_state else 0}


# ===== 卸载（删文件夹）=====

@router.delete("/{slug}")
async def uninstall_skill(slug: str):
    """卸载 Skill —— 删除 skills/_installed/<slug>/ 目录"""
    success = uninstall_skill_file(slug)
    if not success:
        raise HTTPException(status_code=404, detail="Skill not found")
    return {"status": "uninstalled", "id": slug}


# ===== 在线搜索（GitHub Search API）=====

@router.get("/online-search")
async def online_search(q: str = "", category: Optional[str] = None):
    """从 GitHub 搜索含 agent skill 关键词的仓库，返回标准化结果供安装"""
    import httpx

    if not q and not category:
        return {"skills": [], "count": 0, "source": "github"}

    search_query = q or category or "agent"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://api.github.com/search/repositories",
                params={
                    "q": f"{search_query} agent skill",
                    "per_page": "15",
                    "sort": "stars",
                    "order": "desc",
                },
                headers={"Accept": "application/vnd.github.v3+json"},
            )
            if resp.status_code == 200:
                items = resp.json().get("items", [])
                normalized = []
                for repo in items:
                    topics = repo.get("topics", [])
                    normalized.append({
                        "name": repo.get("name", ""),
                        "display_name": repo.get("name", "").replace("-", " ").replace("_", " ").title(),
                        "description": repo.get("description", "") or "No description",
                        "version": "1.0.0",
                        "author": repo.get("owner", {}).get("login", ""),
                        "category": "community",
                        "icon": "🐙",
                        "triggers": topics[:5] if topics else [search_query],
                        "content": f"# {repo.get('name', '')}\n\n{repo.get('description', '')}\n\nSource: {repo.get('html_url', '')}",
                        "source": "github",
                        "source_url": repo.get("html_url", ""),
                        "stars": repo.get("stargazers_count", 0),
                    })
                return {"skills": normalized, "count": len(normalized), "source": "github"}
            return {"skills": [], "count": 0, "source": "github", "error": f"GitHub API: {resp.status_code}"}
    except Exception as e:
        return {"skills": [], "count": 0, "source": "none", "error": f"搜索失败: {str(e)}"}
