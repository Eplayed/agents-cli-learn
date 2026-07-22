"""
本地编码 Agent 工具（M19 学习版）

给 Agent 一套"在指定工作区里读改文件、跑命令"的工具，用来理解 AI Coding
（Claude Code / Cursor）的骨架。**学习版，不做生产级沙箱。**

核心安全概念（也是本里程碑最值得学的点）：
1. **工作区限定**：所有路径都被约束在 CODE_AGENT_WORKSPACE 内，`../`、绝对路径
   逃逸一律拒绝（防越权读写系统文件）。
2. **写/跑命令走 HITL 审批**：write_file / str_replace_in_file / run_bash 默认在
   HITL_APPROVAL_TOOLS 名单里，执行前弹人审卡片（复用 M14）——这就是"HARD-GATE"。
3. **bash 限定 cwd + 超时**：命令只在工作区跑，超时强杀。

⚠️ 仅适合本地单用户自己跑；多用户/对外暴露需要真正的容器沙箱（见 DeerFlow）。
"""
import subprocess
from pathlib import Path

from langchain_core.tools import BaseTool, tool

from app.core.config import settings

_MAX_READ = 20000   # 单文件读取上限（字符）
_MAX_OUTPUT = 8000  # 命令/检索输出上限（字符）


def _workspace() -> Path:
    ws = Path(getattr(settings, "CODE_AGENT_WORKSPACE", "./code_workspace")).resolve()
    ws.mkdir(parents=True, exist_ok=True)
    return ws


def _resolve(path: str) -> Path:
    """把相对路径解析到工作区内；逃逸工作区则抛 ValueError。"""
    ws = _workspace()
    p = (ws / (path or ".")).resolve()
    if p != ws and ws not in p.parents:
        raise ValueError(f"路径越权：{path} 超出工作区范围")
    return p


@tool
def read_file(path: str) -> str:
    """读取工作区内某个文件的内容。path 是相对工作区的路径。"""
    try:
        p = _resolve(path)
        if not p.is_file():
            return f"Error: 文件不存在：{path}"
        text = p.read_text(encoding="utf-8", errors="replace")
        return text[:_MAX_READ] + ("\n...(已截断)" if len(text) > _MAX_READ else "")
    except ValueError as e:
        return f"Error: {e}"
    except Exception as e:
        return f"Error: 读取失败：{e}"


@tool
def write_file(path: str, content: str) -> str:
    """把内容写入工作区内的文件（覆盖）。会自动创建父目录。"""
    try:
        p = _resolve(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
        return f"已写入 {len(content)} 字符到 {path}"
    except ValueError as e:
        return f"Error: {e}"
    except Exception as e:
        return f"Error: 写入失败：{e}"


@tool
def str_replace_in_file(path: str, old: str, new: str) -> str:
    """把工作区文件里的 old 子串替换成 new（old 必须唯一出现一次）。"""
    try:
        p = _resolve(path)
        if not p.is_file():
            return f"Error: 文件不存在：{path}"
        text = p.read_text(encoding="utf-8", errors="replace")
        count = text.count(old)
        if count == 0:
            return f"Error: 未找到要替换的内容"
        if count > 1:
            return f"Error: old 出现了 {count} 次，请提供更多上下文使其唯一"
        p.write_text(text.replace(old, new, 1), encoding="utf-8")
        return f"已替换 {path} 中的 1 处"
    except ValueError as e:
        return f"Error: {e}"
    except Exception as e:
        return f"Error: 替换失败：{e}"


@tool
def list_dir(path: str = ".") -> str:
    """列出工作区内某个目录的文件和子目录。"""
    try:
        p = _resolve(path)
        if not p.is_dir():
            return f"Error: 目录不存在：{path}"
        entries = sorted(p.iterdir(), key=lambda x: (x.is_file(), x.name))
        lines = [f"{'📁' if e.is_dir() else '📄'} {e.name}" for e in entries]
        return "\n".join(lines) if lines else "(空目录)"
    except ValueError as e:
        return f"Error: {e}"
    except Exception as e:
        return f"Error: {e}"


@tool
def grep_files(pattern: str, path: str = ".") -> str:
    """在工作区内按纯文本搜索包含 pattern 的行（返回 文件:行号: 内容）。"""
    try:
        base = _resolve(path)
    except ValueError as e:
        return f"Error: {e}"
    ws = _workspace()
    hits = []
    files = [base] if base.is_file() else base.rglob("*")
    for f in files:
        if not f.is_file():
            continue
        try:
            for i, line in enumerate(f.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
                if pattern in line:
                    hits.append(f"{f.relative_to(ws)}:{i}: {line.strip()[:200]}")
                    if len("\n".join(hits)) > _MAX_OUTPUT:
                        hits.append("...(结果过多，已截断)")
                        return "\n".join(hits)
        except Exception:
            continue
    return "\n".join(hits) if hits else "(未找到匹配)"


@tool
def run_bash(command: str) -> str:
    """在工作区目录里执行一条 shell 命令（用于跑 build/test/git 等）。有超时保护。"""
    try:
        ws = _workspace()
        timeout = getattr(settings, "CODE_AGENT_BASH_TIMEOUT", 30)
        result = subprocess.run(
            command, shell=True, cwd=str(ws),
            capture_output=True, text=True, timeout=timeout,
        )
        out = (result.stdout or "") + (("\n[stderr]\n" + result.stderr) if result.stderr else "")
        out = out or "(无输出)"
        tail = f"\n[exit code: {result.returncode}]"
        return out[:_MAX_OUTPUT] + ("\n...(已截断)" if len(out) > _MAX_OUTPUT else "") + tail
    except subprocess.TimeoutExpired:
        return f"Error: 命令超时（>{timeout}s）已被终止"
    except Exception as e:
        return f"Error: 执行失败：{e}"


def get_coding_tools() -> list[BaseTool]:
    """返回编码 Agent 的全套工具。"""
    return [read_file, write_file, str_replace_in_file, list_dir, grep_files, run_bash]
