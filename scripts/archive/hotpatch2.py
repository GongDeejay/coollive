#!/usr/bin/env python3
import os, time, json, urllib.request
import paramiko
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

print("[1] Upload main.py...")
sftp.put(str(REPO / "backend" / "main.py"), "/opt/zentalk/backend/main.py")

print("[2] Restart...")
run("pm2 restart zentalk-backend")
time.sleep(5)
run("curl -sf http://127.0.0.1:8765/health")

print("\n[3] Test the exact scenario from the screenshot...\n")

def chat(msg, session_id=None):
    r = urllib.request.Request(
        "https://zen.mplusm.site/api/chat",
        data=json.dumps({"message": msg, **({"session_id": session_id} if session_id else {})}).encode(),
        headers={"Content-Type": "application/json"}, method="POST",
    )
    with urllib.request.urlopen(r, timeout=35) as resp:
        return json.loads(resp.read())

# Replay the exact conversation from the screenshot
convos = [
    "平时睡懒觉不现实吧，上班迟到是个不靠谱的事",
    "平日不能睡懒觉，因为睡懒觉会迟到，所以，平时就不能睡懒觉，周末懒觉才难得",
    "明天要不要早点起来爬山呢",
    "就是难得周末，想多睡会儿懒觉啊",
    "你说的有道理啊，不过周末7是天里的两天，是挺难得的吧？",
]

sid = None
for q in convos:
    r = chat(q, sid)
    sid = r["session_id"]
    print(f"用户：{q}")
    print(f"AI ：{r['reply']}")
    print()

sftp.close()
ssh.close()
