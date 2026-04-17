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

print("=== find nginx conf ===")
print(run("find / -name 'nginx.conf' 2>/dev/null"))
print("\n=== nginx -T ===")
print(run("nginx -T 2>&1 | head -80"))
print("\n=== /www /opt ===")
print(run("ls /www/ 2>/dev/null; ls /opt/ 2>/dev/null"))

ssh.close()
