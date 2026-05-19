import { Router } from "express";
import { db, stockLedgerTable, stockLevelsTable, productsTable, locationsTable } from "@workspace/db";
import { eq, and, sql, gte, lte, lt } from "drizzle-orm";
import { authenticate, requireRole } from "../../middleware/authenticate.js";
import { WAREHOUSE_ROLES } from "../../lib/auth-roles.js";
import { appendLedger } from "../../lib/stockService.js";
import type { AuthRequest } from "../../middleware/authenticate.js";

const router = Router();

router.get("/stock/levels", authenticate, async (req, res) => {
  const { locationId, productId, lowStockOnly, page = "1", limit = "50" } = req.query as Record<string, string>;
  const pg = Math.max(1, parseInt(page));
  const lim = Math.min(200, parseInt(limit));
  const offset = (pg - 1) * lim;

  let query = db
    .select({
      productId: stockLevelsTable.productId,
      variantId: stockLevelsTable.variantId,
      locationId: stockLevelsTable.locationId,
      currentQty: stockLevelsTable.currentQty,
      reservedQty: stockLevelsTable.reservedQty,
      productName: productsTable.name,
      productCode: productsTable.code,
      reorderLevel: productsTable.reorderLevel,
      locationName: locationsTable.name,
    })
    .from(stockLevelsTable)
    .leftJoin(productsTable, eq(stockLevelsTable.productId, productsTable.id))
    .leftJoin(locationsTable, eq(stockLevelsTable.locationId, locationsTable.id))
    .$dynamic();

  if (locationId) query = query.where(eq(stockLevelsTable.locationId, locationId));
  if (productId) query = query.where(eq(stockLevelsTable.productId, productId));
  if (lowStockOnly === "true") query = query.where(lt(stockLevelsTable.currentQty, productsTable.reorderLevel ?? 10));

  const rows = await query.limit(lim).offset(offset);
  const total = rows.length;

  const data = rows.map((r) => ({
    ...r,
    variantSize: "",
    isLow: r.currentQty < (r.reorderLevel ?? 10),
  }));

  res.json({ success: true, data, meta: { page: pg, limit: lim, total, pages: Math.ceil(total / lim) } });
});

router.get("/stock/ledger", authenticate, async (req, res) => {
  const { productId, locationId, type, page = "1", limit = "50" } = req.query as Record<string, string>;
  const pg = Math.max(1, parseInt(page));
  const lim = Math.min(200, parseInt(limit));
  const offset = (pg - 1) * lim;

  let query = db
    .select({
      id: stockLedgerTable.id,
      productId: stockLedgerTable.productId,
      variantId: stockLedgerTable.variantId,
      locationId: stockLedgerTable.locationId,
      type: stockLedgerTable.type,
      qty: stockLedgerTable.qty,
      batchNo: stockLedgerTable.batchNo,
      refType: stockLedgerTable.refType,
      refId: stockLedgerTable.refId,
      notes: stockLedgerTable.notes,
      ts: stockLedgerTable.ts,
      productName: productsTable.name,
    })
    .from(stockLedgerTable)
    .leftJoin(productsTable, eq(stockLedgerTable.productId, productsTable.id))
    .$dynamic();

  if (productId) query = query.where(eq(stockLedgerTable.productId, productId));
  if (locationId) query = query.where(eq(stockLedgerTable.locationId, locationId));
  if (type) query = query.where(eq(stockLedgerTable.type, type as any));

  const rows = await query.orderBy(sql`${stockLedgerTable.ts} desc`).limit(lim).offset(offset);
  const countRows = await db.select({ count: sql<number>`count(*)` }).from(stockLedgerTable);
  const total = Number(countRows[0]?.count ?? 0);

  res.json({ success: true, data: rows, meta: { page: pg, limit: lim, total, pages: Math.ceil(total / lim) } });
});

router.post("/stock/receive", authenticate, requireRole(...WAREHOUSE_ROLES), async (req: AuthRequest, res) => {
  const { warehouseId, purchaseOrderId, items } = req.body as {
    warehouseId: string;
    purchaseOrderId: string;
    items: Array<{ productId: string; variantId: string; qty: number; batchNo?: string; damagedQty?: number }>;
  };

  let received = 0;
  let damaged = 0;

  for (const item of items) {
    if (item.qty > 0) {
      await appendLedger({
        productId: item.productId,
        variantId: item.variantId,
        locationId: warehouseId,
        type: "IN",
        qty: item.qty,
        batchNo: item.batchNo,
        refType: "PO",
        refId: purchaseOrderId,
        createdBy: req.user?.id,
      });
      received += item.qty;
    }
    if (item.damagedQty && item.damagedQty > 0) {
      await appendLedger({
        productId: item.productId,
        variantId: item.variantId,
        locationId: warehouseId,
        type: "DAMAGE",
        qty: -item.damagedQty,
        batchNo: item.batchNo,
        refType: "PO",
        refId: purchaseOrderId,
        notes: "Damaged on receipt",
        createdBy: req.user?.id,
      });
      damaged += item.damagedQty;
    }
  }

  res.json({ success: true, data: { received, damaged } });
});

router.post("/stock/adjust", authenticate, requireRole(...WAREHOUSE_ROLES), async (req: AuthRequest, res) => {
  const body = (req.body ?? {}) as {
    productId?: string; variantId?: string; locationId?: string; qty?: number; reason?: string;
  };
  const { productId, variantId, locationId, qty, reason } = body;

  const missing: string[] = [];
  if (!productId) missing.push("productId");
  if (!variantId) missing.push("variantId");
  if (!locationId) missing.push("locationId");
  if (qty === undefined || qty === null || Number.isNaN(Number(qty))) missing.push("qty");
  if (!reason || String(reason).trim().length === 0) missing.push("reason");
  if (missing.length > 0) {
    return res.status(400).json({
      success: false,
      error: "ValidationError",
      message: `Missing or invalid fields: ${missing.join(", ")}. 'reason' is required for every stock adjustment (audit trail).`,
      missing,
    });
  }

  // Wrap in a transaction for symmetry with other stock-mutating routes —
  // the ledger insert and the stock_levels upsert are now committed together.
  await db.transaction(async (tx) => {
    await appendLedger(
      {
        productId: productId!, variantId: variantId!, locationId: locationId!,
        type: "ADJUST",
        qty: Number(qty),
        notes: reason!,
        refType: "MANUAL",
        createdBy: req.user?.id,
      },
      tx,
    );
  });

  return res.json({ success: true, message: "Stock adjusted" });
});

export default router;
