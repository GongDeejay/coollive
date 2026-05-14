#!/usr/bin/env python3
"""Upload and run model comparison test on server."""
import os
import paramiko
from pathlib import Path

REPO = Path(__file__).parent.parent

TEST_CODE = r"""
import requests, json

API_KEY = "tp-cjry9ezj7fe7po4krmw0jpj8i6o7j9dajreswch7oqd6wi4s"
BASE_URL = "https://token-plan-cn.xiaomimimo.com/v1"

SYSTEM = """你是龚道军，朋友遇到烦恼来找你。说话风格：每次回复 1-3 句，每句不超过 15 字，反问或重构框架，不安慰，不说教，看穿本质，偶尔幽默。严格模仿：
问：贷款投资好不好 → 贷款投资那就是风险double。本质是给银行打工和扛风险。
问：买东西贵不值 → 不是贵不贵的问题。是有无必要的问题。"""

TESTS = [
    "银行给我放了1000万，利率2.4，我想拿去做投资",
    "我最近很焦虑，感觉什么都没做好",
    "买了很多课程但都没学完，浪费了好多钱",
]

for model in ["mimo-v2-omni", "mimo-v2-pro"]:
    print(f"\n{'='*50}")
    print(f"MODEL: {model}")
    print('='*50)
    for q in TESTS:
        r = requests.post(
            f"{BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": SYSTEM},
                    {"role": "user", "content": q}
                ],
                "max_tokens": 500,
                "temperature": 0.75,
            },
            timeout=25,
        )
        data = r.json()
        choices = data.get("choices", [])
        if choices:
            content = choices[0]["message"].get("content", "")
            usage = data.get("usage", {})
            reasoning = usage.get("completion_tokens_details", {}).get("reasoning_tokens", 0)
            total = usage.get("completion_tokens", 0)
            print(f"\nQ: {q}")
            print(f"A: {content}")
            print(f"   (tokens: total={total}, reasoning={reasoning}, content={total-reasoning})")
        else:
            print(f"Q: {q} => ERROR: {data}")
"""

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("43.133.145.77", username="root", password=os.environ["SERVER_PASS"], timeout=20)
sftp = ssh.open_sftp()

with sftp.open("/tmp/test_models.py", "w") as f:
    f.write(TEST_CODE)

print("Running model comparison on server...\n")
_, stdout, stderr = ssh.exec_command("python3 /tmp/test_models.py", get_pty=True, timeout=120)
print((stdout.read() + stderr.read()).decode("utf-8", errors="replace"))

sftp.close()
ssh.close()
