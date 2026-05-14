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
    for line in out.split("\n")[-5:]:
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

print("[1] Create data dir on server...")
run("mkdir -p /opt/zentalk/data")

print("[2] Upload backend...")
sftp.put(str(REPO / "backend" / "main.py"), "/opt/zentalk/backend/main.py")

print("[3] Upload frontend dist...")
run("rm -rf /www/wwwroot/zen.mplusm.site/*")
upload_dir(REPO / "frontend" / "dist", "/www/wwwroot/zen.mplusm.site")

print("[4] Restart backend...")
run("pm2 restart zentalk-backend")
time.sleep(5)
out = run("curl -sf http://127.0.0.1:8765/health")
assert '"ok"' in out or "ok" in out.lower(), "Health check failed"
print("  Backend healthy!")

print("\n[5] E2E test — chat + like + verify learning...\n")

def api(path, data=None, method="POST"):
    url = f"https://zen.mplusm.site/api{path}"
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode() if data else None,
        headers={"Content-Type": "application/json"},
        method=method,
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

# Send a message
r1 = api("/chat", {"message": "我最近很焦虑，感觉时间不够用"})
print(f"用户：我最近很焦虑，感觉时间不够用")
print(f"AI ：{r1['reply']}")
print(f"message_id: {r1['message_id']}")

# Like it
r2 = api("/feedback/like", {"message_id": r1["message_id"]})
print(f"\n点赞结果: ok={r2['ok']}, total_liked={r2['total_liked']}")

# Verify stats
r3 = api("/feedback/stats", method="GET")
print(f"Stats: total={r3['total_liked']}")
print(f"Latest sample: 用户={r3['examples'][-1]['user'][:20]}... 你={r3['examples'][-1]['reply'][:30]}...")

print("\n✓ Feedback system working!")

sftp.close()
ssh.close()
