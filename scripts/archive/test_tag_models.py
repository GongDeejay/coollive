#!/usr/bin/env python3
"""Compare mimo-v2-omni vs mimo-v2-pro for tag extraction."""
import os, json, paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("43.133.145.77", username="root", password=os.environ["SERVER_PASS"], timeout=20)

test_script = r'''
import requests, json

API_KEY = "tp-cjry9ezj7fe7po4krmw0jpj8i6o7j9dajreswch7oqd6wi4s"
BASE = "https://token-plan-cn.xiaomimimo.com/v1"

PROMPT = """你是日记标签提取系统。从日记提取标签，返回JSON。
emotion: 焦虑/平静/顿悟/喜悦/低落/愤怒/困惑/感恩/空/疲惫/兴奋/矛盾/满足/孤独/轻松/烦躁/期待（1-3个，贴合实际）
topic: 自我/关系/工作/金钱/身体/时间/目标/创造/社会/学习/决策/习惯/记忆/家庭/项目/技术/写作/健康（1-4个）
operation: 命名/重构/执念/放下/挖前提/边界/判断/观察/复盘/计划/感受/顿悟（1-3个）
timeview: 过去/当下/未来/跨越（1个）
energy: 高能/低谷/平稳/波动（1个）
keywords: 原文关键词2-6个
summary: 不超过18字的核心概括

规则：出现"很爽/开心/成就感"必选喜悦或满足；"累/疲惫"必选疲惫；"焦虑/担心"必选焦虑。
只返回JSON不要其他内容。"""

tests = [
    "很爽！项目终于上线了，但累死了",
    "感觉今天什么都没做，很焦虑，时间都哪去了",
    "喝了杯咖啡，坐在阳台，什么都没想，挺好的",
    "今天跟同事吵架了，真的很烦，但也觉得自己有点反应过度",
]

for model in ["mimo-v2-omni", "mimo-v2-pro"]:
    print(f"\n=== {model} ===")
    for text in tests:
        r = requests.post(f"{BASE}/chat/completions",
            headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
            json={"model": model, "messages": [
                {"role": "system", "content": PROMPT},
                {"role": "user", "content": text}
            ], "max_tokens": 600, "temperature": 0.5},
            timeout=25)
        d = r.json()
        content = d.get("choices", [{}])[0].get("message", {}).get("content", "")
        usage = d.get("usage", {})
        reasoning = usage.get("completion_tokens_details", {}).get("reasoning_tokens", 0)
        total = usage.get("completion_tokens", 0)
        # try parse
        import re
        m = re.search(r"\{.*\}", content, re.DOTALL)
        if m:
            try:
                t = json.loads(m.group())
                print(f"  '{text[:22]}': emotion={t.get('emotion')} energy={t.get('energy')} reasoning={reasoning}/{total}")
            except:
                print(f"  parse error: {content[:80]}")
        else:
            print(f"  no JSON: {content[:80]} (reasoning={reasoning}/{total})")
'''

sftp = ssh.open_sftp()
with sftp.open("/tmp/test_tags.py", "w") as f:
    f.write(test_script)
_, stdout, stderr = ssh.exec_command("python3 /tmp/test_tags.py", get_pty=True, timeout=120)
print((stdout.read() + stderr.read()).decode())
sftp.close(); ssh.close()
