# Antigravity Handoff — Rathinam Crackers Platform

This document is the **single onboarding page** for any developer (in Antigravity, Cursor, VS Code, JetBrains, or plain CLI) who picks this project up after the initial Replit build.

Read it once top-to-bottom. Every link below is a real path you can open.

---

## 1. What this codebase is

A pnpm monorepo with **5 deployable apps + 1 internal sandbox + shared libs**, all sharing one PostgreSQL database and one OpenAPI contract.

| Workspace path                | Package name                  | What it is                           |
| ----------------------------- | ----------------------------- | ------------------------------------ |
| `artifacts/api-server`        | `@workspace/api-server`       | Express 5 + Drizzle API (Node 20)    |
| `artifacts/erp`               | `@workspace/erp`              | ERP admin SPA (React + Vite)         |
| `artifacts/pos`               | `@workspace/pos`              | POS terminal SPA                     |
| `artifacts/warehouse`         | `@workspace/warehouse`        | Warehouse SPA                        |
| `artifacts/website`           | `@workspace/website`          | Public storefront SPA                |
| `artifacts/mockup-sandbox`    | `@workspace/mockup-sandbox`   | Internal Vite preview (dev only)     |
| `lib/api-spec`                | `@workspace/api-spec`         | OpenAPI 3.1 source of truth          |
| `lib/api-client-react`        | `@workspace/api-client-react` | Generated React Query hooks + Zod    |
| `lib/db`                      | `@workspace/db`               | Drizzle schema + migrations          |
| `lib/*` (others)              |                               | Shared utility libs                  |
| `scripts`                     | `@workspace/scripts`          | Seed + verify + ad-hoc CLI scripts   |

For the full architecture deep-dive see `replit.md` and the in-app `/help/architecture` page.

---

## 2. First 10 minutes

```bash
git clone <repo-url>
cd <repo>

# 1. install
pnpm install                                  # pnpm 9 required

# 2. env (use your local Postgres or a Docker one)
cp .env.example .env                          # if missing, see README quick-start
# edit DATABASE_URL + SESSION_SECRET

# 3. db
pnpm --filter @workspace/db run migrate
pnpm --filter @workspace/scripts run seed

# 4. codegen (always after touching the OpenAPI spec)
pnpm --filter @workspace/api-spec run codegen

# 5. typecheck the whole repo (canonical health check)
pnpm run typecheck

# 6. run apps — open a terminal per app, or use a process manager
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/erp        run dev
pnpm --filter @workspace/pos        run dev
pnpm --filter @workspace/warehouse  run dev
pnpm --filter @workspace/website    run dev
```

**Default login** to the ERP: `admin` / `Admin@12345` (PIN 1234). Full credential table is in `README.md`.

Sanity-check at any time:

```bash
pnpm --filter @workspace/scripts run verify   # CLI smoke test
# Then open /verifier in the ERP — every section must be green.
```

---

## 3. Golden rules (please don't break these)

1. **The OpenAPI spec is the contract.** When you change anything API-related:
   - edit `lib/api-spec/openapi.yaml`
   - run `pnpm --filter @workspace/api-spec run codegen`
   - update the server route to use the regenerated Zod schemas
   - update the React side to use the regenerated hook
   - typecheck — anything red is a real contract violation
2. **The stock ledger is append-only.** Never `UPDATE` or `DELETE` rows in `stock_ledger`. To "fix" a value, write an `ADJUST` row with a reason. Same for `audit_log`.
3. **All admin writes go through `requireRole(...)`.** Don't add an admin endpoint without it.
4. **Don't create new logins by hardcoding passwords.** Hash with bcrypt (`@workspace/db/auth`).
5. **Never use `console.log` in server code.** Use `req.log` in handlers and the singleton `logger` elsewhere.
6. **Follow the workspace conventions** in `.local/skills/pnpm-workspace/SKILL.md` — leaf apps are `tsc --noEmit`, only `lib/*` packages are composite. Don't add app packages to root `tsconfig.json` references.
7. **Bypass guards exist on purpose.** If you see `USE_DISPATCH`, `USE_SHOP_PLACEMENT`, `NOT_DELIVERED`, or `ORDER_CANCELLED` in a 4xx response, that's the system protecting the order lifecycle — use the dedicated action instead.

---

## 4. Where features live

| Feature                              | Primary files                                              |
| ------------------------------------ | ---------------------------------------------------------- |
| **5-tier pricing**                   | `artifacts/api-server/src/lib/pricing.ts`, `routes/v1/products*` |
| **Stock ledger**                     | `artifacts/api-server/src/lib/stock.ts`, `routes/v1/stock*`     |
| **Online order lifecycle**           | `artifacts/api-server/src/lib/orderLifecycle.ts`, `routes/v1/ordersAdmin.ts`, `routes/v1/shop.ts` |
| **Cancellation (atomic restore)**    | `cancelOnlineOrder()` in `lib/orderLifecycle.ts` (FOR UPDATE row lock + ledger-based stock restore via `refId`) |
| **Bypass guards**                    | `routes/v1/invoices.ts` (`USE_SHOP_PLACEMENT`), `routes/v1/returns.ts` (`NOT_DELIVERED`, `ORDER_CANCELLED`), `routes/v1/ordersAdmin.ts` (`USE_DISPATCH`) |
| **Returns + credit notes**           | `routes/v1/returns.ts`                                     |
| **Coupons (server-side validation)** | `routes/v1/coupons.ts`, `lib/coupons.ts`                   |
| **Loyalty**                          | `lib/loyalty.ts`                                           |
| **Audit log**                        | `lib/audit.ts`, `db/schema/audit_log.ts`                   |
| **Bulk CSV**                         | `routes/v1/bulk.ts`, `artifacts/erp/src/components/bulk-io.tsx` |
| **In-app help**                      | `artifacts/erp/src/pages/help/{index,topic}.tsx`           |
| **Self-check verifier**              | `artifacts/erp/src/pages/verifier.tsx`                     |
| **DB schema**                        | `lib/db/src/schema/*.ts`                                   |
| **Migrations**                       | `lib/db/drizzle/*.sql`                                     |
| **Seed**                             | `scripts/src/seed.ts`                                      |

When in doubt: `rg "<thing-i-want>" artifacts/ lib/` — it's a small enough codebase that grep works.

---

## 5. Adding a new API endpoint (the canonical recipe)

1. Add the path + request/response schema to `lib/api-spec/openapi.yaml`.
2. `pnpm --filter @workspace/api-spec run codegen`.
3. Implement the route in `artifacts/api-server/src/routes/v1/<area>.ts`:
   - Validate the body with the generated Zod schema (`<Op>Body.parse(req.body)`).
   - Wrap multi-write logic in `db.transaction(async (tx) => { ... })`.
   - Use `requireRole("ADMIN", "ERP_MANAGER")` for admin-only routes.
   - `req.log.info({ ... }, "...")` — never `console.log`.
4. Mount the route in `routes/index.ts` if it's a new file.
5. Use the generated React Query hook on the frontend — don't hand-roll `fetch`.
6. Add a verifier check in `artifacts/erp/src/pages/verifier.tsx` for the happy path + the main failure code.
7. Run `pnpm run typecheck`.

---

## 6. Adding a new database table

1. Define the table in a new file under `lib/db/src/schema/`.
2. Re-export it from `lib/db/src/schema/index.ts`.
3. `pnpm --filter @workspace/db run generate` to produce a migration in `lib/db/drizzle/`.
4. Inspect the generated SQL — Drizzle usually nails it but check defaults / `NOT NULL`.
5. `pnpm --filter @workspace/db run migrate` locally.
6. `pnpm run typecheck`.

For a destructive schema change in production, wrap the migration so the new column is added first, code is deployed to write to both old and new, then a follow-up migration drops the old column. Never drop-and-rename in one step.

---

## 7. Common pitfalls (we already paid for these)

- **`localStorage.getItem("accessToken")` is wrong** — the ERP stores its token under `erp_token`. Always use that key. (Bug fixed in commit `19d379b`.)
- **Default seed passwords differ.** Admin is `Admin@12345`, cashier is `admin123`. The verifier auto-detects from your live token, so you don't need to track this in code anymore.
- **Replit had an issue where `tsc` build cached a wrong path** — if you see baffling type errors, `pnpm -r exec rm -rf .turbo dist *.tsbuildinfo` and re-run `typecheck`.
- **Vite preview ports must be unique** when running multiple apps locally; they're fixed in the per-app `vite.config.ts`.
- **Don't run `pnpm dev` at the repo root** — it doesn't exist by design. Run per-package.
- **Customer cancellation is allowed only at `pending_confirmation` and `confirmed`.** Anything else returns 409 — by design.

---

## 8. Tooling that helps

- **Antigravity / Cursor / Copilot**: feed them `replit.md` + `ANTIGRAVITY_HANDOFF.md` (this file) + the relevant route file. They produce sane patches because the OpenAPI contract gives them a strong type signal.
- **Drizzle Studio**: `pnpm --filter @workspace/db exec drizzle-kit studio` — visual DB browser.
- **The verifier**: best regression test you have. Run it before and after every change.
- **`pnpm run typecheck`**: faster than spinning up the apps and is canonical.

---

## 9. Deploying changes

- **Production target**: AWS — see `DEPLOYMENT_AWS.md`.
- **Path A (EC2 + RDS)**: SSH in, `git pull`, `pnpm install --frozen-lockfile`, `pnpm -r run build`, `pm2 reload all`.
- **Path B (ECS Fargate)**: push to `main` → CI builds + pushes images → `aws ecs update-service --force-new-deployment`.
- **Always**: run the verifier on the live URL after deploy. Bookmark `/verifier`.

---

## 10. Where to ask questions

1. `/help` in the ERP — 16 topic guides cover every business feature.
2. `replit.md` — feature inventory.
3. `PRODUCTION.md` — go-live checklist.
4. `DEPLOYMENT_AWS.md` — AWS runbook.
5. `lib/api-spec/openapi.yaml` — single source of truth for the API.
6. `git log --oneline` — recent context in commit messages.

Welcome aboard. The system is small, opinionated, and consistent — once you've read this file and `replit.md`, you should be able to ship a feature in an afternoon.
