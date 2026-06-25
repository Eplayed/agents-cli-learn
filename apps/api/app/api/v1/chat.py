"""
Chat API - Single Agent endpoints
"""
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.requests import Request as FastAPIRequest
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.core.database import get_db
from app.core.config import settings
from app.schemas.chat import ChatRequest, ChatResponse
from app.models.models import Session, Message
from app.agents.registry import get_agent, get_default_key, list_agents

router = APIRouter()

# API Key 占位符列表（这些值说明用户还没配置真实 key）
_PLACEHOLDER_KEYS = {"", "sk-your-key", "sk-xxx", "sk-your-api-key-here"}


def _is_api_key_missing() -> bool:
    """检查 API key 是否缺失或为占位符"""
    key = (settings.OPENAI_API_KEY or "").strip()
    return key in _PLACEHOLDER_KEYS


def _config_error_payload() -> dict:
    """生成友好的配置错误信息（供前端渲染为引导卡片）"""
    return {
        "type": "config_error",
        "content": "🔑 API Key 未配置",
        "details": {
            "title": "需要配置 OpenAI API Key",
            "steps": [
                "编辑项目根目录的 .env.dev 文件",
                "设置 OPENAI_API_KEY=sk-your-real-key",
                "保存后重启服务 (npm run dev)",
            ],
            "hint": "国内用户可同时设置 OPENAI_BASE_URL 使用 SiliconFlow/DeepSeek 等代理服务",
            "link": {
                "text": "获取 OpenAI API Key",
                "url": "https://platform.openai.com/api-keys",
            },
        },
    }


def _get_checkpointer_from_request(raw_request):
    """从 FastAPI Request 获取 lifespan 注入的 checkpointer"""
    try:
        return raw_request.app.state.checkpointer
    except AttributeError:
        return None


def _resolve_agent(request, raw_request, session_id):
    """解析并创建 Agent 实例，无效 key 抛 400"""
    agent_key = request.agent_key or get_default_key()
    available = [a["key"] for a in list_agents()]
    if agent_key not in available:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid agent_key: '{agent_key}'. Available: {available}",
        )
    return get_agent(agent_key, session_id=session_id, model=request.model, checkpointer=_get_checkpointer_from_request(raw_request))


async def get_or_create_session(session_id: str | None, db: AsyncSession):
    # session_id 由前端传入：
    # - 有值：尝试复用已有会话（便于“继续上次对话”）
    # - 无值/找不到：创建新会话
    if session_id:
        from sqlalchemy import select
        stmt = select(Session).where(Session.id == session_id)
        result = await db.execute(stmt)
        sess = result.scalar_one_or_none()
        if sess:
            return sess, False

    new_session = Session(name=f"Session {datetime.now().strftime('%m/%d %H:%M')}", mode="single")
    db.add(new_session)
    await db.commit()
    await db.refresh(new_session)
    return new_session, True


@router.post("/send")
async def chat_send(request: ChatRequest, raw_request: FastAPIRequest, db: AsyncSession = Depends(get_db)):
    # 非流式：等模型完全生成完，返回一次性 JSON（适合简单前端/调试）
    if _is_api_key_missing():
        raise HTTPException(status_code=400, detail=_config_error_payload())

    session, _ = await get_or_create_session(request.session_id, db)

    # 先把 user 消息落库：这样就算中途模型报错，也能在 DB 里看到“用户问了什么”
    user_msg = Message(session_id=session.id, role="user", content=request.message)
    db.add(user_msg)
    await db.commit()

    agent = _resolve_agent(request, raw_request, session.id)
    full_response = ""
    async for chunk in agent.stream(request.message, images=request.images):
        if chunk["type"] == "text":
            full_response += chunk.get("content", "")

    # 再把 assistant 完整回答落库，并更新会话统计
    agent_msg = Message(session_id=session.id, role="assistant", content=full_response)
    db.add(agent_msg)
    session.message_count += 2
    session.updated_at = datetime.utcnow()
    await db.commit()

    return ChatResponse(session_id=session.id, message_id=agent_msg.id, content=full_response, created_at=agent_msg.created_at)


@router.post("/stream")
async def chat_stream(request: ChatRequest, raw_request: FastAPIRequest, db: AsyncSession = Depends(get_db)):
    # SSE 流式：以 text/event-stream 连续推送事件
    # 注意：某些 Electron/内嵌浏览器环境用 fetch 读 SSE 可能出现 net::ERR_ABORTED
    # 若遇到该问题，建议前端改用 /stream_ndjson（更通用）
    session, _ = await get_or_create_session(request.session_id, db)

    user_msg = Message(session_id=session.id, role="user", content=request.message)
    db.add(user_msg)
    await db.commit()

    if _is_api_key_missing():
        async def event_generator():
            yield {
                "event": "message",
                "data": json.dumps(_config_error_payload()),
            }
            yield {"event": "message", "data": json.dumps({"type": "done", "content": ""})}

        return EventSourceResponse(event_generator())

    agent = _resolve_agent(request, raw_request, session.id)

    async def event_generator():
        full_response = ""
        sid = session.id
        try:
            async for chunk in agent.stream(request.message, images=request.images):
                if chunk["type"] == "done":
                    break
                if chunk["type"] == "text":
                    full_response += chunk.get("content", "")
                yield {"event": "message", "data": json.dumps(chunk)}
            
            # 流式结束后再写入 assistant 完整回答：
            # - 流式阶段持续时间可能较长
            # - 使用单独的 inner_db 避免生成器生命周期与请求依赖的 db session 绑定过深
            from app.core.database import AsyncSessionLocal
            async with AsyncSessionLocal() as inner_db:
                agent_msg = Message(session_id=sid, role="assistant", content=full_response)
                inner_db.add(agent_msg)
                stmt = select(Session).where(Session.id == sid)
                result = await inner_db.execute(stmt)
                sess = result.scalar_one()
                sess.message_count += 2
                sess.updated_at = datetime.utcnow()
                await inner_db.commit()
            yield {"event": "message", "data": json.dumps({"type": "done", "content": ""})}
        except Exception as e:
            yield {"event": "message", "data": json.dumps({"type": "error", "content": str(e)})}
            yield {"event": "message", "data": json.dumps({"type": "done", "content": ""})}

    return EventSourceResponse(event_generator())


@router.get("/stream")
async def chat_stream_get(message: str, raw_request: FastAPIRequest, session_id: str | None = None, db: AsyncSession = Depends(get_db)):
    return await chat_stream(ChatRequest(message=message, session_id=session_id, stream=True), raw_request, db)


@router.post("/stream_ndjson")
async def chat_stream_ndjson(request: ChatRequest, raw_request: FastAPIRequest, db: AsyncSession = Depends(get_db)):
    # NDJSON 流式：每一行是一个 JSON（application/x-ndjson）
    # 适配性更强，前端可以用 fetch + ReadableStream 按行解析

    # --- 幂等性检查：重复 key 直接返回上次结果 ---
    if request.idempotency_key:
        from app.core.run_tracker import RunTracker
        tracker = RunTracker(db)
        existing_run = await tracker.get_by_idempotency_key(request.idempotency_key)
        if existing_run and existing_run.status == "completed":
            # 找到已完成的 run，回放其事件流
            async def replay():
                for evt in existing_run.events:
                    yield (json.dumps({"type": evt.event_type, "data": evt.event_data}) + "\n").encode("utf-8")
                yield (json.dumps({"type": "done", "content": "", "run_id": existing_run.id, "deduplicated": True}) + "\n").encode("utf-8")
            return StreamingResponse(
                replay(),
                media_type="application/x-ndjson; charset=utf-8",
                headers={"Cache-Control": "no-cache", "X-Idempotency-Status": "hit"},
            )

    # --- 配额检查：超限直接 429 ---
    from app.core.quota import check_quota, record_usage
    from app.core.auth import get_current_user_optional as _get_user_opt
    _quota_user = _get_user_opt()
    _quota_uid = _quota_user.user_id if _quota_user else None
    check_quota(_quota_uid)

    session, _ = await get_or_create_session(request.session_id, db)

    user_msg = Message(session_id=session.id, role="user", content=request.message)
    db.add(user_msg)
    await db.commit()

    async def gen():
        if _is_api_key_missing():
            yield (json.dumps(_config_error_payload()) + "\n").encode("utf-8")
            yield (json.dumps({"type": "done", "content": ""}) + "\n").encode("utf-8")
            return

        agent = _resolve_agent(request, raw_request, session.id)
        full_response = ""
        sid = session.id

        # --- Run Tracker: 持久化运行生命周期 + 事件流 ---
        from app.core.database import AsyncSessionLocal
        from app.core.run_tracker import RunTracker
        from app.core.auth import get_current_user_optional

        user = get_current_user_optional()
        user_id = user.user_id if user else None

        run_id = None
        tracker = None
        tracker_db_ctx = None

        try:
            tracker_db_ctx = AsyncSessionLocal()
            tracker_db = await tracker_db_ctx.__aenter__()
            tracker = RunTracker(tracker_db)
            run = await tracker.start_run(
                session_id=sid,
                prompt=request.message,
                user_id=user_id,
                agent_key=request.agent_key,
                model=request.model,
                idempotency_key=request.idempotency_key,
            )
            run_id = run.id
        except Exception as _tracker_err:
            # Run Tracker 是可观测层，失败不应影响核心功能
            print(f"[RunTracker] start_run failed (non-blocking): {_tracker_err}")
            tracker = None

        run_status = "completed"
        run_error = None
        token_stats = {}

        try:
            async for chunk in agent.stream(request.message, images=request.images):
                if chunk["type"] == "done":
                    break
                if chunk["type"] == "text":
                    full_response += chunk.get("content", "")
                if chunk["type"] == "token_stats":
                    token_stats = chunk.get("data", {})

                # 持久化事件（text 事件太多，只记录非 text 事件以控制存储量）
                if tracker and run_id and chunk["type"] != "text":
                    try:
                        await tracker.record_event(run_id, chunk["type"], chunk.get("data") or {"content": chunk.get("content", "")})
                    except Exception:
                        pass  # 事件记录失败不影响流式输出

                yield (json.dumps(chunk) + "\n").encode("utf-8")

            # 落库 assistant 消息
            async with AsyncSessionLocal() as inner_db:
                agent_msg = Message(session_id=sid, role="assistant", content=full_response)
                inner_db.add(agent_msg)
                stmt = select(Session).where(Session.id == sid)
                result = await inner_db.execute(stmt)
                sess = result.scalar_one()
                sess.message_count += 2
                sess.updated_at = datetime.utcnow()
                await inner_db.commit()

        except Exception as e:
            run_status = "failed"
            run_error = str(e)
            yield (json.dumps({"type": "error", "content": str(e)}) + "\n").encode("utf-8")

        # 结束 run，写入 token 统计
        if tracker and run_id:
            try:
                await tracker.finish_run(
                    run_id=run_id,
                    status=run_status,
                    error_message=run_error,
                    input_tokens=token_stats.get("input_tokens", 0),
                    output_tokens=token_stats.get("output_tokens", 0),
                    total_tokens=token_stats.get("total_tokens", 0),
                    cost_usd=token_stats.get("cost_usd", 0.0),
                )
            except Exception as _e:
                print(f"[RunTracker] finish_run failed (non-blocking): {_e}")

        # 配额记录
        record_usage(_quota_uid, token_stats.get("total_tokens", 0))

        # 清理 tracker DB session
        if tracker_db_ctx:
            try:
                await tracker_db_ctx.__aexit__(None, None, None)
            except Exception:
                pass

        yield (json.dumps({"type": "done", "content": ""}) + "\n").encode("utf-8")

    return StreamingResponse(
        gen(),
        media_type="application/x-ndjson; charset=utf-8",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


from sqlalchemy import select
