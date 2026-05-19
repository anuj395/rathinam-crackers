import { Router } from "express";
import crypto from "node:crypto";
import {
  db,
  invoicesTable,
  productsTable,
  stockLevelsTable,
  heldBillsTable,
  posShiftsTable,
  settingsTable,
  customersTable,
  loyaltyLedgerTable,
  usersTable,
  idempotencyKeysTable,
  type HeldBillItemsPayload,
} from "@workspace/db";
import { eq, and, sql, inArray, desc, isNull } from "drizzle-orm";
import { authenticate, requireRole } from "../../middleware/authenticate.js";
import { POS_ROLES } from "../../lib/auth-roles.js";
import { nextInvoiceNo } from "../../lib/counter.js";
import { resolvePrice } from "../../lib/pricing.js";
import { appendLedger } from "../../lib/stockService.js";
import { getTaxConfig, computeTax } from "../../lib/tax.js";
import { sendEmail, sendWhatsapp } from "../../lib/notifier.js";

// Module-level: read once at process start so a runtime request can never
// flip this on. Production deployments do not set E2E_TEST_HOOKS, so the
// rollback test hook below is permanently inert in production.
const E2E_TEST_HOOKS = process.env["E2E_TEST_HOOKS"] === "1";
import type { AuthRequest } from "../../middleware/authenticate.js";

const router = Router();

// -------- helpers --------

type Tender = { mode: "CASH" | "UPI" | "CARD" | "CREDIT"; amount: number; reference?: string };

const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);

async function findOpenShift(userId: string, locationId?: string) {
  const conds = [eq(posShiftsTable.userId, userId), eq(posShiftsTable.status, "open")];
  if (locationId) conds.push(eq(posShiftsTable.locationId, locationId));
  const rows = await db
    .select()
    .from(posShiftsTable)
    .where(and(...conds))
    .orderBy(desc(posShiftsTable.openedAt))
    .limit(1);
  return rows[0] ?? null;
}

/** Compute live totals from invoices linked to a shift. Splits SPLIT-mode invoices by their stored tender breakdown. */
async function computeShiftTotals(shiftId: string) {
  const rows = await db.select().from(invoicesTable).where(eq(invoicesTable.shiftId, shiftId));
  let totalSales = 0,
    cashSales = 0,
    upiSales = 0,
    cardSales = 0,
    creditSales = 0;
  for (const inv of rows) {
    const t = num(inv.total);
    totalSales += t;
    const logistics = (inv.logisticsDetails ?? null) as { tenders?: Tender[] } | null;
    const tenders = logistics?.tenders;
    if (Array.isArray(tenders) && tenders.length > 0) {
      for (const tn of tenders) {
        const a = num(tn.amount);
        if (tn.mode === "CASH") cashSales += a;
        else if (tn.mode === "UPI") upiSales += a;
        else if (tn.mode === "CARD") cardSales += a;
        else if (tn.mode === "CREDIT") creditSales += a;
      }
    } else {
      // legacy single-tender invoices
      switch (inv.paymentMode) {
        case "CASH":
          cashSales += t;
          break;
        case "UPI":
          upiSales += t;
          break;
        case "CARD":
          cardSales += t;
          break;
        case "CREDIT":
          creditSales += t;
          break;
        default:
          // SPLIT with no tender array — bucket as cash to avoid silent drop
          cashSales += t;
      }
    }
  }
  return { txnCount: rows.length, totalSales, cashSales, upiSales, cardSales, creditSales };
}

// -------- products --------

router.get("/pos/products", authenticate, async (req, res) => {
  const { locationId } = req.query as Record<string, string>;
  const products = await db.select().from(productsTable).where(eq(productsTable.status, "Active")).limit(500);

  const enriched = await Promise.all(
    products.map(async (product) => {
      const variants = (product.variants ?? []) as any[];
      const enrichedVariants = await Promise.all(
        variants.map(async (v: any) => {
          let stock = 0;
          if (locationId) {
            const stockRows = await db
              .select()
              .from(stockLevelsTable)
              .where(
                and(
                  eq(stockLevelsTable.productId, product.id),
                  eq(stockLevelsTable.variantId, v.variantId),
                  eq(stockLevelsTable.locationId, locationId),
                ),
              )
              .limit(1);
            stock = stockRows[0]?.currentQty ?? 0;
          }
          return { variantId: v.variantId, size: v.size, price: v.prices?.retailEst ?? 0, stock };
        }),
      );
      return {
        id: product.id,
        code: product.code,
        name: product.name,
        category: product.category,
        imageUrl: product.imageUrl,
        variants: enrichedVariants,
      };
    }),
  );

  res.json({ success: true, data: enriched });
});

// -------- shifts --------

const OPENING_CASH_MAX = 1_000_000;

router.post("/pos/shift-open", authenticate, requireRole(...POS_ROLES), async (req: AuthRequest, res) => {
  const { locationId, openingCash, notes } = req.body as {
    locationId: string;
    openingCash: number;
    notes?: string;
  };
  if (!req.user?.id) {
    res.status(401).json({ success: false, error: { code: "UNAUTHENTICATED", message: "Login required" } });
    return;
  }
  if (!locationId || typeof openingCash !== "number" || Number.isNaN(openingCash) || openingCash < 0) {
    res
      .status(400)
      .json({ success: false, error: { code: "VALIDATION", message: "locationId and non-negative openingCash required" } });
    return;
  }
  if (openingCash > OPENING_CASH_MAX) {
    res.status(400).json({
      success: false,
      error: { code: "VALIDATION", message: `Opening cash must not exceed ₹${OPENING_CASH_MAX.toLocaleString("en-IN")}` },
    });
    return;
  }

  // Cashiers may only open shifts at locations they're assigned to.
  // Privileged roles (admin/manager) can open at any location, e.g. for floor support.
  const role = req.user.role ?? "";
  const isPrivileged =
    role === "SUPER_ADMIN" || role === "ADMIN" || role === "ERP_MANAGER" || role === "MANAGER";
  if (!isPrivileged) {
    const userRow = (
      await db.select({ locationIds: usersTable.locationIds }).from(usersTable).where(eq(usersTable.id, req.user.id)).limit(1)
    )[0];
    const allowed = (userRow?.locationIds ?? []) as string[];
    if (!allowed.includes(locationId)) {
      res.status(403).json({
        success: false,
        error: { code: "LOCATION_NOT_ALLOWED", message: "You are not assigned to this location. Ask an admin to grant access." },
      });
      return;
    }
  }

  // Conflict-check + insert in a transaction. The DB also has a partial
  // unique index `one_open_shift_per_user` on (user_id) WHERE closed_at IS
  // NULL, so two simultaneous opens can't both succeed even if they pass
  // the application-level check (TOCTOU). We catch the 23505 violation
  // below and turn it into a clean 409.
  type ShiftRow = typeof posShiftsTable.$inferSelect;
  type ConflictResult = { kind: "elsewhere" | "here"; shift: ShiftRow };
  type OpenResult = { kind: "opened"; shift: ShiftRow };
  let result: ConflictResult | OpenResult;
  try {
    result = await db.transaction(async (tx): Promise<ConflictResult | OpenResult> => {
      const anyOpenRows = await tx
        .select()
        .from(posShiftsTable)
        .where(and(eq(posShiftsTable.userId, req.user!.id), isNull(posShiftsTable.closedAt)))
        .limit(1);
      const anyOpenRow = anyOpenRows[0];
      if (anyOpenRow) {
        return { kind: anyOpenRow.locationId === locationId ? "here" : "elsewhere", shift: anyOpenRow };
      }
      const [created] = await tx
        .insert(posShiftsTable)
        .values({
          locationId,
          userId: req.user!.id,
          openingCash: String(openingCash),
          notes: notes ?? null,
        })
        .returning();
      return { kind: "opened", shift: created };
    });
  } catch (err: unknown) {
    // Postgres unique-violation. Race lost — re-read the now-existing open
    // shift and return it as a 409 just like the app-level conflict path.
    const code = (err as { code?: string })?.code;
    if (code === "23505") {
      const existing = await findOpenShift(req.user.id);
      if (existing) {
        const running = await computeShiftTotals(existing.id);
        const conflictCode = existing.locationId === locationId ? "SHIFT_ALREADY_OPEN" : "SHIFT_ALREADY_OPEN_ELSEWHERE";
        const message = existing.locationId === locationId
          ? "A shift is already open here."
          : "You already have an open shift at another location. Close it before opening a new one.";
        res.status(409).json({
          success: false,
          error: { code: conflictCode, message },
          data: {
            ...existing,
            openingCash: num(existing.openingCash),
            running: { ...running, expectedCash: num(existing.openingCash) + running.cashSales },
          },
        });
        return;
      }
    }
    throw err;
  }
  if (result.kind !== "opened") {
    const running = await computeShiftTotals(result.shift.id);
    const code = result.kind === "elsewhere" ? "SHIFT_ALREADY_OPEN_ELSEWHERE" : "SHIFT_ALREADY_OPEN";
    const message = result.kind === "elsewhere"
      ? "You already have an open shift at another location. Close it before opening a new one."
      : "A shift is already open here.";
    res.status(409).json({
      success: false,
      error: { code, message },
      data: {
        ...result.shift,
        openingCash: num(result.shift.openingCash),
        running: { ...running, expectedCash: num(result.shift.openingCash) + running.cashSales },
      },
    });
    return;
  }
  const shift = result.shift;
  res.json({
    success: true,
    data: {
      ...shift,
      openingCash: num(shift.openingCash),
      running: { txnCount: 0, totalSales: 0, cashSales: 0, upiSales: 0, cardSales: 0, creditSales: 0, expectedCash: openingCash },
    },
  });
});

router.get("/pos/shift-current", authenticate, async (req: AuthRequest, res) => {
  if (!req.user?.id) {
    res.json({ success: true, data: null });
    return;
  }
  const { locationId } = req.query as Record<string, string>;
  const shift = await findOpenShift(req.user.id, locationId);
  if (!shift) {
    res.json({ success: true, data: null });
    return;
  }
  const running = await computeShiftTotals(shift.id);
  res.json({
    success: true,
    data: {
      ...shift,
      openingCash: num(shift.openingCash),
      running: { ...running, expectedCash: num(shift.openingCash) + running.cashSales },
    },
  });
});

router.post("/pos/shift-close", authenticate, requireRole(...POS_ROLES), async (req: AuthRequest, res) => {
  const { shiftId, closingCash, notes } = req.body as {
    shiftId?: string;
    closingCash: number;
    notes?: string;
  };
  if (!req.user?.id) {
    res.status(401).json({ success: false, error: { code: "UNAUTHENTICATED", message: "Login required" } });
    return;
  }

  // Resolve target shift: explicit id, else the user's currently open one.
  let shift = shiftId
    ? (await db.select().from(posShiftsTable).where(eq(posShiftsTable.id, shiftId)).limit(1))[0] ?? null
    : await findOpenShift(req.user.id);
  if (!shift) {
    res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "No open shift found" } });
    return;
  }
  // Cashiers may only close their own shift. Managers/admins can close any.
  const role = req.user.role ?? "";
  const isPrivileged = role === "SUPER_ADMIN" || role === "ADMIN" || role === "ERP_MANAGER" || role === "MANAGER";
  if (shift.userId !== req.user.id && !isPrivileged) {
    res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Cannot close another cashier's shift" } });
    return;
  }
  if (shift.status === "closed") {
    res.status(409).json({ success: false, error: { code: "ALREADY_CLOSED", message: "Shift already closed" } });
    return;
  }

  const running = await computeShiftTotals(shift.id);
  const opening = num(shift.openingCash);
  const expectedCash = opening + running.cashSales;
  const counted = num(closingCash);
  const overShort = counted - expectedCash;

  const closedAt = new Date();
  await db
    .update(posShiftsTable)
    .set({
      status: "closed",
      closedAt,
      closingCash: counted.toFixed(2),
      totalSales: running.totalSales.toFixed(2),
      cashSales: running.cashSales.toFixed(2),
      upiSales: running.upiSales.toFixed(2),
      cardSales: running.cardSales.toFixed(2),
      creditSales: running.creditSales.toFixed(2),
      notes: notes ?? shift.notes,
    })
    .where(eq(posShiftsTable.id, shift.id));

  res.json({
    success: true,
    data: {
      shiftId: shift.id,
      openedAt: shift.openedAt?.toISOString(),
      closedAt: closedAt.toISOString(),
      txnCount: running.txnCount,
      totalSales: running.totalSales,
      cashSales: running.cashSales,
      upiSales: running.upiSales,
      cardSales: running.cardSales,
      creditSales: running.creditSales,
      openingCash: opening,
      expectedCash,
      closingCash: counted,
      overShort,
      notes: notes ?? shift.notes ?? "",
    },
  });
});

// -------- sale --------

// Server-side idempotency for /pos/sale.
//
// The cashier UI may retry the same sale on a flaky network — without this
// check the customer would be billed twice. The contract:
//   * Client sends header `X-Idempotency-Key: <uuid>` (≤ 128 chars).
//   * Same key + same body, sale already finished → replay cached response
//     with header `X-Idempotent-Replay: true`.
//   * Same key + different body → 409 IDEMPOTENCY_KEY_REUSED.
//   * Same key + same body, sale still running on another worker → 409
//     IDEMPOTENCY_IN_PROGRESS so the client retries shortly.
//   * 24h retention; cron prunes via deploy/scripts/idempotency-cleanup.sh.
//
// Race-safe: we INSERT the row BEFORE running the sale (with response=null
// meaning "in flight") and rely on the primary-key conflict to atomically
// elect a single winner across concurrent requests / cluster workers. The
// key is prefixed with the scope so the same UUID can't collide between e.g.
// pos.sale and pos.return.
type IdemClaim =
  | { kind: "none" }
  | { kind: "replay"; status: number; body: unknown }
  | { kind: "conflict"; code: "IDEMPOTENCY_KEY_REUSED" | "IDEMPOTENCY_IN_PROGRESS"; message: string }
  | { kind: "fresh"; storedKey: string; hash: string };

async function claimIdempotency(
  scope: string,
  userId: string | undefined,
  rawKey: unknown,
  body: unknown,
): Promise<IdemClaim> {
  if (rawKey == null || rawKey === "") return { kind: "none" };
  const storedKey = `${scope}:${String(rawKey).slice(0, 96)}`;
  const hash = crypto.createHash("sha256").update(JSON.stringify(body ?? null)).digest("hex");

  // Atomic claim. RETURNING returns the inserted row only if we won; on
  // conflict it returns nothing and we fall through to inspect the existing
  // row (replay vs conflict vs in-flight).
  const inserted = await db
    .insert(idempotencyKeysTable)
    .values({
      key: storedKey,
      scope,
      userId: userId ?? null,
      requestHash: hash,
      response: null,
      statusCode: null,
    })
    .onConflictDoNothing({ target: idempotencyKeysTable.key })
    .returning({ key: idempotencyKeysTable.key });
  if (inserted.length > 0) return { kind: "fresh", storedKey, hash };

  const existing = (
    await db.select().from(idempotencyKeysTable).where(eq(idempotencyKeysTable.key, storedKey)).limit(1)
  )[0];
  if (!existing) {
    // Row vanished between insert-conflict and select (cleanup race). Treat
    // as a fresh claim by retrying once.
    return claimIdempotency(scope, userId, rawKey, body);
  }
  if ((existing.userId ?? null) !== (userId ?? null) || existing.requestHash !== hash) {
    return {
      kind: "conflict",
      code: "IDEMPOTENCY_KEY_REUSED",
      message: "This X-Idempotency-Key was already used with a different request.",
    };
  }
  if (existing.response == null) {
    return {
      kind: "conflict",
      code: "IDEMPOTENCY_IN_PROGRESS",
      message: "An earlier request with this X-Idempotency-Key is still being processed. Retry in a moment.",
    };
  }
  return { kind: "replay", status: Number(existing.statusCode) || 200, body: existing.response };
}

async function commitIdempotency(storedKey: string, status: number, body: unknown): Promise<void> {
  await db
    .update(idempotencyKeysTable)
    .set({ statusCode: String(status), response: body as never })
    .where(eq(idempotencyKeysTable.key, storedKey));
}

async function releaseIdempotency(storedKey: string): Promise<void> {
  // Sale failed before commit — drop the placeholder so the client can retry
  // with the same key.
  await db.delete(idempotencyKeysTable).where(eq(idempotencyKeysTable.key, storedKey));
}

router.post("/pos/sale", authenticate, requireRole(...POS_ROLES), async (req: AuthRequest, res) => {
  const idempotencyHeader = req.header("X-Idempotency-Key") ?? req.header("x-idempotency-key");
  const idem = await claimIdempotency("pos.sale", req.user?.id, idempotencyHeader, req.body);
  if (idem.kind === "conflict") {
    res.status(409).json({ success: false, error: { code: idem.code, message: idem.message } });
    return;
  }
  if (idem.kind === "replay") {
    res.setHeader("X-Idempotent-Replay", "true");
    res.status(idem.status).json(idem.body);
    return;
  }

  // From here on, if the sale fails we MUST release the claim so the client
  // can retry with the same key. We wrap the whole handler body in try/catch.
  try {
    return await runSale();
  } catch (err) {
    if (idem.kind === "fresh") {
      await releaseIdempotency(idem.storedKey).catch(() => {});
    }
    throw err;
  }

  async function runSale() {
  const {
    customerId,
    locationId,
    paymentMode,
    tenders: tendersInput,
    cashReceived,
    orderDiscount,
    discountReason,
    items,
    couponCode,
    shiftId: explicitShiftId,
    shippingAddress: shippingAddressInput,
    billingAddress: billingAddressInput,
  } = req.body as {
    customerId?: string;
    locationId: string;
    paymentMode?: string;
    tenders?: Tender[];
    cashReceived?: number;
    orderDiscount?: number;
    discountReason?: string;
    items: Array<{ productId: string; variantId: string; qty: number }>;
    couponCode?: string;
    shiftId?: string;
    shippingAddress?: unknown;
    billingAddress?: unknown;
  };

  // Inline-address sanitizer for delivery POS sales.
  const sanitizeAddress = (a: unknown) => {
    if (!a || typeof a !== "object") return null;
    const o = a as Record<string, unknown>;
    const required = ["name", "phone", "line1", "city", "state", "pincode"];
    if (!required.every((k) => typeof o[k] === "string" && (o[k] as string).trim() !== "")) return null;
    return {
      name: String(o["name"]), phone: String(o["phone"]), line1: String(o["line1"]),
      line2: o["line2"] == null ? null : String(o["line2"]),
      city: String(o["city"]), state: String(o["state"]), pincode: String(o["pincode"]),
      landmark: o["landmark"] == null ? null : String(o["landmark"]),
    };
  };
  const shipAddr = sanitizeAddress(shippingAddressInput);
  const billAddr = sanitizeAddress(billingAddressInput) ?? shipAddr;

  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ success: false, error: { code: "VALIDATION", message: "Cart is empty" } });
    return;
  }

  // Reject any non-positive or non-finite quantities. Without this a malicious
  // client could send qty=-1 to "refund" stock and reduce the bill.
  for (const it of items) {
    if (!it || typeof it.qty !== "number" || !Number.isFinite(it.qty) || it.qty <= 0) {
      res.status(400).json({
        success: false,
        error: { code: "VALIDATION", message: "Each item must have a positive quantity" },
      });
      return;
    }
  }

  const settingsRows = await db.select().from(settingsTable).where(eq(settingsTable.key, "pricing")).limit(1);
  const pricingSettings = (settingsRows[0]?.value ?? {}) as any;
  const threshold = Number(pricingSettings.wholesaleQtyThreshold ?? 10);
  const taxConfig = await getTaxConfig();

  // Resolve lines with the same pricing engine the rest of the system uses.
  const resolvedItems: any[] = [];
  const taxLines: { amount: number; product: { gstRate?: number | null; hsnCode?: string | null } }[] = [];
  for (const item of items) {
    const pRows = await db.select().from(productsTable).where(eq(productsTable.id, item.productId)).limit(1);
    const product = pRows[0];
    if (!product) continue;
    const variants = (product.variants ?? []) as any[];
    const variant = variants.find((v: any) => v.variantId === item.variantId);
    if (!variant) continue;
    const priceResult = resolvePrice(variant, item.qty, "POS", threshold);
    const lineAmount = priceResult.resolvedPrice * item.qty;
    resolvedItems.push({
      productId: item.productId,
      productName: product.name,
      variantId: item.variantId,
      variantSize: variant.size ?? "",
      qty: item.qty,
      resolvedPrice: priceResult.resolvedPrice,
      resolutionReason: priceResult.resolutionReason,
      bulkRateApplied: priceResult.bulkRateApplied,
      amount: lineAmount,
      hsnCode: product.hsnCode ?? null,
      gstRate: product.gstRate ?? null,
    });
    taxLines.push({ amount: lineAmount, product: { gstRate: product.gstRate, hsnCode: product.hsnCode } });
  }

  const subtotal = resolvedItems.reduce((s, i) => s + i.amount, 0);

  // Cap discount by user role. Without this a cashier could ring up a 99%
  // discount via the API and bypass the UI's manual-discount field.
  const role = (req.user?.role ?? "CASHIER").toUpperCase();
  const discountCapPct = (() => {
    if (role === "SUPER_ADMIN" || role === "ADMIN") return 100;
    if (role === "ERP_MANAGER" || role === "MANAGER") return Number(pricingSettings.maxManagerDiscountPct ?? 50);
    return Number(pricingSettings.maxCashierDiscountPct ?? 10);
  })();
  const maxAllowedDiscount = subtotal * (discountCapPct / 100);
  const requestedDiscount = Math.max(0, num(orderDiscount));
  if (requestedDiscount > maxAllowedDiscount + 0.01) {
    res.status(403).json({
      success: false,
      error: {
        code: "DISCOUNT_LIMIT",
        message: `Your role (${role}) can apply at most ${discountCapPct}% discount (₹${maxAllowedDiscount.toFixed(2)} on this bill)`,
      },
    });
    return;
  }
  const manualDiscount = Math.min(requestedDiscount, maxAllowedDiscount);
  // Per-line GST: each item uses its product override → HSN slab → default rate.
  const tx = computeTax(taxLines, manualDiscount, taxConfig, false);
  const taxable = tx.taxable;
  const cgst = tx.cgst;
  const sgst = tx.sgst;
  const total = tx.total;

  // Tender validation. Strict: known modes only, non-negative finite amounts.
  const ALLOWED_MODES = new Set(["CASH", "UPI", "CARD", "CREDIT"]);
  const rawTenders: Tender[] = Array.isArray(tendersInput) && tendersInput.length > 0
    ? tendersInput.map((t) => ({ mode: t.mode, amount: Number(t.amount), reference: t.reference }))
    : paymentMode && ALLOWED_MODES.has(paymentMode)
      ? [{ mode: paymentMode as Tender["mode"], amount: total }]
      : [{ mode: "CASH", amount: total }];

  for (const t of rawTenders) {
    if (!ALLOWED_MODES.has(t.mode)) {
      res.status(400).json({ success: false, error: { code: "VALIDATION", message: `Invalid tender mode: ${t.mode}` } });
      return;
    }
    if (!Number.isFinite(t.amount) || t.amount < 0) {
      res.status(400).json({ success: false, error: { code: "VALIDATION", message: "Tender amount must be a non-negative number" } });
      return;
    }
  }

  const tenderSum = rawTenders.reduce((s, t) => s + t.amount, 0);
  // Strict: tender must equal bill total to within 1 paisa. We never
  // collect more than the actual invoice value.
  if (Math.abs(tenderSum - total) > 0.01) {
    res.status(400).json({
      success: false,
      error: {
        code: "TENDER_MISMATCH",
        message: `Tender total ₹${tenderSum.toFixed(2)} does not match bill total ₹${total.toFixed(2)}`,
      },
    });
    return;
  }

  const nonZero = rawTenders.filter((t) => t.amount > 0);
  const finalPaymentMode: "CASH" | "UPI" | "CARD" | "CREDIT" | "SPLIT" =
    nonZero.length > 1 ? "SPLIT" : (nonZero[0]?.mode ?? "CASH");

  // Resolve target shift with ownership + state checks. Reject forged or foreign shift ids.
  let shiftId: string | null = null;
  if (explicitShiftId) {
    const rows = await db.select().from(posShiftsTable).where(eq(posShiftsTable.id, explicitShiftId)).limit(1);
    const target = rows[0];
    if (!target) {
      res.status(404).json({ success: false, error: { code: "SHIFT_NOT_FOUND", message: "Shift not found" } });
      return;
    }
    if (target.userId !== req.user?.id) {
      res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Shift does not belong to this cashier" } });
      return;
    }
    if (target.locationId !== locationId) {
      res.status(400).json({ success: false, error: { code: "SHIFT_LOCATION_MISMATCH", message: "Shift location does not match sale location" } });
      return;
    }
    if (target.status !== "open") {
      res.status(409).json({ success: false, error: { code: "SHIFT_CLOSED", message: "Shift is already closed" } });
      return;
    }
    shiftId = target.id;
  } else if (req.user?.id) {
    const open = await findOpenShift(req.user.id, locationId);
    shiftId = open?.id ?? null;
  }

  const fy = new Date().getFullYear();
  const invoiceNo = await nextInvoiceNo();

  const status: "paid" | "credit" =
    finalPaymentMode === "CREDIT" || nonZero.some((t) => t.mode === "CREDIT") ? "credit" : "paid";

  // Wrap stock-ledger writes and the invoice insert in a single DB transaction
  // so a failure on the parent insert rolls back the ledger rows and stock
  // levels — no orphan ledger entries, no silent stock drift.
  // Test-only rollback hook. Gated on a server-side, non-user-controllable
  // env flag (E2E_TEST_HOOKS=1) read once at module load — production never
  // sets this, so the body flag is completely inert in real deployments.
  const forceFail =
    E2E_TEST_HOOKS &&
    (req.body as { __forceFailAfterLedger?: boolean })?.__forceFailAfterLedger === true;

  const invoice = await db.transaction(async (tx) => {
    for (const item of resolvedItems) {
      await appendLedger(
        {
          productId: item.productId,
          variantId: item.variantId,
          locationId,
          type: "OUT",
          qty: -item.qty,
          refType: "POS",
          createdBy: req.user?.id,
        },
        tx,
      );
    }
    if (forceFail) {
      throw new Error("__test_force_fail_after_ledger");
    }
    const [inv] = await tx
      .insert(invoicesTable)
      .values({
        id: crypto.randomUUID(),
        invoiceNo,
        customerId,
        items: resolvedItems,
        subtotal: subtotal.toFixed(2),
        discountAmount: manualDiscount.toFixed(2),
        couponCode,
        couponDiscount: "0",
        taxableAmount: taxable.toFixed(2),
        cgst: cgst.toFixed(2),
        sgst: sgst.toFixed(2),
        igst: "0",
        total: total.toFixed(2),
        paymentMode: finalPaymentMode,
        channel: "POS",
        financialYear: `${fy}-${fy + 1}`,
        status,
        locationId,
        shiftId: shiftId ?? undefined,
        logisticsDetails: {
          tenders: nonZero,
          cashReceived: num(cashReceived),
          change: Math.max(0, num(cashReceived) - (nonZero.find((t) => t.mode === "CASH")?.amount ?? 0)),
          discountReason: discountReason ?? null,
          ...(shipAddr ? { shippingAddress: shipAddr, address: shipAddr } : {}),
          ...(billAddr ? { billingAddress: billAddr } : {}),
          ...(shipAddr && billAddr ? { sameAsShipping: JSON.stringify(shipAddr) === JSON.stringify(billAddr) } : {}),
        } as any,
        createdBy: req.user?.id,
      })
      .returning();
    return inv;
  });

  // Loyalty earn (paid sales only).
  let loyaltyEarned = 0;
  if (customerId && status === "paid") {
    const loyaltyRate = Number(pricingSettings.loyaltyEarnRate ?? 1);
    loyaltyEarned = Math.floor((total * loyaltyRate) / 100);
    if (loyaltyEarned > 0) {
      await db
        .update(customersTable)
        .set({ loyaltyPoints: sql`${customersTable.loyaltyPoints} + ${loyaltyEarned}`, updatedAt: new Date() })
        .where(eq(customersTable.id, customerId));
      await db.insert(loyaltyLedgerTable).values({
        id: crypto.randomUUID(),
        customerId,
        type: "EARN",
        points: loyaltyEarned.toString(),
        referenceId: invoice!.id,
        notes: `Earned on POS ${invoiceNo}`,
      });
    }
  }

  const responseBody = { success: true, data: { invoice, loyaltyEarned } };
  if (idem.kind === "fresh") {
    await commitIdempotency(idem.storedKey, 200, responseBody);
  }

  // Fire-and-forget receipt notification. Wrapped in a try-and-swallow so a
  // notifier outage NEVER blocks a sale — the till must always confirm fast.
  // Only fires when (a) sale is paid, (b) we have a customer with contact
  // details, (c) operator has actually configured + enabled SMTP/WhatsApp.
  if (customerId && status === "paid") {
    void (async () => {
      try {
        const cust = (await db.select().from(customersTable).where(eq(customersTable.id, customerId)).limit(1))[0];
        if (!cust) return;
        const subject = `Receipt for ${invoiceNo} — ₹${total.toFixed(2)}`;
        const body =
          `Hi ${cust.name},\n\nThank you for your purchase!\n\n` +
          `Invoice: ${invoiceNo}\nAmount: ₹${total.toFixed(2)}\n` +
          (loyaltyEarned > 0 ? `Loyalty points earned: ${loyaltyEarned}\n` : "") +
          `\n— Rathinam Crackers`;
        const tasks: Promise<unknown>[] = [];
        if (cust.email) {
          tasks.push(sendEmail({
            eventType: "pos.sale.receipt",
            to: cust.email,
            subject,
            text: body,
            recipientId: cust.id,
            recipientType: "customer",
          }));
        }
        if (cust.phone) {
          const phone = cust.phone.startsWith("+") ? cust.phone : `+91${cust.phone}`;
          tasks.push(sendWhatsapp({
            eventType: "pos.sale.receipt",
            to: phone,
            body,
            recipientId: cust.id,
            recipientType: "customer",
          }));
        }
        await Promise.allSettled(tasks);
      } catch (err) {
        req.log?.warn({ err, invoiceNo }, "pos receipt notification failed");
      }
    })();
  }

  res.json(responseBody);
  } // end runSale
});

// -------- recent (for reprint) --------

router.get("/pos/recent", authenticate, async (req, res) => {
  const { locationId, limit } = req.query as Record<string, string>;
  const lim = Math.min(50, Math.max(1, Number(limit) || 10));
  const conds = [eq(invoicesTable.channel, "POS" as any)];
  if (locationId) conds.push(eq(invoicesTable.locationId, locationId));
  const rows = await db
    .select()
    .from(invoicesTable)
    .where(and(...conds))
    .orderBy(desc(invoicesTable.createdAt))
    .limit(lim);

  const customerIds = Array.from(new Set(rows.map((r) => r.customerId).filter((id): id is string => !!id)));
  const customerRows = customerIds.length
    ? await db.select().from(customersTable).where(inArray(customersTable.id, customerIds))
    : [];
  const nameById = new Map(customerRows.map((c) => [c.id, c.name]));

  res.json({
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      invoiceNo: r.invoiceNo,
      total: num(r.total),
      paymentMode: r.paymentMode,
      customerName: r.customerId ? nameById.get(r.customerId) ?? null : null,
      createdAt: r.createdAt?.toISOString(),
      itemCount: Array.isArray(r.items) ? (r.items as any[]).length : 0,
    })),
  });
});

// -------- return --------

router.post("/pos/return", authenticate, async (req: AuthRequest, res) => {
  const { invoiceId, items, reason } = req.body as {
    invoiceId: string;
    items: Array<{ productId: string; variantId: string; qty: number }>;
    reason: string;
  };
  const invRows = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId)).limit(1);
  if (!invRows[0]) {
    res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Invoice not found" } });
    return;
  }
  const inv = invRows[0];

  // Compute credit amount from the original invoice line prices.
  const origItems = (inv.items ?? []) as any[];
  let creditAmount = 0;
  for (const item of items) {
    const orig = origItems.find((o) => o.productId === item.productId && o.variantId === item.variantId);
    const unit = orig ? num(orig.resolvedPrice ?? orig.unitPrice) : 0;
    creditAmount += unit * item.qty;
    await appendLedger({
      productId: item.productId,
      variantId: item.variantId,
      locationId: inv.locationId ?? "",
      type: "IN",
      qty: item.qty,
      refType: "RETURN",
      refId: invoiceId,
      notes: reason,
      createdBy: req.user?.id,
    });
  }

  const returnId = crypto.randomUUID();
  res.json({ success: true, data: { returnId, creditAmount } });
});

// -------- hold / resume --------

router.post("/pos/hold", authenticate, async (req: AuthRequest, res) => {
  const { locationId, customerId, items, label, coupon } = req.body as {
    locationId: string;
    customerId?: string;
    items: unknown[];
    label?: string;
    coupon?: unknown;
  };
  const payload: HeldBillItemsPayload = coupon ? { lines: items, coupon } : items;
  await db.insert(heldBillsTable).values({
    id: crypto.randomUUID(),
    locationId,
    customerId,
    label,
    items: payload,
    createdBy: req.user?.id,
  });
  res.json({ success: true, message: "Bill held" });
});

router.get("/pos/held", authenticate, async (req, res) => {
  const { locationId } = req.query as Record<string, string>;
  const conditions = locationId ? [eq(heldBillsTable.locationId, locationId)] : [];
  const rows = await db
    .select()
    .from(heldBillsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .limit(50);

  const customerIds = Array.from(new Set(rows.map((r) => r.customerId).filter((id): id is string => !!id)));
  const customerRows = customerIds.length
    ? await db.select().from(customersTable).where(inArray(customersTable.id, customerIds))
    : [];
  const customerById = new Map(customerRows.map((c) => [c.id, c]));

  res.json({
    success: true,
    data: rows.map((r) => {
      const stored = r.items;
      const lines: unknown[] = Array.isArray(stored) ? stored : (stored.lines ?? []);
      const coupon: unknown = Array.isArray(stored) ? null : (stored.coupon ?? null);
      return {
        id: r.id,
        holdId: r.id,
        label: r.label,
        items: lines,
        customerId: r.customerId,
        customer: r.customerId ? customerById.get(r.customerId) ?? null : null,
        coupon,
        itemCount: lines.length,
        createdAt: r.createdAt?.toISOString(),
      };
    }),
  });
});

export default router;
