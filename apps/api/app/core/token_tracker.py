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
    estimated: bool = False  # True = 字符估算（API 未返回 usage）


class TokenTracker(BaseCallbackHandler):
    """LangChain Callback Handler，捕获 LLM 返回的 token usage。

    优先用 API 返回的真实 usage（需 stream_usage=True）；
    流式且 API 不返回 usage 时，用字符数估算兜底。
    """

    def __init__(self, model: str = "gpt-4o-mini"):
        super().__init__()
        self.model = model
        self.input_tokens = 0
        self.output_tokens = 0
        self.llm_calls = 0
        self._usage_from_api = False
        # 兜底估算用：累积输入/输出文本
        self._est_input_chars = 0
        self._est_output_chars = 0

    def on_llm_start(self, serialized: Any, prompts: List[str], **kwargs) -> None:
        """记录输入文本长度（估算兜底用）"""
        try:
            for p in prompts or []:
                self._est_input_chars += len(p)
        except Exception:
            pass

    def on_chat_model_start(self, serialized: Any, messages: Any, **kwargs) -> None:
        """chat 模型的输入（估算兜底用）"""
        try:
            for msg_list in messages or []:
                for m in msg_list:
                    content = getattr(m, "content", "")
                    if isinstance(content, str):
                        self._est_input_chars += len(content)
                    elif isinstance(content, list):
                        for part in content:
                            if isinstance(part, dict) and part.get("type") == "text":
                                self._est_input_chars += len(part.get("text", ""))
        except Exception:
            pass

    def on_llm_new_token(self, token: str, **kwargs) -> None:
        """累积输出 token 文本（估算兜底用）"""
        try:
            self._est_output_chars += len(token or "")
        except Exception:
            pass

    def on_llm_end(self, response: Any, **kwargs) -> None:
        """LLM 调用结束时触发，从 response 中提取 token usage。"""
        self.llm_calls += 1
        try:
            # 1) LLMResult.llm_output.token_usage（非流式常见）
            if hasattr(response, "llm_output") and response.llm_output:
                usage = response.llm_output.get("token_usage", {}) or {}
                if usage:
                    self.input_tokens += usage.get("prompt_tokens", 0)
                    self.output_tokens += usage.get("completion_tokens", 0)
                    self._usage_from_api = True

            # 2) generations 里 message 的 usage_metadata（stream_usage=True 时）
            if hasattr(response, "generations") and response.generations:
                for gen_list in response.generations:
                    for gen in gen_list:
                        msg = getattr(gen, "message", None)
                        um = getattr(msg, "usage_metadata", None) if msg else None
                        if um:
                            self.input_tokens += um.get("input_tokens", 0)
                            self.output_tokens += um.get("output_tokens", 0)
                            self._usage_from_api = True
                        else:
                            info = getattr(gen, "generation_info", {}) or {}
                            usage = info.get("usage", {}) or info.get("token_usage", {})
                            if usage:
                                self.input_tokens += usage.get("prompt_tokens", 0) or usage.get("input_tokens", 0)
                                self.output_tokens += usage.get("completion_tokens", 0) or usage.get("output_tokens", 0)
                                self._usage_from_api = True
        except Exception:
            pass  # 统计失败不影响功能

    def get_stats(self) -> TokenStats:
        """获取统计结果（API 无 usage 时用字符估算兜底）"""
        input_tokens = self.input_tokens
        output_tokens = self.output_tokens
        estimated = False
        if not self._usage_from_api and (self._est_input_chars or self._est_output_chars):
            input_tokens = _estimate_tokens_from_chars(self._est_input_chars)
            output_tokens = _estimate_tokens_from_chars(self._est_output_chars)
            estimated = True

        total = input_tokens + output_tokens
        prices = PRICE_TABLE.get(self.model, PRICE_TABLE["default"])
        cost = (input_tokens * prices["input"] + output_tokens * prices["output"]) / 1_000_000

        return TokenStats(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total,
            model=self.model,
            cost_usd=round(cost, 6),
            llm_calls=self.llm_calls,
            estimated=estimated,
        )


def _estimate_tokens_from_chars(chars: int) -> int:
    """按字符数粗估 token（混合中英文，约 1.7 字符/token）"""
    if chars <= 0:
        return 0
    return max(1, int(chars / 1.7))


def format_token_stats(stats: TokenStats) -> dict:
    """格式化为前端可展示的 dict"""
    suffix = "（估算）" if stats.estimated else ""
    return {
        "input_tokens": stats.input_tokens,
        "output_tokens": stats.output_tokens,
        "total_tokens": stats.total_tokens,
        "model": stats.model,
        "cost_usd": stats.cost_usd,
        "cost_display": (f"${stats.cost_usd:.4f}{suffix}" if stats.cost_usd > 0 else "~$0"),
        "llm_calls": stats.llm_calls,
        "estimated": stats.estimated,
    }
