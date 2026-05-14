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
    for line in out.split("\n")[-4:]:
        if line.strip(): print(f"    {line}")
    return out

print("[1] Uploading main.py...")
sftp.put(str(REPO / "backend" / "main.py"), "/opt/zentalk/backend/main.py")

print("[2] Restarting...")
run("pm2 restart zentalk-backend")
time.sleep(5)
run("curl -sf http://127.0.0.1:8765/health")

print("\n[3] Testing live endpoint...\n")
tests = [
    "银行给我放了1000万贷款，利率2.4，我想拿去做投资",
    "我最近很焦虑，感觉什么都没做好",
    "买了很多课程但都没学完，感觉浪费了好多钱",
]
session_id = None
for q in tests:
    payload = {"message": q}
    if session_id:
        payload["session_id"] = session_id
    req = urllib.request.Request(
        "https://zen.mplusm.site/api/chat",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        body = json.loads(r.read())
        session_id = body["session_id"]
        print(f"用户：{q}")
        print(f"AI：{body['reply']}")
        print()

sftp.close()
ssh.close()
