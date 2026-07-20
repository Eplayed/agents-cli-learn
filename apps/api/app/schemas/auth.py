"""
多用户鉴权 Schema（M13）
"""
from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=32, description="用户名，3-32 字符")
    password: str = Field(..., min_length=6, max_length=128, description="密码，至少 6 位")


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=32)
    password: str = Field(..., min_length=1, max_length=128)


class UserInfo(BaseModel):
    id: str
    username: str
    role: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserInfo
