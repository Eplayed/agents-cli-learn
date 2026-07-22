"""
M19 本地编码 Agent 工具测试（学习版）

重点验证：工作区限定（越权拒绝）+ 读写/替换/搜索/命令 + HITL 名单包含写/跑命令工具。
"""
import pytest


@pytest.fixture(autouse=True)
def _workspace(tmp_path, monkeypatch):
    """把编码工作区指到临时目录，隔离测试。"""
    from app.core.config import settings
    monkeypatch.setattr(settings, "CODE_AGENT_WORKSPACE", str(tmp_path))
    return tmp_path


def test_write_then_read_roundtrip():
    from app.core.coding_tools import write_file, read_file
    r = write_file.invoke({"path": "hello.py", "content": "print('hi')\n"})
    assert "已写入" in r
    out = read_file.invoke({"path": "hello.py"})
    assert "print('hi')" in out


def test_path_escape_rejected():
    from app.core.coding_tools import read_file, write_file
    r1 = read_file.invoke({"path": "../../etc/passwd"})
    assert r1.startswith("Error") and "越权" in r1
    r2 = write_file.invoke({"path": "/etc/evil.txt", "content": "x"})
    assert r2.startswith("Error") and "越权" in r2


def test_read_missing_file():
    from app.core.coding_tools import read_file
    assert read_file.invoke({"path": "nope.txt"}).startswith("Error")


def test_str_replace_success_and_edge_cases():
    from app.core.coding_tools import write_file, str_replace_in_file, read_file
    write_file.invoke({"path": "a.txt", "content": "foo bar baz"})
    # 正常替换
    r = str_replace_in_file.invoke({"path": "a.txt", "old": "bar", "new": "QUX"})
    assert "已替换" in r
    assert "QUX" in read_file.invoke({"path": "a.txt"})
    # 找不到
    assert str_replace_in_file.invoke({"path": "a.txt", "old": "zzz", "new": "y"}).startswith("Error")
    # 多次出现
    write_file.invoke({"path": "b.txt", "content": "x x x"})
    assert "出现了" in str_replace_in_file.invoke({"path": "b.txt", "old": "x", "new": "y"})


def test_list_dir_and_grep():
    from app.core.coding_tools import write_file, list_dir, grep_files
    write_file.invoke({"path": "src/main.py", "content": "def run():\n    return 42\n"})
    listing = list_dir.invoke({"path": "."})
    assert "src" in listing
    hits = grep_files.invoke({"pattern": "return 42", "path": "."})
    assert "main.py" in hits and "return 42" in hits


def test_run_bash_confined_to_workspace(_workspace):
    from app.core.coding_tools import run_bash
    out = run_bash.invoke({"command": "echo hello && pwd"})
    assert "hello" in out
    assert "exit code: 0" in out
    # pwd 应在工作区内
    assert str(_workspace) in out


def test_get_coding_tools():
    from app.core.coding_tools import get_coding_tools
    names = {t.name for t in get_coding_tools()}
    assert names == {"read_file", "write_file", "str_replace_in_file", "list_dir", "grep_files", "run_bash"}


def test_write_and_bash_tools_under_hitl():
    """写文件/跑命令默认在 HITL 审批名单，apply_hitl 应包装它们"""
    from app.core.hitl import hitl_tool_names, apply_hitl
    from app.core.coding_tools import get_coding_tools
    names = hitl_tool_names()
    assert {"write_file", "str_replace_in_file", "run_bash"} <= names
    assert "read_file" not in names  # 只读工具不需审批

    tools = get_coding_tools()
    wrapped = apply_hitl(tools)
    by_name = {t.name: t for t in wrapped}
    # read_file 未被包装（原对象），write_file 被替换成包装版
    orig = {t.name: t for t in tools}
    assert by_name["read_file"] is orig["read_file"]
    assert by_name["write_file"] is not orig["write_file"]


def test_code_agent_registered():
    import app.agents.catalog  # noqa: F401 触发注册
    from app.agents.registry import list_agents
    keys = {a["key"] for a in list_agents()}
    assert "code-agent" in keys
