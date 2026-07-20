"""
Weather MCP Server (stdio transport)

把原来内嵌在 agent.py 里的 get_weather 工具，拆成独立的 MCP Server。

为什么这样做？
- 协议化：现在这个工具符合 MCP 标准，任何支持 MCP 的客户端都能用
  （Claude Desktop / Cursor / Codex / 你自己的 LangGraph agent）
- 进程隔离：工具崩了不影响主 API 进程
- 可独立测试：python -m app.mcp_servers.weather_server 单跑

如何独立运行（验证 server 本身能起来）：
    python -m app.mcp_servers.weather_server

如何被 Agent 加载：
    见 app/agents/single/agent.py 里的 MultiServerMCPClient 配置
"""
import json
import ssl
import urllib.parse
import urllib.request

from mcp.server.fastmcp import FastMCP

# FastMCP 是 mcp SDK 提供的"快速 Server 写法"
# - "Weather" 是 server 显示名（在 MCP Host 里看到的名字）
# - 默认 transport 由 .run() 决定（stdio / http / sse）
mcp = FastMCP("Weather")


@mcp.tool(
    annotations={
        "readOnlyHint": True,      # 只读：查天气不修改任何状态
        "openWorldHint": True,     # 调用外部系统：Open-Meteo API
    },
)
def get_weather(city: str) -> str:
    """查询指定城市的实时天气信息（气温、降水概率、风速）。

    适用于需要天气数据来给出出行/洗车/穿衣建议的场景。
    返回包含气温区间、降雨概率、风速和洗车建议的天气摘要字符串。

    Args:
        city: 城市名称，支持中文（如"上海"）或英文（如"Shanghai"）
    """
    # ↑ 这段 docstring 非常重要！
    # MCP 协议会把 docstring 作为工具描述发给 LLM。
    # 写得清楚 LLM 才知道什么时候/怎么调用。

    aliases = {
        "上海": "Shanghai",
        "北京": "Beijing",
        "深圳": "Shenzhen",
        "广州": "Guangzhou",
        "杭州": "Hangzhou",
        "南京": "Nanjing",
        "成都": "Chengdu",
        "重庆": "Chongqing",
    }
    name = aliases.get(city.strip(), city.strip())

    def _get_json(url: str) -> dict:
        # 校验证书的 HTTPS context（不再用 _create_unverified_context，防中间人攻击）
        from app.core.safe_tools import secure_ssl_context
        ctx = secure_ssl_context()
        req = urllib.request.Request(url, headers={"User-Agent": "noah-agent-cli-learn/1.0"})
        with urllib.request.urlopen(req, timeout=12, context=ctx) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
        return json.loads(raw)

    try:
        # 1) 城市名 → 经纬度（geocoding）
        geo_url = (
            "https://geocoding-api.open-meteo.com/v1/search?"
            + urllib.parse.urlencode({"name": name, "count": 1, "language": "zh", "format": "json"})
        )
        geo = _get_json(geo_url)
        results = geo.get("results") or []
        if not results:
            return f"未找到城市：{city}"

        r0 = results[0]
        lat, lon = r0.get("latitude"), r0.get("longitude")
        resolved = r0.get("name") or name
        tz = r0.get("timezone") or "Asia/Shanghai"

        # 2) 经纬度 → 天气预报
        forecast_url = (
            "https://api.open-meteo.com/v1/forecast?"
            + urllib.parse.urlencode({
                "latitude": lat,
                "longitude": lon,
                "current_weather": "true",
                "daily": "temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,windspeed_10m_max",
                "timezone": tz,
            })
        )
        fc = _get_json(forecast_url)
        daily = fc.get("daily") or {}

        def _pick(field: str):
            arr = daily.get(field) or []
            return arr[0] if arr else None

        tmax = _pick("temperature_2m_max")
        tmin = _pick("temperature_2m_min")
        pprob = _pick("precipitation_probability_max")
        psum = _pick("precipitation_sum")
        wmax = _pick("windspeed_10m_max")

        # 3) 生成洗车建议（业务规则）
        advice = []
        if pprob is not None:
            if float(pprob) <= 30:
                advice.append("降雨概率较低，通常适合洗车")
            elif float(pprob) <= 60:
                advice.append("降雨概率中等，建议观望或选择室内洗车")
            else:
                advice.append("降雨概率较高，不建议洗车")
        if wmax is not None and float(wmax) >= 10:
            advice.append("风较大，洗车后更容易落灰/留水痕")
        if psum is not None and float(psum) > 0:
            advice.append("预计有降水，洗车性价比偏低")

        parts = [
            f"{resolved} 今日天气（Open-Meteo）：",
            f"- 气温：{tmin}°C ~ {tmax}°C" if (tmin is not None or tmax is not None) else "- 气温：未知",
            f"- 降雨概率（最高）：{pprob}%" if pprob is not None else "- 降雨概率：未知",
            f"- 预计降水量：{psum}mm" if psum is not None else "- 预计降水量：未知",
            f"- 最大风速：{wmax}m/s" if wmax is not None else "- 最大风速：未知",
        ]
        parts.append("洗车建议：" + ("；".join(advice) if advice else "信息不足"))
        return "\n".join(parts)
    except Exception as e:
        return f"天气查询失败：{e}（city={city}）"


if __name__ == "__main__":
    # transport="stdio" 是 MCP 最常见的本地传输方式：
    # - 主进程通过 stdin/stdout 和 server 进程通信
    # - 启动开销小，适合一对一、单机场景
    # 后续如果要远程部署，改成 transport="http" 即可
    mcp.run(transport="stdio")
