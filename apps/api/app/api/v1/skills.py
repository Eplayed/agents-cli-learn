"""
Skills Store API — Skill 商店 + 管理

端点：
- GET  /api/v1/skills/installed     — 已安装列表
- GET  /api/v1/skills/marketplace   — 商店浏览（内置 + 社区）
- POST /api/v1/skills/install       — 安装 Skill
- POST /api/v1/skills/{id}/toggle   — 启用/禁用
- DELETE /api/v1/skills/{id}        — 卸载
- GET  /api/v1/skills/local         — 本地 skills/ 目录的 Skill（只读）
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.models import InstalledSkill

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
    source: str = "marketplace"
    source_url: Optional[str] = None


class SkillResponse(BaseModel):
    id: str
    name: str
    display_name: Optional[str]
    description: Optional[str]
    version: str
    author: Optional[str]
    category: Optional[str]
    icon: Optional[str]
    triggers: Optional[list]
    enabled: int
    source: str
    source_url: Optional[str]
    installed_at: Optional[str]

    class Config:
        from_attributes = True


# ===== 已安装 =====

@router.get("/installed")
async def list_installed(db: AsyncSession = Depends(get_db)):
    """列出所有已安装的 Skill"""
    stmt = select(InstalledSkill).order_by(InstalledSkill.installed_at.desc())
    result = await db.execute(stmt)
    skills = result.scalars().all()
    return {
        "skills": [
            {
                "id": s.id,
                "name": s.name,
                "display_name": s.display_name or s.name,
                "description": s.description,
                "version": s.version,
                "author": s.author,
                "category": s.category,
                "icon": s.icon or "🔧",
                "triggers": s.triggers or [],
                "enabled": s.enabled,
                "source": s.source,
                "source_url": s.source_url,
                "installed_at": str(s.installed_at) if s.installed_at else None,
            }
            for s in skills
        ],
        "count": len(skills),
    }


# ===== 本地 Skills（只读，来自 skills/ 目录）=====

@router.get("/local")
async def list_local():
    """列出本地 skills/ 目录中的 Skill（只读展示）"""
    from app.core.skills import load_skills
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
                "enabled": 1,  # 本地 Skill 始终启用
            }
            for s in local_skills
        ],
        "count": len(local_skills),
    }


# ===== 商店浏览 =====

@router.get("/marketplace")
async def browse_marketplace(
    category: Optional[str] = None,
    q: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """浏览 Skill 商店（内置预设 + 已安装状态标记）"""
    from app.api.v1.skill_marketplace import MARKETPLACE_SKILLS

    # 获取已安装的 skill name 集合
    stmt = select(InstalledSkill.name)
    result = await db.execute(stmt)
    installed_names = set(row[0] for row in result.all())

    # 过滤
    skills = MARKETPLACE_SKILLS
    if category:
        skills = [s for s in skills if s.get("category") == category]
    if q:
        q_lower = q.lower()
        skills = [
            s for s in skills
            if q_lower in s.get("name", "").lower()
            or q_lower in s.get("description", "").lower()
            or q_lower in " ".join(s.get("triggers", [])).lower()
        ]

    # 标记安装状态
    for s in skills:
        s["installed"] = s["name"] in installed_names

    return {
        "skills": skills,
        "count": len(skills),
        "categories": list(set(s.get("category", "other") for s in MARKETPLACE_SKILLS)),
    }


# ===== 安装 =====

@router.post("/install")
async def install_skill(req: SkillInstallRequest, db: AsyncSession = Depends(get_db)):
    """安装一个 Skill 到本地数据库"""
    # 检查是否已安装
    stmt = select(InstalledSkill).where(InstalledSkill.name == req.name)
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail=f"Skill '{req.name}' already installed")

    skill = InstalledSkill(
        name=req.name,
        display_name=req.display_name or req.name,
        description=req.description,
        version=req.version,
        author=req.author,
        category=req.category,
        icon=req.icon,
        triggers=req.triggers,
        content=req.content,
        source=req.source,
        source_url=req.source_url,
        enabled=1,
    )
    db.add(skill)
    await db.commit()
    await db.refresh(skill)

    return {"status": "installed", "id": skill.id, "name": skill.name}


# ===== 启用/禁用 =====

@router.post("/{skill_id}/toggle")
async def toggle_skill(skill_id: str, db: AsyncSession = Depends(get_db)):
    """切换 Skill 启用/禁用状态"""
    stmt = select(InstalledSkill).where(InstalledSkill.id == skill_id)
    result = await db.execute(stmt)
    skill = result.scalar_one_or_none()
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    skill.enabled = 0 if skill.enabled else 1
    await db.commit()

    return {"status": "toggled", "id": skill.id, "name": skill.name, "enabled": skill.enabled}


# ===== 卸载 =====

@router.delete("/{skill_id}")
async def uninstall_skill(skill_id: str, db: AsyncSession = Depends(get_db)):
    """卸载 Skill（从数据库删除）"""
    stmt = select(InstalledSkill).where(InstalledSkill.id == skill_id)
    result = await db.execute(stmt)
    skill = result.scalar_one_or_none()
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    await db.delete(skill)
    await db.commit()

    return {"status": "uninstalled", "name": skill.name}


# ===== 在线搜索（AI Skill Store） =====

@router.get("/online-search")
async def online_search(q: str = "", category: Optional[str] = None):
    """从在线仓库搜索 Skill（GitHub Search API）

    搜索 GitHub 上含 SKILL.md 或 agent-skill 关键词的仓库，
    返回标准化结果供前端安装。
    """
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
                    # 从 topics 提取 triggers
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
            else:
                return {"skills": [], "count": 0, "source": "github", "error": f"GitHub API: {resp.status_code}"}
    except Exception as e:
        return {"skills": [], "count": 0, "source": "none", "error": f"搜索失败: {str(e)}"}
