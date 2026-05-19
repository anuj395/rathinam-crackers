#!/usr/bin/env bash
# Runs after a task is merged. Keep idempotent and fast.
set -euo pipefail

echo "[post-merge] installing workspace dependencies"
pnpm install --frozen-lockfile=false --prefer-offline

echo "[post-merge] applying database schema (drizzle push)"
# Audit log + stock_levels composite PK depend on this. push is idempotent.
pnpm --filter @workspace/db run push -- --force || pnpm --filter @workspace/db run push-force

echo "[post-merge] regenerating OpenAPI client"
pnpm --filter @workspace/api-spec run codegen

echo "[post-merge] done"
