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

print("[1] Upload backend...")
sftp.put(str(REPO / "backend" / "main.py"), "/opt/zentalk/backend/main.py")
run("mkdir -p /opt/zentalk/data")

print("[2] Upload frontend dist...")
run("rm -rf /www/wwwroot/zen.mplusm.site/*")
upload_dir(REPO / "frontend" / "dist", "/www/wwwroot/zen.mplusm.site")

print("[3] Restart backend...")
run("pm2 restart zentalk-backend")
time.sleep(5)
out = run("curl -sf http://127.0.0.1:8765/health")
print("  Health:", out)

print("\n[4] E2E tests...\n")

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

# Test 1: daily question
r = api("/chat", {"message": "今天吃什么"})
sid = r["session_id"]
mid = r["message_id"]
print(f"【日常问题】用户：今天吃什么")
print(f"AI：{r['reply']}\n")

# Test 2: dislike
r2 = api("/feedback/dislike", {"message_id": mid})
print(f"Dislike: ok={r2['ok']}, total={r2['total']}\n")

# Test 3: philosophical question
r3 = api("/chat", {"message": "我很焦虑，感觉时间不够用"})
sid3 = r3["session_id"]
print(f"【烦恼问题】用户：我很焦虑，感觉时间不够用")
print(f"AI：{r3['reply']}\n")

# Test 4: multi-turn obsession (5 turns same topic)
print("【多轮点醒测试】")
topics = [
    "我总是拖延，做不完事情",
    "就是总想做的事情太多了",
    "是啊，什么都想做，但时间不够",
    "对，我需要更好地管理时间",
    "你说得对，我应该更自律",
]
s = None
for i, q in enumerate(topics):
    r = api("/chat", {"message": q, **({"session_id": s} if s else {})})
    s = r["session_id"]
    print(f"Turn {r['turn']} 用户：{q}")
    print(f"        AI：{r['reply']}\n")

stats = api("/feedback/stats", method="GET")
print(f"Stats: liked={stats['total_liked']}, disliked={stats['total_disliked']}")

sftp.close()
ssh.close()
