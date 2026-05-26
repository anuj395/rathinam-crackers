# Local Deploy / Development Guide

This document explains how to run the full stack locally for development.

Prerequisites
- Node.js 18+ (or Node 20 recommended)
- pnpm installed
- A running Postgres instance reachable from `DATABASE_URL` or use the default placeholder in the script

Quick start

1. Install dependencies (root):

```bash
pnpm install
```

2. (Optional) Prepare `.env` with local secrets. Example keys used by the project:
- `DATABASE_URL`
- `SESSION_SECRET` (strong random string recommended)
- `AWS_REGION`

3. Seed the DB (creates admin, cashier, sample data):

```bash
pnpm --filter @workspace/scripts run seed
```

4. Run everything using the convenience script (starts API + frontends):

```bash
# make executable once
chmod +x scripts/dev-all.sh
./scripts/dev-all.sh
```

Console output is minimal; logs are written to `logs/` at the repo root, e.g. `logs/api.log`, `logs/erp.log`.

Notes on environment variables
- The script uses sensible defaults but you should set `DATABASE_URL` and `SESSION_SECRET` for realistic testing.
- To change ports, export `API_PORT`, `ERP_PORT`, `POS_PORT`, `WH_PORT`, `WEB_PORT` before running `dev-all.sh`.
- Frontends pick up `VITE_API_URL` automatically (set to `http://localhost:${API_PORT:-3000}` by the script).

Verification
- Use the built-in verifier:

```bash
VERIFIER_BASE_URL=http://localhost:19002 pnpm --filter @workspace/scripts run verify
```

- To run Playwright e2e tests:

```bash
VERIFIER_BASE_URL=http://localhost:19002 pnpm --filter @workspace/scripts exec npx playwright test
```

Deployment notes
- For production you should build each frontend with `pnpm --filter <pkg> run build` and serve the `dist/public` output behind a webserver.
- Ensure `VITE_API_URL` points at your API host in production and `BASE_PATH` matches the configured URL path (if using sub-paths).

