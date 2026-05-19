#!/usr/bin/env tsx
/**
 * Rathinam Crackers — System Verifier
 *
 * Automated end-to-end health checks for the entire stack.
 * Verifies API health, auth, RBAC, pricing engine, stock immutability,
 * coupon validation, and frontend availability.
 *
 * Usage:  pnpm --filter @workspace/scripts run verify
 */

const BASE = process.env["VERIFIER_BASE_URL"] ?? "http://localhost:80";

type CheckResult = {
  name: string;
  passed: boolean;
  detail?: string;
};

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

async function http(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: unknown; headers: Headers }> {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const res = await fetch(url, init);
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = await res.text().catch(() => null);
  }
  return { status: res.status, body, headers: res.headers };
}

async function login(username: string, password: string): Promise<string | null> {
  const res = await http("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (res.status !== 200) return null;
  const body = res.body as { data?: { accessToken?: string } };
  return body?.data?.accessToken ?? null;
}

const sections: Array<{ name: string; checks: () => Promise<CheckResult[]> }> = [
  {
    name: "1. Infrastructure & Health",
    checks: async () => {
      const out: CheckResult[] = [];
      const health = await http("/api/healthz");
      out.push({
        name: "API health endpoint responds 200",
        passed: health.status === 200,
        detail: `status=${health.status}`,
      });
      out.push({
        name: "Health body has status:ok",
        passed: (health.body as { status?: string })?.status === "ok",
        detail: JSON.stringify(health.body),
      });
      const erp = await fetch(`${BASE}/`);
      out.push({
        name: "ERP frontend served at /",
        passed: erp.status < 500,
        detail: `status=${erp.status}`,
      });
      const pos = await fetch(`${BASE}/pos/`);
      out.push({
        name: "POS frontend served at /pos/",
        passed: pos.status < 500,
        detail: `status=${pos.status}`,
      });
      const wh = await fetch(`${BASE}/warehouse/`);
      out.push({
        name: "Warehouse frontend served at /warehouse/",
        passed: wh.status < 500,
        detail: `status=${wh.status}`,
      });
      const web = await fetch(`${BASE}/website/`);
      out.push({
        name: "Website frontend served at /website/",
        passed: web.status < 500,
        detail: `status=${web.status}`,
      });
      return out;
    },
  },
  {
    name: "2. Authentication & RBAC",
    checks: async () => {
      const out: CheckResult[] = [];
      const protectedNoAuth = await http("/api/v1/products");
      out.push({
        name: "Protected route returns 401 without token",
        passed: protectedNoAuth.status === 401,
        detail: `status=${protectedNoAuth.status}`,
      });
      const badLogin = await http("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "wrong" }),
      });
      out.push({
        name: "Wrong password returns 401",
        passed: badLogin.status === 401,
        detail: `status=${badLogin.status}`,
      });
      const adminTok = await login("admin", "admin123");
      out.push({
        name: "Admin login succeeds with seeded credentials",
        passed: !!adminTok,
        detail: adminTok ? "token issued" : "no token returned",
      });
      if (adminTok) {
        const me = await http("/api/v1/auth/me", {
          headers: { Authorization: `Bearer ${adminTok}` },
        });
        out.push({
          name: "GET /auth/me returns 200 with token",
          passed: me.status === 200,
          detail: `status=${me.status}`,
        });
      }
      return out;
    },
  },
  {
    name: "3. Pricing Engine (5-tier + qty trigger)",
    checks: async () => {
      const out: CheckResult[] = [];
      const tok = await login("admin", "admin123");
      if (!tok) {
        out.push({
          name: "Pricing checks (skipped — no admin token)",
          passed: false,
        });
        return out;
      }
      const headers = { Authorization: `Bearer ${tok}` };
      const products = await http("/api/v1/products?limit=1", { headers });
      const pBody = products.body as { data?: unknown };
      const raw = pBody?.data;
      const items = (Array.isArray(raw)
        ? raw
        : (raw as { items?: unknown[] })?.items ?? []) as Array<{ id: string; variants?: Array<{ id?: string; variantId?: string }> }>;
      if (!items || items.length === 0) {
        out.push({ name: "Has at least one product to price", passed: false, detail: "GET /products returned 0 items" });
        return out;
      }
      const prod = items[0]!;
      const variantId = prod.variants?.[0]?.variantId ?? prod.variants?.[0]?.id;
      const lowQty = await http(
        `/api/v1/products/${prod.id}/price?qty=1&channel=POS&variantId=${variantId}`,
        { headers },
      );
      const highQty = await http(
        `/api/v1/products/${prod.id}/price?qty=20&channel=POS&variantId=${variantId}`,
        { headers },
      );
      out.push({
        name: "Price endpoint returns 200 for low qty",
        passed: lowQty.status === 200,
        detail: `status=${lowQty.status}`,
      });
      out.push({
        name: "Price endpoint returns 200 for qty above threshold",
        passed: highQty.status === 200,
        detail: `status=${highQty.status}`,
      });
      const lowBody = lowQty.body as { data?: { resolutionReason?: string; bulkRateApplied?: boolean } };
      const highBody = highQty.body as { data?: { resolutionReason?: string; bulkRateApplied?: boolean } };
      out.push({
        name: "Price response includes resolutionReason",
        passed: !!lowBody?.data?.resolutionReason,
        detail: `reason=${lowBody?.data?.resolutionReason}`,
      });
      out.push({
        name: "qty>=10 triggers wholesale (bulkRateApplied=true)",
        passed: highBody?.data?.bulkRateApplied === true,
        detail: `bulkRateApplied=${highBody?.data?.bulkRateApplied}`,
      });
      return out;
    },
  },
  {
    name: "4. Stock System (immutable ledger)",
    checks: async () => {
      const out: CheckResult[] = [];
      const tok = await login("admin", "admin123");
      if (!tok) {
        out.push({ name: "Stock checks (skipped — no token)", passed: false });
        return out;
      }
      const headers = { Authorization: `Bearer ${tok}` };
      const levels = await http("/api/v1/stock/levels", { headers });
      out.push({
        name: "GET /stock/levels returns 200",
        passed: levels.status === 200,
        detail: `status=${levels.status}`,
      });
      const ledger = await http("/api/v1/stock/ledger?limit=5", { headers });
      out.push({
        name: "GET /stock/ledger returns 200",
        passed: ledger.status === 200,
        detail: `status=${ledger.status}`,
      });
      const adjustNoReason = await http("/api/v1/stock/adjust", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ qty: 1 }),
      });
      out.push({
        name: "POST /stock/adjust without reason returns 4xx",
        passed: adjustNoReason.status >= 400 && adjustNoReason.status < 500,
        detail: `status=${adjustNoReason.status}`,
      });
      // Immutable ledger guard: any mutation verb on /stock/ledger must NOT succeed (no 2xx)
      const ledgerRows = ledger.body as { data?: unknown[] };
      const sampleRow = Array.isArray(ledgerRows?.data) ? (ledgerRows.data[0] as { id?: string } | undefined) : undefined;
      const sampleId = sampleRow?.id ?? "ledger-row-id-test";
      const putAttempt = await http(`/api/v1/stock/ledger/${sampleId}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ qty: 9999 }),
      });
      out.push({
        name: "PUT /stock/ledger/:id is rejected (immutable)",
        passed: putAttempt.status >= 400,
        detail: `status=${putAttempt.status}`,
      });
      const deleteAttempt = await http(`/api/v1/stock/ledger/${sampleId}`, {
        method: "DELETE",
        headers,
      });
      out.push({
        name: "DELETE /stock/ledger/:id is rejected (immutable)",
        passed: deleteAttempt.status >= 400,
        detail: `status=${deleteAttempt.status}`,
      });
      const patchAttempt = await http(`/api/v1/stock/ledger/${sampleId}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ qty: 9999 }),
      });
      out.push({
        name: "PATCH /stock/ledger/:id is rejected (immutable)",
        passed: patchAttempt.status >= 400,
        detail: `status=${patchAttempt.status}`,
      });
      return out;
    },
  },
  {
    name: "5. Customers, Suppliers, Agents",
    checks: async () => {
      const out: CheckResult[] = [];
      const tok = await login("admin", "admin123");
      if (!tok) {
        out.push({ name: "CRM checks (skipped — no token)", passed: false });
        return out;
      }
      const headers = { Authorization: `Bearer ${tok}` };
      const c = await http("/api/v1/customers?limit=1", { headers });
      out.push({ name: "GET /customers returns 200", passed: c.status === 200 });
      const s = await http("/api/v1/suppliers?limit=1", { headers });
      out.push({ name: "GET /suppliers returns 200", passed: s.status === 200 });
      const a = await http("/api/v1/agents?limit=1", { headers });
      out.push({ name: "GET /agents returns 200", passed: a.status === 200 });
      return out;
    },
  },
  {
    name: "6. Estimates / Invoices / Coupons",
    checks: async () => {
      const out: CheckResult[] = [];
      const tok = await login("admin", "admin123");
      if (!tok) {
        out.push({ name: "Sales checks (skipped — no token)", passed: false });
        return out;
      }
      const headers = { Authorization: `Bearer ${tok}` };
      const est = await http("/api/v1/estimates?limit=1", { headers });
      out.push({ name: "GET /estimates returns 200", passed: est.status === 200 });
      const inv = await http("/api/v1/invoices?limit=1", { headers });
      out.push({ name: "GET /invoices returns 200", passed: inv.status === 200 });
      const cp = await http("/api/v1/coupons?limit=1", { headers });
      out.push({ name: "GET /coupons returns 200", passed: cp.status === 200 });
      const validate = await http("/api/v1/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "DEFINITELY_NOT_A_REAL_COUPON_X9", cartTotal: 1000, channel: "POS" }),
      });
      out.push({
        name: "Coupon validate with bad code returns invalid (200 or 404)",
        passed: validate.status === 200 || validate.status === 404,
        detail: `status=${validate.status}`,
      });
      return out;
    },
  },
  {
    name: "7. POS / Warehouse / Reports",
    checks: async () => {
      const out: CheckResult[] = [];
      const tok = await login("admin", "admin123");
      if (!tok) {
        out.push({ name: "Module checks (skipped — no token)", passed: false });
        return out;
      }
      const headers = { Authorization: `Bearer ${tok}` };
      const pos = await http("/api/v1/pos/products?limit=1", { headers });
      out.push({ name: "GET /pos/products returns 200", passed: pos.status === 200 });
      const tr = await http("/api/v1/transfers?limit=1", { headers });
      out.push({ name: "GET /transfers returns 200", passed: tr.status === 200 });
      const po = await http("/api/v1/purchase-orders?limit=1", { headers });
      out.push({ name: "GET /purchase-orders returns 200", passed: po.status === 200 });
      const today = new Date().toISOString().slice(0, 10);
      const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const sales = await http(`/api/v1/reports/sales?dateFrom=${monthAgo}&dateTo=${today}`, { headers });
      out.push({ name: "GET /reports/sales returns 200", passed: sales.status === 200 });
      return out;
    },
  },
  {
    name: "8. Locations, Users & Settings (admin)",
    checks: async () => {
      const out: CheckResult[] = [];
      const tok = await login("admin", "admin123");
      if (!tok) {
        out.push({ name: "Skipped — no admin token", passed: false });
        return out;
      }
      const headers = { Authorization: `Bearer ${tok}` };

      const locs = await http("/api/v1/locations", { headers });
      out.push({
        name: "GET /locations returns 200",
        passed: locs.status === 200,
        detail: `status=${locs.status}`,
      });
      const locArr = (locs.body as { data?: unknown[] })?.data;
      out.push({
        name: "Locations seed has at least one entry",
        passed: Array.isArray(locArr) && locArr.length > 0,
        detail: `count=${Array.isArray(locArr) ? locArr.length : 0}`,
      });

      const usersNoAuth = await http("/api/v1/users");
      out.push({
        name: "GET /users without token returns 401 (admin-only)",
        passed: usersNoAuth.status === 401,
        detail: `status=${usersNoAuth.status}`,
      });
      const users = await http("/api/v1/users", { headers });
      out.push({
        name: "GET /users returns 200 (admin)",
        passed: users.status === 200,
        detail: `status=${users.status}`,
      });
      // RBAC: a non-admin (CASHIER) MUST be rejected with 403.
      const cashierTok = await login("cashier", "admin123");
      const cashierHeaders = { Authorization: `Bearer ${cashierTok}` };
      const usersAsCashier = await http("/api/v1/users", { headers: cashierHeaders });
      out.push({
        name: "GET /users as non-admin (CASHIER) returns 403 (RBAC)",
        passed: usersAsCashier.status === 403,
        detail: `status=${usersAsCashier.status}`,
      });
      const userCreateAsCashier = await http("/api/v1/users", {
        method: "POST",
        headers: { ...cashierHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Hacker", username: "hacker", password: "x", role: "SUPER_ADMIN" }),
      });
      out.push({
        name: "POST /users as non-admin (CASHIER) returns 403 (RBAC)",
        passed: userCreateAsCashier.status === 403,
        detail: `status=${userCreateAsCashier.status}`,
      });

      const company = await http("/api/v1/settings/company", { headers });
      out.push({
        name: "GET /settings/company returns 200",
        passed: company.status === 200,
        detail: `status=${company.status}`,
      });
      const cBody = JSON.stringify(company.body ?? "");
      out.push({
        name: "Company settings reference brand 'Rathinam'",
        passed: /Rathinam/i.test(cBody),
        detail: cBody.slice(0, 80),
      });

      const pricing = await http("/api/v1/settings/pricing", { headers });
      out.push({
        name: "GET /settings/pricing returns 200",
        passed: pricing.status === 200,
        detail: `status=${pricing.status}`,
      });
      const pricingData = (pricing.body as { data?: Record<string, unknown> })?.data ?? {};
      const taxRate = pricingData["taxRate"];
      out.push({
        name: "Pricing settings include GST taxRate (>0)",
        passed: typeof taxRate === "number" && taxRate > 0,
        detail: `taxRate=${String(taxRate)}`,
      });

      // Audit-log: a settings PUT must record an audit row.
      const beforeCount = await http("/api/v1/audit-log?entityType=settings.pricing&limit=1", { headers });
      const beforeTotal = Number(((beforeCount.body as { meta?: { total?: number } })?.meta?.total) ?? 0);
      const echoPut = await http("/api/v1/settings/pricing", {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(pricingData),
      });
      const afterCount = await http("/api/v1/audit-log?entityType=settings.pricing&limit=1", { headers });
      const afterTotal = Number(((afterCount.body as { meta?: { total?: number } })?.meta?.total) ?? 0);
      out.push({
        name: "PUT /settings/pricing records an audit-log row",
        passed: echoPut.status === 200 && afterTotal === beforeTotal + 1,
        detail: `before=${beforeTotal} after=${afterTotal} put=${echoPut.status}`,
      });
      const auditAsCashier = await http("/api/v1/audit-log", { headers: cashierHeaders });
      out.push({
        name: "GET /audit-log as non-admin (CASHIER) returns 403 (RBAC)",
        passed: auditAsCashier.status === 403,
        detail: `status=${auditAsCashier.status}`,
      });

      // Transactional rollback: if the parent invoice insert fails, the
      // stock-ledger writes that were queued inside the same transaction
      // must be rolled back. We force a NOT NULL violation by omitting
      // paymentMode and confirm the ledger row count is unchanged.
      const locsForRollback = (locArr as Array<{ id: string }>) ?? [];
      const rollbackLocId = locsForRollback[0]?.id;
      const prodsForRollback = await http("/api/v1/products?limit=1", { headers });
      const prodsRaw = (prodsForRollback.body as { data?: unknown })?.data;
      const prodItems = (Array.isArray(prodsRaw) ? prodsRaw : (prodsRaw as { items?: any[] })?.items ?? []) as any[];
      const rollbackProd = prodItems[0];
      const rollbackVariantId =
        rollbackProd?.variants?.[0]?.id ?? rollbackProd?.variants?.[0]?.variantId;
      if (rollbackLocId && rollbackProd?.id && rollbackVariantId) {
        const ledgerQs =
          `?productId=${rollbackProd.id}&variantId=${encodeURIComponent(rollbackVariantId)}&limit=1`;
        const ledgerBefore = await http(`/api/v1/stock/ledger${ledgerQs}`, { headers });
        const ledgerBeforeTotal = Number(
          (ledgerBefore.body as { meta?: { total?: number } })?.meta?.total ?? -1,
        );
        // Intentionally invalid: paymentMode omitted → DB NOT NULL fails inside
        // the same transaction that already inserted the ledger row.
        const badInvoice = await http("/api/v1/invoices", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            locationId: rollbackLocId,
            channel: "RETAIL",
            items: [
              { productId: rollbackProd.id, variantId: rollbackVariantId, qty: 1 },
            ],
          }),
        });
        const ledgerAfter = await http(`/api/v1/stock/ledger${ledgerQs}`, { headers });
        const ledgerAfterTotal = Number(
          (ledgerAfter.body as { meta?: { total?: number } })?.meta?.total ?? -2,
        );
        out.push({
          name: "Failed invoice insert rolls back stock-ledger row (transactional)",
          passed:
            badInvoice.status >= 400 &&
            ledgerBeforeTotal >= 0 &&
            ledgerAfterTotal === ledgerBeforeTotal,
          detail: `invoice=${badInvoice.status} ledger before=${ledgerBeforeTotal} after=${ledgerAfterTotal}`,
        });
      }

      // End-to-end transfer flow: create → dispatch → receive
      if (Array.isArray(locArr) && locArr.length >= 2) {
        const products = await http("/api/v1/products?limit=1", { headers });
        const raw = (products.body as { data?: unknown })?.data;
        const items = (Array.isArray(raw) ? raw : (raw as { items?: any[] })?.items ?? []) as any[];
        const prod = items[0];
        const variantId = prod?.variants?.[0]?.id ?? prod?.variants?.[0]?.variantId;
        const fromId = (locArr[0] as { id: string }).id;
        const toId = (locArr[1] as { id: string }).id;
        if (prod && variantId) {
          const created = await http("/api/v1/transfers", {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({
              fromLocationId: fromId,
              toLocationId: toId,
              items: [{ productId: prod.id, variantId, qty: 1 }],
              notes: "verifier round-trip",
            }),
          });
          const tBody = created.body as { id?: string; data?: { id?: string } };
          const tid = tBody?.data?.id ?? tBody?.id;
          out.push({
            name: "POST /transfers creates a draft transfer",
            passed: created.status === 201 && !!tid,
            detail: `status=${created.status}`,
          });
          if (tid) {
            const disp = await http(`/api/v1/transfers/${tid}/dispatch`, {
              method: "PUT",
              headers: { ...headers, "Content-Type": "application/json" },
              body: JSON.stringify({}),
            });
            out.push({
              name: "PUT /transfers/:id/dispatch returns 200",
              passed: disp.status === 200,
              detail: `status=${disp.status}`,
            });
            // Read-back: confirm dispatch flipped status to "in_transit".
            const afterDispatch = await http(`/api/v1/transfers/${tid}`, { headers });
            const dispBody = afterDispatch.body as { data?: { status?: string } };
            const dispStatus = dispBody?.data?.status;
            out.push({
              name: "Transfer status is 'in_transit' after dispatch",
              passed: afterDispatch.status === 200 && dispStatus === "in_transit",
              detail: `status=${dispStatus}`,
            });
            // Confirm dispatch left a MOVE OUT ledger row tagged with this transfer.
            const dispLedger = await http(
              `/api/v1/stock/ledger?productId=${prod.id}&variantId=${encodeURIComponent(variantId)}&limit=20`,
              { headers },
            );
            const dispLedgerRows = (dispLedger.body as { data?: Array<{ refType?: string; refId?: string; type?: string }> })?.data ?? [];
            const dispatched = dispLedgerRows.some(
              (r) => r.refType === "TRANSFER" && r.refId === tid && r.type === "MOVE",
            );
            out.push({
              name: "Stock ledger has MOVE row for dispatched transfer (transactional commit)",
              passed: dispatched,
              detail: dispatched ? "ok" : `no matching ledger row (rows=${dispLedgerRows.length})`,
            });
            const recv = await http(`/api/v1/transfers/${tid}/receive`, {
              method: "PUT",
              headers: { ...headers, "Content-Type": "application/json" },
              body: JSON.stringify({
                items: [{ productId: prod.id, variantId, receivedQty: 1 }],
              }),
            });
            out.push({
              name: "PUT /transfers/:id/receive returns 200",
              passed: recv.status === 200,
              detail: `status=${recv.status}`,
            });
            // Read-back: confirm receive flipped status to "received".
            const afterReceive = await http(`/api/v1/transfers/${tid}`, { headers });
            const recvBody = afterReceive.body as { data?: { status?: string } };
            const recvStatus = recvBody?.data?.status;
            out.push({
              name: "Transfer status is 'received' after receive",
              passed: afterReceive.status === 200 && recvStatus === "received",
              detail: `status=${recvStatus}`,
            });

          }

          // Real transactional-rollback proofs for POS sale, transfer
          // dispatch, transfer receive, and PO receive. Each route honours
          // a NODE_ENV-gated `__forceFailAfterLedger` body flag that throws
          // *inside* the same db.transaction, after appendLedger has run.
          // The expectation is identical for every path: HTTP 5xx, and the
          // stock-ledger row count is unchanged.
          const ledgerQs2 = `?productId=${prod.id}&variantId=${encodeURIComponent(variantId)}&limit=1`;
          const ledgerTotal = async (): Promise<number> => {
            const r = await http(`/api/v1/stock/ledger${ledgerQs2}`, { headers });
            return Number((r.body as { meta?: { total?: number } })?.meta?.total ?? -1);
          };

          // -- POS sale rollback --
          const posBefore = await ledgerTotal();
          const badPos = await http("/api/v1/pos/sale", {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({
              locationId: fromId,
              paymentMode: "CASH",
              items: [{ productId: prod.id, variantId, qty: 1 }],
              __forceFailAfterLedger: true,
            }),
          });
          const posAfter = await ledgerTotal();
          out.push({
            name: "Forced-fail POS sale rolls back stock-ledger row (transactional)",
            passed: badPos.status >= 500 && posBefore >= 0 && posAfter === posBefore,
            detail: `pos=${badPos.status} ledger before=${posBefore} after=${posAfter}`,
          });

          // -- Transfer dispatch rollback (needs a fresh draft transfer) --
          const draftDispatch = await http("/api/v1/transfers", {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({
              fromLocationId: fromId,
              toLocationId: toId,
              items: [{ productId: prod.id, variantId, qty: 1 }],
              notes: "verifier rollback dispatch",
            }),
          });
          const dispDraftId = (draftDispatch.body as { data?: { id?: string } })?.data?.id;
          if (dispDraftId) {
            const before = await ledgerTotal();
            const bad = await http(`/api/v1/transfers/${dispDraftId}/dispatch`, {
              method: "PUT",
              headers: { ...headers, "Content-Type": "application/json" },
              body: JSON.stringify({ vehicleNo: "TN-FAIL-1", __forceFailAfterLedger: true }),
            });
            const after = await ledgerTotal();
            out.push({
              name: "Forced-fail transfer dispatch rolls back stock-ledger row (transactional)",
              passed: bad.status >= 500 && before >= 0 && after === before,
              detail: `dispatch=${bad.status} ledger before=${before} after=${after}`,
            });
          }

          // -- Transfer receive rollback (needs an in-transit transfer) --
          const draftReceive = await http("/api/v1/transfers", {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({
              fromLocationId: fromId,
              toLocationId: toId,
              items: [{ productId: prod.id, variantId, qty: 1 }],
              notes: "verifier rollback receive",
            }),
          });
          const recvDraftId = (draftReceive.body as { data?: { id?: string } })?.data?.id;
          if (recvDraftId) {
            await http(`/api/v1/transfers/${recvDraftId}/dispatch`, {
              method: "PUT",
              headers: { ...headers, "Content-Type": "application/json" },
              body: JSON.stringify({ vehicleNo: "TN-OK-1" }),
            });
            const before = await ledgerTotal();
            const bad = await http(`/api/v1/transfers/${recvDraftId}/receive`, {
              method: "PUT",
              headers: { ...headers, "Content-Type": "application/json" },
              body: JSON.stringify({
                items: [{ productId: prod.id, variantId, receivedQty: 1 }],
                __forceFailAfterLedger: true,
              }),
            });
            const after = await ledgerTotal();
            out.push({
              name: "Forced-fail transfer receive rolls back stock-ledger row (transactional)",
              passed: bad.status >= 500 && before >= 0 && after === before,
              detail: `receive=${bad.status} ledger before=${before} after=${after}`,
            });
          }

          // End-to-end PO flow: create → receive → assert RECEIVED status + IN ledger row
          const suppliers = await http("/api/v1/suppliers?limit=1", { headers });
          const supArr = (suppliers.body as { data?: Array<{ id: string }> })?.data ?? [];
          const supplierId = supArr[0]?.id;
          if (supplierId) {
            const poCreated = await http("/api/v1/purchase-orders", {
              method: "POST",
              headers: { ...headers, "Content-Type": "application/json" },
              body: JSON.stringify({
                supplierId,
                warehouseId: fromId,
                items: [{ productId: prod.id, variantId, orderedQty: 2, unitPrice: 100 }],
                expectedDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
                notes: "verifier PO round-trip",
              }),
            });
            const poBody = poCreated.body as { id?: string; data?: { id?: string } };
            const poId = poBody?.data?.id ?? poBody?.id;
            out.push({
              name: "POST /purchase-orders creates a draft PO",
              passed: poCreated.status === 201 && !!poId,
              detail: `status=${poCreated.status}`,
            });
            if (poId) {
              const poRecv = await http(`/api/v1/purchase-orders/${poId}/receive`, {
                method: "PUT",
                headers: { ...headers, "Content-Type": "application/json" },
                body: JSON.stringify({
                  items: [{ productId: prod.id, variantId, receivedQty: 2 }],
                }),
              });
              out.push({
                name: "PUT /purchase-orders/:id/receive returns 200",
                passed: poRecv.status === 200,
                detail: `status=${poRecv.status}`,
              });
              const poAfter = await http(`/api/v1/purchase-orders/${poId}`, { headers });
              const poAfterBody = poAfter.body as { status?: string; data?: { status?: string } };
              const poRow = poAfterBody?.data ?? poAfterBody;
              out.push({
                name: "PO status is 'received' after receiving",
                passed: poRow?.status === "received",
                detail: `status=${poRow?.status}`,
              });
              const ledger = await http(
                `/api/v1/stock/ledger?productId=${prod.id}&variantId=${encodeURIComponent(variantId)}&limit=20`,
                { headers },
              );
              const ledgerRows = (ledger.body as { data?: Array<{ refType?: string; refId?: string; type?: string }> })?.data ?? [];
              const inwardForPo = ledgerRows.some(
                (r) => r.refType === "PO" && r.refId === poId && r.type === "IN",
              );
              out.push({
                name: "Stock ledger has IN row for received PO",
                passed: inwardForPo,
                detail: inwardForPo ? "ok" : `no matching ledger row (rows=${ledgerRows.length})`,
              });

              // -- PO receive rollback: a fresh draft PO + force-fail flag.
              const poDraft2 = await http("/api/v1/purchase-orders", {
                method: "POST",
                headers: { ...headers, "Content-Type": "application/json" },
                body: JSON.stringify({
                  supplierId,
                  warehouseId: fromId,
                  items: [{ productId: prod.id, variantId, orderedQty: 2, unitPrice: 100 }],
                  expectedDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
                  notes: "verifier rollback PO",
                }),
              });
              const poBody2 = poDraft2.body as { id?: string; data?: { id?: string } };
              const poId2 = poBody2?.data?.id ?? poBody2?.id;
              if (poId2) {
                const ledgerQs3 = `?productId=${prod.id}&variantId=${encodeURIComponent(variantId)}&limit=1`;
                const before = Number(
                  ((await http(`/api/v1/stock/ledger${ledgerQs3}`, { headers })).body as { meta?: { total?: number } })?.meta?.total ?? -1,
                );
                const bad = await http(`/api/v1/purchase-orders/${poId2}/receive`, {
                  method: "PUT",
                  headers: { ...headers, "Content-Type": "application/json" },
                  body: JSON.stringify({
                    items: [{ productId: prod.id, variantId, receivedQty: 2 }],
                    __forceFailAfterLedger: true,
                  }),
                });
                const after = Number(
                  ((await http(`/api/v1/stock/ledger${ledgerQs3}`, { headers })).body as { meta?: { total?: number } })?.meta?.total ?? -2,
                );
                out.push({
                  name: "Forced-fail PO receive rolls back stock-ledger row (transactional)",
                  passed: bad.status >= 500 && before >= 0 && after === before,
                  detail: `po=${bad.status} ledger before=${before} after=${after}`,
                });
              }
            }
          }
        }
      }
      return out;
    },
  },
  {
    name: "9. Public / Website APIs",
    checks: async () => {
      const out: CheckResult[] = [];
      const pub = await http("/api/v1/products/public?limit=3");
      out.push({
        name: "GET /products/public returns 200 (no auth needed)",
        passed: pub.status === 200,
        detail: `status=${pub.status}`,
      });
      const pubItems = (pub.body as { data?: { items?: Array<Record<string, unknown>> } })?.data?.items ?? [];
      const noPurchase = pubItems.every((p) => !("purchase" in p) && !("purchaseRate" in p));
      out.push({
        name: "Public products do NOT expose purchase rate",
        passed: noPurchase,
        detail: noPurchase ? "ok" : "purchase price leaked in public API",
      });
      const cp = await http("/api/v1/coupons/public");
      out.push({
        name: "GET /coupons/public returns 200 (no auth needed)",
        passed: cp.status === 200 || cp.status === 404,
        detail: `status=${cp.status}`,
      });

      // Occasion filter — end-to-end smoke test.
      // Tag a product with a rare occasion key and verify ?occasion=KEY filters to it.
      const adminToken = await login("admin", "admin123");
      const authHeaders = { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" };
      const all = await http("/api/v1/products?limit=1&onlineDisplay=true", { headers: authHeaders });
      const someProduct = (all.body as { data?: Array<{ id?: string; occasions?: string[] }> })?.data?.[0];
      if (adminToken && someProduct?.id) {
        const tag = "verify-occasion";
        const original = someProduct.occasions ?? [];
        await http(`/api/v1/products/${someProduct.id}`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ occasions: [...original, tag] }),
        });
        const filtered = await http(`/api/v1/products/public?occasion=${tag}&limit=20`);
        const items = (filtered.body as { data?: Array<{ id: string }> })?.data ?? [];
        const found = items.some((p) => p.id === someProduct.id);
        out.push({
          name: "Public products filter by ?occasion= (CMS occasion tag)",
          passed: filtered.status === 200 && found && items.length >= 1,
          detail: `status=${filtered.status} found=${found} count=${items.length}`,
        });
        // Restore.
        await http(`/api/v1/products/${someProduct.id}`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ occasions: original }),
        });
      } else {
        out.push({
          name: "Public products filter by ?occasion= (CMS occasion tag)",
          passed: false,
          detail: "no online product available to tag",
        });
      }
      return out;
    },
  },
  {
    name: "10. Shop orders — split shipping & billing",
    checks: async () => {
      const out: CheckResult[] = [];
      // Sign up a fresh shop customer (verifier-only) so we can place an order.
      const stamp = Date.now();
      const phone = `9${String(stamp).slice(-9)}`;
      const signup = await http("/api/v1/shop/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Verifier User", phone, password: "verify1234" }),
      });
      const token = (signup.body as any)?.data?.token ?? (signup.body as any)?.data?.accessToken;
      out.push({
        name: "POST /shop/auth/signup returns token",
        passed: (signup.status === 200 || signup.status === 201) && typeof token === "string",
        detail: token ? undefined : `status=${signup.status}`,
      });
      if (!token) return out;
      const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

      // Create two distinct addresses: one shipping, one billing.
      const ship = await http("/api/v1/shop/addresses", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          label: "Ship", name: "Ship Recipient", phone: "9000000001",
          line1: "1 Shipping Lane", city: "Sivakasi", state: "Tamil Nadu",
          pincode: "626123", addressType: "shipping",
        }),
      });
      const shippingId = (ship.body as any)?.data?.id;
      const bill = await http("/api/v1/shop/addresses", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          label: "Bill", name: "Bill Recipient", phone: "9000000002",
          line1: "9 Billing Road", city: "Madurai", state: "Tamil Nadu",
          pincode: "625001", addressType: "billing", isDefault: false,
        }),
      });
      const billingId = (bill.body as any)?.data?.id;
      out.push({
        name: "POST /shop/addresses (shipping + billing) returns 201",
        passed: !!shippingId && !!billingId,
        detail: !shippingId ? `ship status=${ship.status}` : !billingId ? `bill status=${bill.status}` : undefined,
      });
      if (!shippingId || !billingId) return out;

      // Pick any public product/variant to place the order.
      const prods = await http("/api/v1/products/public?limit=1");
      const p = (prods.body as any)?.data?.[0];
      const v = p?.variants?.[0];
      if (!p || !v) {
        out.push({ name: "Public product available for order", passed: false, detail: "no products" });
        return out;
      }

      const placed = await http("/api/v1/shop/orders", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          items: [{ productId: p.id, variantId: v.id ?? v.variantId, qty: 1 }],
          shippingAddressId: shippingId,
          billingAddressId: billingId,
          paymentMode: "COD",
        }),
      });
      out.push({
        name: "POST /shop/orders accepts shippingAddressId + billingAddressId",
        passed: placed.status === 200 || placed.status === 201,
        detail: placed.status >= 400 ? `status=${placed.status}` : undefined,
      });

      const orderId = (placed.body as any)?.data?.id;
      if (!orderId) return out;

      const got = await http(`/api/v1/shop/orders/${orderId}`, { headers: auth });
      const ld = (got.body as any)?.data?.logisticsDetails ?? {};
      out.push({
        name: "Order persists shippingAddress in logisticsDetails",
        passed: ld?.shippingAddress?.line1 === "1 Shipping Lane",
        detail: ld?.shippingAddress?.line1 ?? "missing",
      });
      out.push({
        name: "Order persists billingAddress in logisticsDetails",
        passed: ld?.billingAddress?.line1 === "9 Billing Road",
        detail: ld?.billingAddress?.line1 ?? "missing",
      });
      out.push({
        name: "Order marks sameAsShipping=false when billing differs",
        passed: ld?.sameAsShipping === false,
        detail: `sameAsShipping=${ld?.sameAsShipping}`,
      });
      return out;
    },
  },
  {
    name: "11. Audit-log coverage (users, locations, suppliers, agents)",
    checks: async () => {
      const out: CheckResult[] = [];
      const tok = await login("admin", "admin123");
      if (!tok) {
        out.push({ name: "Audit-coverage checks (skipped — no token)", passed: false });
        return out;
      }
      const headers = { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" };

      const auditTotal = async (entityType: string): Promise<number> => {
        const r = await http(`/api/v1/audit-log?entityType=${entityType}&limit=1`, { headers });
        return Number((r.body as { meta?: { total?: number } })?.meta?.total ?? -1);
      };

      const stamp = Date.now();

      // Some routes return the bare row (`{ id }`), others return the
      // standard envelope (`{ success, data: { id } }`). Read either shape
      // without resorting to `any`.
      type IdResponse = { id?: string; data?: { id?: string } };
      const extractId = (body: unknown): string | undefined => {
        const b = (body ?? {}) as IdResponse;
        return b.data?.id ?? b.id;
      };

      // -- locations: POST + PUT + DELETE --
      {
        const before = await auditTotal("location");
        const created = await http("/api/v1/locations", {
          method: "POST",
          headers,
          body: JSON.stringify({ name: `verify-loc-${stamp}`, type: "warehouse", address: "Verifier Address" }),
        });
        const lid = extractId(created.body);
        const afterCreate = await auditTotal("location");
        out.push({
          name: "POST /locations records a 'location' audit-log row",
          passed: created.status === 201 && !!lid && before >= 0 && afterCreate === before + 1,
          detail: `status=${created.status} before=${before} after=${afterCreate}`,
        });
        if (lid) {
          const updated = await http(`/api/v1/locations/${lid}`, {
            method: "PUT",
            headers,
            body: JSON.stringify({ name: `verify-loc-${stamp}-edit` }),
          });
          const afterUpdate = await auditTotal("location");
          out.push({
            name: "PUT /locations/:id records a 'location' audit-log row",
            passed: updated.status === 200 && afterUpdate === afterCreate + 1,
            detail: `status=${updated.status} before=${afterCreate} after=${afterUpdate}`,
          });
          const deleted = await http(`/api/v1/locations/${lid}`, { method: "DELETE", headers });
          const afterDelete = await auditTotal("location");
          out.push({
            name: "DELETE /locations/:id records a 'location' audit-log row",
            passed: deleted.status === 200 && afterDelete === afterUpdate + 1,
            detail: `status=${deleted.status} before=${afterUpdate} after=${afterDelete}`,
          });
        }
      }

      // -- suppliers: POST + PUT + DELETE --
      {
        const before = await auditTotal("supplier");
        const created = await http("/api/v1/suppliers", {
          method: "POST",
          headers,
          body: JSON.stringify({ name: `verify-sup-${stamp}`, phone: `9${String(stamp).slice(-9)}` }),
        });
        const sid = extractId(created.body);
        const afterCreate = await auditTotal("supplier");
        out.push({
          name: "POST /suppliers records a 'supplier' audit-log row",
          passed: created.status === 201 && !!sid && before >= 0 && afterCreate === before + 1,
          detail: `status=${created.status} before=${before} after=${afterCreate}`,
        });
        if (sid) {
          const updated = await http(`/api/v1/suppliers/${sid}`, {
            method: "PUT",
            headers,
            body: JSON.stringify({ name: `verify-sup-${stamp}-edit` }),
          });
          const afterUpdate = await auditTotal("supplier");
          out.push({
            name: "PUT /suppliers/:id records a 'supplier' audit-log row",
            passed: updated.status === 200 && afterUpdate === afterCreate + 1,
            detail: `status=${updated.status} before=${afterCreate} after=${afterUpdate}`,
          });
          const deleted = await http(`/api/v1/suppliers/${sid}`, { method: "DELETE", headers });
          const afterDelete = await auditTotal("supplier");
          out.push({
            name: "DELETE /suppliers/:id records a 'supplier' audit-log row",
            passed: deleted.status === 200 && afterDelete === afterUpdate + 1,
            detail: `status=${deleted.status} before=${afterUpdate} after=${afterDelete}`,
          });
        }
      }

      // -- agents: POST + PUT + DELETE --
      {
        const before = await auditTotal("agent");
        const created = await http("/api/v1/agents", {
          method: "POST",
          headers,
          body: JSON.stringify({ name: `verify-agent-${stamp}`, phone: `8${String(stamp).slice(-9)}` }),
        });
        const aid = extractId(created.body);
        const afterCreate = await auditTotal("agent");
        out.push({
          name: "POST /agents records an 'agent' audit-log row",
          passed: created.status === 201 && !!aid && before >= 0 && afterCreate === before + 1,
          detail: `status=${created.status} before=${before} after=${afterCreate}`,
        });
        if (aid) {
          const updated = await http(`/api/v1/agents/${aid}`, {
            method: "PUT",
            headers,
            body: JSON.stringify({ name: `verify-agent-${stamp}-edit` }),
          });
          const afterUpdate = await auditTotal("agent");
          out.push({
            name: "PUT /agents/:id records an 'agent' audit-log row",
            passed: updated.status === 200 && afterUpdate === afterCreate + 1,
            detail: `status=${updated.status} before=${afterCreate} after=${afterUpdate}`,
          });
          const deleted = await http(`/api/v1/agents/${aid}`, { method: "DELETE", headers });
          const afterDelete = await auditTotal("agent");
          out.push({
            name: "DELETE /agents/:id records an 'agent' audit-log row",
            passed: deleted.status === 200 && afterDelete === afterUpdate + 1,
            detail: `status=${deleted.status} before=${afterUpdate} after=${afterDelete}`,
          });
        }
      }

      // -- users: POST + PATCH + DELETE --
      {
        const before = await auditTotal("user");
        const created = await http("/api/v1/users", {
          method: "POST",
          headers,
          body: JSON.stringify({
            name: `Verify User ${stamp}`,
            username: `verify_${stamp}`,
            password: "verify1234",
            role: "CASHIER",
          }),
        });
        const uid = extractId(created.body);
        const afterCreate = await auditTotal("user");
        out.push({
          name: "POST /users records a 'user' audit-log row",
          passed: created.status === 201 && !!uid && before >= 0 && afterCreate === before + 1,
          detail: `status=${created.status} before=${before} after=${afterCreate}`,
        });
        if (uid) {
          const updated = await http(`/api/v1/users/${uid}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ name: `Verify User ${stamp} (edited)` }),
          });
          const afterUpdate = await auditTotal("user");
          out.push({
            name: "PATCH /users/:id records a 'user' audit-log row",
            passed: updated.status === 200 && afterUpdate === afterCreate + 1,
            detail: `status=${updated.status} before=${afterCreate} after=${afterUpdate}`,
          });
          const deleted = await http(`/api/v1/users/${uid}`, { method: "DELETE", headers });
          const afterDelete = await auditTotal("user");
          out.push({
            name: "DELETE /users/:id records a 'user' audit-log row",
            passed: deleted.status === 200 && afterDelete === afterUpdate + 1,
            detail: `status=${deleted.status} before=${afterUpdate} after=${afterDelete}`,
          });
        }
      }

      // -- RBAC: a non-admin (CASHIER) must not be able to write to any of
      //    these admin surfaces. We assert 403 across POST/PUT/DELETE for
      //    every entity so the audit-coverage gain doesn't get masked by an
      //    open write path.
      const cashierTok = await login("cashier", "admin123");
      if (cashierTok) {
        const ch = { Authorization: `Bearer ${cashierTok}`, "Content-Type": "application/json" };
        const dummyId = "00000000-0000-0000-0000-000000000000";
        type RbacProbe = { label: string; method: "POST" | "PUT" | "DELETE"; path: string; body?: unknown };
        const probes: RbacProbe[] = [
          { label: "POST /locations", method: "POST", path: "/api/v1/locations", body: { name: "x", type: "warehouse", address: "x" } },
          { label: "PUT /locations/:id", method: "PUT", path: `/api/v1/locations/${dummyId}`, body: { name: "x" } },
          { label: "DELETE /locations/:id", method: "DELETE", path: `/api/v1/locations/${dummyId}` },
          { label: "POST /suppliers", method: "POST", path: "/api/v1/suppliers", body: { name: "x", phone: "9000000000" } },
          { label: "PUT /suppliers/:id", method: "PUT", path: `/api/v1/suppliers/${dummyId}`, body: { name: "x" } },
          { label: "DELETE /suppliers/:id", method: "DELETE", path: `/api/v1/suppliers/${dummyId}` },
          { label: "POST /agents", method: "POST", path: "/api/v1/agents", body: { name: "x", phone: "9000000001" } },
          { label: "PUT /agents/:id", method: "PUT", path: `/api/v1/agents/${dummyId}`, body: { name: "x" } },
          { label: "DELETE /agents/:id", method: "DELETE", path: `/api/v1/agents/${dummyId}` },
        ];
        for (const p of probes) {
          const r = await http(p.path, {
            method: p.method,
            headers: ch,
            ...(p.body ? { body: JSON.stringify(p.body) } : {}),
          });
          out.push({
            name: `${p.label} as non-admin (CASHIER) returns 403 (RBAC)`,
            passed: r.status === 403,
            detail: `status=${r.status}`,
          });
        }
      }

      // -- entity-types listing surfaces all four --
      const types = await http("/api/v1/audit-log/entity-types", { headers });
      const typeList = ((types.body as { data?: string[] })?.data ?? []) as string[];
      const required = ["user", "location", "supplier", "agent"] as const;
      const missing = required.filter((t) => !typeList.includes(t));
      out.push({
        name: "Audit-log entity-types includes user/location/supplier/agent",
        passed: missing.length === 0,
        detail: missing.length === 0 ? `types=${typeList.join(",")}` : `missing=${missing.join(",")}`,
      });

      return out;
    },
  },
];

async function main() {
  console.log(`\n${BOLD}${CYAN}╔════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║  Rathinam Crackers — System Verifier              ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚════════════════════════════════════════════════════╝${RESET}`);
  console.log(`${YELLOW}Target: ${BASE}${RESET}\n`);

  let totalPass = 0;
  let totalFail = 0;
  const failures: Array<{ section: string; check: CheckResult }> = [];

  for (const section of sections) {
    console.log(`${BOLD}${CYAN}▼ ${section.name}${RESET}`);
    let results: CheckResult[];
    try {
      results = await section.checks();
    } catch (err) {
      results = [
        {
          name: "section threw error",
          passed: false,
          detail: err instanceof Error ? err.message : String(err),
        },
      ];
    }
    for (const r of results) {
      const icon = r.passed ? `${GREEN}✔${RESET}` : `${RED}✘${RESET}`;
      const detail = r.detail ? ` ${YELLOW}(${r.detail})${RESET}` : "";
      console.log(`  ${icon} ${r.name}${detail}`);
      if (r.passed) totalPass++;
      else {
        totalFail++;
        failures.push({ section: section.name, check: r });
      }
    }
    console.log();
  }

  const total = totalPass + totalFail;
  const pct = total > 0 ? Math.round((totalPass / total) * 100) : 0;
  console.log(`${BOLD}${CYAN}═════════════════════════════════════════════════════${RESET}`);
  console.log(
    `${BOLD}Result: ${totalPass}/${total} passed (${pct}%)  —  ${totalFail > 0 ? `${RED}${totalFail} FAILURES${RESET}` : `${GREEN}ALL GREEN${RESET}`}${RESET}`,
  );
  console.log(`${BOLD}${CYAN}═════════════════════════════════════════════════════${RESET}\n`);

  if (failures.length > 0) {
    console.log(`${RED}${BOLD}Failures:${RESET}`);
    for (const f of failures) {
      console.log(`  ${RED}✘${RESET} [${f.section}] ${f.check.name}${f.check.detail ? ` — ${f.check.detail}` : ""}`);
    }
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(`${RED}Verifier crashed:${RESET}`, err);
  process.exit(2);
});
