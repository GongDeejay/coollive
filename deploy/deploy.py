#!/usr/bin/env python3
"""
通用部署脚本 — mplusm.site 腾讯云 CVM (aaPanel)
用法：
    SERVER_PASS=xxx python3 deploy/deploy.py --config deploy/project.conf
"""
import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

import paramiko

# ── 解析配置文件 ───────────────────────────────────────────────────

def load_conf(path: str) -> dict:
    conf = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            # Expand shell env vars like ${MY_VAR}
            val = os.path.expandvars(val)
            conf[key] = val
    return conf


# ── SSH helpers ────────────────────────────────────────────────────

class Remote:
    def __init__(self, ip, user, password):
        self.ssh = paramiko.SSHClient()
        self.ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        self.ssh.connect(ip, username=user, password=password, timeout=20)
        self.sftp = self.ssh.open_sftp()
        self._created_dirs: set = set()

    def run(self, cmd, check=True, timeout=300):
        short = cmd[:120]
        print(f"  $ {short}")
        _, stdout, stderr = self.ssh.exec_command(cmd, get_pty=True, timeout=timeout)
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        code = stdout.channel.recv_exit_status()
        combined = (out + err).strip()
        for line in combined.split("\n")[-8:]:
            if line.strip():
                print(f"    {line}")
        if check and code != 0:
            raise RuntimeError(f"Command failed (exit {code}): {short}")
        return combined, code

    def mkdir_p(self, path: str):
        if path in self._created_dirs:
            return
        parts = [p for p in path.split("/") if p]
        cur = ""
        for p in parts:
            cur += "/" + p
            if cur in self._created_dirs:
                continue
            try:
                self.sftp.stat(cur)
            except FileNotFoundError:
                try:
                    self.sftp.mkdir(cur)
                except Exception:
                    pass
            self._created_dirs.add(cur)

    def upload_dir(self, local: Path, remote: str):
        for item in sorted(local.rglob("*")):
            if item.is_dir():
                continue
            rel = item.relative_to(local)
            rpath = f"{remote}/{rel}".replace("\\", "/")
            self.mkdir_p(rpath.rsplit("/", 1)[0])
            print(f"  upload: {rel}")
            self.sftp.put(str(item), rpath)

    def upload_file(self, local: Path, remote: str):
        self.mkdir_p(remote.rsplit("/", 1)[0])
        print(f"  upload: {local.name} -> {remote}")
        self.sftp.put(str(local), remote)

    def write(self, remote: str, content: str):
        self.mkdir_p(remote.rsplit("/", 1)[0])
        with self.sftp.open(remote, "w") as f:
            f.write(content)
        print(f"  written: {remote}")

    def close(self):
        self.sftp.close()
        self.ssh.close()


# ── DNS setup ──────────────────────────────────────────────────────

def setup_dns(domain: str, server_ip: str):
    """Call Tencent Cloud DNSPod to create/update A record."""
    secret_id = os.environ.get("TENCENT_SECRET_ID", "")
    secret_key = os.environ.get("TENCENT_SECRET_KEY", "")
    if not secret_id or not secret_key:
        print("  [DNS] TENCENT_SECRET_ID / TENCENT_SECRET_KEY not set, skipping DNS")
        return

    dns_script = Path(__file__).parent.parent / "scripts" / "dns_setup.py"
    parts = domain.split(".", 1)
    subdomain, base_domain = parts[0], parts[1]

    env = os.environ.copy()
    env["TENCENT_SECRET_ID"] = secret_id
    env["TENCENT_SECRET_KEY"] = secret_key
    env["SERVER_IP"] = server_ip
    env["DNS_DOMAIN"] = base_domain
    env["DNS_SUBDOMAIN"] = subdomain

    # Inline DNS call to avoid subprocess env issues
    import hmac, hashlib, datetime, requests

    def sign(key, msg):
        return hmac.new(key, msg.encode(), hashlib.sha256).digest()

    def call_dnspod(action, params):
        import json
        service, host = "dnspod", "dnspod.tencentcloudapi.com"
        endpoint = f"https://{host}"
        now = datetime.datetime.utcnow()
        timestamp = str(int(now.timestamp()))
        date = now.strftime("%Y-%m-%d")
        algorithm = "TC3-HMAC-SHA256"

        payload = json.dumps(params)
        hashed_payload = hashlib.sha256(payload.encode()).hexdigest()
        canonical_headers = f"content-type:application/json; charset=utf-8\nhost:{host}\n"
        signed_headers = "content-type;host"
        canonical_request = "\n".join(["POST", "/", "", canonical_headers, signed_headers, hashed_payload])
        credential_scope = f"{date}/{service}/tc3_request"
        hashed_cr = hashlib.sha256(canonical_request.encode()).hexdigest()
        string_to_sign = f"{algorithm}\n{timestamp}\n{credential_scope}\n{hashed_cr}"

        secret_date = sign(("TC3" + secret_key).encode(), date)
        secret_svc = sign(secret_date, service)
        secret_signing = sign(secret_svc, "tc3_request")
        signature = hmac.new(secret_signing, string_to_sign.encode(), hashlib.sha256).hexdigest()

        auth = (f"{algorithm} Credential={secret_id}/{credential_scope}, "
                f"SignedHeaders={signed_headers}, Signature={signature}")
        headers = {
            "Authorization": auth, "Content-Type": "application/json; charset=utf-8",
            "Host": host, "X-TC-Action": action,
            "X-TC-Timestamp": timestamp, "X-TC-Version": "2021-03-23",
        }
        return requests.post(endpoint, headers=headers, data=payload, timeout=15).json()

    print(f"  [DNS] Checking {domain} -> {server_ip} ...")
    res = call_dnspod("DescribeRecordList", {"Domain": base_domain, "Subdomain": subdomain, "RecordType": "A"})
    records = res.get("Response", {}).get("RecordList", [])
    existing_id = next((r.get("RecordId") for r in records if r.get("Type") == "A"), None)
    current_ip = next((r.get("Value") for r in records if r.get("Type") == "A"), None)

    if existing_id and current_ip == server_ip:
        print(f"  [DNS] Already correct: {domain} -> {server_ip}")
        return

    if existing_id:
        res2 = call_dnspod("ModifyRecord", {
            "Domain": base_domain, "SubDomain": subdomain, "RecordType": "A",
            "RecordLine": "默认", "Value": server_ip, "RecordId": existing_id, "TTL": 600,
        })
    else:
        res2 = call_dnspod("CreateRecord", {
            "Domain": base_domain, "SubDomain": subdomain, "RecordType": "A",
            "RecordLine": "默认", "Value": server_ip, "TTL": 600,
        })

    if res2.get("Response", {}).get("Error"):
        print(f"  [DNS] Error: {res2['Response']['Error']}")
    else:
        print(f"  [DNS] OK: {domain} -> {server_ip}")


# ── Nginx vhost generator ──────────────────────────────────────────

def make_nginx_conf(c: dict, ssl: bool) -> str:
    domain = c["DOMAIN"]
    web_root = f"/www/wwwroot/{domain}"
    port = c.get("BACKEND_PORT", "")
    api_prefix = c.get("API_PREFIX", "/api")
    frontend_type = c.get("FRONTEND_TYPE", "static")
    backend_type = c.get("BACKEND_TYPE", "none")

    http_block = f"""server {{
    listen 80;
    server_name {domain};
    {"return 301 https://$host$request_uri;" if ssl else f"""
    root {web_root};
    index index.html;
    location / {{ try_files $uri $uri/ /index.html; }}
    """ if frontend_type != "none" else ""}
}}
"""
    if not ssl:
        return http_block

    # Static frontend + API backend
    if frontend_type == "static" and backend_type != "none" and api_prefix:
        static_block = f"""
    root {web_root};
    index index.html;

    location / {{
        try_files $uri $uri/ /index.html;
    }}

    location {api_prefix}/ {{
        proxy_pass http://127.0.0.1:{port}/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }}"""
    # Pure API / full proxy (no static frontend, or no api_prefix separation)
    elif backend_type != "none" and frontend_type == "none":
        static_block = f"""
    location / {{
        proxy_pass http://127.0.0.1:{port};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }}"""
    # Pure static site
    else:
        static_block = f"""
    root {web_root};
    index index.html;
    location / {{
        try_files $uri $uri/ /index.html;
    }}"""

    return http_block + f"""
server {{
    listen 443 ssl;
    server_name {domain};

    ssl_certificate /etc/letsencrypt/live/{domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/{domain}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    access_log /www/wwwlogs/{c["PROJECT_NAME"]}.access.log;
    error_log /www/wwwlogs/{c["PROJECT_NAME"]}.error.log;
{static_block}
}}
"""


# ── Main deploy logic ──────────────────────────────────────────────

def log(msg):
    print(f"\n\033[1;36m[deploy]\033[0m {msg}")


def deploy(conf_path: str, repo_root: Path):
    c = load_conf(conf_path)
    server_pass = os.environ.get("SERVER_PASS", "")
    if not server_pass:
        print("ERROR: SERVER_PASS env var required")
        sys.exit(1)

    domain = c["DOMAIN"]
    project = c["PROJECT_NAME"]
    app_dir = f"/opt/{project}"
    web_root = f"/www/wwwroot/{domain}"
    vhost_dir = "/www/server/panel/vhost/nginx"
    backend_port = c.get("BACKEND_PORT", "")
    frontend_type = c.get("FRONTEND_TYPE", "static")
    backend_type = c.get("BACKEND_TYPE", "none")
    admin_email = c.get("ADMIN_EMAIL", "admin@mplusm.site")

    # ── Step 1: DNS ──
    log(f"Step 1: DNS — {domain}")
    setup_dns(domain, c.get("SERVER_IP", "43.133.145.77"))

    # ── Step 2: Build frontend locally ──
    if frontend_type in ("static", "node"):
        build_cmd = c.get("FRONTEND_BUILD_CMD", "")
        if build_cmd:
            log("Step 2: Building frontend...")
            result = subprocess.run(build_cmd, shell=True, cwd=str(repo_root))
            if result.returncode != 0:
                raise RuntimeError("Frontend build failed")
        else:
            log("Step 2: No frontend build command, skipping")
    else:
        log("Step 2: No frontend, skipping build")

    # ── Step 3: Connect ──
    log("Step 3: Connecting to server...")
    r = Remote(c.get("SERVER_IP", "43.133.145.77"), c.get("SERVER_USER", "root"), server_pass)
    print(f"  Connected to {c.get('SERVER_IP')}")

    # ── Step 4: Install backend deps ──
    install_cmd = c.get("BACKEND_INSTALL_CMD", "")
    if install_cmd and backend_type == "python":
        log("Step 4: Installing backend Python dependencies...")
        r.mkdir_p(app_dir)
        # Upload requirements first if it's a pip install
        if "requirements.txt" in install_cmd:
            req_path = repo_root / c.get("BACKEND_DIR", "backend") / "requirements.txt"
            if req_path.exists():
                r.mkdir_p(f"{app_dir}/{c.get('BACKEND_DIR','backend')}")
                r.upload_file(req_path, f"{app_dir}/{c.get('BACKEND_DIR','backend')}/requirements.txt")
        r.run(f"cd {app_dir} && {install_cmd} 2>&1 | tail -5", timeout=180)
    else:
        log("Step 4: Skipping dependency installation")

    # ── Step 5: Upload backend ──
    if backend_type != "none":
        log("Step 5: Uploading backend...")
        backend_dir = c.get("BACKEND_DIR", "backend")
        r.run(f"mkdir -p {app_dir}/{backend_dir}")
        r.upload_dir(repo_root / backend_dir, f"{app_dir}/{backend_dir}")

        # Upload docker-compose.yml if exists
        dc = repo_root / "docker-compose.yml"
        if dc.exists():
            r.upload_file(dc, f"{app_dir}/docker-compose.yml")

        # Write .env
        env_vars = c.get("ENV_VARS", "").strip()
        if env_vars:
            r.write(f"{app_dir}/.env", env_vars + "\n")
    else:
        log("Step 5: No backend, skipping")

    # ── Step 6: Upload frontend dist ──
    if frontend_type == "static":
        log("Step 6: Uploading frontend dist...")
        build_dir = repo_root / c.get("FRONTEND_BUILD_DIR", "frontend/dist")
        r.run(f"mkdir -p {web_root}")
        r.upload_dir(build_dir, web_root)
    else:
        log("Step 6: No static frontend, skipping")

    # ── Step 7: Start/restart backend ──
    if backend_type != "none":
        start_cmd = c.get("BACKEND_START_CMD", "")
        env_vars = c.get("ENV_VARS", "").strip()
        # Build inline env prefix
        env_prefix = " ".join(
            f"{line.split('=', 1)[0]}={line.split('=', 1)[1]}"
            for line in env_vars.split("\n") if "=" in line
        ) if env_vars else ""

        log(f"Step 7: Starting backend '{project}' with PM2...")
        r.run(f"pm2 delete {project}-backend 2>/dev/null || true", check=False)
        r.run(
            f"cd {app_dir} && "
            f"{env_prefix} "
            f"pm2 start '{start_cmd}' --name {project}-backend"
        )
        r.run("pm2 save")

        log("  Waiting for backend health...")
        for i in range(15):
            out, _ = r.run(f"curl -sf http://127.0.0.1:{backend_port}/health || echo FAIL", check=False)
            if '"ok"' in out or '"status"' in out:
                print("  Backend is healthy!")
                break
            time.sleep(4)
        else:
            print("  WARNING: Health check timed out. Showing PM2 logs:")
            r.run(f"pm2 logs {project}-backend --nostream --lines 15", check=False)
    else:
        log("Step 7: No backend to start")

    # ── Step 8: SSL certificate ──
    log(f"Step 8: SSL certificate for {domain}...")
    out, _ = r.run(f"test -f /etc/letsencrypt/live/{domain}/fullchain.pem && echo EXISTS || echo MISSING", check=False)

    if "EXISTS" in out:
        print(f"  Certificate already exists")
    else:
        # Write temp HTTP-only vhost for webroot challenge
        r.write(f"{vhost_dir}/{domain}.conf", make_nginx_conf(c, ssl=False))
        r.run("/www/server/nginx/sbin/nginx -t && /www/server/nginx/sbin/nginx -s reload")
        time.sleep(2)

        _, code = r.run(
            f"certbot certonly --webroot -w {web_root} -d {domain} "
            f"--non-interactive --agree-tos --email {admin_email} 2>&1",
            check=False, timeout=120
        )
        if code != 0:
            print("  Webroot mode failed, trying standalone...")
            r.run("/www/server/nginx/sbin/nginx -s stop || true", check=False)
            time.sleep(2)
            r.run(
                f"certbot certonly --standalone -d {domain} "
                f"--non-interactive --agree-tos --email {admin_email} 2>&1",
                check=False, timeout=120
            )
            r.run("/www/server/nginx/sbin/nginx || true", check=False)

    # ── Step 9: Final Nginx vhost ──
    log("Step 9: Writing Nginx vhost with SSL...")
    r.write(f"{vhost_dir}/{domain}.conf", make_nginx_conf(c, ssl=True))
    out, code = r.run("/www/server/nginx/sbin/nginx -t 2>&1", check=False)
    if code == 0:
        r.run("/www/server/nginx/sbin/nginx -s reload")
        print("  Nginx reloaded")
    else:
        raise RuntimeError(f"Nginx config invalid:\n{out}")

    # ── Step 10: Cert auto-renewal ──
    r.run(
        "(crontab -l 2>/dev/null | grep -v 'certbot renew'; "
        "echo '0 3 * * * certbot renew --quiet --post-hook \"/www/server/nginx/sbin/nginx -s reload\"') | crontab -",
        check=False
    )

    # ── Step 11: Verify ──
    log("Step 11: Verifying...")
    time.sleep(4)
    out, _ = r.run(f"curl -sk https://{domain} -o /dev/null -w '%{{http_code}}' || echo 000", check=False)
    code_str = out.strip().split()[-1]
    if code_str == "200":
        print(f"\n  \033[1;32m✓ Deployed: https://{domain}\033[0m")
    else:
        print(f"\n  HTTP {code_str} — check https://{domain} in a few minutes (DNS may still propagate)")

    r.close()


# ── Entrypoint ─────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="通用部署脚本")
    parser.add_argument("--config", required=True, help="项目配置文件路径 (project.conf)")
    parser.add_argument("--root", default=None, help="项目根目录（默认：config 文件向上两级）")
    args = parser.parse_args()

    conf_path = Path(args.config).resolve()
    if not conf_path.exists():
        print(f"ERROR: Config not found: {conf_path}")
        sys.exit(1)

    repo_root = Path(args.root).resolve() if args.root else conf_path.parent.parent
    print(f"Project root: {repo_root}")
    print(f"Config: {conf_path}")

    deploy(str(conf_path), repo_root)
