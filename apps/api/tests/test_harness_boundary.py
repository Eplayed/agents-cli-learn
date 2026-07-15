"""
架构守护测试：Harness / App 边界检查（M12 P1）

借鉴 bytedance/deer-flow 的 test_harness_boundary.py 思路：
把"可复用的 Agent 核心能力"和"业务路由层"分层，并用一个静态 AST 检查
测试守住这条边界——核心层绝不能反向 import 业务层。

本项目的分层：
- 核心层（harness）：app/agents/**、app/core/**  —— 可复用的 Agent 能力、
  配置、鉴权、追踪、限流等，不应该知道具体的 HTTP 路由长什么样
- 业务层（app）：app/api/**、app/main.py  —— HTTP 路由、请求编排，
  可以自由依赖核心层

规则：核心层不允许 import 业务层（app.api.* / app.main）。
反过来（业务层 import 核心层）是允许且正常的。

为什么用 AST 而不是字符串搜索？
- 避免误伤注释、文档字符串里出现的 "app.api"
- 精确识别 `import x` / `from x import y` 两种语法
"""
import ast
from pathlib import Path

import pytest

# app 包根目录（tests/ 的上一级下的 app/）
APP_ROOT = Path(__file__).resolve().parent.parent / "app"

# 被守护的核心层目录（相对 app/）
CORE_LAYER_DIRS = ["agents", "core"]

# 核心层禁止 import 的业务层模块前缀
FORBIDDEN_PREFIXES = ("app.api", "app.main")


def _iter_core_py_files():
    """遍历核心层所有 .py 文件（跳过 __pycache__）"""
    for sub in CORE_LAYER_DIRS:
        base = APP_ROOT / sub
        if not base.exists():
            continue
        for path in base.rglob("*.py"):
            if "__pycache__" in path.parts:
                continue
            yield path


def _imported_modules(tree: ast.AST):
    """从 AST 中提取所有被 import 的模块全名（import x / from x import y）"""
    modules = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                modules.append(alias.name)
        elif isinstance(node, ast.ImportFrom):
            # 只关心绝对 import（node.level == 0）；相对 import 不跨层，忽略
            if node.module and node.level == 0:
                modules.append(node.module)
    return modules


def test_core_layer_does_not_import_app_layer():
    """核心层（app/agents, app/core）不得 import 业务层（app.api / app.main）"""
    violations = []

    for path in _iter_core_py_files():
        source = path.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=str(path))
        for mod in _imported_modules(tree):
            if mod.startswith(FORBIDDEN_PREFIXES):
                rel = path.relative_to(APP_ROOT.parent)
                violations.append(f"{rel} imports {mod}")

    assert not violations, (
        "核心层出现对业务层的反向依赖，破坏了 Harness/App 边界：\n  "
        + "\n  ".join(violations)
    )


def test_core_layer_has_files_to_check():
    """确保测试确实扫到了文件（防止路径写错导致空跑却'通过'）"""
    files = list(_iter_core_py_files())
    assert len(files) > 0, f"未在 {APP_ROOT} 下的 {CORE_LAYER_DIRS} 扫到任何 .py 文件"
