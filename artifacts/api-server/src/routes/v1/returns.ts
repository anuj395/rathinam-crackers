import { Router } from "express";
import {
  db,
  returnsTable,
  damageLedgerTable,
  invoicesTable,
  customersTable,
  creditLedgerTable,
} from "@workspace/db";
import { eq, and, sql, gte, lte, desc } from "drizzle-orm";
import { authenticate, requireRole } from "../../middleware/authenticate.js";
import { SALES_WRITE, WAREHOUSE_ROLES } from "../../lib/auth-roles.js";
import { appendLedger } from "../../lib/stockService.js";
import { nextReturnNo, nextCreditNoteNo } from "../../lib/counter.js";
import type { AuthRequest } from "../../middleware/authenticate.js";

const router = Router();

router.get("/returns", authenticate, async (req, res) => {
  const { type, dateFrom, dateTo, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pg = Math.max(1, parseInt(page));
  const lim = Math.min(100, parseInt(limit));
  const offset = (pg - 1) * lim;
  const conditions = [];
  if (type) conditions.push(eq(returnsTable.type, type as any));
  if (dateFrom) conditions.push(gte(returnsTable.createdAt, new Date(dateFrom)));
  if (dateTo) conditions.push(lte(returnsTable.createdAt, new Date(dateTo)));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [rows, countRows] = await Promise.all([
    db.select().from(returnsTable).where(where).orderBy(desc(returnsTable.createdAt)).limit(lim).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(returnsTable).where(where),
  ]);
  const total = Number(countRows[0]?.count ?? 0);
  res.json({ success: true, data: rows, meta: { page: pg, limit: lim, total, pages: Math.ceil(total / lim) } });
});

router.get("/returns/:id", authenticate, async (req, res) => {
  const rows = await db.select().from(returnsTable).where(eq(returnsTable.id, req.params["id"] as string)).limit(1);
  if (!rows[0]) {
    res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Return not found" } });
    return;
  }
  res.json({ success: true, data: rows[0] });
});

// Create a customer return — restocks goods, generates a credit note, and
// either reduces the customer's outstanding balance or records a cash refund.
// All four side effects (return record, stock ledger, customer balance, credit
// ledger) are wrapped in a transaction so a partial failure can never leave
// inventory in an inconsistent state.
router.post("/returns", authenticate, requireRole(...SALES_WRITE), async (req: AuthRequest, res) => {
  const {
    type = "customer",
    referenceId,
    items,
    reason,
    refundMode = "CREDIT_NOTE",
    locationId,
    notes,
  } = req.body as {
    type?: "customer" | "supplier" | "online";
    referenceId?: string;
    items: Array<{
      productId: string;
      variantId: string;
      productName?: string;
      variantLabel?: string;
      qty: number;
      unitPrice?: number;
    }>;
    reason: string;
    refundMode?: "CREDIT_NOTE" | "CASH" | "NONE";
    locationId?: string;
    notes?: string;
  };

  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "At least one item is required" } });
    return;
  }
  if (!reason?.trim()) {
    res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "Reason is required" } });
    return;
  }

  // Resolve the originating invoice (if any) to derive customer + per-line
  // unit prices when the client didn't pass them.
  let invoice: typeof invoicesTable.$inferSelect | null = null;
  if (referenceId) {
    const invRows = await db.select().from(invoicesTable).where(eq(invoicesTable.id, referenceId)).limit(1);
    invoice = invRows[0] ?? null;
    if (!invoice) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Invoice not found" } });
      return;
    }
    // For ONLINE-channel orders, returns are only meaningful once the goods
    // have actually shipped. Returning before delivery would double-restock
    // (cancellation already restocks) and ghost-return a cancelled order.
    if (invoice.channel === "ONLINE") {
      if (invoice.status === "cancelled") {
        res.status(409).json({
          success: false,
          error: { code: "ORDER_CANCELLED", message: "Cannot return a cancelled order — stock was already restored on cancel." },
        });
        return;
      }
      const stage = (invoice.logisticsDetails as any)?.status;
      if (stage !== "dispatched" && stage !== "delivered") {
        res.status(409).json({
          success: false,
          error: {
            code: "NOT_DELIVERED",
            message: "Online orders can only be returned after delivery. To stop a pending order, cancel it instead.",
          },
        });
        return;
      }
    }
  }

  // Guard against over-returns: total qty per (product,variant) across all
  // existing returns for this invoice plus the new request must not exceed
  // the originally sold qty.
  if (invoice) {
    const prior = await db.select().from(returnsTable).where(eq(returnsTable.referenceId, invoice.id));
    const alreadyReturned = new Map<string, number>();
    for (const r of prior) {
      for (const line of (r.items ?? []) as Array<{ productId: string; variantId: string; qty: number }>) {
        const k = `${line.productId}|${line.variantId}`;
        alreadyReturned.set(k, (alreadyReturned.get(k) ?? 0) + Number(line.qty ?? 0));
      }
    }
    const soldByKey = new Map<string, number>();
    for (const line of (invoice.items ?? []) as Array<{ productId: string; variantId: string; qty: number }>) {
      const k = `${line.productId}|${line.variantId}`;
      soldByKey.set(k, (soldByKey.get(k) ?? 0) + Number(line.qty ?? 0));
    }
    for (const it of items) {
      const k = `${it.productId}|${it.variantId}`;
      const sold = soldByKey.get(k) ?? 0;
      const already = alreadyReturned.get(k) ?? 0;
      const remaining = sold - already;
      if (Number(it.qty) > remaining) {
        res.status(400).json({
          success: false,
          error: {
            code: "BAD_REQUEST",
            message: `Cannot return ${it.qty} of ${it.productName ?? k} — only ${remaining} remaining (sold ${sold}, already returned ${already}).`,
          },
        });
        return;
      }
    }
  }

  // Build enriched line items with computed line totals so the return record
  // is self-describing without joining back to the invoice every time.
  const enrichedItems = items.map((it) => {
    const invLine = (invoice?.items ?? []).find(
      (l: any) => l.productId === it.productId && l.variantId === it.variantId,
    ) as any | undefined;
    const unitPrice = Number(it.unitPrice ?? invLine?.unitPrice ?? 0);
    const qty = Number(it.qty ?? 0);
    return {
      productId: it.productId,
      variantId: it.variantId,
      productName: it.productName ?? invLine?.productName ?? "",
      variantLabel: it.variantLabel ?? invLine?.variantLabel ?? "",
      qty,
      unitPrice,
      lineTotal: Number((unitPrice * qty).toFixed(2)),
    };
  });

  const creditAmount = enrichedItems.reduce((s, i) => s + (i.lineTotal ?? 0), 0);
  const restockLocation = locationId ?? invoice?.locationId ?? null;

  const [returnNo, creditNoteNo] = await Promise.all([
    nextReturnNo(),
    refundMode === "CREDIT_NOTE" || refundMode === "CASH" ? nextCreditNoteNo() : Promise.resolve<string | null>(null),
  ]);

  const result = await db.transaction(async (tx) => {
    const customerId = invoice?.customerId ?? null;
    const customerName = invoice?.customerName ?? null;

    const [created] = await tx
      .insert(returnsTable)
      .values({
        id: crypto.randomUUID(),
        returnNo,
        type,
        referenceId: referenceId ?? null,
        referenceNo: invoice?.invoiceNo ?? null,
        customerId,
        customerName,
        locationId: restockLocation,
        items: enrichedItems,
        reason,
        creditAmount: creditAmount.toFixed(2),
        refundMode,
        creditNoteNo: creditNoteNo,
        status: "approved",
        notes: notes ?? null,
        createdBy: req.user?.id,
      })
      .returning();

    // Restock at the original location (or specified one). Goodwill / write-off
    // returns can opt out by passing locationId=null + we skip if missing.
    if (restockLocation) {
      for (const item of enrichedItems) {
        if (item.qty <= 0) continue;
        await appendLedger(
          {
            productId: item.productId,
            variantId: item.variantId,
            locationId: restockLocation,
            type: "IN",
            qty: item.qty,
            refType: "RETURN",
            refId: created!.id,
            notes: `Return ${returnNo}: ${reason}`,
            createdBy: req.user?.id,
          },
          tx,
        );
      }
    }

    // Issue the credit note: reduce outstanding (if customer has a balance)
    // or accumulate a wallet credit (negative outstanding). For CASH refunds
    // we record the credit ledger entry but DO NOT change the balance — the
    // money leaves via the till.
    if (customerId && refundMode === "CREDIT_NOTE" && creditAmount > 0) {
      // Atomic decrement so concurrent returns/payments don't race on the
      // outstandingBalance read-then-write. RETURNING gives us the new
      // balance to record on the credit ledger row in the same statement.
      const updated = await tx
        .update(customersTable)
        .set({
          outstandingBalance: sql`(${customersTable.outstandingBalance})::numeric - ${creditAmount}`,
          updatedAt: new Date(),
        })
        .where(eq(customersTable.id, customerId))
        .returning({ outstandingBalance: customersTable.outstandingBalance });
      if (updated[0]) {
        await tx.insert(creditLedgerTable).values({
          id: crypto.randomUUID(),
          customerId,
          type: "CREDIT",
          amount: creditAmount.toFixed(2),
          runningBalance: Number(updated[0].outstandingBalance).toFixed(2),
          reference: creditNoteNo!,
          refType: "RETURN",
          refId: created!.id,
          notes: `Credit note for return ${returnNo}`,
          createdBy: req.user?.id,
        });
      }
    } else if (customerId && refundMode === "CASH" && creditAmount > 0) {
      const cRows = await tx.select().from(customersTable).where(eq(customersTable.id, customerId)).limit(1);
      const runningBalance = Number(cRows[0]?.outstandingBalance ?? 0);
      await tx.insert(creditLedgerTable).values({
        id: crypto.randomUUID(),
        customerId,
        type: "ADJUSTMENT",
        amount: creditAmount.toFixed(2),
        runningBalance: runningBalance.toFixed(2),
        reference: creditNoteNo!,
        refType: "RETURN",
        refId: created!.id,
        notes: `Cash refund for return ${returnNo}`,
        createdBy: req.user?.id,
      });
    }

    return created!;
  });

  res.status(201).json({ success: true, data: result });
});

// Returns aggregate report. Useful for the finance team to reconcile
// returns vs sales for a period and watch the top reasons.
router.get("/reports/returns", authenticate, async (req, res) => {
  const { dateFrom, dateTo } = req.query as Record<string, string>;
  const conditions = [];
  if (dateFrom) conditions.push(gte(returnsTable.createdAt, new Date(dateFrom)));
  if (dateTo) conditions.push(lte(returnsTable.createdAt, new Date(dateTo)));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await db.select().from(returnsTable).where(where).orderBy(desc(returnsTable.createdAt)).limit(500);

  const summary = rows.reduce(
    (acc, r) => {
      acc.totalReturns += 1;
      acc.totalCredit += Number(r.creditAmount ?? 0);
      acc.byType[r.type] = (acc.byType[r.type] ?? 0) + 1;
      acc.byMode[r.refundMode] = (acc.byMode[r.refundMode] ?? 0) + 1;
      const key = (r.reason ?? "Other").slice(0, 60);
      acc.byReason[key] = (acc.byReason[key] ?? 0) + 1;
      return acc;
    },
    {
      totalReturns: 0,
      totalCredit: 0,
      byType: {} as Record<string, number>,
      byMode: {} as Record<string, number>,
      byReason: {} as Record<string, number>,
    },
  );

  const topReasons = Object.entries(summary.byReason)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([reason, count]) => ({ reason, count }));

  res.json({
    success: true,
    data: {
      summary: {
        totalReturns: summary.totalReturns,
        totalCredit: summary.totalCredit.toFixed(2),
        byType: summary.byType,
        byMode: summary.byMode,
      },
      topReasons,
      recent: rows.slice(0, 50),
    },
  });
});

router.post("/damage", authenticate, requireRole(...WAREHOUSE_ROLES), async (req: AuthRequest, res) => {
  const { locationId, productId, variantId, batchNo, qty, category, description } = req.body;
  await Promise.all([
    db.insert(damageLedgerTable).values({
      id: crypto.randomUUID(),
      locationId, productId, variantId, batchNo, qty, category, description,
      createdBy: req.user?.id,
    }),
    appendLedger({
      productId, variantId, locationId,
      type: "DAMAGE",
      qty: -qty,
      batchNo,
      refType: "DAMAGE",
      notes: `${category}: ${description ?? ""}`,
      createdBy: req.user?.id,
    }),
  ]);
  res.status(201).json({ success: true, message: "Damage logged" });
});

router.get("/damage", authenticate, async (req, res) => {
  const { locationId, category, dateFrom, dateTo } = req.query as Record<string, string>;
  const conditions = [];
  if (locationId) conditions.push(eq(damageLedgerTable.locationId, locationId));
  if (category) conditions.push(eq(damageLedgerTable.category, category as any));
  if (dateFrom) conditions.push(gte(damageLedgerTable.createdAt, new Date(dateFrom)));
  if (dateTo) conditions.push(lte(damageLedgerTable.createdAt, new Date(dateTo)));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await db.select().from(damageLedgerTable).where(where).orderBy(desc(damageLedgerTable.createdAt)).limit(500);
  res.json({ success: true, data: rows });
});

export default router;
