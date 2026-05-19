# Rathinam Crackers — Business Management Platform

A full-stack business management system for **Rathinam Crackers** (firecracker manufacturer / wholesaler / retailer). Five apps share one PostgreSQL backend and one OpenAPI contract.

| App         | Path           | Audience                        |
| ----------- | -------------- | ------------------------------- |
| ERP         | `/`            | Admin, manager, agents          |
| POS         | `/pos/`        | Cashiers (PIN login)            |
| Warehouse   | `/warehouse/`  | Warehouse manager / pickers     |
| Website     | `/website/`    | Customers (anonymous + login)   |
| API         | `/api/v1/`     | All apps                        |

---

## Highlights

- **5-tier pricing engine** (purchase / wholesale / retail / retail-estimate / agent) with quantity-triggered wholesale and per-customer overrides
- **Immutable, append-only stock ledger** across multiple locations
- **GST-compliant invoicing** (CGST + SGST intra-state, IGST inter-state) with HSN-wise GSTR-1 export
- **Online order lifecycle** with explicit dispatch step (courier + AWB), atomic cancel with stock restore, customer self-cancel from the website, and bypass guards (`USE_DISPATCH`, `USE_SHOP_PLACEMENT`, `NOT_DELIVERED`, `ORDER_CANCELLED`)
- **Returns + credit notes** with sequential numbering and ledger reversal
- **Coupons & loyalty** validated server-side
- **Bulk CSV import / export** for every master-data resource
- **Built-in self-check verifier** at `/verifier` — 60+ end-to-end checks, auto-uses your live admin token
- **In-app help system** with 16 topic guides at `/help`
- **Audit log** for every admin write
- **Strict TypeScript** monorepo with `pnpm run typecheck` clean

---

## Tech stack

- **Backend**: Node 20, Express 5, TypeScript ESM, Drizzle ORM
- **Database**: PostgreSQL 14+
- **Frontend**: React 18, Vite, shadcn/ui, TanStack Query, wouter
- **API contract**: OpenAPI 3.1 → Orval codegen → Zod schemas + React Query hooks
- **Auth**: JWT (15 min access + 7 d refresh), bcrypt password hashing
- **Build / package**: pnpm workspaces

---

## Repository layout

```
.
├── artifacts/
│   ├── api-server/       # Express + Drizzle API
│   ├── erp/              # ERP admin SPA
│   ├── pos/              # POS terminal SPA
│   ├── warehouse/        # Warehouse SPA
│   ├── website/          # Public storefront SPA
│   └── mockup-sandbox/   # Internal Vite preview server (dev only)
├── lib/                  # Shared libs (api-spec, api-client-react, db, etc.)
├── scripts/              # CLI utilities (seed, verify, migrations runner)
├── pnpm-workspace.yaml
├── replit.md             # Detailed feature inventory
├── PRODUCTION.md         # Production go-live checklist
├── QUICKSTART_AWS.md     # 30-min fresh-EC2 deploy (start here)
├── DEPLOYMENT_AWS.md     # Long-form AWS deployment runbook
├── ANTIGRAVITY_HANDOFF.md# Hand-off doc for further dev in Antigravity / any IDE
└── README.md             # ← you are here
```

---

## Quick start (local dev, any machine)

Requirements: Node 20+, pnpm 9+, PostgreSQL 14+.

```bash
# 1. Install
pnpm install

# 2. Configure env (copy and edit)
cat > .env <<EOF
DATABASE_URL=postgresql://user:pass@localhost:5432/rathinam
SESSION_SECRET=$(openssl rand -hex 32)
NODE_ENV=development
EOF

# 3. Migrate + seed
pnpm --filter @workspace/db run migrate
pnpm --filter @workspace/scripts run seed

# 4. Generate API client (after every OpenAPI spec change)
pnpm --filter @workspace/api-spec run codegen

# 5. Run each app in its own terminal (or use Replit workflows)
pnpm --filter @workspace/api-server run dev   # :8080  → /api
pnpm --filter @workspace/erp        run dev   # :5173  → /
pnpm --filter @workspace/pos        run dev   # :5174  → /pos
pnpm --filter @workspace/warehouse  run dev   # :5175  → /warehouse
pnpm --filter @workspace/website    run dev   # :5176  → /website
```

In production each app gets its own subdomain (`rathinamcracker.com`, `api.`, `erp.`, `pos.`, `wh.`) terminated by a single nginx box. The fastest path is `QUICKSTART_AWS.md` (30-minute fresh-EC2 walkthrough); `DEPLOYMENT_AWS.md` is the long-form reference.

---

## Default credentials (seed only — rotate before going live!)

| Role        | Username    | Password           | PIN  |
| ----------- | ----------- | ------------------ | ---- |
| ERP Admin   | `admin`     | `Admin@12345`      | 1234 |
| ERP Manager | `manager`   | `Manager@12345`    | 2345 |
| POS Cashier | `cashier`   | `admin123`         | 3456 |
| Warehouse   | `warehouse` | `Warehouse@12345`  | 4567 |

---

## Verify the build

```bash
pnpm run typecheck            # all workspaces
pnpm --filter @workspace/scripts run verify   # CLI smoke test
# Then open the ERP and run /verifier — every section must be green.
```

---

## Documentation map

| Doc                       | Purpose                                            |
| ------------------------- | -------------------------------------------------- |
| `README.md`               | This file — overview + quick start                |
| `replit.md`               | Detailed feature inventory + architecture          |
| `PRODUCTION.md`           | Pre-launch checklist for ops / business owners     |
| `QUICKSTART_AWS.md`       | **Start here for AWS** — 30-min fresh-EC2 deploy   |
| `DEPLOYMENT_AWS.md`       | Long-form AWS deploy reference (EC2 + RDS / ECS)   |
| `ANTIGRAVITY_HANDOFF.md`  | Hand-off for the next developer (any IDE)          |
| `/help` (in the ERP)      | 16 in-app guides                                   |
| `/help/architecture`      | API contract, data model, code layout              |
| `/help/production`        | Same checklist as `PRODUCTION.md`, in-app          |
| `/verifier`               | Live end-to-end self-check                         |

---

## Pushing this repo to GitHub for the first time

```bash
git remote add origin https://github.com/<your-username>/<your-repo>.git
git branch -M main
git push -u origin main
```

If `origin` already exists, replace `add` with `set-url`. Use a Personal Access Token (Settings → Developer settings → Personal access tokens) as the password when prompted.

---

## License

Proprietary — © Rathinam Crackers. Not for redistribution.
