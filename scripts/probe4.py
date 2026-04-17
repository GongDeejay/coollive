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

print("=== vhost nginx dir ===")
print(run("ls /www/server/panel/vhost/nginx/"))
print("\n=== sample vhost ===")
print(run("cat /www/server/panel/vhost/nginx/app.mplusm.site.conf 2>/dev/null | head -60"))
print("\n=== wwwroot ===")
print(run("ls /www/wwwroot/"))

ssh.close()
