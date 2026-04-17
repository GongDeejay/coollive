#!/usr/bin/env python3
import os, paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("43.133.145.77", username="root", password=os.environ["SERVER_PASS"], timeout=20)

def run(cmd, timeout=30):
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    return (stdout.read() + stderr.read()).decode("utf-8", errors="replace")

# The dist is in /var/www/note.mplusm.site/dist
print("=== Find JS bundle ===")
print(run("ls /var/www/note.mplusm.site/dist/assets/ 2>/dev/null"))

print("\n=== Extract text content from JS bundle (strip JS, get Chinese text) ===")
# Get all Chinese strings from the bundle
result = run(
    "cat /var/www/note.mplusm.site/dist/assets/index-DK9nIIGp.js 2>/dev/null | "
    r"grep -oP '[\u4e00-\u9fff\uff00-\uffef，。！？、：；「」『』【】《》\w\s]{8,}' | "
    "head -300",
    timeout=15
)
print(result)

ssh.close()
