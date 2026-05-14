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

print("[1] Uploading..."); sftp.put(str(REPO / "backend" / "main.py"), "/opt/zentalk/backend/main.py")
print("[2] Restarting..."); run("pm2 restart zentalk-backend"); time.sleep(5)
run("curl -sf http://127.0.0.1:8765/health"); print()

# Test cases targeting the 7 methods
tests = [
    ("叙事重构", "我感觉一直在努力但没有进展，是不是我不够努力"),
    ("拆层", "我和同事关系不好，沟通很累"),
    ("挖前提", "我觉得人就是要对社会有贡献才有意义"),
    ("命名", "我说不清楚，就是感觉很堵，很多事情同时压着"),
    ("边界", "朋友有困难来找我，我帮了但自己很累，不帮又过意不去"),
    ("判断+对比", "我想先把所有事想清楚再开始行动"),
]

session_id = None
for method, q in tests:
    payload = {"message": q}
    if session_id:
        payload["session_id"] = session_id
    req = urllib.request.Request(
        "https://zen.mplusm.site/api/chat",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=35) as r:
        body = json.loads(r.read())
        session_id = body["session_id"]
        print(f"[{method}]")
        print(f"用户：{q}")
        print(f"AI ：{body['reply']}")
        print()

sftp.close()
ssh.close()
