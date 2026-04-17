#!/usr/bin/env python3
import os
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("43.133.145.77", username="root", password=os.environ["SERVER_PASS"], timeout=20)

def run(cmd):
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=30)
    return (stdout.read() + stderr.read()).decode("utf-8", errors="replace").strip()

print("=== openai version on server ===")
print(run("pip3 show openai | grep Version"))

print("\n=== Full error log ===")
print(run("cat /root/.pm2/logs/zentalk-backend-error.log | tail -60"))

print("\n=== Test LLM call directly ===")
test_script = """
import os, sys
os.environ['XIAOMI_API_KEY'] = sys.argv[1]
from openai import OpenAI
client = OpenAI(
    api_key=os.environ['XIAOMI_API_KEY'],
    base_url='https://token-plan-cn.xiaomimimo.com/v1',
)
try:
    r = client.chat.completions.create(
        model='mimo',
        messages=[{'role':'user','content':'你好'}],
        max_tokens=50,
    )
    print('OK:', r.choices[0].message.content)
except Exception as e:
    print('ERROR:', type(e).__name__, str(e)[:300])
"""
api_key = "tp-cjry9ezj7fe7po4krmw0jpj8i6o7j9dajreswch7oqd6wi4s"
print(run(f"python3 -c \"{test_script}\" '{api_key}' 2>&1"))

ssh.close()
