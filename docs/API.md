# API reference

The full, machine-readable contract is in
[`lib/api-spec/openapi.yaml`](../lib/api-spec/openapi.yaml). It is the source
of truth — typed React Query hooks and Zod schemas are generated from it via
`pnpm --filter @workspace/api-spec run codegen`.

This file is a quick human-readable index of the route groups.

| Prefix | Purpose | Auth |
|--------|---------|------|
| `POST /api/v1/auth/login` | Username + password login (ERP/Warehouse) | public |
| `POST /api/v1/auth/pin-login` | PIN login (POS cashier) | public |
| `POST /api/v1/auth/refresh` | Rotate access token | refresh cookie |
| `GET  /api/v1/healthz` | Liveness probe (used by ALB / nginx) | public |
| `*    /api/v1/products` | Product CRUD + variants + custom prices | required |
| `GET  /api/v1/products/public` | Storefront catalogue (only `retailOnline` price) | public |
| `GET  /api/v1/products/:id/price` | Resolved price for given qty/customer/channel | required |
| `*    /api/v1/categories` `/brands` `/suppliers` `/agents` `/customers` | Master data CRUD | required |
| `GET  /api/v1/stock/levels` | Aggregated stock by location | required |
| `GET  /api/v1/stock/ledger` | Append-only ledger (Manager+) | required |
| `POST /api/v1/stock/receive` | Goods receipt (creates IN movements) | Warehouse+ |
| `POST /api/v1/stock/adjust` | Adjustment with mandatory reason | Admin |
| `*    /api/v1/purchase-orders` `/transfers` `/packing-jobs` | Inventory workflows | role-gated |
| `*    /api/v1/estimates` `/invoices` `/returns` | Sales documents | role-gated |
| `POST /api/v1/coupons/validate` | Server-side coupon discount calc (never client-side) | optional |
| `POST /api/v1/pos/sale` | POS sale — atomic, supports `X-Idempotency-Key` | Cashier+ |
| `POST /api/v1/pos/return` | POS return + credit note | Cashier+ |
| `POST /api/v1/pos/hold` `GET /pos/held` | Hold + resume bills | Cashier+ |
| `POST /api/v1/pos/shift-close` | Close shift, cash count, Z-report | Cashier+ |
| `POST /api/v1/brochure/upload` `GET /brochure/parse/:id` | Wholesale Excel brochure parser (header-name match) | required |
| `*    /api/v1/import/:module` `/export/:module` | Excel import/export per master-data module | required |
| `GET  /api/v1/reports/{sales,gst,stock,outstanding,commission,daybook,damage,loyalty}` | All accept `?export=xlsx` | role-gated |
| `*    /api/v1/settings/{company,tax,pricing,integrations}` | System configuration | Admin |
| `*    /api/v1/notifications` | In-app notification log | required |
| `POST /api/v1/notify/send` | Trigger an outbound notification (WA/SMS/email) | Manager+ |

## Conventions

- All success responses: `{ "success": true, "data": ... }` (paginated list also includes `meta`).
- All error responses: `{ "success": false, "error": { "code": "...", "message": "..." } }`.
- Money is stored and returned as numeric strings with two decimals.
- All write endpoints log to `audit_log` (immutable).
- `POST /pos/sale` accepts a `X-Idempotency-Key` header; replays of the same key + body within 24h return the cached response with `X-Idempotent-Replay: true`. A different body for the same key returns `409 IDEMPOTENCY_KEY_REUSED`.

## Generating the typed client

```bash
pnpm --filter @workspace/api-spec run codegen
```

This rewrites `lib/api-client/src/generated/*` and `lib/api-client/src/zod/*` so the frontends and the server agree on types.
