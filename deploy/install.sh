#!/usr/bin/env bash
# ====================================================================
# Rathinam Crackers — zero-touch installer for Amazon Linux 2023.
# ====================================================================
#
# What this does, in order:
#   1. Installs system packages (nginx, postgresql15, certbot, git, curl).
#   2. Installs Node.js 20 LTS, pnpm, and pm2 globally.
#   3. Bootstraps a local PostgreSQL cluster + a 'ratinam' database/user
#      if you haven't pointed DATABASE_URL at an external RDS.
#   4. Generates a strong SESSION_SECRET (and JWT_SECRET) and writes
#      /etc/ratinam.env (chmod 0600, owned by ec2-user) — the single
#      source of truth for production secrets.
#   5. Clones / pulls the repo into /var/www/ratinam.
#   6. Installs deps, runs OpenAPI codegen, builds API + 4 frontends,
#      pushes Drizzle schema, and starts PM2 in single-instance mode.
#   7. Installs the multi-subdomain nginx config + the shared
#      security/gzip snippet, requests Let's Encrypt certificates for
#      all 5 subdomains, and reloads nginx.
#   8. Registers cron jobs for nightly backup + hourly idempotency
#      cleanup, and enables pm2 systemd integration.
#
# Re-runnable. Each step is idempotent — safe to call again on every
# release. Pass --skip-cert to skip certbot (useful when rehearsing
# offline or when you already have certs).
#
# Required env vars (or interactive prompt if missing):
#   GITHUB_REPO_URL    e.g. https://github.com/abhijeetpandeywork/crackers.git
#   GITHUB_TOKEN       (optional) PAT for private clone
#   APP_DOMAIN         e.g. rathinamcracker.com
#   ACME_EMAIL         e.g. admin@rathinamcracker.com
#   DATABASE_URL       (optional) external Postgres; if blank, local PG used
#
# Usage:
#   sudo APP_DOMAIN=rathinamcracker.com ACME_EMAIL=admin@... \
#        GITHUB_REPO_URL=https://github.com/abhijeetpandeywork/crackers.git \
#        bash install.sh
#
# Tested on: Amazon Linux 2023 (also works on RHEL 9 / Rocky 9 with
# minor pkg-manager swaps).

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_PREFIX="[ratinam-install]"
log() { echo "$LOG_PREFIX $*"; }
die() { echo "$LOG_PREFIX ERROR: $*" >&2; exit 1; }

[[ "$EUID" -eq 0 ]] || die "Run as root (use sudo)."

SKIP_CERT="0"
for arg in "$@"; do
  case "$arg" in
    --skip-cert) SKIP_CERT="1" ;;
    *) ;;
  esac
done

# --------------------------------------------------------------------
# 0. Inputs
# --------------------------------------------------------------------
APP_DOMAIN="${APP_DOMAIN:-}"
ACME_EMAIL="${ACME_EMAIL:-}"
GITHUB_REPO_URL="${GITHUB_REPO_URL:-https://github.com/abhijeetpandeywork/crackers.git}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
APP_USER="${APP_USER:-ec2-user}"

# Interactive prompts — only fired when stdin is a TTY and the value
# wasn't supplied via env var. Lets a fresh-EC2 operator just run
# `sudo bash install.sh` with no flags and answer 3 questions.
prompt() {
  local var="$1" question="$2" default="${3:-}" answer
  if [[ -t 0 && -z "${!var}" ]]; then
    if [[ -n "$default" ]]; then
      read -rp "$question [$default]: " answer
      printf -v "$var" '%s' "${answer:-$default}"
    else
      while [[ -z "${!var}" ]]; do
        read -rp "$question: " answer
        printf -v "$var" '%s' "$answer"
      done
    fi
  fi
}
prompt APP_DOMAIN  "Domain (root, no scheme)" "rathinamcracker.com"
prompt ACME_EMAIL  "Email for Let's Encrypt"  "admin@${APP_DOMAIN}"
prompt GITHUB_TOKEN "GitHub PAT for private repo (blank if public/anon clone)" ""

[[ -n "$APP_DOMAIN" ]] || die "APP_DOMAIN required."
[[ -n "$ACME_EMAIL" ]] || die "ACME_EMAIL required."
APP_DIR="/var/www/ratinam"
ENV_FILE="/etc/ratinam.env"
UPLOADS_DIR="/opt/rathinam/uploads"

# CRITICAL: source the existing env file BEFORE we capture any "input"
# values. Otherwise on a re-run we'd regenerate the local PG password
# and lose the connection to the existing 'ratinam' database role.
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
fi
DATABASE_URL_INPUT="${DATABASE_URL:-}"

log "Domain: $APP_DOMAIN | Email: $ACME_EMAIL | App user: $APP_USER"

# --------------------------------------------------------------------
# 1. System packages
# --------------------------------------------------------------------
log "Installing system packages…"
dnf install -y nginx git curl tar gzip jq ca-certificates rsync \
               postgresql15 postgresql15-server certbot python3-certbot-nginx \
               openssl >/dev/null

systemctl enable --now nginx >/dev/null

# --------------------------------------------------------------------
# 2. Node.js 20 + pnpm + pm2
# --------------------------------------------------------------------
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v 2>/dev/null | cut -dv -f2 | cut -d. -f1)" -lt 20 ]]; then
  log "Installing Node.js 20…"
  curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - >/dev/null
  dnf install -y nodejs >/dev/null
fi
command -v pnpm >/dev/null 2>&1 || npm i -g pnpm@9 >/dev/null
command -v pm2  >/dev/null 2>&1 || npm i -g pm2     >/dev/null

# --------------------------------------------------------------------
# 3. PostgreSQL (local fallback)
# --------------------------------------------------------------------
if [[ -z "$DATABASE_URL_INPUT" ]]; then
  log "DATABASE_URL not provided — bootstrapping a local PostgreSQL cluster."
  if [[ ! -d /var/lib/pgsql/data/base ]]; then
    /usr/bin/postgresql-setup --initdb >/dev/null
  fi
  systemctl enable --now postgresql >/dev/null

  PG_PASS="$(openssl rand -hex 16)"
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='ratinam'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE USER ratinam WITH PASSWORD '${PG_PASS}';"
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='ratinam'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE ratinam OWNER ratinam;"
  DATABASE_URL="postgresql://ratinam:${PG_PASS}@127.0.0.1:5432/ratinam"
else
  DATABASE_URL="$DATABASE_URL_INPUT"
  log "Using external DATABASE_URL."
fi

# --------------------------------------------------------------------
# 4. Secrets + /etc/ratinam.env
# --------------------------------------------------------------------
gen_secret() { openssl rand -hex 48; }

SESSION_SECRET="${SESSION_SECRET:-$(gen_secret)}"
JWT_SECRET="${JWT_SECRET:-$(gen_secret)}"
ADMIN_BOOTSTRAP_PASSWORD="${ADMIN_BOOTSTRAP_PASSWORD:-$(openssl rand -hex 12)}"

# API_BASE points all four frontends at the api. subdomain.
API_BASE="https://api.${APP_DOMAIN}"

cat > "$ENV_FILE" <<EOF
# Generated by deploy/install.sh — chmod 0600.
# Re-running install.sh preserves existing secrets.
NODE_ENV=production
PORT=8080
DATABASE_URL=${DATABASE_URL}
SESSION_SECRET=${SESSION_SECRET}
JWT_SECRET=${JWT_SECRET}
ADMIN_BOOTSTRAP_PASSWORD=${ADMIN_BOOTSTRAP_PASSWORD}
APP_DOMAIN=${APP_DOMAIN}
PUBLIC_API_BASE=${API_BASE}
# UPLOAD_DIR is read by the API to persist uploaded media (see
# artifacts/api-server/src/routes/v1/media.ts). nginx serves the same
# folder directly via the /uploads/ alias for hot-cached delivery.
UPLOAD_DIR=${UPLOADS_DIR}
# Build-time variables consumed by Vite (frontends).
VITE_API_BASE=${API_BASE}
EOF
chmod 0600 "$ENV_FILE"
chown root:root "$ENV_FILE"

# --------------------------------------------------------------------
# 5. Code checkout
# --------------------------------------------------------------------
mkdir -p "$APP_DIR" "$UPLOADS_DIR" /var/log/ratinam /var/backups/ratinam
chown -R "$APP_USER:$APP_USER" "$APP_DIR" "$UPLOADS_DIR" /var/log/ratinam /var/backups/ratinam

CLONE_URL="$GITHUB_REPO_URL"
if [[ -n "$GITHUB_TOKEN" ]]; then
  CLONE_URL="${GITHUB_REPO_URL/https:\/\//https://x-access-token:${GITHUB_TOKEN}@}"
fi

if [[ -d "$APP_DIR/.git" ]]; then
  log "Pulling latest commits…"
  sudo -u "$APP_USER" git -C "$APP_DIR" remote set-url origin "$CLONE_URL"
  sudo -u "$APP_USER" git -C "$APP_DIR" fetch origin
  sudo -u "$APP_USER" git -C "$APP_DIR" reset --hard origin/main
else
  log "Cloning repo into $APP_DIR…"
  sudo -u "$APP_USER" git clone "$CLONE_URL" "$APP_DIR"
fi

# --------------------------------------------------------------------
# 6. Build + DB push + PM2
# --------------------------------------------------------------------
log "Installing dependencies…"
sudo -u "$APP_USER" --preserve-env=PATH bash -c "cd '$APP_DIR' && pnpm install --frozen-lockfile"

log "Generating OpenAPI client…"
sudo -u "$APP_USER" --preserve-env=PATH bash -c "cd '$APP_DIR' && pnpm --filter @workspace/api-spec run codegen"

log "Building API + 4 frontends (with VITE_API_BASE=$API_BASE)…"
# Frontends are built with BASE_PATH=/ because each is served from its own
# subdomain root. Set VITE_API_BASE so axios/fetch helpers point at the
# api. subdomain. Both are sourced via /etc/ratinam.env above.
sudo -u "$APP_USER" --preserve-env bash -c "
  set -e
  cd '$APP_DIR'
  set -a; source $ENV_FILE; set +a
  export BASE_PATH=/
  pnpm -r --if-present run build
"

log "Pushing Drizzle schema migrations…"
sudo -u "$APP_USER" --preserve-env bash -c "
  set -a; source $ENV_FILE; set +a
  cd '$APP_DIR' && pnpm --filter @workspace/db run push
"

log "Starting / reloading PM2 (single instance, fork mode)…"
sudo -u "$APP_USER" --preserve-env bash -c "
  set -a; source $ENV_FILE; set +a
  cd '$APP_DIR'
  pm2 startOrReload deploy/pm2/ecosystem.config.cjs --env production --update-env
  pm2 save
"

# pm2 startup as the app user (idempotent).
PM2_STARTUP_CMD="$(sudo -u "$APP_USER" pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" 2>&1 | tail -1)"
if [[ "$PM2_STARTUP_CMD" == sudo* ]]; then
  eval "$PM2_STARTUP_CMD" || true
fi

# --------------------------------------------------------------------
# 7. nginx config + Let's Encrypt
# --------------------------------------------------------------------
log "Installing nginx config…"
mkdir -p /etc/nginx/snippets /etc/nginx/conf.d /var/www/letsencrypt
cat > /etc/nginx/snippets/ratinam-common.conf <<'NGEOF'
server_tokens off;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
gzip on; gzip_vary on; gzip_min_length 1024; gzip_proxied any; gzip_comp_level 6;
gzip_types text/plain text/css text/xml application/json application/javascript
           application/xml+rss application/atom+xml image/svg+xml;
client_max_body_size 25m;
NGEOF

# Make sure rate-limit zones are declared in http{}.
if ! grep -q "limit_req_zone .*zone=api" /etc/nginx/nginx.conf; then
  sed -i '/^http {/a \    limit_req_zone $binary_remote_addr zone=api:10m  rate=200r/m;\n    limit_req_zone $binary_remote_addr zone=auth:10m rate=10r/m;' /etc/nginx/nginx.conf
fi

# Bootstrap problem: the production conf in deploy/nginx/ references
# /etc/letsencrypt/live/.../fullchain.pem, but on a fresh box those
# files don't exist yet — `nginx -t` would fail and certbot would never
# get the chance to run. Fix: install an HTTP-only bootstrap conf first
# (just enough to satisfy the http-01 challenge), let certbot fetch the
# certs, THEN swap in the real config.
if [[ ! -f "/etc/letsencrypt/live/${APP_DOMAIN}/fullchain.pem" && "$SKIP_CERT" == "0" ]]; then
  log "No certs yet — installing HTTP-only bootstrap config for the ACME challenge."
  cat > /etc/nginx/conf.d/ratinam.conf <<EOF2
server {
  listen 80 default_server;
  listen [::]:80 default_server;
  server_name ${APP_DOMAIN} www.${APP_DOMAIN} api.${APP_DOMAIN} erp.${APP_DOMAIN} pos.${APP_DOMAIN} wh.${APP_DOMAIN};
  location /.well-known/acme-challenge/ { root /var/www/letsencrypt; }
  location / { return 200 'Provisioning Rathinam Crackers — please come back in a few minutes.\n'; add_header Content-Type text/plain; }
}
EOF2
  nginx -t
  systemctl reload nginx

  log "Requesting Let's Encrypt certificates for all 5 subdomains (webroot mode)…"
  certbot certonly --webroot -w /var/www/letsencrypt --non-interactive --agree-tos -m "$ACME_EMAIL" \
    -d "$APP_DOMAIN" -d "www.$APP_DOMAIN" \
    -d "api.$APP_DOMAIN" \
    -d "erp.$APP_DOMAIN" \
    -d "pos.$APP_DOMAIN" \
    -d "wh.$APP_DOMAIN" \
    || die "certbot failed — check DNS for the 5 subdomains then re-run install.sh"
fi

# Now install the real subdomain config (it references the certs we
# just obtained, or pre-existing ones from a previous run).
if [[ "$SKIP_CERT" == "0" || -f "/etc/letsencrypt/live/${APP_DOMAIN}/fullchain.pem" ]]; then
  cp "$APP_DIR/deploy/nginx/ratinam-subdomains.conf" /etc/nginx/conf.d/ratinam.conf
  nginx -t
  systemctl reload nginx
else
  log "--skip-cert with no existing certs: leaving HTTP-only bootstrap config in place. Re-run without --skip-cert to enable HTTPS."
fi

# --------------------------------------------------------------------
# 8. Cron + health check
# --------------------------------------------------------------------
CRON_FILE="/etc/cron.d/ratinam"
cat > "$CRON_FILE" <<EOF
# Generated by deploy/install.sh
SHELL=/bin/bash
PATH=/usr/local/bin:/usr/bin:/bin
0 2 * * * $APP_USER set -a; source $ENV_FILE; set +a; bash $APP_DIR/deploy/scripts/backup.sh >> /var/log/ratinam/backup.log 2>&1
0 * * * * $APP_USER set -a; source $ENV_FILE; set +a; bash $APP_DIR/deploy/scripts/idempotency-cleanup.sh >> /var/log/ratinam/cron.log 2>&1
EOF
chmod 0644 "$CRON_FILE"

sleep 2
if curl -fsS http://127.0.0.1:8080/api/healthz >/dev/null; then
  log "API health check: OK"
else
  log "WARNING: API not responding on 127.0.0.1:8080 — inspect 'pm2 logs ratinam-api'"
fi

cat <<EOF

============================================================
  Rathinam Crackers is installed.

  Public site:  https://${APP_DOMAIN}
  ERP:          https://erp.${APP_DOMAIN}
  POS:          https://pos.${APP_DOMAIN}
  Warehouse:    https://wh.${APP_DOMAIN}
  API:          https://api.${APP_DOMAIN}/api/healthz

  Bootstrap admin password: ${ADMIN_BOOTSTRAP_PASSWORD}
    (also stored in ${ENV_FILE}; rotate after first login.)

  Logs:    pm2 logs ratinam-api   |   /var/log/ratinam/
  Reload:  sudo bash $APP_DIR/deploy/install.sh   (idempotent)
============================================================
EOF
