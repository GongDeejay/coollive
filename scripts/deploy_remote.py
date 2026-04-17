#!/usr/bin/env python3
"""
Automated deployment for ZenTalk on aaPanel (BT Panel) server.
- Server: OpenCloudOS 9.4 / 43.133.145.77
- Nginx: /www/server/nginx (aaPanel managed)
- Vhosts: /www/server/panel/vhost/nginx/
- Web roots: /www/wwwroot/
- Backend: Python uvicorn managed by PM2
- SSL: certbot (already installed)
"""
import os
import sys
import time
import paramiko
from pathlib import Path

SERVER_IP = os.environ.get("SERVER_IP", "43.133.145.77")
SERVER_USER = os.environ.get("SERVER_USER", "root")
SERVER_PASS = os.environ["SERVER_PASS"]
DOMAIN = "zen.mplusm.site"
APP_DIR = "/opt/zentalk"
WEB_ROOT = "/www/wwwroot/zen.mplusm.site"
VHOST_DIR = "/www/server/panel/vhost/nginx"
BACKEND_PORT = 8765
REPO_DIR = Path(__file__).parent.parent

XIAOMI_API_KEY = os.environ["XIAOMI_API_KEY"]
XIAOMI_BASE_URL = os.environ.get("XIAOMI_BASE_URL", "https://token-plan-cn.xiaomimimo.com/v1")
XIAOMI_MODEL = os.environ.get("XIAOMI_MODEL", "mimo")


def ssh_connect():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(SERVER_IP, username=SERVER_USER, password=SERVER_PASS, timeout=20)
    return client


def run(ssh, cmd, check=True, timeout=180):
    print(f"  $ {cmd[:120]}")
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    combined = (out + err).strip()
    if combined:
        for line in combined.split("\n")[-10:]:
            if line.strip():
                print(f"    {line}")
    if check and code != 0:
        raise RuntimeError(f"Command failed (exit {code}): {cmd[:80]}")
    return combined, code


def upload_dir(sftp, local_dir, remote_dir):
    local_dir = Path(local_dir)
    for item in sorted(local_dir.rglob("*")):
        if item.is_dir():
            continue
        rel = item.relative_to(local_dir)
        remote_path = f"{remote_dir}/{rel}".replace("\\", "/")
        parent = remote_path.rsplit("/", 1)[0]
        _sftp_mkdir_p(sftp, parent)
        print(f"  upload: {rel}")
        sftp.put(str(item), remote_path)


_created_dirs = set()

def _sftp_mkdir_p(sftp, path):
    if path in _created_dirs:
        return
    parts = [p for p in path.split("/") if p]
    current = ""
    for part in parts:
        current += "/" + part
        if current in _created_dirs:
            continue
        try:
            sftp.stat(current)
        except FileNotFoundError:
            try:
                sftp.mkdir(current)
            except Exception:
                pass
        _created_dirs.add(current)


def upload_file(sftp, local_path, remote_path):
    _sftp_mkdir_p(sftp, remote_path.rsplit("/", 1)[0])
    print(f"  upload: {Path(local_path).name} -> {remote_path}")
    sftp.put(str(local_path), remote_path)


def write_remote(sftp, remote_path, content):
    _sftp_mkdir_p(sftp, remote_path.rsplit("/", 1)[0])
    with sftp.open(remote_path, "w") as f:
        f.write(content)
    print(f"  written: {remote_path}")


def log(msg):
    print(f"\n\033[1;36m[deploy]\033[0m {msg}")


def main():
    log("Step 1: Connecting to server...")
    ssh = ssh_connect()
    sftp = ssh.open_sftp()
    print("  Connected to OpenCloudOS 9.4 / aaPanel server")

    # ── 2. Install Python deps on server ──────────────────────────
    log("Step 2: Installing Python dependencies on server...")
    run(ssh, "pip3 install fastapi uvicorn[standard] openai pydantic python-dotenv 2>&1 | tail -5",
        timeout=120)

    # ── 3. Upload backend ──────────────────────────────────────────
    log("Step 3: Uploading backend...")
    run(ssh, f"mkdir -p {APP_DIR}/backend")
    upload_dir(sftp, REPO_DIR / "backend", f"{APP_DIR}/backend")

    write_remote(sftp, f"{APP_DIR}/.env",
        f"XIAOMI_API_KEY={XIAOMI_API_KEY}\n"
        f"XIAOMI_BASE_URL={XIAOMI_BASE_URL}\n"
        f"XIAOMI_MODEL={XIAOMI_MODEL}\n"
    )

    # ── 4. Upload frontend dist ────────────────────────────────────
    log("Step 4: Uploading frontend dist...")
    run(ssh, f"mkdir -p {WEB_ROOT}")
    upload_dir(sftp, REPO_DIR / "frontend" / "dist", WEB_ROOT)

    # ── 5. Start backend with PM2 ─────────────────────────────────
    log("Step 5: Starting/restarting backend with PM2...")
    run(ssh, "pm2 delete zentalk-backend 2>/dev/null || true", check=False)
    run(ssh,
        f"cd {APP_DIR} && "
        f"XIAOMI_API_KEY={XIAOMI_API_KEY} "
        f"XIAOMI_BASE_URL={XIAOMI_BASE_URL} "
        f"XIAOMI_MODEL={XIAOMI_MODEL} "
        f"pm2 start 'python3 -m uvicorn backend.main:app --host 127.0.0.1 --port {BACKEND_PORT}' "
        f"--name zentalk-backend --no-autorestart"
    )
    run(ssh, "pm2 save")

    print("  Waiting for backend health check...")
    for i in range(15):
        out, code = run(ssh, f"curl -sf http://127.0.0.1:{BACKEND_PORT}/health || echo FAIL", check=False)
        if '"ok"' in out or "ok" in out.lower():
            print("  Backend is healthy!")
            break
        print(f"  ... waiting ({i+1}/15)")
        time.sleep(4)
    else:
        print("  WARNING: Backend did not respond in time, checking PM2 logs...")
        run(ssh, "pm2 logs zentalk-backend --nostream --lines 20", check=False)
        print("  Continuing deployment anyway...")

    # ── 6. SSL Certificate ────────────────────────────────────────
    log("Step 6: Obtaining SSL certificate...")
    out, _ = run(ssh, f"test -f /etc/letsencrypt/live/{DOMAIN}/fullchain.pem && echo EXISTS || echo MISSING",
                  check=False)
    if "EXISTS" in out:
        print(f"  Certificate already exists for {DOMAIN}")
    else:
        # Serve HTTP for cert validation - write a temp vhost
        temp_vhost = f"""server {{
    listen 80;
    server_name {DOMAIN};
    root {WEB_ROOT};
    index index.html;
    location / {{ try_files $uri $uri/ /index.html; }}
}}
"""
        write_remote(sftp, f"{VHOST_DIR}/{DOMAIN}.conf", temp_vhost)
        run(ssh, "/www/server/nginx/sbin/nginx -t && /www/server/nginx/sbin/nginx -s reload")
        time.sleep(3)

        print(f"  Running certbot for {DOMAIN}...")
        _, code = run(ssh,
            f"certbot certonly --webroot -w {WEB_ROOT} -d {DOMAIN} "
            f"--non-interactive --agree-tos --email admin@mplusm.site 2>&1",
            check=False, timeout=120
        )
        if code != 0:
            print("  Webroot mode failed, trying standalone...")
            run(ssh, "rm -f /www/server/panel/vhost/nginx/{DOMAIN}.conf 2>/dev/null || true", check=False)
            run(ssh, "/www/server/nginx/sbin/nginx -s stop || systemctl stop nginx || true", check=False)
            time.sleep(2)
            run(ssh,
                f"certbot certonly --standalone -d {DOMAIN} "
                f"--non-interactive --agree-tos --email admin@mplusm.site 2>&1",
                check=False, timeout=120
            )
            run(ssh, "/www/server/nginx/sbin/nginx || systemctl start nginx || true", check=False)

    # ── 7. Write final Nginx vhost ────────────────────────────────
    log("Step 7: Writing Nginx vhost with SSL...")
    nginx_conf = (REPO_DIR / "nginx" / "zen.mplusm.site.conf").read_text()
    write_remote(sftp, f"{VHOST_DIR}/{DOMAIN}.conf", nginx_conf)
    out, code = run(ssh, "/www/server/nginx/sbin/nginx -t 2>&1", check=False)
    if code == 0:
        run(ssh, "/www/server/nginx/sbin/nginx -s reload")
        print("  Nginx reloaded successfully")
    else:
        print("  Nginx config test failed:")
        print(out)
        raise RuntimeError("Nginx config invalid")

    # ── 8. Auto-renewal ───────────────────────────────────────────
    log("Step 8: Setting up cert auto-renewal...")
    run(ssh,
        "(crontab -l 2>/dev/null | grep -v 'certbot renew'; "
        "echo '0 3 * * * certbot renew --quiet --post-hook \"/www/server/nginx/sbin/nginx -s reload\"') | crontab -",
        check=False
    )

    # ── 9. Final verification ─────────────────────────────────────
    log("Step 9: Verifying deployment...")
    time.sleep(4)
    out, _ = run(ssh, f"curl -sk https://{DOMAIN} -o /dev/null -w '%{{http_code}}' || echo 000", check=False)
    http_code = out.strip().split()[-1]
    if http_code == "200":
        print(f"\n  \033[1;32m✓ Deployment successful!\033[0m")
        print(f"  \033[1;32m✓ Live at: https://{DOMAIN}\033[0m")
    else:
        print(f"  HTTP code: {http_code}")
        # Check if HTTP works (cert might not be ready yet due to DNS)
        out2, _ = run(ssh, f"curl -s http://{DOMAIN} -o /dev/null -w '%{{http_code}}' || echo 000", check=False)
        http2 = out2.strip().split()[-1]
        print(f"  HTTP (non-SSL): {http2}")
        if http2 in ("200", "301"):
            print(f"\n  \033[1;33m✓ Server is responding. SSL may take a moment.\033[0m")
            print(f"  \033[1;33m✓ Try: https://{DOMAIN}\033[0m")
        else:
            print(f"\n  Try visiting https://{DOMAIN} in a browser.")
            print(f"  DNS propagation may take a few minutes.")
            run(ssh, "pm2 list", check=False)
            run(ssh, f"pm2 logs zentalk-backend --nostream --lines 10", check=False)

    sftp.close()
    ssh.close()


if __name__ == "__main__":
    main()
