"""
AI Testing API（M11）— AI 应用测试功能的 HTTP 入口

端点：
- GET  /api/v1/ai-testing/types           — 列出 6 种测试类型及说明
- GET  /api/v1/ai-testing/presets/{type}  — 获取某类型的预置用例
- POST /api/v1/ai-testing/run             — 运行一次测试套件（同步等待结果）
- GET  /api/v1/ai-testing/history         — 查询历史运行记录
- GET  /api/v1/ai-testing/history/{id}    — 查询单次运行详情（含用例级结果）
- DELETE /api/v1/ai-testing/history/{id}  — 删除一条历史记录
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.core.database import get_db
from app.core.ai_testing import TEST_TYPES
from app.core.ai_testing_cases import get_preset_cases
from app.models.models import TestRun

router = APIRouter()


class RunTestRequest(BaseModel):
    test_type: str = Field(..., description="测试类型：prompt_stability / multi_turn / rag_hit_rate / tool_calling / hallucination / adversarial")
    agent_key: Optional[str] = Field(None, description="被测 Agent，不传则用该测试类型的默认值")
    model: Optional[str] = Field(None, description="指定模型，不传则用服务端默认值")
    cases: Optional[list[dict]] = Field(None, description="自定义用例，不传则用预置用例")
    runs: Optional[int] = Field(3, description="仅 prompt_stability 用：每个用例重复运行次数")


@router.get("/types")
async def list_test_types():
    """列出所有测试类型及说明，供前端下拉/卡片展示"""
    return {
        "types": [
            {
                "key": key,
                "label": info["label"],
                "description": info["description"],
                "default_agent": info["default_agent"],
            }
            for key, info in TEST_TYPES.items()
        ]
    }


@router.get("/presets/{test_type}")
async def get_presets(test_type: str):
    """获取某个测试类型的预置用例（供前端展示/编辑后再运行）"""
    if test_type not in TEST_TYPES:
        raise HTTPException(status_code=404, detail=f"Unknown test_type: {test_type}. Available: {list(TEST_TYPES.keys())}")
    return {"test_type": test_type, "cases": get_preset_cases(test_type)}


@router.post("/run")
async def run_test(req: RunTestRequest, db: AsyncSession = Depends(get_db)):
    """运行一次测试套件（同步执行，等待全部用例跑完后返回汇总 + 详情）

    注意：这是同步阻塞调用（可能耗时几秒到几十秒，取决于用例数量和 LLM 响应速度）。
    学习项目场景下用例数少（2-4 个），同步返回体验更简单直接，不需要引入任务队列。
    """
    if req.test_type not in TEST_TYPES:
        raise HTTPException(status_code=404, detail=f"Unknown test_type: {req.test_type}. Available: {list(TEST_TYPES.keys())}")

    info = TEST_TYPES[req.test_type]
    runner = info["runner"]
    agent_key = req.agent_key or info["default_agent"]
    cases = req.cases if req.cases is not None else get_preset_cases(req.test_type)

    if not cases:
        raise HTTPException(status_code=400, detail="没有可运行的用例（未传自定义用例，且该类型无预置用例）")

    # 按测试类型分发参数（各 runner 签名略有不同：有无 agent_key / runs）
    try:
        if req.test_type == "rag_hit_rate":
            suite = await runner(cases)
        elif req.test_type == "prompt_stability":
            suite = await runner(cases, agent_key=agent_key or "basic-chatbot", runs=req.runs or 3)
        else:
            suite = await runner(cases, agent_key=agent_key or "basic-chatbot")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"测试执行失败: {e}")

    result_dict = suite.to_dict()

    # 落库，供历史查询
    run = TestRun(
        test_type=req.test_type,
        agent_key=agent_key,
        model=req.model,
        total=suite.total,
        passed=suite.passed,
        failed=suite.failed,
        pass_rate=suite.pass_rate,
        duration_ms=suite.duration_ms,
        cases=result_dict["cases"],
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    result_dict["run_id"] = run.id
    result_dict["created_at"] = run.created_at.isoformat() if run.created_at else None
    return result_dict


@router.get("/history")
async def list_history(test_type: Optional[str] = None, limit: int = 30, db: AsyncSession = Depends(get_db)):
    """查询历史运行记录（不含用例级详情，用于列表展示 + 趋势图）"""
    stmt = select(TestRun).order_by(desc(TestRun.created_at)).limit(limit)
    if test_type:
        stmt = stmt.where(TestRun.test_type == test_type)
    result = await db.execute(stmt)
    runs = result.scalars().all()
    return {
        "runs": [
            {
                "id": r.id,
                "test_type": r.test_type,
                "agent_key": r.agent_key,
                "model": r.model,
                "total": r.total,
                "passed": r.passed,
                "failed": r.failed,
                "pass_rate": r.pass_rate,
                "duration_ms": r.duration_ms,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in runs
        ],
        "count": len(runs),
    }


@router.get("/history/{run_id}")
async def get_history_detail(run_id: str, db: AsyncSession = Depends(get_db)):
    """查询单次运行的完整详情（含用例级结果）"""
    stmt = select(TestRun).where(TestRun.id == run_id)
    result = await db.execute(stmt)
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Test run not found")
    return {
        "id": run.id,
        "test_type": run.test_type,
        "agent_key": run.agent_key,
        "model": run.model,
        "total": run.total,
        "passed": run.passed,
        "failed": run.failed,
        "pass_rate": run.pass_rate,
        "duration_ms": run.duration_ms,
        "cases": run.cases,
        "created_at": run.created_at.isoformat() if run.created_at else None,
    }


@router.delete("/history/{run_id}")
async def delete_history(run_id: str, db: AsyncSession = Depends(get_db)):
    """删除一条历史记录"""
    stmt = select(TestRun).where(TestRun.id == run_id)
    result = await db.execute(stmt)
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Test run not found")
    await db.delete(run)
    await db.commit()
    return {"status": "deleted", "id": run_id}
