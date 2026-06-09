"""
Minimal email-based auth.
- Users stored in users.json (email → hashed_password)
- Journal entries stored in journals/{user_id}.json
- JWT token, 90-day expiry
- No email verification for now (add later when SMTP is configured)
"""
import os
import json
import uuid
import time
import hashlib
import hmac as _hmac
from pathlib import Path
from typing import Optional

import bcrypt
import jwt as pyjwt
from fastapi import HTTPException, Header

DATA_DIR = Path(os.environ.get("DATA_DIR", "/opt/zentalk/data"))
USERS_FILE = DATA_DIR / "users.json"
JOURNALS_DIR = DATA_DIR / "journals"
JWT_SECRET = os.environ.get("JWT_SECRET", "zentalk-secret-change-in-prod")
JWT_ALGO = "HS256"
TOKEN_DAYS = 90

DATA_DIR.mkdir(parents=True, exist_ok=True)
JOURNALS_DIR.mkdir(parents=True, exist_ok=True)


# ── User store ─────────────────────────────────────────────────────

def _load_users() -> dict:
    if USERS_FILE.exists():
        try:
            return json.loads(USERS_FILE.read_text())
        except Exception:
            return {}
    return {}


def _save_users(users: dict):
    USERS_FILE.write_text(json.dumps(users, ensure_ascii=False, indent=2))


def _user_journal_path(user_id: str) -> Path:
    return JOURNALS_DIR / f"{user_id}.json"


# ── JWT ────────────────────────────────────────────────────────────

def make_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": int(time.time()) + TOKEN_DAYS * 86400,
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def decode_token(token: str) -> dict:
    try:
        return pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="token_expired")
    except Exception:
        raise HTTPException(status_code=401, detail="token_invalid")


def optional_user(authorization: Optional[str] = Header(default=None)) -> Optional[dict]:
    """Extract user from Bearer token if present; return None if not logged in."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization[7:]
    try:
        return decode_token(token)
    except Exception:
        return None


def require_user(authorization: Optional[str] = Header(default=None)) -> dict:
    user = optional_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="login_required")
    return user


# ── Register / Login ───────────────────────────────────────────────

def register(email: str, password: str) -> dict:
    email = email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="invalid_email")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="password_too_short")

    users = _load_users()
    for uid, u in users.items():
        if u["email"] == email:
            raise HTTPException(status_code=409, detail="email_exists")

    user_id = str(uuid.uuid4())
    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    users[user_id] = {"email": email, "password": hashed, "created_at": int(time.time())}
    _save_users(users)

    token = make_token(user_id, email)
    return {"user_id": user_id, "email": email, "token": token}


def login(email: str, password: str) -> dict:
    email = email.strip().lower()
    users = _load_users()

    for uid, u in users.items():
        if u["email"] == email:
            if bcrypt.checkpw(password.encode(), u["password"].encode()):
                token = make_token(uid, email)
                return {"user_id": uid, "email": email, "token": token}
            raise HTTPException(status_code=401, detail="wrong_password")

    raise HTTPException(status_code=404, detail="user_not_found")


def change_password(user_id: str, old_password: str, new_password: str) -> dict:
    """Change password — requires old password verification."""
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="password_too_short")
    users = _load_users()
    u = users.get(user_id)
    if not u:
        raise HTTPException(status_code=404, detail="user_not_found")
    if not bcrypt.checkpw(old_password.encode(), u["password"].encode()):
        raise HTTPException(status_code=401, detail="wrong_password")
    users[user_id]["password"] = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt()).decode()
    _save_users(users)
    return {"ok": True}


def admin_force_reset(admin_email: str, target_email: str, new_password: str) -> dict:
    """Admin-only: force reset any user's password without old password."""
    if admin_email != "gongdj@gmail.com":
        raise HTTPException(status_code=403, detail="admin_only")
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="password_too_short")
    users = _load_users()
    target_email = target_email.strip().lower()
    for uid, u in users.items():
        if u["email"] == target_email:
            users[uid]["password"] = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt()).decode()
            _save_users(users)
            return {"ok": True, "email": target_email}
    raise HTTPException(status_code=404, detail="user_not_found")


# ── Journal cloud storage ──────────────────────────────────────────

def load_user_journal(user_id: str) -> list:
    path = _user_journal_path(user_id)
    if path.exists():
        try:
            return json.loads(path.read_text())
        except Exception:
            return []
    return []


def save_user_journal(user_id: str, entries: list):
    path = _user_journal_path(user_id)
    path.write_text(json.dumps(entries, ensure_ascii=False, indent=2))


def upsert_entry(user_id: str, entry: dict) -> list:
    entries = load_user_journal(user_id)
    existing_ids = {e["id"] for e in entries}
    if entry["id"] in existing_ids:
        entries = [entry if e["id"] == entry["id"] else e for e in entries]
    else:
        entries.insert(0, entry)
    save_user_journal(user_id, entries)
    return entries


def delete_entry(user_id: str, entry_id: str) -> list:
    entries = [e for e in load_user_journal(user_id) if e["id"] != entry_id]
    save_user_journal(user_id, entries)
    return entries


def get_public_entries(user_id: str) -> list:
    """Return only entries marked as public, sorted newest first."""
    return [e for e in load_user_journal(user_id) if e.get("is_public")]


def get_user_public_profile(user_id: str) -> dict:
    users = _load_users()
    u = users.get(user_id, {})
    if not u:
        return {}
    # Return safe subset only
    return {"user_id": user_id, "display_name": u.get("display_name") or u["email"].split("@")[0]}
