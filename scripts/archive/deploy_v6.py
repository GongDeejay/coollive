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
            run(f"mkdir -p {parent}", timeout=10); created.add(parent)
        sftp.put(str(item), rpath)
        print(f"  upload: {rel}")

print("[1] Upload backend...")
sftp.put(str(REPO / "backend" / "main.py"), "/opt/zentalk/backend/main.py")
sftp.put(str(REPO / "backend" / "auth.py"),  "/opt/zentalk/backend/auth.py")

print("[2] Upload frontend dist...")
run("rm -rf /www/wwwroot/zen.mplusm.site/*")
upload_dir(REPO / "frontend" / "dist", "/www/wwwroot/zen.mplusm.site")

print("[3] Restart backend...")
run("pm2 restart zentalk-backend"); time.sleep(6)
print("  Health:", run("curl -sf http://127.0.0.1:8765/health"))

print("\n[4] Test tag extraction quality...\n")
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

test_entries = [
    {"scene": "项目上线了，部署成功", "feeling": "很爽有成就感，但也有点累了", "reflection": "最难的不是技术，是一直推进的意志力"},
    {"scene": "", "feeling": "", "reflection": "", "content": "我总是在最重要的事情上拖延，然后用次要的事情填满时间，感觉很忙但什么都没推进"},
    {"scene": "今天和朋友聊了很久", "feeling": "有点压力", "reflection": "发现我总是把别人的情绪当自己的责任"},
]

for i, entry in enumerate(test_entries):
    r = api("/journal/tags", entry)
    print(f"测试 {i+1}:")
    print(f"  emotion:   {r['emotion']}")
    print(f"  topic:     {r['topic']}")
    print(f"  operation: {r['operation']}")
    print(f"  keywords:  {r['keywords']}")
    print(f"  energy:    {r['energy']}")
    print(f"  summary:   {r['summary']}")
    print()

print("[5] Test public blog...")
import random, string
email = f"blogtest_{''.join(random.choices(string.ascii_lowercase, k=5))}@test.com"
r_reg = api("/auth/register", {"email": email, "password": "test1234"})
tok = r_reg["token"]
uid = r_reg["user_id"]
print(f"  user_id: {uid[:16]}…")

entry = {"id": "pub-001", "created_at": "2026-04-19T10:00:00+08:00",
         "scene": "写代码", "feeling": "专注", "reflection": "找到了节奏感",
         "raw": "", "is_public": True,
         "tags": {"emotion": ["平静"], "topic": ["工作","创造"], "operation": ["观察"],
                  "timeview": "当下", "energy": "高能", "keywords": ["节奏感", "代码"]},
         "summary": "找到写代码的节奏感",
         "session_id": None, "zen_session_id": None, "zen_reply_id": None}
api("/journal/entries/sync", {"entry": entry}, token=tok)
r_pub = api(f"/public/{uid}/entries", method="GET")
print(f"  public entries: {len(r_pub['entries'])}, profile: {r_pub['profile']['display_name']}")
print(f"  public blog URL: https://zen.mplusm.site/blog/{uid}")

print("\n✓ Done! https://zen.mplusm.site")
sftp.close(); ssh.close()
