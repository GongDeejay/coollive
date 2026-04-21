"""Auth routes — register, login, me."""
from typing import Optional
from fastapi import APIRouter, Header
from pydantic import BaseModel
import auth as _auth

router = APIRouter()


class AuthRequest(BaseModel):
    email: str
    password: str


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
