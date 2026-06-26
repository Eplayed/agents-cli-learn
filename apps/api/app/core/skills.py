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
    enabled: bool = True


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
    """加载内置 Skills（扫描 skills/ 目录顶层，跳过 _ 开头的目录）"""
    if skills_dir is None:
        skills_dir = str(Path(__file__).resolve().parent.parent.parent / "skills")

    skills_path = Path(skills_dir)
    if not skills_path.exists():
        return []

    skills = []
    for skill_dir in sorted(skills_path.iterdir()):
        if not skill_dir.is_dir():
            continue
        if skill_dir.name.startswith("_"):
            continue  # 跳过 _installed 等特殊目录（由 load_installed_skills 处理）
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


def get_installed_dir() -> Path:
    """已安装 Skill 的存放目录：skills/_installed/"""
    return Path(__file__).resolve().parent.parent.parent / "skills" / "_installed"


def load_installed_skills(include_disabled: bool = False) -> List[Skill]:
    """加载从商店安装的 Skill（扫描 skills/_installed/ 目录）

    每个安装的 Skill 是 skills/_installed/<name>/SKILL.md。
    frontmatter 里的 enabled 字段控制是否启用（默认 true）。
    """
    installed_path = get_installed_dir()
    if not installed_path.exists():
        return []

    skills = []
    for skill_dir in sorted(installed_path.iterdir()):
        if not skill_dir.is_dir():
            continue
        skill_file = skill_dir / "SKILL.md"
        if not skill_file.exists():
            continue

        text = skill_file.read_text(encoding='utf-8')
        meta, body = _parse_frontmatter(text)

        enabled = str(meta.get('enabled', 'true')).lower() != 'false'
        if not include_disabled and not enabled:
            continue

        skill = Skill(
            name=meta.get('name', skill_dir.name),
            description=meta.get('description', ''),
            version=meta.get('version', '1.0.0'),
            triggers=meta.get('triggers', []),
            content=body.strip(),
            path=str(skill_file),
        )
        skill.enabled = enabled  # 动态附加属性
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


def load_all_skills() -> List[Skill]:
    """加载所有启用的 Skill（内置 + 已安装），供对话时匹配使用"""
    return load_skills() + load_installed_skills(include_disabled=False)


def skills_to_prompt(skills: List[Skill]) -> str:
    """把匹配到的 Skills 转成 system prompt 追加内容"""
    if not skills:
        return ""

    parts = ["\n\n--- 已激活的 Skills ---"]
    for skill in skills:
        parts.append(f"\n### Skill: {skill.name}\n{skill.content}")
    return "\n".join(parts)


# ============================================================
# Skill 安装管理（文件夹方式，写入 skills/_installed/<name>/SKILL.md）
# ============================================================

import re as _re_slug


def _slugify(name: str) -> str:
    """把 Skill 名转成安全的文件夹名"""
    slug = _re_slug.sub(r'[^a-zA-Z0-9_-]', '-', name.strip().lower())
    slug = _re_slug.sub(r'-+', '-', slug).strip('-')
    return slug or "skill"


def _build_skill_md(meta: dict, content: str) -> str:
    """根据元信息和正文构建 SKILL.md 文本（含 frontmatter）"""
    triggers = meta.get('triggers') or []
    lines = ["---"]
    lines.append(f"name: {meta.get('name', '')}")
    lines.append(f"description: {meta.get('description', '')}")
    lines.append(f"version: {meta.get('version', '1.0.0')}")
    if meta.get('author'):
        lines.append(f"author: {meta['author']}")
    if meta.get('category'):
        lines.append(f"category: {meta['category']}")
    if meta.get('icon'):
        lines.append(f"icon: {meta['icon']}")
    if meta.get('source'):
        lines.append(f"source: {meta['source']}")
    if meta.get('source_url'):
        lines.append(f"source_url: {meta['source_url']}")
    lines.append(f"enabled: {str(meta.get('enabled', True)).lower()}")
    if triggers:
        lines.append("triggers:")
        for t in triggers:
            lines.append(f"  - {t}")
    lines.append("---")
    lines.append("")
    lines.append(content)
    return "\n".join(lines)


def install_skill_file(meta: dict, content: str) -> tuple[bool, str]:
    """安装 Skill：写入 skills/_installed/<slug>/SKILL.md

    返回 (success, message_or_slug)
    """
    slug = _slugify(meta.get('name', ''))
    skill_dir = get_installed_dir() / slug
    if skill_dir.exists():
        return False, f"Skill '{meta.get('name')}' 已安装"

    skill_dir.mkdir(parents=True, exist_ok=True)
    (skill_dir / "SKILL.md").write_text(_build_skill_md(meta, content), encoding='utf-8')
    return True, slug


def uninstall_skill_file(slug: str) -> bool:
    """卸载 Skill：删除 skills/_installed/<slug>/ 目录"""
    import shutil
    skill_dir = get_installed_dir() / slug
    if not skill_dir.exists():
        return False
    shutil.rmtree(skill_dir)
    return True


def toggle_skill_file(slug: str) -> tuple[bool, bool]:
    """切换 Skill 启用状态（改写 frontmatter 的 enabled 字段）

    返回 (success, new_enabled_state)
    """
    skill_file = get_installed_dir() / slug / "SKILL.md"
    if not skill_file.exists():
        return False, False

    text = skill_file.read_text(encoding='utf-8')
    meta, body = _parse_frontmatter(text)
    current = str(meta.get('enabled', 'true')).lower() != 'false'
    new_state = not current
    meta['enabled'] = new_state
    skill_file.write_text(_build_skill_md(meta, body.strip()), encoding='utf-8')
    return True, new_state
