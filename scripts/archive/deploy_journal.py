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

print("[2] Upload frontend dist...")
run("rm -rf /www/wwwroot/zen.mplusm.site/*")
upload_dir(REPO / "frontend" / "dist", "/www/wwwroot/zen.mplusm.site")

print("[3] Restart backend...")
run("pm2 restart zentalk-backend")
time.sleep(6)

print("[4] Health check...")
out = run("curl -sf http://127.0.0.1:8765/health")
print("  Health:", out)

print("\n[5] Test journal tag extraction...\n")

def api(path, data=None, method="POST"):
    url = f"https://zen.mplusm.site/api{path}"
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode() if data else None,
        headers={"Content-Type": "application/json"},
        method=method,
    )
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read())

# Test tag extraction
r = api("/journal/tags", {
    "scene": "独自坐在咖啡馆，看着窗外下雨",
    "feeling": "有点孤独，但也很平静",
    "reflection": "原来孤独不是问题，是一种状态"
})
print("场景：独自坐在咖啡馆，看着窗外下雨")
print(f"标签提取结果：")
print(f"  emotion:   {r['emotion']}")
print(f"  topic:     {r['topic']}")
print(f"  operation: {r['operation']}")
print(f"  timeview:  {r['timeview']}")
print(f"  energy:    {r['energy']}")
print(f"  summary:   {r['summary']}")

print("\n✓ Journal module deployed and working!")
print("  → https://zen.mplusm.site (点击「日记」tab)")

sftp.close()
ssh.close()
