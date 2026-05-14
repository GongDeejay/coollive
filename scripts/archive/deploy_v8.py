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
    for line in out.split("\n")[-3:]:
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
            run(f"mkdir -p {parent}", timeout=10); created.add(parent)
        sftp.put(str(item), rpath)
        print(f"  upload: {rel}")

print("[1] Upload backend (refactored routers)...")
run("mkdir -p /opt/zentalk/backend/routers")
sftp.put(str(REPO / "backend" / "main.py"),                          "/opt/zentalk/backend/main.py")
sftp.put(str(REPO / "backend" / "auth.py"),                          "/opt/zentalk/backend/auth.py")
sftp.put(str(REPO / "backend" / "routers" / "__init__.py"),          "/opt/zentalk/backend/routers/__init__.py")
sftp.put(str(REPO / "backend" / "routers" / "chat.py"),              "/opt/zentalk/backend/routers/chat.py")
sftp.put(str(REPO / "backend" / "routers" / "journal.py"),           "/opt/zentalk/backend/routers/journal.py")
sftp.put(str(REPO / "backend" / "routers" / "auth_routes.py"),       "/opt/zentalk/backend/routers/auth_routes.py")
print("  All backend files uploaded")

print("[2] Upload frontend dist...")
run("rm -rf /www/wwwroot/zen.mplusm.site/*")
upload_dir(REPO / "frontend" / "dist", "/www/wwwroot/zen.mplusm.site")

print("[3] Restart backend...")
run("pm2 restart zentalk-backend"); time.sleep(6)
print("  Health:", run("curl -sf http://127.0.0.1:8765/health"))

print("\n[4] Smoke tests...\n")
def api(path, data=None, method="POST", token=None):
    url = f"https://zen.mplusm.site/api{path}"
    headers = {"Content-Type": "application/json"}
    if token: headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(
        url, data=json.dumps(data).encode() if data else None,
        headers=headers, method=method,
    )
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read())

# Chat
r = api("/chat", {"message": "今天吃什么"})
print(f"Chat: {r['reply'][:40]}")

# Tag extraction — test variety
for text in [
    "很爽！项目终于上线了，但累死了",
    "感觉今天什么都没做，很焦虑，时间都哪去了",
    "喝了杯咖啡，坐在阳台，什么都没想，挺好的",
]:
    r2 = api("/journal/tags", {"content": text})
    print(f"Tags '{text[:20]}...': {r2['emotion']} | {r2['topic']} | {r2['energy']}")

print("\n✓ Done! https://zen.mplusm.site")
sftp.close(); ssh.close()
