# Rathinam Crackers — Production Go-Live Guide

This is the single source of truth for taking the Rathinam Crackers ERP, POS, Warehouse, and Website live. Read it end-to-end before flipping the switch on real customer traffic.

> A web version of this guide is also available inside the ERP under **Help → Production Go-Live Checklist** (`/help/production`), and detailed per-feature guides live under **Help → Topic Guides** (`/help`).

---

## 1. System overview

The project is a pnpm monorepo with five deployable artifacts behind a single shared reverse proxy:

| Path           | Artifact                          | Audience                      |
| -------------- | --------------------------------- | ----------------------------- |
| `/`            | Rathinam Crackers ERP             | Admin / manager / agent users |
| `/pos/`        | POS Interface                     | Cashiers (PIN login)          |
| `/warehouse/`  | Warehouse Dashboard               | Warehouse manager             |
| `/website/`    | Public storefront                 | Customers (anonymous + login) |
| `/api/v1/`     | Express + Drizzle API             | All apps                      |

Tech stack: Node 20 + Express 5 + TypeScript ESM, PostgreSQL via Drizzle ORM, OpenAPI 3.1 contract → Orval codegen → Zod schemas + React Query hooks, JWT auth (15 min access / 7 d refresh), bcrypt password hashing, multi-location immutable stock ledger.

---

## 2. Pre-deploy checklist

### 2.1 Secrets & environment

The app expects these secrets to be set (Replit Secrets / `.env`):

- `DATABASE_URL` — Postgres connection string
- `SESSION_SECRET` — random 32+ byte string for session signing
- `JWT_SECRET` (auto-derived from `SESSION_SECRET` if not set; set explicitly for stable tokens across restarts)

Rotate `SESSION_SECRET` once before going live, then leave it alone.

### 2.2 Default credentials — **rotate every one**

Seeded for development; not safe for production.

| Role          | Username    | Default password    | PIN  |
| ------------- | ----------- | ------------------- | ---- |
| ERP Admin     | `admin`     | `Admin@12345`       | 1234 |
| ERP Manager   | `manager`   | `Manager@12345`     | 2345 |
| POS Cashier   | `cashier`   | `admin123`          | 3456 |
| Warehouse     | `warehouse` | `Warehouse@12345`   | 4567 |

**ERP → Settings → Users → Edit** for each. Pick strong unique passwords, store in a password manager, share with the right humans only.

### 2.3 Company information

ERP → **Settings → Company**. Replace seed values with the real legal entity:

- Company name, GSTIN, address, phone, email
- Bank details (printed on invoices)
- Logo (used on PDFs and the website header)

### 2.4 Pricing config

ERP → **Settings → Pricing**:

- Wholesale qty threshold (default 10)
- Loyalty earn rate (default 1 point per ₹100)
- Default GST rate (default 18%)

### 2.5 Master data

Use **Bulk CSV** (Template / Export / Import buttons on each list page) to load real Products, Customers, Suppliers, Agents, Brands, Categories, Locations, Coupons. Disable any demo rows you don't need (e.g. "Test Brand AAA").

### 2.6 Opening stock

For each location, **Stock → Receive** with reason "Opening stock as on <date>". This anchors the immutable ledger to a real baseline.

### 2.7 CMS pages

ERP → **Site Content**: edit About, Privacy Policy, Refund Policy, Terms, Shipping Policy, FAQ. These are surfaced on the website footer and order pages — they must reflect your real legal terms before customers can place orders.

---

## 3. Smoke test (post-deploy)

Run, in order, on the production environment:

1. **Verifier** — open ERP → **Verifier** → click *Run all checks*. Every section must be green. The verifier auto-uses your live admin token, so it always reflects the current passwords.
2. **POS sale** — log into `/pos/`, ring up a 1-line cash sale, print the receipt, confirm it shows the correct company info + GST.
3. **Online order** — place a test order on the website. In the ERP, advance it: confirm → packed → dispatch (with courier + AWB) → delivered. Verify the customer sees the courier info on their order detail page.
4. **Cancel flow** — place another test order, cancel it from the ERP and from the website (use a fresh order for each). After each cancellation, confirm the stock has been restored on the product detail page.
5. **Return** — raise a return against the delivered test invoice; confirm the stock IN ledger entry appears.
6. **GST report** — Reports → GST → current month. Verify the totals match what you'd expect from the test sales.
7. **Backup** — take a full database backup and store it off-system.

If any step fails, do **not** flip live traffic; fix and re-run.

---

## 4. Going live

1. Confirm all of section 2 and section 3 are done.
2. Publish the deployment (Replit → Publish).
3. Update the storefront URL in your marketing channels.
4. Bookmark `/verifier` on every staff device — daily morning run.
5. Bookmark Reports → Dashboard for the morning anomaly glance (low stock, negative cash drawer, overdue receivables).

---

## 5. Day-2 operations

- **Daily**: morning Verifier run, dashboard glance, end-of-day cash reconciliation.
- **Weekly**: review outstanding receivables, agent commission, low-stock alerts.
- **Monthly**: pull the GSTR-1 report, file with your CA, take a full DB backup.
- **As needed**: rotate a user's password if they leave; raise stock adjustments (with a reason) for damages.

---

## 6. Bypass / safety guards already in place

These are enforced by the API regardless of UI state — useful to know if you ever see one of these error codes in a log:

| Code                 | Meaning                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------- |
| `USE_DISPATCH`       | Tried to PATCH order status to `dispatched` directly; must use the Dispatch action.      |
| `USE_SHOP_PLACEMENT` | Tried to create an invoice with `channel=ONLINE` via the generic invoice route.         |
| `NOT_DELIVERED`      | Tried to raise a return on an online order that isn't delivered yet.                    |
| `ORDER_CANCELLED`    | Tried to raise a return on a cancelled online order.                                    |
| Cancel auth          | Customer cancel endpoint requires the customer's own session; staff cancel needs admin. |

---

## 7. Where to find more

- Per-feature guides: ERP → **Help** (`/help`)
- Live API docs: ERP → **System → API Docs** (`/system/api-docs`)
- Self-check: ERP → **Verifier** (`/verifier`)
- Architecture deep-dive: ERP → **Help → Architecture & API** (`/help/architecture`)

You're cleared for live the moment section 2 and section 3 are both green.
