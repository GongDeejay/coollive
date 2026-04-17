#!/usr/bin/env python3
"""Test Xiaomi API with raw requests to diagnose 403."""
import os
import json
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("43.133.145.77", username="root", password=os.environ["SERVER_PASS"], timeout=20)

def run(cmd, timeout=20):
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    return (stdout.read() + stderr.read()).decode("utf-8", errors="replace").strip()

API_KEY = "tp-cjry9ezj7fe7po4krmw0jpj8i6o7j9dajreswch7oqd6wi4s"
BASE_URL = "https://token-plan-cn.xiaomimimo.com/v1"

print("=== Test 1: raw curl with Bearer token ===")
print(run(f"""curl -s -X POST "{BASE_URL}/chat/completions" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer {API_KEY}" \\
  -d '{{"model":"mimo","messages":[{{"role":"user","content":"你好"}}],"max_tokens":50}}'"""))

print("\n=== Test 2: list models ===")
print(run(f"""curl -s "{BASE_URL}/models" -H "Authorization: Bearer {API_KEY}" """))

print("\n=== Test 3: check openai SDK version and try with explicit params ===")
script = f"""
import requests, json
r = requests.post(
    "{BASE_URL}/chat/completions",
    headers={{"Authorization": "Bearer {API_KEY}", "Content-Type": "application/json"}},
    json={{"model": "mimo", "messages": [{{"role": "user", "content": "你好"}}], "max_tokens": 50}},
    timeout=15,
)
print("Status:", r.status_code)
print("Body:", r.text[:500])
"""
print(run(f"python3 -c \"{script}\""))

print("\n=== Test 4: try different model names ===")
for model in ["mimo", "MiMo", "mimo-7b", "MiMo-7B-RL"]:
    result = run(f"""curl -s -X POST "{BASE_URL}/chat/completions" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer {API_KEY}" \\
  -d '{{"model":"{model}","messages":[{{"role":"user","content":"hi"}}],"max_tokens":20}}' | head -c 200""")
    print(f"  model={model}: {result}")

ssh.close()
