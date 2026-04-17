#!/usr/bin/env python3
import os
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("43.133.145.77", username="root", password=os.environ["SERVER_PASS"], timeout=20)

def run(cmd, timeout=30):
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    return (stdout.read() + stderr.read()).decode("utf-8", errors="replace").strip()

API_KEY = "tp-cjry9ezj7fe7po4krmw0jpj8i6o7j9dajreswch7oqd6wi4s"
BASE_URL = "https://token-plan-cn.xiaomimimo.com/v1"

print("=== Full response with more tokens ===")
print(run(f"""curl -s -X POST "{BASE_URL}/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {API_KEY}" \
  -d '{{"model":"mimo-v2-omni","messages":[{{"role":"system","content":"你是禅师，用3句话简短回答"}},{{"role":"user","content":"我最近工作压力很大，怎么办"}}],"max_tokens":300}}' """, timeout=25))

ssh.close()
