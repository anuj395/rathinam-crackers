import { Router } from "express";
import { db, productsTable, insertProductSchema } from "@workspace/db";
import { eq, ilike, and, sql, arrayContains } from "drizzle-orm";
import { z } from "zod/v4";
import { authenticate, requireRole, type AuthRequest } from "../../middleware/authenticate.js";
import { CATALOG_ADMIN } from "../../lib/auth-roles.js";
import { resolvePrice, type PricingChannel } from "../../lib/pricing.js";
import { auditWrite } from "../../lib/audit.js";

const router = Router();
const updateProductSchema = insertProductSchema.partial();

router.get("/products", authenticate, async (req, res) => {
  const { category, status, search, page = "1", limit = "20", onlineDisplay, occasion } = req.query as Record<string, string>;
  const pg = Math.max(1, parseInt(page));
  const lim = Math.min(100, parseInt(limit));
  const offset = (pg - 1) * lim;

  const conditions = [];
  if (category) conditions.push(eq(productsTable.category, category as any));
  if (status) conditions.push(eq(productsTable.status, status as any));
  if (onlineDisplay === "true") conditions.push(eq(productsTable.onlineDisplay, true));
  if (occasion) conditions.push(arrayContains(productsTable.occasions, [occasion]));
  if (search) conditions.push(ilike(productsTable.name, `%${search}%`));

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [rows, countRows] = await Promise.all([
    db.select().from(productsTable).where(where).limit(lim).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(productsTable).where(where),
  ]);

  const total = Number(countRows[0]?.count ?? 0);
  res.json({ success: true, data: rows, meta: { page: pg, limit: lim, total, pages: Math.ceil(total / lim) } });
});

router.get("/products/public", async (req, res) => {
  const { category, featured, search, page = "1", limit = "20", occasion } = req.query as Record<string, string>;
  const pg = Math.max(1, parseInt(page));
  const lim = Math.min(100, parseInt(limit));
  const offset = (pg - 1) * lim;

  const conditions = [eq(productsTable.onlineDisplay, true), eq(productsTable.status, "Active")];
  if (category) conditions.push(eq(productsTable.category, category as any));
  if (featured === "true") conditions.push(eq(productsTable.featured, true));
  if (occasion) conditions.push(arrayContains(productsTable.occasions, [occasion]));
  if (search) conditions.push(ilike(productsTable.name, `%${search}%`));

  const where = and(...conditions);
  const rows = await db.select().from(productsTable).where(where).limit(lim).offset(offset);
  const countRows = await db.select({ count: sql<number>`count(*)` }).from(productsTable).where(where);
  const total = Number(countRows[0]?.count ?? 0);
  res.json({ success: true, data: rows, meta: { page: pg, limit: lim, total, pages: Math.ceil(total / lim) } });
});

router.get("/products/:id", authenticate, async (req, res) => {
  const rows = await db.select().from(productsTable).where(eq(productsTable.id, req.params["id"] as string)).limit(1);
  if (!rows[0]) { res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Product not found" } }); return; }
  res.json(rows[0]);
});

router.post("/products", authenticate, requireRole(...CATALOG_ADMIN), async (req: AuthRequest, res) => {
  const parsed = insertProductSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: z.prettifyError(parsed.error) } });
    return;
  }
  const id = crypto.randomUUID();
  const [product] = await db.insert(productsTable).values({ ...parsed.data, id }).returning();
  await auditWrite(req, { action: "CREATE", entityType: "product", entityId: id, after: product });
  res.status(201).json(product);
});

router.put("/products/:id", authenticate, requireRole(...CATALOG_ADMIN), async (req: AuthRequest, res) => {
  const id = req.params["id"] as string;
  const parsed = updateProductSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: z.prettifyError(parsed.error) } });
    return;
  }
  const before = (await db.select().from(productsTable).where(eq(productsTable.id, id)).limit(1))[0] ?? null;
  const [product] = await db.update(productsTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(productsTable.id, id)).returning();
  if (!product) { res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Product not found" } }); return; }
  await auditWrite(req, { action: "UPDATE", entityType: "product", entityId: id, before, after: product });
  res.json(product);
});

router.delete("/products/:id", authenticate, requireRole(...CATALOG_ADMIN), async (req: AuthRequest, res) => {
  const id = req.params["id"] as string;
  const before = (await db.select().from(productsTable).where(eq(productsTable.id, id)).limit(1))[0] ?? null;
  await db.update(productsTable).set({ status: "Discontinued", updatedAt: new Date() }).where(eq(productsTable.id, id));
  await auditWrite(req, { action: "DELETE", entityType: "product", entityId: id, before, after: { status: "Discontinued" } });
  res.json({ success: true, message: "Product discontinued" });
});

router.get("/products/:id/price", authenticate, async (req, res) => {
  const { variantId, qty, channel } = req.query as Record<string, string>;
  const rows = await db.select().from(productsTable).where(eq(productsTable.id, req.params["id"] as string)).limit(1);
  const product = rows[0];
  if (!product) { res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Product not found" } }); return; }

  const variants = (product.variants ?? []) as any[];
  const variant = variants.find((v: any) => v.variantId === variantId);
  if (!variant) { res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Variant not found" } }); return; }

  const result = resolvePrice(variant, parseInt(qty ?? "1"), (channel ?? "RETAIL") as PricingChannel);
  res.json({ success: true, data: result });
});

export default router;
