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
from app.models.models import Session, Message, utcnow
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
    """解析并创建 Agent 实例，无效 key 抛 400。

    当请求带图片且配置了 VISION_MODEL 时，自动切换到视觉模型，
    因为很多文本模型（如 qwen3.6-flash）不支持图片输入。
    """
    agent_key = request.agent_key or get_default_key()
    available = [a["key"] for a in list_agents()]
    if agent_key not in available:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid agent_key: '{agent_key}'. Available: {available}",
        )
    # 图片消息 → 优先用视觉模型（VISION_MODEL），否则用请求指定/默认模型
    model = request.model
    if getattr(request, "images", None) and settings.VISION_MODEL:
        model = settings.VISION_MODEL
    return get_agent(agent_key, session_id=session_id, model=model, checkpointer=_get_checkpointer_from_request(raw_request))


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

    # 保存图片附件（多模态消息）
    from app.core.uploads import save_images
    img_urls = save_images(request.images, session.id)

    # 先把 user 消息落库：这样就算中途模型报错，也能在 DB 里看到“用户问了什么”
    user_msg = Message(session_id=session.id, role="user", content=request.message, attachments=img_urls or None)
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
    session.updated_at = utcnow()
    await db.commit()

    return ChatResponse(session_id=session.id, message_id=agent_msg.id, content=full_response, created_at=agent_msg.created_at)


@router.post("/stream")
async def chat_stream(request: ChatRequest, raw_request: FastAPIRequest, db: AsyncSession = Depends(get_db)):
    # SSE 流式：以 text/event-stream 连续推送事件
    # 注意：某些 Electron/内嵌浏览器环境用 fetch 读 SSE 可能出现 net::ERR_ABORTED
    # 若遇到该问题，建议前端改用 /stream_ndjson（更通用）
    session, _ = await get_or_create_session(request.session_id, db)

    from app.core.uploads import save_images
    img_urls = save_images(request.images, session.id)

    user_msg = Message(session_id=session.id, role="user", content=request.message, attachments=img_urls or None)
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
                sess.updated_at = utcnow()
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

    from app.core.uploads import save_images
    img_urls = save_images(request.images, session.id)

    user_msg = Message(session_id=session.id, role="user", content=request.message, attachments=img_urls or None)
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
                sess.updated_at = utcnow()
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


def _sse_pack(data: str, event: str | None = None, event_id: str | None = None) -> bytes:
    """把一个事件序列化成 SSE 帧（text/event-stream）。

    手写 SSE 而不用 sse-starlette 的 EventSourceResponse：后者用一个模块级全局
    Event 做优雅关闭检测，在 pytest 每用例独立 event loop 下会 "bound to a
    different event loop" 报错。手写 StreamingResponse 无此依赖，更可控。
    """
    lines = []
    if event_id is not None:
        lines.append(f"id: {event_id}")
    if event is not None:
        lines.append(f"event: {event}")
    for dl in data.split("\n"):
        lines.append(f"data: {dl}")
    return ("\r\n".join(lines) + "\r\n\r\n").encode("utf-8")


# ============================================================
# 任务化流式 + 断线续传（M12「改法 B」）
#
# 两步式：
#   1) POST /chat/tasks           创建任务，后台跑 Agent，立即返回 task_id
#   2) GET  /chat/tasks/{id}/stream  用 SSE 观察该任务的事件，可带
#      Last-Event-ID / ?after_id= 断线重连、从上次事件之后接着收
#
# 事件 id 用 StreamTask 内部单调序号；断开重连时服务端做事件重放。
# ============================================================


async def _run_agent_task(task, agent, message, images, run_id, quota_uid, trace_id):
    """后台运行 Agent，把每个 chunk 写入任务缓冲区（含 text，供全保真重放）。

    与 HTTP 连接解耦：客户端断开也不影响它继续跑，事件留在缓冲区等重连。
    """
    from app.core.database import AsyncSessionLocal
    from app.core.run_tracker import RunTracker
    from app.core.quota import record_usage
    from app.core.trace import set_trace_context, get_logger

    if trace_id:
        set_trace_context(trace_id)

    log = get_logger()
    full_response = ""
    token_stats = {}
    run_status = "completed"
    run_error = None
    sid = task.session_id

    tracker_db_ctx = AsyncSessionLocal()
    tracker_db = await tracker_db_ctx.__aenter__()
    tracker = RunTracker(tracker_db)

    try:
        async for chunk in agent.stream(message, images=images):
            if chunk["type"] == "done":
                break
            if chunk["type"] == "text":
                full_response += chunk.get("content", "")
            if chunk["type"] == "token_stats":
                token_stats = chunk.get("data", {})

            # 内存缓冲：全部事件（含 text），供在线断线续传全保真回放
            await task.emit(chunk)

            # DB 持久化：只存非 text 事件（控制存储量），供跨重启的审计/回放
            if run_id and chunk["type"] != "text":
                try:
                    await tracker.record_event(
                        run_id, chunk["type"], chunk.get("data") or {"content": chunk.get("content", "")}
                    )
                except Exception:
                    pass

        # 落库 assistant 完整回答 + 更新会话统计
        async with AsyncSessionLocal() as inner_db:
            agent_msg = Message(session_id=sid, role="assistant", content=full_response)
            inner_db.add(agent_msg)
            stmt = select(Session).where(Session.id == sid)
            sess = (await inner_db.execute(stmt)).scalar_one()
            sess.message_count += 2
            sess.updated_at = utcnow()
            await inner_db.commit()
    except Exception as e:
        run_status = "failed"
        run_error = str(e)
        log.warning(f"[task {task.task_id}] agent stream failed: {e}")
        await task.emit({"type": "error", "content": str(e)})
    finally:
        if run_id:
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
        record_usage(quota_uid, token_stats.get("total_tokens", 0))
        try:
            await tracker_db_ctx.__aexit__(None, None, None)
        except Exception:
            pass
        # done 事件 + 标记完成（唤醒观察者收尾）
        await task.emit({"type": "done", "content": ""})
        await task.finish(run_error)


@router.post("/tasks")
async def create_task(request: ChatRequest, raw_request: FastAPIRequest, db: AsyncSession = Depends(get_db)):
    """创建一个流式任务，后台运行 Agent，返回 task_id 供 GET stream 观察。"""
    import asyncio
    from app.core.task_stream import registry
    from app.core.quota import check_quota
    from app.core.auth import get_current_user_optional
    from app.core.trace import get_trace_id

    # 配额检查（超限同步返回 429）
    user = get_current_user_optional()
    quota_uid = user.user_id if user else None
    check_quota(quota_uid)

    session, _ = await get_or_create_session(request.session_id, db)

    from app.core.uploads import save_images
    img_urls = save_images(request.images, session.id)

    user_msg = Message(session_id=session.id, role="user", content=request.message, attachments=img_urls or None)
    db.add(user_msg)
    await db.commit()

    trace_id = get_trace_id()

    # API Key 缺失：仍创建任务，但后台只发 config_error + done（保持 SSE 契约统一）
    if _is_api_key_missing():
        task = registry.create(f"task_{session.id}_{int(datetime.now().timestamp()*1000)}", session.id)

        async def _config_err_task():
            await task.emit(_config_error_payload())
            await task.emit({"type": "done", "content": ""})
            await task.finish()

        asyncio.create_task(_config_err_task())
        return {"task_id": task.task_id, "session_id": session.id}

    # 起 run（run_id 复用为 task_id，统一 DB 回放）
    from app.core.database import AsyncSessionLocal
    from app.core.run_tracker import RunTracker

    run_id = None
    try:
        async with AsyncSessionLocal() as run_db:
            tracker = RunTracker(run_db)
            run = await tracker.start_run(
                session_id=session.id,
                prompt=request.message,
                user_id=quota_uid,
                agent_key=request.agent_key,
                model=request.model,
                idempotency_key=request.idempotency_key,
            )
            run_id = run.id
    except Exception as _e:
        print(f"[RunTracker] start_run failed (non-blocking): {_e}")

    task_id = run_id or f"task_{session.id}_{int(datetime.now().timestamp()*1000)}"
    task = registry.create(task_id, session.id)

    agent = _resolve_agent(request, raw_request, session.id)
    asyncio.create_task(
        _run_agent_task(task, agent, request.message, request.images, run_id, quota_uid, trace_id)
    )

    return {"task_id": task_id, "session_id": session.id}


async def _replay_completed_run_from_db(task_id: str, start_after: int):
    """任务不在内存（进程重启/已过期回收）时，从 DB 回放已完成 run 的事件。

    注意：DB 只持久化了非 text 事件，所以这里补发一条 assistant 完整回答的 text 事件，
    让重连的前端仍能看到最终答案（诚实取舍：跨重启不保真 token 级流式）。

    用独立的 AsyncSessionLocal（而不是请求注入的 db）：SSE 响应体是在端点函数
    返回之后才流式产出的，此时依赖注入的 session 生命周期已结束，复用会导致连接泄漏。
    """
    from app.core.database import AsyncSessionLocal
    from app.models.models import AgentRun, AgentEvent

    async with AsyncSessionLocal() as db:
        run = (await db.execute(select(AgentRun).where(AgentRun.id == task_id))).scalar_one_or_none()
        if not run:
            yield {"event": "message", "data": json.dumps({"type": "error", "content": "任务不存在或已过期"})}
            yield {"event": "message", "data": json.dumps({"type": "done", "content": ""})}
            return

        ev_stmt = (
            select(AgentEvent)
            .where(AgentEvent.run_id == task_id, AgentEvent.seq_no > start_after)
            .order_by(AgentEvent.seq_no)
        )
        for ev in (await db.execute(ev_stmt)).scalars().all():
            yield {
                "id": str(ev.seq_no),
                "event": "message",
                "data": json.dumps({"type": ev.event_type, "data": ev.event_data}),
            }

        # 补发最终答案文本
        last_msg = (
            await db.execute(
                select(Message)
                .where(Message.session_id == run.session_id, Message.role == "assistant")
                .order_by(Message.created_at.desc())
            )
        ).scalars().first()
        if last_msg and last_msg.content:
            yield {"event": "message", "data": json.dumps({"type": "text", "content": last_msg.content})}

        yield {"event": "message", "data": json.dumps({"type": "done", "content": ""})}


@router.get("/tasks/{task_id}/stream")
async def stream_task(task_id: str, raw_request: FastAPIRequest, after_id: int = 0):
    """SSE 观察某个任务的事件流，支持断线续传。

    续传起点优先级：Last-Event-ID 请求头 > ?after_id= 查询参数 > 0。
    """
    from app.core.task_stream import registry

    last_event_header = raw_request.headers.get("Last-Event-ID", "").strip()
    start_after = after_id
    if last_event_header.isdigit():
        start_after = int(last_event_header)

    task = registry.get(task_id)

    async def gen():
        # 首帧告知客户端：这是新连接还是重连（附续传起点）
        first_event = "reconnect" if start_after > 0 else "open"
        yield _sse_pack(
            json.dumps({"type": "resume", "task_id": task_id, "after_id": start_after}),
            event=first_event,
        )

        if task is not None:
            # 在线任务：从内存缓冲区全保真回放 + 实时跟随
            async for e in task.follow(start_after):
                yield _sse_pack(json.dumps(e["chunk"]), event="message", event_id=str(e["id"]))
        else:
            # 不在内存：从 DB 回放已完成 run
            async for item in _replay_completed_run_from_db(task_id, start_after):
                yield _sse_pack(item["data"], event=item.get("event"), event_id=item.get("id"))

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


from sqlalchemy import select
