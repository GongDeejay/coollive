#!/usr/bin/env python3
import os, re, paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("43.133.145.77", username="root", password=os.environ["SERVER_PASS"], timeout=20)

def run(cmd, timeout=30):
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    return (stdout.read() + stderr.read()).decode("utf-8", errors="replace")

# Download the JS bundle content
print("Downloading JS bundle...")
content = run("cat /var/www/note.mplusm.site/dist/assets/index-DK9nIIGp.js", timeout=20)

# Extract Chinese text chunks (strings in quotes that contain Chinese)
# Find all quoted strings
chunks = re.findall(r'"([^"]{10,})"', content)
chinese_chunks = [c for c in chunks if re.search(r'[\u4e00-\u9fff]', c) and len(c) > 8]

print(f"\nFound {len(chinese_chunks)} Chinese text chunks\n")
print("=" * 60)
for chunk in chinese_chunks[:200]:
    # Clean up escaped characters
    clean = chunk.replace('\\n', '\n').replace('\\"', '"').replace('\\\\', '\\')
    print(clean)
    print("---")

ssh.close()
