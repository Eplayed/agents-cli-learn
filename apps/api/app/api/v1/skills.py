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


# ===== 安装（写文件）=====

@router.post("/install")
async def install_skill(req: SkillInstallRequest):
    """安装一个 Skill —— 写入 skills/_installed/<slug>/SKILL.md"""
    meta = {
        "name": req.name,
        "description": req.description or "",
        "version": req.version,
        "author": req.author,
        "category": req.category,
        "icon": req.icon,
        "source": req.source,
        "source_url": req.source_url,
        "triggers": req.triggers,
        "enabled": True,
    }
    success, result = install_skill_file(meta, req.content)
    if not success:
        raise HTTPException(status_code=409, detail=result)
    return {"status": "installed", "id": result, "name": req.name}


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
