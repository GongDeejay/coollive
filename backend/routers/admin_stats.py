"""
Admin dashboard stats — only accessible by gongdj@gmail.com.

Endpoints:
  GET /admin/stats          — combined: traffic + processes + errors
  GET /admin/stats/refresh  — force re-parse logs and rebuild cache
"""

import os
import json
import re
import subprocess
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
from collections import defaultdict

from fastapi import APIRouter, HTTPException, Header

import auth as _auth

router = APIRouter()

ADMIN_EMAIL = "gongdj@gmail.com"
CACHE_FILE  = Path(os.environ.get("DATA_DIR", "/opt/zentalk/data")) / "admin_stats_cache.json"
CACHE_TTL   = 300   # seconds (5 minutes)

LOG_FILES = {
    "zen": "/www/wwwlogs/zen.access.log",
    "3d":  "/www/wwwlogs/3d.access.log",
}

ERROR_LOGS = {
    "zentalk": "/root/.pm2/logs/zentalk-backend-error.log",
    "3d":      "/root/.pm2/logs/3d-platform-error.log",
}

# ── Auth guard ──────────────────────────────────────────────────────
def require_admin(authorization: Optional[str] = None):
    user = _auth.optional_user(authorization)
    if not user or user.get("email") != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="admin_only")
    return user


# ── Nginx log parser ────────────────────────────────────────────────
# Format: IP - - [day/mon/year:HH:MM:SS +tz] "METHOD path HTTP/x" STATUS bytes ...
LOG_RE = re.compile(
    r'(?P<ip>\S+) - - \[(?P<dt>\d+/\w+/\d+:\d+:\d+:\d+) [^\]]+\] '
    r'"(?P<method>\S+) (?P<path>\S+) [^"]*" (?P<status>\d+)'
)
MONTHS = {"Jan":1,"Feb":2,"Mar":3,"Apr":4,"May":5,"Jun":6,
          "Jul":7,"Aug":8,"Sep":9,"Oct":10,"Nov":11,"Dec":12}

def parse_log_date(dt_str: str) -> Optional[datetime]:
    # dt_str: "09/Jun/2026:15:03:21"
    try:
        day, mon, rest = dt_str.split("/", 2)
        year, hms = rest.split(":", 1)
        h, m, s = hms.split(":")
        return datetime(int(year), MONTHS.get(mon, 1), int(day), int(h), int(m), int(s))
    except Exception:
        return None


def parse_traffic(log_path: str, days: int = 7) -> dict:
    """Return per-day stats for the last `days` days."""
    cutoff = datetime.now() - timedelta(days=days)
    daily: dict[str, dict] = defaultdict(lambda: {"requests": 0, "unique_ips": set(),
                                                    "errors_4xx": 0, "errors_5xx": 0,
                                                    "api_requests": 0})
    try:
        with open(log_path, "r", errors="replace") as f:
            for line in f:
                m = LOG_RE.match(line)
                if not m:
                    continue
                dt = parse_log_date(m.group("dt"))
                if dt is None or dt < cutoff:
                    continue
                day_key = dt.strftime("%Y-%m-%d")
                d = daily[day_key]
                d["requests"] += 1
                d["unique_ips"].add(m.group("ip"))
                status = int(m.group("status"))
                if 400 <= status < 500:
                    d["errors_4xx"] += 1
                elif status >= 500:
                    d["errors_5xx"] += 1
                path = m.group("path")
                if path.startswith("/api/"):
                    d["api_requests"] += 1
    except FileNotFoundError:
        pass

    # Serialize: convert sets to counts, fill missing days
    result = []
    today = datetime.now().date()
    for i in range(days - 1, -1, -1):
        day = (today - timedelta(days=i)).strftime("%Y-%m-%d")
        d = daily.get(day, {})
        result.append({
            "date":         day,
            "requests":     d.get("requests", 0),
            "unique_ips":   len(d.get("unique_ips", set())),
            "errors_4xx":   d.get("errors_4xx", 0),
            "errors_5xx":   d.get("errors_5xx", 0),
            "api_requests": d.get("api_requests", 0),
        })
    return {"days": result}


# ── PM2 process status ──────────────────────────────────────────────
def get_pm2_status() -> list:
    try:
        raw = subprocess.check_output(["pm2", "jlist"], timeout=8, stderr=subprocess.DEVNULL)
        procs = json.loads(raw)
        result = []
        for p in procs:
            env = p.get("pm2_env", {})
            monit = p.get("monit", {})
            uptime_ms = env.get("pm_uptime", 0)
            if uptime_ms:
                uptime_sec = int((time.time() * 1000 - uptime_ms) / 1000)
            else:
                uptime_sec = 0
            result.append({
                "name":        p.get("name", "?"),
                "status":      env.get("status", "?"),
                "pid":         p.get("pid", 0),
                "cpu":         monit.get("cpu", 0),
                "memory_mb":   round(monit.get("memory", 0) / 1024 / 1024, 1),
                "restarts":    env.get("restart_time", 0),
                "uptime_sec":  uptime_sec,
            })
        return result
    except Exception:
        return []


# ── Error log reader ────────────────────────────────────────────────
def get_recent_errors(limit: int = 60) -> list:
    """
    Read last N lines from each error log; return structured entries.
    Detects lines containing ERROR, error, Exception, Traceback, ⨯
    """
    entries = []
    for service, path in ERROR_LOGS.items():
        try:
            result = subprocess.check_output(
                ["tail", "-200", path], timeout=5, stderr=subprocess.DEVNULL
            ).decode("utf-8", errors="replace")
            lines = result.strip().split("\n")
            for line in reversed(lines):
                line = line.strip()
                if not line:
                    continue
                # Skip pure INFO lines from our own logger
                if re.match(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \[MF\] INFO", line):
                    continue
                # Skip JWT warning spam
                if "InsecureKeyLengthWarning" in line or "HMAC key" in line:
                    continue
                # Flag as error if it has error indicators
                level = "error" if any(kw in line for kw in [
                    "Error", "error", "ERROR", "Exception", "Traceback",
                    "SyntaxError", "⨯", "failed", "FAIL"
                ]) else "warn"
                entries.append({
                    "service": service,
                    "level":   level,
                    "message": line[:200],
                })
                if len(entries) >= limit:
                    break
        except Exception:
            pass
    return entries[:limit]


# ── Cache layer ─────────────────────────────────────────────────────
def build_stats() -> dict:
    traffic = {}
    for site, path in LOG_FILES.items():
        traffic[site] = parse_traffic(path, days=7)

    stats = {
        "generated_at": time.time(),
        "traffic":       traffic,
        "processes":     get_pm2_status(),
        "errors":        get_recent_errors(60),
    }
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    CACHE_FILE.write_text(json.dumps(stats, ensure_ascii=False), encoding="utf-8")
    return stats


def load_stats(force: bool = False) -> dict:
    if not force and CACHE_FILE.exists():
        try:
            data = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
            age = time.time() - data.get("generated_at", 0)
            if age < CACHE_TTL:
                return data
        except Exception:
            pass
    return build_stats()


# ── Routes ──────────────────────────────────────────────────────────
@router.get("/admin/stats")
async def get_stats(authorization: Optional[str] = Header(default=None)):
    require_admin(authorization)
    return load_stats()


@router.post("/admin/stats/refresh")
async def refresh_stats(authorization: Optional[str] = Header(default=None)):
    require_admin(authorization)
    data = load_stats(force=True)
    return {"ok": True, "generated_at": data["generated_at"]}
