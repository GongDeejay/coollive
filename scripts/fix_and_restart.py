#!/usr/bin/env python3
import os
import time
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("43.133.145.77", username="root", password=os.environ["SERVER_PASS"], timeout=20)

def run(cmd, timeout=30):
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    out = (stdout.read() + stderr.read()).decode("utf-8", errors="replace").strip()
    print(f"  $ {cmd[:100]}")
    for line in out.split("\n")[-8:]:
        if line.strip():
            print(f"    {line}")
    return out

# Update .env with correct model name
run("""cat > /opt/zentalk/.env << 'EOF'
XIAOMI_API_KEY=tp-cjry9ezj7fe7po4krmw0jpj8i6o7j9dajreswch7oqd6wi4s
XIAOMI_BASE_URL=https://token-plan-cn.xiaomimimo.com/v1
XIAOMI_MODEL=mimo-v2-omni
EOF""")

# Upload fixed main.py
sftp = ssh.open_sftp()
sftp.put("/workspace/backend/main.py", "/opt/zentalk/backend/main.py")
print("  uploaded: main.py")
sftp.close()

# Restart PM2 process with new env vars
run("pm2 delete zentalk-backend 2>/dev/null || true")
run(
    "cd /opt/zentalk && "
    "XIAOMI_API_KEY=tp-cjry9ezj7fe7po4krmw0jpj8i6o7j9dajreswch7oqd6wi4s "
    "XIAOMI_BASE_URL=https://token-plan-cn.xiaomimimo.com/v1 "
    "XIAOMI_MODEL=mimo-v2-omni "
    "pm2 start 'python3 -m uvicorn backend.main:app --host 127.0.0.1 --port 8765' "
    "--name zentalk-backend"
)
run("pm2 save")

print("\n  Waiting for health check...")
for i in range(10):
    out = run(f"curl -sf http://127.0.0.1:8765/health || echo FAIL")
    if '"ok"' in out or "ok" in out.lower():
        print("  Backend is healthy!")
        break
    time.sleep(3)

# Quick end-to-end test
print("\n=== E2E chat test ===")
import urllib.request, json
req = urllib.request.Request(
    "https://zen.mplusm.site/api/chat",
    data=json.dumps({"message": "我最近工作压力很大"}).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=20) as r:
        body = json.loads(r.read())
        print(f"  Status: 200")
        print(f"  Reply: {body.get('reply', '')}")
except Exception as e:
    print(f"  Error: {e}")
    # Show recent PM2 logs
    run("pm2 logs zentalk-backend --nostream --lines 15")

ssh.close()
