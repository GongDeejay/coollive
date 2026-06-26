#!/usr/bin/env python3
import os, time, json
import paramiko, urllib.request
from pathlib import Path

REPO = Path(__file__).parent.parent
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("43.133.145.77", username="root", password=os.environ["SERVER_PASS"], timeout=20)
sftp = ssh.open_sftp()

def run(cmd, timeout=30):
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    out = (stdout.read() + stderr.read()).decode("utf-8", errors="replace").strip()
    for line in out.split("\n")[-3:]:
        if line.strip(): print(f"    {line}")
    return out

print("[1] Upload fixed backend...")
sftp.put(str(REPO / "backend" / "main.py"), "/opt/zentalk/backend/main.py")
run("pm2 restart zentalk-backend")
time.sleep(5)

print("[2] Test tag extraction...")
print(run("""curl -s -X POST http://127.0.0.1:8765/journal/tags \
  -H 'Content-Type: application/json' \
  -d '{"scene":"独自坐在咖啡馆","feeling":"有点孤独","reflection":"孤独不是问题"}'""", timeout=30))

print("\n[3] Full HTTPS test...")
def api(path, data=None, method="POST"):
    url = f"https://zen.mplusm.site/api{path}"
    req = urllib.request.Request(
        url, data=json.dumps(data).encode() if data else None,
        headers={"Content-Type": "application/json"}, method=method,
    )
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read())

r = api("/journal/tags", {
    "scene": "独自坐在咖啡馆，看着窗外下雨",
    "feeling": "有点孤独，但也很平静",
    "reflection": "原来孤独不是问题，是一种状态",
})
print(f"  emotion:   {r['emotion']}")
print(f"  topic:     {r['topic']}")
print(f"  operation: {r['operation']}")
print(f"  timeview:  {r['timeview']}")
print(f"  energy:    {r['energy']}")
print(f"  summary:   {r['summary']}")
print("\n✓ Done! Visit https://zen.mplusm.site → 日记 tab")

sftp.close()
ssh.close()
