#!/usr/bin/env python3
import os
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("43.133.145.77", username="root", password=os.environ["SERVER_PASS"], timeout=20)

def run(cmd, timeout=20):
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    return (stdout.read() + stderr.read()).decode("utf-8", errors="replace").strip()

API_KEY = "tp-cjry9ezj7fe7po4krmw0jpj8i6o7j9dajreswch7oqd6wi4s"
BASE_URL = "https://token-plan-cn.xiaomimimo.com/v1"

# Test the actual model IDs returned by /models
for model in ["mimo-v2-omni", "mimo-v2-pro", "mimo-v2-tts"]:
    result = run(f"""curl -s -X POST "{BASE_URL}/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {API_KEY}" \
  -d '{{"model":"{model}","messages":[{{"role":"user","content":"你好"}}],"max_tokens":30}}' """, timeout=20)
    print(f"model={model}:\n  {result[:300]}\n")

ssh.close()
