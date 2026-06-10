"""
Agent 评测脚本（M7）

功能：
- 读取 eval/cases.jsonl 中的测试用例
- 对每个用例调用 Agent
- 检查断言（是否调了该调的工具、回答是否包含关键词、长度是否达标）
- 输出通过率 + 失败用例详情

运行方式：
    cd apps/api
    .venv/bin/python -m eval.run_eval

设计原则：
- 不依赖 DeepEval 等外部框架（零额外依赖）
- 可作为 CI 步骤（返回码 0=全通过，1=有失败）
- 每个用例独立（失败不影响其他用例）
"""
import asyncio
import json
import sys
from pathlib import Path
from typing import Any

# 确保能 import app 模块
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.agents.single.agent import SingleAgent, _get_fallback_tools


async def run_agent(message: str) -> dict:
    """运行一次 Agent，收集所有事件"""
    agent = SingleAgent(session_id="eval-session", tools=_get_fallback_tools())
    
    result = {
        "tool_calls": [],
        "tool_results": [],
        "text": "",
        "error": None,
    }
    
    try:
        async for chunk in agent.stream(message):
            if chunk["type"] == "text":
                result["text"] += chunk.get("content", "")
            elif chunk["type"] == "tool_calls":
                tool_name = chunk.get("data", {}).get("name", "")
                if tool_name:
                    result["tool_calls"].append(tool_name)
            elif chunk["type"] == "tool_result":
                result["tool_results"].append(chunk.get("data", {}))
            elif chunk["type"] == "error":
                result["error"] = chunk.get("content", "")
    except Exception as e:
        result["error"] = str(e)
    
    return result


def check_assertions(result: dict, assertions: dict) -> list[str]:
    """检查断言，返回失败原因列表（空列表 = 全通过）"""
    failures = []
    
    # 必须调用某工具
    if "must_call_tool" in assertions:
        expected_tool = assertions["must_call_tool"]
        called = [t for t in result["tool_calls"] if expected_tool in t]
        if not called:
            failures.append(f"应调用 {expected_tool}，实际调了 {result['tool_calls'] or '无'}")
    
    # 禁止调用工具
    if assertions.get("must_not_call_tool"):
        if result["tool_calls"]:
            failures.append(f"不应调用工具，但调了 {result['tool_calls']}")
    
    # 回答必须包含关键词
    if "must_contain" in assertions:
        for keyword in assertions["must_contain"]:
            if keyword not in result["text"]:
                failures.append(f"回答中缺少关键词: {keyword}")
    
    # 最小长度
    if "min_length" in assertions:
        if len(result["text"]) < assertions["min_length"]:
            failures.append(f"回答太短: {len(result['text'])} < {assertions['min_length']}")
    
    # 有错误
    if result["error"]:
        failures.append(f"执行出错: {result['error']}")
    
    return failures


async def main():
    cases_file = Path(__file__).parent / "cases.jsonl"
    if not cases_file.exists():
        print("❌ 找不到 eval/cases.jsonl")
        sys.exit(1)
    
    cases = [json.loads(line) for line in cases_file.read_text().strip().split("\n") if line.strip()]
    
    print(f"📋 加载了 {len(cases)} 个评测用例")
    print("=" * 60)
    
    passed = 0
    failed = 0
    failures_detail = []
    
    for case in cases:
        case_id = case["id"]
        message = case["input"]
        assertions = case["assertions"]
        tags = case.get("tags", [])
        
        print(f"\n▶ [{case_id}] {message}")
        
        try:
            result = await run_agent(message)
            failures = check_assertions(result, assertions)
            
            if not failures:
                print(f"  ✅ PASS (tools: {result['tool_calls']}, len: {len(result['text'])})")
                passed += 1
            else:
                print(f"  ❌ FAIL:")
                for f in failures:
                    print(f"     - {f}")
                failed += 1
                failures_detail.append({
                    "id": case_id,
                    "input": message,
                    "tags": tags,
                    "failures": failures,
                    "actual_text": result["text"][:100],
                })
        except Exception as e:
            print(f"  💥 ERROR: {e}")
            failed += 1
            failures_detail.append({
                "id": case_id,
                "input": message,
                "tags": tags,
                "failures": [f"异常: {e}"],
            })
    
    # 汇总
    total = passed + failed
    rate = (passed / total * 100) if total > 0 else 0
    
    print("\n" + "=" * 60)
    print(f"📊 评测结果：{passed}/{total} 通过 ({rate:.0f}%)")
    
    if failures_detail:
        print(f"\n❌ 失败用例 ({len(failures_detail)}):")
        for f in failures_detail:
            print(f"  [{f['id']}] {f['input']}")
            print(f"    tags: {f['tags']}")
            for reason in f["failures"]:
                print(f"    ✗ {reason}")
    
    # 返回码：0=全通过，1=有失败
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    asyncio.run(main())
