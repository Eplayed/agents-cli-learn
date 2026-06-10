"""
Token 统计追踪器（M10）

记录每次请求的 token 消耗，返回给前端做可视化。

设计：
- 通过 LangChain 的 callback 机制捕获 LLM 返回的 usage 信息
- 每次请求结束后返回统计数据
- 前端显示"本次花了多少 token / 多少钱"

使用方式：
    from app.core.token_tracker import TokenTracker

    tracker = TokenTracker()
    # 传给 LLM 的 callbacks
    response = await llm.ainvoke(messages, config={"callbacks": [tracker]})
    # 获取统计
    stats = tracker.get_stats()
"""
from dataclasses import dataclass, field
from typing import Any, List
from langchain_core.callbacks import BaseCallbackHandler


# Token 价格表（每 1M token 的美元价格，2026 年参考价）
PRICE_TABLE = {
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "gpt-4o": {"input": 2.50, "output": 10.00},
    "gpt-4.1-mini": {"input": 0.40, "output": 1.60},
    "gpt-4.1": {"input": 2.00, "output": 8.00},
    "gpt-3.5-turbo": {"input": 0.50, "output": 1.50},
    # 默认
    "default": {"input": 0.50, "output": 2.00},
}


@dataclass
class TokenStats:
    """一次请求的 token 统计"""
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    model: str = ""
    cost_usd: float = 0.0
    llm_calls: int = 0


class TokenTracker(BaseCallbackHandler):
    """LangChain Callback Handler，捕获 LLM 返回的 token usage。"""

    def __init__(self, model: str = "gpt-4o-mini"):
        super().__init__()
        self.model = model
        self.input_tokens = 0
        self.output_tokens = 0
        self.llm_calls = 0

    def on_llm_end(self, response: Any, **kwargs) -> None:
        """LLM 调用结束时触发，从 response 中提取 token usage。"""
        self.llm_calls += 1
        try:
            # LangChain 的 LLMResult 有 llm_output.token_usage
            if hasattr(response, "llm_output") and response.llm_output:
                usage = response.llm_output.get("token_usage", {})
                self.input_tokens += usage.get("prompt_tokens", 0)
                self.output_tokens += usage.get("completion_tokens", 0)
            # 有些模型通过 generations[0].generation_info 返回
            elif hasattr(response, "generations") and response.generations:
                for gen_list in response.generations:
                    for gen in gen_list:
                        info = getattr(gen, "generation_info", {}) or {}
                        usage = info.get("usage", {}) or info.get("token_usage", {})
                        if usage:
                            self.input_tokens += usage.get("prompt_tokens", 0) or usage.get("input_tokens", 0)
                            self.output_tokens += usage.get("completion_tokens", 0) or usage.get("output_tokens", 0)
        except Exception:
            pass  # 统计失败不影响功能

    def get_stats(self) -> TokenStats:
        """获取统计结果"""
        total = self.input_tokens + self.output_tokens
        prices = PRICE_TABLE.get(self.model, PRICE_TABLE["default"])
        cost = (self.input_tokens * prices["input"] + self.output_tokens * prices["output"]) / 1_000_000

        return TokenStats(
            input_tokens=self.input_tokens,
            output_tokens=self.output_tokens,
            total_tokens=total,
            model=self.model,
            cost_usd=round(cost, 6),
            llm_calls=self.llm_calls,
        )


def format_token_stats(stats: TokenStats) -> dict:
    """格式化为前端可展示的 dict"""
    return {
        "input_tokens": stats.input_tokens,
        "output_tokens": stats.output_tokens,
        "total_tokens": stats.total_tokens,
        "model": stats.model,
        "cost_usd": stats.cost_usd,
        "cost_display": f"${stats.cost_usd:.4f}" if stats.cost_usd > 0 else "统计中...",
        "llm_calls": stats.llm_calls,
    }
