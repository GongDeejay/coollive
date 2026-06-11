#!/usr/bin/env python3
import os, paramiko
from pathlib import Path

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("43.133.145.77", username="root", password=os.environ["SERVER_PASS"], timeout=20)
sftp = ssh.open_sftp()

sftp.put(str(Path(__file__).parent / "_remote_test.py"), "/tmp/_remote_test.py")
_, stdout, stderr = ssh.exec_command("python3 /tmp/_remote_test.py", get_pty=True, timeout=120)
print((stdout.read() + stderr.read()).decode("utf-8", errors="replace"))

sftp.close()
ssh.close()
