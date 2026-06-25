"""
Skills Loader（M8）

Skills = 可按需加载的"能力包"（参考 Anthropic Agent Skills）。
每个 Skill 是一个文件夹，包含 SKILL.md（定义角色、工作流程、注意事项）。

设计：
- 扫描 skills/ 目录下所有 SKILL.md
- 解析 YAML frontmatter（name / description / triggers）
- 根据用户消息中的关键词，匹配相关 Skill
- 把匹配到的 Skill 内容注入 system prompt

使用方式：
    from app.core.skills import load_skills, match_skills

    all_skills = load_skills()
    matched = match_skills("上海天气适合洗车吗", all_skills)
    # matched 里有 weather-advisor 的 SKILL.md 内容
"""
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import List


@dataclass
class Skill:
    """一个 Skill 的元信息 + 内容"""
    name: str
    description: str
    version: str
    triggers: List[str] = field(default_factory=list)
    content: str = ""  # SKILL.md 的正文（不含 frontmatter）
    path: str = ""


def _parse_frontmatter(text: str) -> tuple[dict, str]:
    """解析 YAML frontmatter（--- 包裹的部分）"""
    match = re.match(r'^---\s*\n(.*?)\n---\s*\n(.*)$', text, re.DOTALL)
    if not match:
        return {}, text

    frontmatter_text = match.group(1)
    body = match.group(2)

    # 简单解析 YAML（不引入 pyyaml 依赖）
    meta = {}
    for line in frontmatter_text.split('\n'):
        line = line.strip()
        if ':' in line:
            key, val = line.split(':', 1)
            key = key.strip()
            val = val.strip()
            if val.startswith('[') or val == '':
                continue  # 跳过列表和空值
            meta[key] = val

    # 解析 triggers 列表
    triggers = []
    in_triggers = False
    for line in frontmatter_text.split('\n'):
        line = line.strip()
        if line.startswith('triggers:'):
            in_triggers = True
            continue
        if in_triggers:
            if line.startswith('- '):
                triggers.append(line[2:].strip())
            else:
                in_triggers = False
    meta['triggers'] = triggers

    return meta, body


def load_skills(skills_dir: str = None) -> List[Skill]:
    """加载所有 Skills（扫描 skills/ 目录）"""
    if skills_dir is None:
        skills_dir = str(Path(__file__).resolve().parent.parent.parent / "skills")

    skills_path = Path(skills_dir)
    if not skills_path.exists():
        return []

    skills = []
    for skill_dir in sorted(skills_path.iterdir()):
        if not skill_dir.is_dir():
            continue
        skill_file = skill_dir / "SKILL.md"
        if not skill_file.exists():
            continue

        text = skill_file.read_text(encoding='utf-8')
        meta, body = _parse_frontmatter(text)

        skill = Skill(
            name=meta.get('name', skill_dir.name),
            description=meta.get('description', ''),
            version=meta.get('version', '1.0.0'),
            triggers=meta.get('triggers', []),
            content=body.strip(),
            path=str(skill_file),
        )
        skills.append(skill)

    return skills


def match_skills(message: str, skills: List[Skill]) -> List[Skill]:
    """根据用户消息匹配相关 Skills（关键词触发）"""
    message_lower = message.lower()
    matched = []
    for skill in skills:
        for trigger in skill.triggers:
            if trigger.lower() in message_lower:
                matched.append(skill)
                break
    return matched


async def load_db_skills() -> List[Skill]:
    """从数据库加载已安装且启用的 Skill（Skill Store）

    与 load_skills() 的本地文件互补：
    - load_skills(): 读 skills/ 目录（始终启用，开发者手动管理）
    - load_db_skills(): 读 DB installed_skills 表（用户通过商店管理）
    """
    try:
        from app.core.database import AsyncSessionLocal
        from app.models.models import InstalledSkill
        from sqlalchemy import select

        async with AsyncSessionLocal() as db:
            stmt = select(InstalledSkill).where(InstalledSkill.enabled == 1)
            result = await db.execute(stmt)
            rows = result.scalars().all()

            return [
                Skill(
                    name=row.name,
                    description=row.description or "",
                    version=row.version or "1.0.0",
                    triggers=row.triggers or [],
                    content=row.content or "",
                    path=f"db://{row.id}",
                )
                for row in rows
            ]
    except Exception as e:
        # DB 不可用时（如测试环境），graceful 降级
        print(f"[Skills] load_db_skills failed (non-blocking): {e}")
        return []


async def load_all_skills() -> List[Skill]:
    """加载所有可用 Skill（本地文件 + 数据库商店）"""
    local = load_skills()
    db_skills = await load_db_skills()
    return local + db_skills


def skills_to_prompt(skills: List[Skill]) -> str:
    """把匹配到的 Skills 转成 system prompt 追加内容"""
    if not skills:
        return ""

    parts = ["\n\n--- 已激活的 Skills ---"]
    for skill in skills:
        parts.append(f"\n### Skill: {skill.name}\n{skill.content}")
    return "\n".join(parts)
