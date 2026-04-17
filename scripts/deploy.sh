#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# ZenTalk Full Deploy Script
# Runs locally; SSHes into the server and sets everything up.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

SERVER_IP="${SERVER_IP:-43.133.145.77}"
SERVER_USER="${SERVER_USER:-root}"
SERVER_PASS="${SERVER_PASS:?SERVER_PASS env var required}"
DOMAIN="zen.mplusm.site"
APP_DIR="/opt/zentalk"
XIAOMI_API_KEY="${XIAOMI_API_KEY:?XIAOMI_API_KEY env var required}"
XIAOMI_BASE_URL="${XIAOMI_BASE_URL:-https://token-plan-cn.xiaomimimo.com/v1}"
XIAOMI_MODEL="${XIAOMI_MODEL:-mimo}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

log() { echo -e "\033[1;36m[deploy]\033[0m $*"; }
err() { echo -e "\033[1;31m[error]\033[0m $*" >&2; }

# ── 1. Build frontend ──────────────────────────────────────
log "Building frontend..."
cd "$REPO_DIR/frontend"
npm ci --silent
npm run build

# ── 2. Run DNS setup ──────────────────────────────────────
log "Configuring DNS..."
cd "$REPO_DIR"
pip3 install requests -q 2>/dev/null || true
python3 scripts/dns_setup.py

# ── 3. Install sshpass if needed ─────────────────────────
if ! command -v sshpass &>/dev/null; then
    log "Installing sshpass..."
    apt-get install -y sshpass -q 2>/dev/null || yum install -y sshpass -q 2>/dev/null || true
fi

SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=15"
SSH_CMD="sshpass -p '$SERVER_PASS' ssh $SSH_OPTS $SERVER_USER@$SERVER_IP"
SCP_CMD="sshpass -p '$SERVER_PASS' scp $SSH_OPTS -r"

# ── 4. Server setup via SSH ────────────────────────────────
log "Setting up server environment..."
eval "$SSH_CMD" << 'REMOTE'
set -e
export DEBIAN_FRONTEND=noninteractive

# Update & install dependencies
apt-get update -qq
apt-get install -y -qq docker.io docker-compose nginx certbot python3-certbot-nginx curl

# Enable services
systemctl enable docker nginx
systemctl start docker nginx

# Create app directory
mkdir -p /opt/zentalk /var/www/zentalk
REMOTE

# ── 5. Upload backend ────────────────────────────────────
log "Uploading backend..."
eval "$SCP_CMD '$REPO_DIR/backend' $SERVER_USER@$SERVER_IP:$APP_DIR/"
eval "$SCP_CMD '$REPO_DIR/docker-compose.yml' $SERVER_USER@$SERVER_IP:$APP_DIR/"

# ── 6. Upload frontend dist ──────────────────────────────
log "Uploading frontend dist..."
eval "$SCP_CMD '$REPO_DIR/frontend/dist/.' $SERVER_USER@$SERVER_IP:/var/www/zentalk/"

# ── 7. Upload Nginx config ───────────────────────────────
log "Uploading Nginx config (HTTP only first for certbot)..."
eval "$SCP_CMD '$REPO_DIR/nginx/zentalk.conf' $SERVER_USER@$SERVER_IP:/etc/nginx/conf.d/"

# Temporarily serve HTTP to allow certbot domain validation
eval "$SSH_CMD" << REMOTE
set -e
# Write a temporary HTTP-only config for cert issuance
cat > /etc/nginx/conf.d/zentalk-temp.conf << 'NGINX'
server {
    listen 80;
    server_name zen.mplusm.site;
    root /var/www/zentalk;
    index index.html;
    location / { try_files \$uri \$uri/ /index.html; }
    location /api/ {
        proxy_pass http://127.0.0.1:8000/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_read_timeout 60s;
    }
}
NGINX
rm -f /etc/nginx/conf.d/zentalk.conf
nginx -t && systemctl reload nginx
REMOTE

# ── 8. Start backend container ───────────────────────────
log "Starting backend container..."
eval "$SSH_CMD" << REMOTE
set -e
cd $APP_DIR
cat > .env << ENV
XIAOMI_API_KEY=$XIAOMI_API_KEY
XIAOMI_BASE_URL=$XIAOMI_BASE_URL
XIAOMI_MODEL=$XIAOMI_MODEL
ENV
docker-compose pull 2>/dev/null || true
docker-compose up -d --build
echo "Waiting for backend health..."
for i in \$(seq 1 20); do
    if curl -sf http://localhost:8000/health > /dev/null; then
        echo "Backend is up!"
        break
    fi
    sleep 3
done
REMOTE

# ── 9. SSL certificate via Let's Encrypt ─────────────────
log "Obtaining SSL certificate for $DOMAIN ..."
eval "$SSH_CMD" << REMOTE
set -e
# Wait a moment for DNS to propagate (it may already be done)
sleep 5
certbot --nginx -d $DOMAIN --non-interactive --agree-tos \
    --email admin@mplusm.site \
    --redirect \
    --keep-until-expiring 2>&1 || {
    echo "Certbot failed, trying standalone mode..."
    systemctl stop nginx
    certbot certonly --standalone -d $DOMAIN --non-interactive --agree-tos \
        --email admin@mplusm.site 2>&1
    systemctl start nginx
}
REMOTE

# ── 10. Install final Nginx config with SSL ──────────────
log "Installing final Nginx config with SSL..."
eval "$SCP_CMD '$REPO_DIR/nginx/zentalk.conf' $SERVER_USER@$SERVER_IP:/etc/nginx/conf.d/"

eval "$SSH_CMD" << REMOTE
set -e
rm -f /etc/nginx/conf.d/zentalk-temp.conf
nginx -t && systemctl reload nginx
# Setup certbot auto-renewal
systemctl enable certbot.timer 2>/dev/null || \
    (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet") | crontab -
REMOTE

# ── 11. Verify ───────────────────────────────────────────
log "Verifying deployment..."
sleep 3
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://$DOMAIN" --max-time 10 || echo "000")
if [[ "$HTTP_CODE" == "200" ]]; then
    log "✓ Deployment successful!"
    log "✓ App is live at: https://$DOMAIN"
else
    err "HTTP $HTTP_CODE — site may need a moment for DNS propagation."
    err "Try: https://$DOMAIN in a few minutes"
fi
