"""Auth routes — register, login, me, change-password, admin-reset."""
from typing import Optional
from fastapi import APIRouter, Header
from pydantic import BaseModel
import auth as _auth

router = APIRouter()


class AuthRequest(BaseModel):
    email: str
    password: str


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


class AdminResetRequest(BaseModel):
    target_email: str
    new_password: str


@router.post("/auth/register")
def route_register(req: AuthRequest):
    return _auth.register(req.email, req.password)


@router.post("/auth/login")
def route_login(req: AuthRequest):
    return _auth.login(req.email, req.password)


@router.get("/auth/me")
def route_me(authorization: Optional[str] = Header(default=None)):
    user = _auth.optional_user(authorization)
    if not user:
        return {"logged_in": False}
    return {"logged_in": True, "user_id": user["sub"], "email": user["email"]}


@router.post("/auth/change-password")
def route_change_password(req: ChangePasswordRequest,
                           authorization: Optional[str] = Header(default=None)):
    """Change own password — requires valid token + old password."""
    user = _auth.require_user(authorization)
    return _auth.change_password(user["sub"], req.old_password, req.new_password)


@router.post("/auth/admin-reset")
def route_admin_reset(req: AdminResetRequest,
                       authorization: Optional[str] = Header(default=None)):
    """Admin force-reset any user's password — gongdj@gmail.com only."""
    admin = _auth.require_user(authorization)
    return _auth.admin_force_reset(admin["email"], req.target_email, req.new_password)
