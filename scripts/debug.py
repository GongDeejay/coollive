#!/usr/bin/env python3
import os
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("43.133.145.77", username="root", password=os.environ["SERVER_PASS"], timeout=20)

def run(cmd):
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=30)
    return (stdout.read() + stderr.read()).decode("utf-8", errors="replace").strip()

print("=== PM2 status ===")
print(run("pm2 list"))
print("\n=== Backend logs (last 30 lines) ===")
print(run("pm2 logs zentalk-backend --nostream --lines 30"))
print("\n=== Health check ===")
print(run("curl -sv http://127.0.0.1:8765/health 2>&1"))
print("\n=== Port listening? ===")
print(run("ss -tlnp | grep 8765 || echo 'NOT LISTENING'"))
print("\n=== Nginx api proxy test ===")
print(run("curl -sk https://zen.mplusm.site/api/health"))
print("\n=== Nginx vhost config ===")
print(run("cat /www/server/panel/vhost/nginx/zen.mplusm.site.conf"))

ssh.close()
