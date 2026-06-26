#!/usr/bin/env python3
import os, json, urllib.request, urllib.error
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("43.133.145.77", username="root", password=os.environ["SERVER_PASS"], timeout=20)

def run(cmd, timeout=15):
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    return (stdout.read() + stderr.read()).decode("utf-8", errors="replace").strip()

# Test directly on server to bypass Nginx
print("=== Direct server test ===")
print(run("""curl -s -X POST http://127.0.0.1:8765/journal/tags \
  -H 'Content-Type: application/json' \
  -d '{"scene":"独自坐在咖啡馆","feeling":"有点孤独","reflection":"孤独不是问题"}'"""))

print("\n=== Check PM2 error logs ===")
print(run("pm2 logs zentalk-backend --nostream --lines 20"))

ssh.close()
