#!/usr/bin/env python3
"""Hot-patch: upload main.py and restart PM2 process."""
import os
import time
import json
import urllib.request
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
    print(f"  $ {cmd[:80]}")
    for line in out.split("\n")[-5:]:
        if line.strip(): print(f"    {line}")
    return out

print("[1] Uploading main.py...")
sftp.put(str(REPO / "backend" / "main.py"), "/opt/zentalk/backend/main.py")

print("[2] Restarting PM2...")
run("pm2 restart zentalk-backend")
time.sleep(4)

print("[3] Health check...")
run("curl -sf http://127.0.0.1:8765/health")

print("[4] E2E test with new prompt...")
req = urllib.request.Request(
    "https://zen.mplusm.site/api/chat",
    data=json.dumps({"message": "银行给我放了1000万贷款，利率2.4，我想拿去投资"}).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(req, timeout=25) as r:
    body = json.loads(r.read())
    print(f"\n  用户：银行给我放了1000万贷款，利率2.4，我想拿去投资")
    print(f"  AI回复：{body['reply']}")

req2 = urllib.request.Request(
    "https://zen.mplusm.site/api/chat",
    data=json.dumps({"message": "我最近很焦虑，感觉什么都没做好", "session_id": body["session_id"]}).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(req2, timeout=25) as r:
    body2 = json.loads(r.read())
    print(f"\n  用户：我最近很焦虑，感觉什么都没做好")
    print(f"  AI回复：{body2['reply']}")

sftp.close()
ssh.close()
