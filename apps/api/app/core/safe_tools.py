"""
工具安全工具（M13.6 安全加固）

集中两处此前的安全隐患修复，供内嵌工具与 MCP Server 共用：
1. safe_eval_math：用 AST 白名单求值替代 eval()，防任意代码执行 + 幂运算 DoS
2. secure_ssl_context：校验证书的 HTTPS context，替代 ssl._create_unverified_context()
"""
import ast
import operator
import ssl

# 只允许这些二元/一元运算，显式不含 ast.Pow（** 可被用来算 9**9**9 打满 CPU）
_BINOPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Mod: operator.mod,
    ast.FloorDiv: operator.floordiv,
}
_UNARY = {ast.UAdd: operator.pos, ast.USub: operator.neg}


def safe_eval_math(expr: str) -> float:
    """安全求值一个纯算术表达式（加减乘除、取模、整除、括号、正负号）。

    用 AST 遍历白名单，禁用变量/函数调用/属性/幂运算等一切可被滥用的节点。
    非法表达式抛 ValueError，除零抛 ZeroDivisionError（由调用方兜底）。
    """
    tree = ast.parse(expr, mode="eval")

    def _ev(node):
        if isinstance(node, ast.Constant):
            # 只接受数字，拒绝 bool/str/None 等
            if isinstance(node.value, bool) or not isinstance(node.value, (int, float)):
                raise ValueError("only numeric literals allowed")
            return node.value
        if isinstance(node, ast.BinOp) and type(node.op) in _BINOPS:
            return _BINOPS[type(node.op)](_ev(node.left), _ev(node.right))
        if isinstance(node, ast.UnaryOp) and type(node.op) in _UNARY:
            return _UNARY[type(node.op)](_ev(node.operand))
        raise ValueError(f"unsupported expression node: {type(node).__name__}")

    return _ev(tree.body)


def secure_ssl_context() -> ssl.SSLContext:
    """返回会校验服务端证书的 HTTPS SSLContext。

    优先用 certifi 的 CA 包（跨平台稳定），没有则用系统默认信任库。
    替代 ssl._create_unverified_context()（后者关闭校验，易受中间人攻击）。
    """
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()
