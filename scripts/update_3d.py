#!/usr/bin/env python3
"""
Update 3D platform on server — upload changed files, rebuild, restart.
Only touches /opt/3d-platform. Does NOT touch ZenTalk.
"""
import os, time, json, urllib.request
import paramiko
from pathlib import Path

LOCAL_SRC = Path("/workspace/3d-work")
APP_DIR   = "/opt/3d-platform"
SERVER_IP = "43.133.145.77"
SERVER_PASS = os.environ["SERVER_PASS"]

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(SERVER_IP, username="root", password=SERVER_PASS, timeout=20)
sftp = ssh.open_sftp()

def run(cmd, timeout=300):
    print(f"  $ {cmd[:100]}")
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    combined = (out + err).strip()
    for line in combined.split("\n")[-6:]:
        if line.strip(): print(f"    {line}")
    return combined, code

def upload_file(local: Path, remote: str):
    parent = remote.rsplit("/", 1)[0]
    run(f"mkdir -p {parent}", timeout=10)
    sftp.put(str(local), remote)

def log(msg):
    print(f"\n\033[1;36m[3d-update]\033[0m {msg}")

# ── 1. Upload all changed source files ────────────────────────────
log("Step 1: Uploading source files")

changed_files = [
    # New question banks
    "src/lib/question-bank/evaluation-literacy-v1.ts",
    "src/lib/question-bank/governance-literacy-v1.ts",
    "src/lib/question-bank/registry.ts",
    # Updated libs
    "src/lib/ladder.ts",
    "src/lib/answers-schema.ts",
    "src/lib/analysis.ts",
    "src/lib/user-rating.ts",
    # Updated pages
    "src/app/ladder/step-2/page.tsx",
    "src/app/ladder/step-3/page.tsx",
    "src/app/admin/(dashboard)/page.tsx",
    "src/app/admin/(dashboard)/new/page.tsx",
    "src/app/admin/(dashboard)/[id]/page.tsx",
    "src/app/admin/distributions/actions.ts",
    "src/app/s/[slug]/page.tsx",
    "src/app/s/[slug]/actions.ts",
    # Tests
    "tests/logic.test.ts",
]

for rel in changed_files:
    local = LOCAL_SRC / rel
    remote = f"{APP_DIR}/{rel}"
    upload_file(local, remote)
    print(f"  ✓ {rel}")

# ── 2. Rebuild ────────────────────────────────────────────────────
log("Step 2: Rebuild (prisma generate + next build)")
node_cmd = 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"'
run(f"{node_cmd}; cd {APP_DIR} && npm run build 2>&1 | tail -20", timeout=300)

# ── 3. Restart ───────────────────────────────────────────────────
log("Step 3: Restart PM2")
run("pm2 restart 3d-platform")
time.sleep(6)

# ── 4. Smoke test ────────────────────────────────────────────────
log("Step 4: Smoke tests")
print("  Health check...")
out, _ = run("curl -sk https://3d.mplusm.site/ -o /dev/null -w '%{http_code}'", timeout=15)
code = out.strip().split()[-1]
print(f"  Homepage: HTTP {code}")

for path in ["/ladder", "/ladder/step-2", "/ladder/step-3", "/admin/new"]:
    out, _ = run(f"curl -sk https://3d.mplusm.site{path} -o /dev/null -w '%{{http_code}}'", timeout=10)
    c = out.strip().split()[-1]
    status = "✓" if c in ("200", "302") else "✗"
    print(f"  {status} {path}: HTTP {c}")

log("Done!")
print(f"  Site:  https://3d.mplusm.site")
print(f"  Admin: https://3d.mplusm.site/admin")
print(f"  Ladder: https://3d.mplusm.site/ladder")

sftp.close()
ssh.close()
