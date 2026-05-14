#!/usr/bin/env python3
import os, paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("43.133.145.77", username="root", password=os.environ["SERVER_PASS"], timeout=20)

def run(cmd, timeout=15):
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    return (stdout.read() + stderr.read()).decode("utf-8", errors="replace").strip()

print(run("pm2 logs zentalk-backend --nostream --lines 30"))
print("\n=== direct health ===")
print(run("curl -sf http://127.0.0.1:8765/health || echo FAIL"))
ssh.close()
