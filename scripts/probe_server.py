#!/usr/bin/env python3
"""Probe script - uses SERVER_PASS env var."""
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
    out = (stdout.read() + stderr.read()).decode("utf-8", errors="replace").strip()
    return out

print("=== OS ===")
print(run("cat /etc/os-release 2>/dev/null || uname -a"))
print("\n=== Package managers ===")
print(run("which yum apt-get dnf pacman apk 2>/dev/null || echo none"))
print("\n=== Existing services ===")
print(run("systemctl list-units --type=service --state=running 2>/dev/null | head -20"))
print("\n=== Nginx status ===")
print(run("which nginx; nginx -v 2>&1; systemctl status nginx 2>&1 | head -6"))
print("\n=== Docker status ===")
print(run("which docker; docker --version 2>&1; systemctl status docker 2>&1 | head -6"))
print("\n=== Port 80/443 ===")
print(run("ss -tlnp | grep -E ':80|:443' || netstat -tlnp 2>/dev/null | grep -E ':80|:443'"))

ssh.close()
