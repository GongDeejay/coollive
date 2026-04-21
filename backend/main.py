"""
ZenTalk API — entry point.
Routers are split by domain:
  routers/chat.py        — chat, feedback, sessions
  routers/journal.py     — tag extraction, cloud sync, public blog
  routers/auth_routes.py — register, login, me
  auth.py                — auth helpers, user/journal storage
"""
import sys
from pathlib import Path

# Ensure backend dir is on path (needed when uvicorn is called with module path)
_backend_dir = Path(__file__).parent
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers.chat import router as chat_router
from routers.journal import router as journal_router
from routers.auth_routes import router as auth_router

app = FastAPI(title="ZenTalk API", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)
app.include_router(journal_router)
app.include_router(auth_router)


@app.get("/health")
def health():
    return {"status": "ok"}
