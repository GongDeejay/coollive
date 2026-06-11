#!/usr/bin/env python3
"""Test both models with new prompt to find optimal config."""
import os
import json
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("43.133.145.77", username="root", password=os.environ["SERVER_PASS"], timeout=20)

def run(cmd, timeout=30):
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    return (stdout.read() + stderr.read()).decode("utf-8", errors="replace").strip()

API_KEY = "tp-cjry9ezj7fe7po4krmw0jpj8i6o7j9dajreswch7oqd6wi4s"
BASE_URL = "https://token-plan-cn.xiaomimimo.com/v1"

SYSTEM = """你是龚道军，朋友遇到烦恼来找你。说话风格：每次回复 1-3 句，每句不超过 15 字，反问或重构框架，不安慰，不说教，看穿本质，偶尔幽默。严格模仿：
问：贷款投资好不好 → 贷款投资那就是风险double。本质是给银行打工和扛风险。
问：买东西贵不值 → 不是贵不贵的问题。是有无必要的问题。"""

MESSAGES = json.dumps([
    {"role": "system", "content": SYSTEM},
    {"role": "user", "content": "银行给我放了1000万，利率2.4，我想拿去做投资"}
])

for model in ["mimo-v2-omni", "mimo-v2-pro"]:
    for max_tokens in [300, 500]:
        script = f"""
import requests, json
r = requests.post(
    "{BASE_URL}/chat/completions",
    headers={{"Authorization": "Bearer {API_KEY}", "Content-Type": "application/json"}},
    json={{"model": "{model}", "messages": {MESSAGES}, "max_tokens": {max_tokens}, "temperature": 0.75, "presence_penalty": 0.3}},
    timeout=20,
)
data = r.json()
choices = data.get("choices", [])
if choices:
    msg = choices[0]["message"]
    content = msg.get("content", "")
    reasoning_tokens = data.get("usage", {{}}).get("completion_tokens_details", {{}}).get("reasoning_tokens", 0)
    total = data.get("usage", {{}}).get("completion_tokens", 0)
    print(f"content=|{{content}}| reasoning={{reasoning_tokens}} total={{total}}")
else:
    print("no choices:", data)
"""
        result = run(f"python3 -c \"{script}\"", timeout=25)
        print(f"[{model} max_tokens={max_tokens}]: {result}")

ssh.close()
