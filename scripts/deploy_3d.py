#!/usr/bin/env python3
"""
Deploy 3D Quiz Platform (Next.js) to 3d.mplusm.site
- Clones from GitHub, installs deps, builds, starts with PM2
- DNS via Tencent Cloud DNSPod
- Nginx vhost + Let's Encrypt SSL
"""
import os
import sys
import time
import json
import urllib.request
import paramiko
from pathlib import Path

SERVER_IP     = "43.133.145.77"
SERVER_USER   = "root"
SERVER_PASS   = os.environ["SERVER_PASS"]
DOMAIN        = "3d.mplusm.site"
APP_DIR       = "/opt/3d-platform"
VHOST_DIR     = "/www/server/panel/vhost/nginx"
NEXT_PORT     = 3000

TENCENT_ID    = os.environ["TENCENT_SECRET_ID"]
TENCENT_KEY   = os.environ["TENCENT_SECRET_KEY"]

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "ZenTalk2026!")
SESSION_SECRET = os.environ.get("SESSION_SECRET", "zentalk-3d-session-secret-2026-long")

REPO_URL = "https://github.com/GongDeejay/3D.git"

# ── helpers ────────────────────────────────────────────────────────

def ssh_connect():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(SERVER_IP, username=SERVER_USER, password=SERVER_PASS, timeout=20)
    return c

def run(ssh, cmd, check=True, timeout=300):
    print(f"  $ {cmd[:120]}")
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    combined = (out + err).strip()
    for line in combined.split("\n")[-8:]:
        if line.strip():
            print(f"    {line}")
    if check and code != 0:
        raise RuntimeError(f"Command failed (exit {code}): {cmd[:80]}")
    return combined, code

def write_remote(sftp, path, content):
    with sftp.open(path, "w") as f:
        f.write(content)
    print(f"  written: {path}")

def log(msg):
    print(f"\n\033[1;36m[3d-deploy]\033[0m {msg}")

# ── DNS ────────────────────────────────────────────────────────────

def setup_dns():
    import hmac, hashlib, datetime, requests as req
    log("Step 1: DNS — 3d.mplusm.site")

    service, host = "dnspod", "dnspod.tencentcloudapi.com"
    endpoint = f"https://{host}"

    def sign(key, msg):
        return hmac.new(key, msg.encode(), hashlib.sha256).digest()

    def call(action, params):
        now = datetime.datetime.utcnow()
        ts = str(int(now.timestamp()))
        date = now.strftime("%Y-%m-%d")
        algo = "TC3-HMAC-SHA256"
        payload = json.dumps(params)
        hp = hashlib.sha256(payload.encode()).hexdigest()
        ch = f"content-type:application/json; charset=utf-8\nhost:{host}\n"
        sh = "content-type;host"
        cr = "\n".join(["POST", "/", "", ch, sh, hp])
        cs = f"{date}/{service}/tc3_request"
        s2s = f"{algo}\n{ts}\n{cs}\n{hashlib.sha256(cr.encode()).hexdigest()}"
        sec_date = sign(("TC3"+TENCENT_KEY).encode(), date)
        sec_svc  = sign(sec_date, service)
        sec_sign = sign(sec_svc, "tc3_request")
        sig = hmac.new(sec_sign, s2s.encode(), hashlib.sha256).hexdigest()
        auth = f"{algo} Credential={TENCENT_ID}/{cs}, SignedHeaders={sh}, Signature={sig}"
        headers = {"Authorization": auth, "Content-Type": "application/json; charset=utf-8",
                   "Host": host, "X-TC-Action": action, "X-TC-Timestamp": ts, "X-TC-Version": "2021-03-23"}
        return req.post(endpoint, headers=headers, data=payload, timeout=15).json()

    resp = call("DescribeRecordList", {"Domain": "mplusm.site", "Subdomain": "3d", "RecordType": "A"})
    records = resp.get("Response", {}).get("RecordList", [])
    existing_id = next((r["RecordId"] for r in records if r.get("Type") == "A"), None)
    current_ip  = next((r["Value"] for r in records if r.get("Type") == "A"), None)

    if existing_id and current_ip == SERVER_IP:
        print(f"  DNS already correct: 3d.mplusm.site → {SERVER_IP}")
        return

    if existing_id:
        r2 = call("ModifyRecord", {"Domain": "mplusm.site", "SubDomain": "3d",
                  "RecordType": "A", "RecordLine": "默认", "Value": SERVER_IP,
                  "RecordId": existing_id, "TTL": 600})
    else:
        r2 = call("CreateRecord", {"Domain": "mplusm.site", "SubDomain": "3d",
                  "RecordType": "A", "RecordLine": "默认", "Value": SERVER_IP, "TTL": 600})

    if r2.get("Response", {}).get("Error"):
        print(f"  DNS Error: {r2['Response']['Error']}")
    else:
        print(f"  DNS OK: 3d.mplusm.site → {SERVER_IP}")

# ── Main ───────────────────────────────────────────────────────────

def main():
    setup_dns()

    ssh = ssh_connect()
    sftp = ssh.open_sftp()
    print(f"  Connected to {SERVER_IP}")

    # ── Step 2: Clone / update code ──────────────────────────────
    log("Step 2: Clone repository")
    run(ssh, f"test -d {APP_DIR}/.git && echo EXISTS || echo MISSING", check=False)
    out, _ = run(ssh, f"test -d {APP_DIR}/.git && echo EXISTS || echo MISSING", check=False)
    if "EXISTS" in out:
        print("  Repo exists — pulling latest")
        run(ssh, f"cd {APP_DIR} && git pull origin main 2>&1 | tail -5")
    else:
        run(ssh, f"mkdir -p {APP_DIR}")
        run(ssh, f"git clone {REPO_URL} {APP_DIR} --depth=1 2>&1 | tail -5", timeout=120)

    # ── Step 3: Write .env ───────────────────────────────────────
    log("Step 3: Configure environment")
    env_content = (
        f'DATABASE_URL="file:{APP_DIR}/prisma/prod.db"\n'
        f'NEXT_PUBLIC_BASE_URL="https://{DOMAIN}"\n'
        f'ADMIN_PASSWORD="{ADMIN_PASSWORD}"\n'
        f'SESSION_SECRET="{SESSION_SECRET}"\n'
        f'NODE_ENV="production"\n'
    )
    write_remote(sftp, f"{APP_DIR}/.env", env_content)

    # ── Step 4: Install Node.js if needed ───────────────────────
    log("Step 4: Ensure Node.js 20 + npm")
    out, _ = run(ssh, "node --version 2>/dev/null || echo MISSING", check=False)
    if "MISSING" in out or "v" not in out:
        print("  Installing Node.js 20 via nvm...")
        run(ssh, 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash', timeout=60)
        run(ssh, 'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm install 20 && nvm alias default 20', timeout=120)
    else:
        print(f"  Node.js already installed: {out.strip()}")

    # ── Step 5: Install deps & build ────────────────────────────
    log("Step 5: npm install + prisma + build")
    # Source nvm in case it's needed
    node_cmd = 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"'
    run(ssh, f'{node_cmd}; cd {APP_DIR} && npm ci --prefer-offline 2>&1 | tail -8', timeout=240)
    run(ssh, f'{node_cmd}; cd {APP_DIR} && npx prisma generate 2>&1 | tail -4', timeout=60)
    run(ssh, f'{node_cmd}; cd {APP_DIR} && npx prisma db push --accept-data-loss 2>&1 | tail -4', timeout=60)
    run(ssh, f'{node_cmd}; cd {APP_DIR} && npm run build 2>&1 | tail -12', timeout=300)

    # ── Step 6: PM2 start ────────────────────────────────────────
    log("Step 6: Start with PM2")
    run(ssh, "pm2 delete 3d-platform 2>/dev/null || true", check=False)
    run(ssh,
        f'{node_cmd}; '
        f'cd {APP_DIR} && '
        f'DATABASE_URL="file:{APP_DIR}/prisma/prod.db" '
        f'NEXT_PUBLIC_BASE_URL="https://{DOMAIN}" '
        f'ADMIN_PASSWORD="{ADMIN_PASSWORD}" '
        f'SESSION_SECRET="{SESSION_SECRET}" '
        f'NODE_ENV=production '
        f'pm2 start npm --name 3d-platform -- start'
    )
    run(ssh, "pm2 save")

    print("  Waiting for Next.js to start...")
    for i in range(20):
        out, _ = run(ssh, f"curl -sf http://127.0.0.1:{NEXT_PORT}/ -o /dev/null -w '%{{http_code}}' || echo 000", check=False)
        code = out.strip().split()[-1]
        if code in ("200", "301", "302"):
            print(f"  Next.js is up! (HTTP {code})")
            break
        time.sleep(4)
    else:
        print("  WARNING: Next.js slow to start, checking logs...")
        run(ssh, "pm2 logs 3d-platform --nostream --lines 15", check=False)

    # ── Step 7: SSL cert ─────────────────────────────────────────
    log("Step 7: SSL certificate")
    out, _ = run(ssh, f"test -f /etc/letsencrypt/live/{DOMAIN}/fullchain.pem && echo EXISTS || echo MISSING", check=False)
    if "EXISTS" in out:
        print(f"  Cert already exists for {DOMAIN}")
    else:
        # Write temp HTTP vhost for webroot challenge
        temp_vhost = f"""server {{
    listen 80;
    server_name {DOMAIN};
    root /www/wwwroot/{DOMAIN};
    location /.well-known {{ try_files $uri $uri/ =404; }}
    location / {{ proxy_pass http://127.0.0.1:{NEXT_PORT}; proxy_http_version 1.1;
                  proxy_set_header Host $host; }}
}}
"""
        run(ssh, f"mkdir -p /www/wwwroot/{DOMAIN}")
        write_remote(sftp, f"{VHOST_DIR}/{DOMAIN}.conf", temp_vhost)
        run(ssh, "/www/server/nginx/sbin/nginx -t && /www/server/nginx/sbin/nginx -s reload")
        time.sleep(3)

        _, code = run(ssh,
            f"certbot certonly --webroot -w /www/wwwroot/{DOMAIN} -d {DOMAIN} "
            f"--non-interactive --agree-tos --email admin@mplusm.site 2>&1",
            check=False, timeout=120
        )
        if code != 0:
            print("  Webroot failed, trying standalone...")
            run(ssh, "/www/server/nginx/sbin/nginx -s stop || true", check=False)
            time.sleep(2)
            run(ssh, f"certbot certonly --standalone -d {DOMAIN} --non-interactive --agree-tos --email admin@mplusm.site 2>&1", check=False, timeout=120)
            run(ssh, "/www/server/nginx/sbin/nginx || true", check=False)

    # ── Step 8: Final Nginx vhost ─────────────────────────────────
    log("Step 8: Nginx vhost (HTTPS + proxy)")
    final_vhost = f"""server {{
    listen 80;
    server_name {DOMAIN};
    return 301 https://$host$request_uri;
}}

server {{
    listen 443 ssl;
    server_name {DOMAIN};

    ssl_certificate /etc/letsencrypt/live/{DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/{DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    access_log /www/wwwlogs/3d.access.log;
    error_log /www/wwwlogs/3d.error.log;

    location / {{
        proxy_pass http://127.0.0.1:{NEXT_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
    }}
}}
"""
    write_remote(sftp, f"{VHOST_DIR}/{DOMAIN}.conf", final_vhost)
    out, code = run(ssh, "/www/server/nginx/sbin/nginx -t 2>&1", check=False)
    if code == 0:
        run(ssh, "/www/server/nginx/sbin/nginx -s reload")
        print("  Nginx reloaded")
    else:
        raise RuntimeError(f"Nginx config invalid:\n{out}")

    # Auto-renewal
    run(ssh,
        '(crontab -l 2>/dev/null | grep -v "certbot renew"; '
        'echo \'0 3 * * * certbot renew --quiet --post-hook "/www/server/nginx/sbin/nginx -s reload"\') | crontab -',
        check=False
    )

    # ── Step 9: Verify ───────────────────────────────────────────
    log("Step 9: Verify")
    time.sleep(4)
    out, _ = run(ssh, f"curl -sk https://{DOMAIN}/ -o /dev/null -w '%{{http_code}}' || echo 000", check=False)
    code_str = out.strip().split()[-1]
    if code_str == "200":
        print(f"\n  \033[1;32m✓ Deployed: https://{DOMAIN}\033[0m")
        print(f"  \033[1;32m✓ Admin:    https://{DOMAIN}/admin\033[0m")
    else:
        print(f"\n  HTTP {code_str} — try https://{DOMAIN} in a minute")
        run(ssh, "pm2 logs 3d-platform --nostream --lines 10", check=False)

    sftp.close()
    ssh.close()


if __name__ == "__main__":
    main()
