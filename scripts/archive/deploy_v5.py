#!/usr/bin/env python3
import os, time, json, urllib.request
import paramiko
from pathlib import Path

REPO = Path(__file__).parent.parent
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("43.133.145.77", username="root", password=os.environ["SERVER_PASS"], timeout=20)
sftp = ssh.open_sftp()

def run(cmd, timeout=60):
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    out = (stdout.read() + stderr.read()).decode("utf-8", errors="replace").strip()
    for line in out.split("\n")[-4:]:
        if line.strip(): print(f"    {line}")
    return out

def upload_dir(local, remote):
    local = Path(local)
    created = set()
    for item in sorted(local.rglob("*")):
        if item.is_dir(): continue
        rel = item.relative_to(local)
        rpath = f"{remote}/{rel}".replace("\\", "/")
        parent = rpath.rsplit("/", 1)[0]
        if parent not in created:
            run(f"mkdir -p {parent}", timeout=10)
            created.add(parent)
        sftp.put(str(item), rpath)
        print(f"  upload: {rel}")

print("[1] Upload backend files...")
sftp.put(str(REPO / "backend" / "main.py"), "/opt/zentalk/backend/main.py")
sftp.put(str(REPO / "backend" / "auth.py"),  "/opt/zentalk/backend/auth.py")
run("pip3 install PyJWT bcrypt -q 2>&1 | tail -2", timeout=60)

print("[2] Upload frontend dist...")
run("rm -rf /www/wwwroot/zen.mplusm.site/*")
upload_dir(REPO / "frontend" / "dist", "/www/wwwroot/zen.mplusm.site")

print("[3] Restart backend...")
run("pm2 restart zentalk-backend")
time.sleep(6)
run("curl -sf http://127.0.0.1:8765/health")

print("\n[4] Test auth + journal...\n")
def api(path, data=None, method="POST", token=None):
    url = f"https://zen.mplusm.site/api{path}"
    headers = {"Content-Type": "application/json"}
    if token: headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(
        url, data=json.dumps(data).encode() if data else None,
        headers=headers, method=method,
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())

import random, string
test_email = f"test_{''.join(random.choices(string.ascii_lowercase, k=6))}@zentalk.test"
test_pass  = "test1234"

# Register
r = api("/auth/register", {"email": test_email, "password": test_pass})
tok = r["token"]
print(f"Register: {r['email']} ✓")

# Me
r2 = api("/auth/me", method="GET", token=tok)
print(f"Me: logged_in={r2['logged_in']}, email={r2['email']}")

# Sync a journal entry
entry = {
    "id": "test-entry-001", "created_at": "2026-04-18T20:00:00+08:00",
    "scene": "测试场景", "feeling": "好奇", "reflection": "系统在工作",
    "raw": "", "tags": {"emotion": ["平静"], "topic": ["自我"],
    "operation": ["观察"], "timeview": "当下", "energy": "平稳"},
    "summary": "测试日记条目", "session_id": None,
    "zen_session_id": None, "zen_reply_id": None,
}
r3 = api("/journal/entries/sync", {"entry": entry}, token=tok)
print(f"Sync entry: ok={r3['ok']}, total={r3['total']}")

# Fetch back
r4 = api("/journal/entries", method="GET", token=tok)
print(f"Fetch entries: {len(r4['entries'])} entries, first summary='{r4['entries'][0]['summary']}'")

print("\n✓ All tests passed!")
print("  → https://zen.mplusm.site")

sftp.close()
ssh.close()
