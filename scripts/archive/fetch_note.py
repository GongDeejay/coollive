#!/usr/bin/env python3
"""Fetch note.mplusm.site content from server (same network)."""
import os, paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("43.133.145.77", username="root", password=os.environ["SERVER_PASS"], timeout=20)

def run(cmd, timeout=30):
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    return (stdout.read() + stderr.read()).decode("utf-8", errors="replace")

# Get the main page
print("=== Homepage ===")
print(run("curl -sk https://note.mplusm.site/ | head -200"))

print("\n=== Check what app is running (PM2 / nginx config) ===")
print(run("cat /www/server/panel/vhost/nginx/note.mplusm.site.conf"))

print("\n=== Check web root ===")
print(run("ls /www/wwwroot/note.mplusm.site/ 2>/dev/null || echo 'not there'"))

ssh.close()
