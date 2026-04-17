#!/usr/bin/env python3
import os
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(
    os.environ.get("SERVER_IP", "43.133.145.77"),
    username=os.environ.get("SERVER_USER", "root"),
    password=os.environ["SERVER_PASS"],
    timeout=20,
)

def run(cmd):
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=30)
    return (stdout.read() + stderr.read()).decode("utf-8", errors="replace").strip()

print("=== Nginx config structure ===")
print(run("find /etc/nginx -name '*.conf' 2>/dev/null | head -30"))
print("\n=== Python3 ===")
print(run("python3 --version; which python3; pip3 --version 2>/dev/null || which pip"))
print("\n=== Node/PM2 ===")
print(run("node --version; npm --version; pm2 list 2>/dev/null | head -20"))

ssh.close()
