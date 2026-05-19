#!/usr/bin/env bash
# Build & deploy Rathinam Crackers on a fresh code checkout.
# Run on the EC2 box from /var/www/ratinam after `git pull` (or rsync).
#
# Idempotent — safe to re-run on every release.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

echo "==> Rathinam Crackers deploy-prep"
echo "    repo: $ROOT_DIR"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set. Source /etc/ratinam.env or your secrets file first." >&2
  exit 1
fi
if [[ -z "${SESSION_SECRET:-}" ]]; then
  echo "ERROR: SESSION_SECRET is not set." >&2
  exit 1
fi

# Node + pnpm
if ! command -v pnpm >/dev/null 2>&1; then
  echo "ERROR: pnpm not found. Install with: npm i -g pnpm" >&2
  exit 1
fi

echo "==> Installing dependencies (pnpm install --frozen-lockfile)"
pnpm install --frozen-lockfile

echo "==> Generating OpenAPI client artefacts"
pnpm --filter @workspace/api-spec run codegen

echo "==> Building API + all frontends"
pnpm -r --if-present run build

echo "==> Pushing schema migrations to the production database"
pnpm --filter @workspace/db run push

echo "==> Ensuring log + nginx directories exist"
sudo mkdir -p /var/log/ratinam
sudo chown -R "$(whoami):$(whoami)" /var/log/ratinam

echo "==> Installing nginx config"
sudo cp deploy/nginx/ratinam.conf /etc/nginx/sites-available/ratinam
sudo ln -sf /etc/nginx/sites-available/ratinam /etc/nginx/sites-enabled/ratinam
sudo nginx -t
sudo systemctl reload nginx
echo "    nginx reloaded"

echo "==> Starting / reloading PM2"
pm2 startOrReload deploy/pm2/ecosystem.config.cjs --env production --update-env
pm2 save

echo "==> Health check"
sleep 2
if curl -fsS http://127.0.0.1:8080/api/healthz >/dev/null; then
  echo "    /api/healthz OK"
else
  echo "    WARNING: health check failed — inspect 'pm2 logs ratinam-api'" >&2
fi

echo "==> Done."
