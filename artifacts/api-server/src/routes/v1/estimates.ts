import { Router } from "express";
import { db, estimatesTable, productsTable, settingsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { authenticate, requireRole } from "../../middleware/authenticate.js";
import { SALES_WRITE } from "../../lib/auth-roles.js";
import { resolvePrice, type PricingChannel } from "../../lib/pricing.js";
import { nextEstimateNo } from "../../lib/counter.js";
import { auditWrite } from "../../lib/audit.js";
import type { AuthRequest } from "../../middleware/authenticate.js";

const router = Router();

// The estimate POST handler does heavy server-side pricing work, so we can't
// just hand the raw insert to drizzle. This narrow schema exists purely to
// reject obviously-bad payloads with a clean 400 instead of letting them
// crash the insert with a NaN or missing-enum DB error.
const createEstimateSchema = z.object({
  type: z.enum(["WHOLESALE", "RETAIL", "AGENT"]),
  customerId: z.string().optional(),
  agentId: z.string().optional(),
  priceListId: z.string().optional(),
  couponCode: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(z.object({
    productId: z.string().min(1),
    variantId: z.string().min(1),
    qty: z.number().positive(),
  })).min(1, "At least one item is required"),
});

async function getWholesaleThreshold(): Promise<number> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, "pricing")).limit(1);
  if (rows[0]) {
    const val = rows[0].value as any;
    if (val?.wholesaleQtyThreshold) return Number(val.wholesaleQtyThreshold);
  }
  return 10;
}

router.get("/estimates", authenticate, async (req, res) => {
  const { type, customerId, agentId, status, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pg = Math.max(1, parseInt(page));
  const lim = Math.min(100, parseInt(limit));
  const offset = (pg - 1) * lim;
  const conditions = [];
  if (type) conditions.push(eq(estimatesTable.type, type as any));
  if (customerId) conditions.push(eq(estimatesTable.customerId, customerId));
  if (agentId) conditions.push(eq(estimatesTable.agentId, agentId));
  if (status) conditions.push(eq(estimatesTable.status, status as any));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [rows, countRows] = await Promise.all([
    db.select().from(estimatesTable).where(where).limit(lim).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(estimatesTable).where(where),
  ]);
  const total = Number(countRows[0]?.count ?? 0);
  res.json({ success: true, data: rows, meta: { page: pg, limit: lim, total, pages: Math.ceil(total / lim) } });
});

router.post("/estimates", authenticate, requireRole(...SALES_WRITE), async (req: AuthRequest, res) => {
  const parsed = createEstimateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: z.prettifyError(parsed.error) } });
    return;
  }
  const { type, customerId, agentId, priceListId, couponCode, items, notes } = parsed.data;

  const threshold = await getWholesaleThreshold();
  const channel: PricingChannel = type === "WHOLESALE" ? "WHOLESALE" : type === "AGENT" ? "AGENT" : "RETAIL";

  const resolvedItems = [];
  for (const item of items) {
    const rows = await db.select().from(productsTable).where(eq(productsTable.id, item.productId)).limit(1);
    const product = rows[0];
    if (!product) continue;
    const variants = (product.variants ?? []) as any[];
    const variant = variants.find((v: any) => v.variantId === item.variantId);
    if (!variant) continue;
    const priceResult = resolvePrice(variant, item.qty, channel, threshold);
    const amount = priceResult.resolvedPrice * item.qty;
    resolvedItems.push({
      productId: item.productId,
      productName: product.name,
      variantId: item.variantId,
      variantSize: variant.size ?? "",
      qty: item.qty,
      resolvedPrice: priceResult.resolvedPrice,
      resolutionReason: priceResult.resolutionReason,
      bulkRateApplied: priceResult.bulkRateApplied,
      amount,
    });
  }

  const subtotal = resolvedItems.reduce((s, i) => s + i.amount, 0);
  const estimateNo = await nextEstimateNo();

  const [estimate] = await db.insert(estimatesTable).values({
    id: crypto.randomUUID(),
    estimateNo,
    type,
    customerId,
    agentId,
    priceListId,
    items: resolvedItems,
    subtotal: subtotal.toFixed(2),
    total: subtotal.toFixed(2),
    couponCode,
    status: "draft",
    notes,
    createdBy: req.user?.id,
  }).returning();

  await auditWrite(req, { action: "CREATE", entityType: "estimate", entityId: estimate?.id, after: estimate });
  res.status(201).json(estimate);
});

router.get("/estimates/:id", authenticate, async (req, res) => {
  const rows = await db.select().from(estimatesTable).where(eq(estimatesTable.id, req.params["id"] as string)).limit(1);
  if (!rows[0]) { res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Estimate not found" } }); return; }
  res.json(rows[0]);
});

router.put("/estimates/:id/convert", authenticate, requireRole(...SALES_WRITE), async (req: AuthRequest, res) => {
  const estimateRows = await db.select().from(estimatesTable).where(eq(estimatesTable.id, req.params["id"] as string)).limit(1);
  if (!estimateRows[0]) { res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Estimate not found" } }); return; }
  const est = estimateRows[0];

  const { nextInvoiceNo } = await import("../../lib/counter.js");
  const { appendLedger } = await import("../../lib/stockService.js");

  const invoiceNo = await nextInvoiceNo();
  const fy = new Date().getFullYear();
  const financialYear = `${fy}-${fy + 1}`;

  const { invoicesTable, customersTable, creditLedgerTable } = await import("@workspace/db");
  const total = Number(est.total);

  const [invoice] = await db.insert(invoicesTable).values({
    id: crypto.randomUUID(),
    invoiceNo,
    customerId: est.customerId ?? undefined,
    customerName: est.customerName ?? undefined,
    agentId: est.agentId ?? undefined,
    priceListId: est.priceListId ?? undefined,
    estimateId: est.id,
    items: est.items as any,
    subtotal: est.subtotal,
    discountAmount: "0",
    couponCode: est.couponCode ?? undefined,
    couponDiscount: est.couponDiscount ?? "0",
    taxableAmount: est.total,
    cgst: "0",
    sgst: "0",
    igst: "0",
    total: est.total,
    paymentMode: (req.body.paymentMode ?? "CASH") as any,
    channel: est.type === "WHOLESALE" ? "WHOLESALE" : est.type === "AGENT" ? "AGENT" : "RETAIL",
    financialYear,
    status: req.body.paymentMode === "CREDIT" ? "credit" : "paid",
    createdBy: req.user?.id,
  }).returning();

  await db.update(estimatesTable).set({ status: "converted", convertedInvoiceId: invoice!.id }).where(eq(estimatesTable.id, est.id));

  res.json(invoice);
});

router.post("/estimates/from-brochure", authenticate, async (req, res) => {
  res.status(501).json({ success: false, error: { code: "NOT_IMPLEMENTED", message: "Brochure parsing not yet implemented" } });
});

export default router;
