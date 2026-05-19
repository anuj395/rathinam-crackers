import { Router } from "express";
import { db, purchaseOrdersTable, suppliersTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { authenticate, requireRole } from "../../middleware/authenticate.js";
import { WAREHOUSE_ROLES, FINANCE_ROLES } from "../../lib/auth-roles.js";
import { nextPoNumber } from "../../lib/counter.js";
import { appendLedger } from "../../lib/stockService.js";
import { auditWrite } from "../../lib/audit.js";
import type { AuthRequest } from "../../middleware/authenticate.js";

const E2E_TEST_HOOKS = process.env["E2E_TEST_HOOKS"] === "1";

const router = Router();

// Narrow guard so a malformed PO payload returns a clean 400 instead of
// crashing the insert on NaN totals or missing supplier ids.
const createPurchaseOrderSchema = z.object({
  supplierId: z.string().min(1),
  warehouseId: z.string().min(1),
  expectedDate: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(z.object({
    productId: z.string().min(1),
    variantId: z.string().min(1),
    orderedQty: z.number().positive(),
    unitPrice: z.number().nonnegative(),
  })).min(1, "At least one item is required"),
});

router.get("/purchase-orders", authenticate, async (req, res) => {
  const { status, supplierId, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pg = Math.max(1, parseInt(page));
  const lim = Math.min(100, parseInt(limit));
  const offset = (pg - 1) * lim;
  const conditions = [];
  if (status) conditions.push(eq(purchaseOrdersTable.status, status as any));
  if (supplierId) conditions.push(eq(purchaseOrdersTable.supplierId, supplierId));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [rows, countRows] = await Promise.all([
    db.select().from(purchaseOrdersTable).where(where).limit(lim).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(purchaseOrdersTable).where(where),
  ]);
  const total = Number(countRows[0]?.count ?? 0);
  res.json({ success: true, data: rows, meta: { page: pg, limit: lim, total, pages: Math.ceil(total / lim) } });
});

router.post("/purchase-orders", authenticate, requireRole(...FINANCE_ROLES), async (req: AuthRequest, res) => {
  const parsed = createPurchaseOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: z.prettifyError(parsed.error) } });
    return;
  }
  const { supplierId, warehouseId, items, expectedDate, notes } = parsed.data;
  const supplierRows = await db.select().from(suppliersTable).where(eq(suppliersTable.id, supplierId)).limit(1);
  const poNumber = await nextPoNumber();
  const totalAmount = items.reduce((s: number, i: any) => s + i.orderedQty * i.unitPrice, 0);
  const [po] = await db.insert(purchaseOrdersTable).values({
    id: crypto.randomUUID(),
    poNumber,
    supplierId,
    supplierName: supplierRows[0]?.name,
    warehouseId,
    items: items.map((i: any) => ({ ...i, receivedQty: 0 })),
    totalAmount: totalAmount.toFixed(2),
    expectedDate,
    notes,
    createdBy: req.user?.id,
  }).returning();
  await auditWrite(req, { action: "CREATE", entityType: "purchaseOrder", entityId: po?.id, after: po });
  // OpenAPI spec types this endpoint as returning the bare PurchaseOrder entity.
  res.status(201).json(po);
});

router.get("/purchase-orders/:id", authenticate, async (req, res) => {
  const rows = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, req.params["id"] as string)).limit(1);
  if (!rows[0]) { res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "PO not found" } }); return; }
  // OpenAPI spec types this endpoint as returning the bare PurchaseOrder entity.
  res.json(rows[0]);
});

router.put("/purchase-orders/:id/receive", authenticate, requireRole(...WAREHOUSE_ROLES), async (req: AuthRequest, res) => {
  const poRows = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, req.params["id"] as string)).limit(1);
  if (!poRows[0]) { res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "PO not found" } }); return; }
  const po = poRows[0];
  const { items } = req.body as { items: Array<{ productId: string; variantId: string; receivedQty: number; batchNo?: string; damagedQty?: number }> };

  const forceFail =
    E2E_TEST_HOOKS &&
    (req.body as { __forceFailAfterLedger?: boolean })?.__forceFailAfterLedger === true;

  // Atomic: stock IN + PO status flip in one transaction.
  await db.transaction(async (tx) => {
    for (const item of items) {
      if (item.receivedQty > 0) {
        await appendLedger(
          {
            productId: item.productId,
            variantId: item.variantId,
            locationId: po.warehouseId,
            type: "IN",
            qty: item.receivedQty,
            batchNo: item.batchNo,
            refType: "PO",
            refId: po.id,
            createdBy: req.user?.id,
          },
          tx,
        );
      }
    }
    if (forceFail) throw new Error("__test_force_fail_after_ledger");
    await tx.update(purchaseOrdersTable).set({ status: "received", updatedAt: new Date() }).where(eq(purchaseOrdersTable.id, po.id));
  });
  res.json({ success: true, message: "PO received" });
});

export default router;
