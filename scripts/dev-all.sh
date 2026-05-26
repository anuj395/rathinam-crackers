#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/logs"

# sensible defaults for local dev
export DATABASE_URL="${DATABASE_URL:-postgresql://neondb_owner:password@localhost:5432/neondb?sslmode=disable}"
export SESSION_SECRET="${SESSION_SECRET:-local_dev_secret}"
export DOTENV_CONFIG_PATH="${DOTENV_CONFIG_PATH:-.env}"

echo "Starting API (port ${API_PORT:-3000})... (logs: $ROOT/logs/api.log)"
(
  cd "$ROOT/artifacts/api-server"
  export PORT="${API_PORT:-3000}"
  export DOTENV_CONFIG_PATH="$ROOT/.env"
  pnpm run dev
) > "$ROOT/logs/api.log" 2>&1 &

sleep 1

echo "Starting ERP frontend (port ${ERP_PORT:-19002})... (logs: $ROOT/logs/erp.log)"
(
  cd "$ROOT/artifacts/erp"
  export PORT="${ERP_PORT:-19002}"
  export BASE_PATH="${ERP_BASE_PATH:-/}"
  export VITE_API_URL="http://localhost:${API_PORT:-3000}"
  pnpm run dev
) > "$ROOT/logs/erp.log" 2>&1 &

sleep 1

echo "Starting POS frontend (port ${POS_PORT:-19001})... (logs: $ROOT/logs/pos.log)"
(
  cd "$ROOT/artifacts/pos"
  export PORT="${POS_PORT:-19001}"
  export BASE_PATH="${POS_BASE_PATH:-/pos}"
  export VITE_API_URL="http://localhost:${API_PORT:-3000}"
  pnpm run dev
) > "$ROOT/logs/pos.log" 2>&1 &

sleep 1

echo "Starting Warehouse frontend (port ${WH_PORT:-19003})... (logs: $ROOT/logs/warehouse.log)"
(
  cd "$ROOT/artifacts/warehouse"
  export PORT="${WH_PORT:-19003}"
  export BASE_PATH="${WH_BASE_PATH:-/warehouse}"
  export VITE_API_URL="http://localhost:${API_PORT:-3000}"
  pnpm run dev
) > "$ROOT/logs/warehouse.log" 2>&1 &

sleep 1

echo "Starting Website frontend (port ${WEB_PORT:-19004})... (logs: $ROOT/logs/website.log)"
(
  cd "$ROOT/artifacts/website"
  export PORT="${WEB_PORT:-19004}"
  export BASE_PATH="${WEB_BASE_PATH:-/website}"
  export VITE_API_URL="http://localhost:${API_PORT:-3000}"
  pnpm run dev
) > "$ROOT/logs/website.log" 2>&1 &

sleep 1

echo "All servers started (or starting). Check logs in $ROOT/logs/ for details."

echo "To stop: kill %1 %2 %3 %4 %5 || pkill -f 'vite --config vite.config.ts' || true" > /dev/null
