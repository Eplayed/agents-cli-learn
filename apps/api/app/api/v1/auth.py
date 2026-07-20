"""
多用户鉴权 API（M13）

- POST /api/v1/auth/register  注册，返回 JWT
- POST /api/v1/auth/login     登录，返回 JWT
- GET  /api/v1/auth/me        查看当前身份（需带 Bearer JWT）

与遗留的「共享 AUTH_SECRET」向后兼容：中间件（app/core/auth.py）同时接受
遗留密钥和新版 JWT，两者都能通过鉴权。
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import hash_password, verify_password, create_access_token
from app.core.auth import get_current_user
from app.models.models import User
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, UserInfo

router = APIRouter()


@router.post("/register", response_model=TokenResponse)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = (await db.execute(select(User).where(User.username == req.username))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="用户名已存在")

    user = User(username=req.username, password_hash=hash_password(req.password), role="user")
    db.add(user)
    await db.commit()

    token = create_access_token(sub=user.id, username=user.username, role=user.role)
    return TokenResponse(access_token=token, user=UserInfo(id=user.id, username=user.username, role=user.role))


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(User.username == req.username))).scalar_one_or_none()
    # 用户名不存在或密码错误：统一返回同一错误，避免暴露用户名是否存在
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="用户已被禁用")

    token = create_access_token(sub=user.id, username=user.username, role=user.role)
    return TokenResponse(access_token=token, user=UserInfo(id=user.id, username=user.username, role=user.role))


@router.get("/me")
async def me():
    """返回当前请求的身份（由中间件从 JWT / 遗留密钥 / 匿名解析）。"""
    u = get_current_user()
    return {
        "user_id": u.user_id,
        "username": u.username,
        "role": u.role,
        "authenticated": u.authenticated,
    }
