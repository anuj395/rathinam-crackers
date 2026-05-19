#!/usr/bin/env bash
# Prune idempotency_keys older than 24h. Run hourly via cron:
#   0 * * * * /var/www/ratinam/deploy/scripts/idempotency-cleanup.sh
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
psql "$DATABASE_URL" -c "DELETE FROM idempotency_keys WHERE created_at < NOW() - INTERVAL '24 hours';"
