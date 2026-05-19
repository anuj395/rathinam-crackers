import { Router } from "express";
import { db, suppliersTable, insertSupplierSchema } from "@workspace/db";
import { eq, ilike, and, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { authenticate, requireRole, type AuthRequest } from "../../middleware/authenticate.js";
import { auditWrite } from "../../lib/audit.js";

const router = Router();

const requireWrite = requireRole("SUPER_ADMIN", "ADMIN", "ERP_MANAGER");
const requireDelete = requireRole("SUPER_ADMIN", "ADMIN");
const updateSupplierSchema = insertSupplierSchema.partial();

router.get("/suppliers", authenticate, async (req, res) => {
  const { search, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pg = Math.max(1, parseInt(page));
  const lim = Math.min(100, parseInt(limit));
  const offset = (pg - 1) * lim;
  const conditions = [];
  if (search) conditions.push(ilike(suppliersTable.name, `%${search}%`));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [rows, countRows] = await Promise.all([
    db.select().from(suppliersTable).where(where).limit(lim).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(suppliersTable).where(where),
  ]);
  const total = Number(countRows[0]?.count ?? 0);
  res.json({ success: true, data: rows, meta: { page: pg, limit: lim, total, pages: Math.ceil(total / lim) } });
});

router.post("/suppliers", authenticate, requireWrite, async (req: AuthRequest, res) => {
  const parsed = insertSupplierSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: z.prettifyError(parsed.error) } });
    return;
  }
  const [supplier] = await db.insert(suppliersTable).values({ ...parsed.data, id: crypto.randomUUID() }).returning();
  await auditWrite(req, { action: "CREATE", entityType: "supplier", entityId: supplier?.id, after: supplier });
  res.status(201).json(supplier);
});

router.get("/suppliers/:id", authenticate, async (req, res) => {
  const rows = await db.select().from(suppliersTable).where(eq(suppliersTable.id, req.params["id"] as string)).limit(1);
  if (!rows[0]) { res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Supplier not found" } }); return; }
  res.json(rows[0]);
});

router.put("/suppliers/:id", authenticate, requireWrite, async (req: AuthRequest, res) => {
  const id = req.params["id"] as string;
  const parsed = updateSupplierSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: z.prettifyError(parsed.error) } });
    return;
  }
  const before = (await db.select().from(suppliersTable).where(eq(suppliersTable.id, id)).limit(1))[0] ?? null;
  const [supplier] = await db.update(suppliersTable).set(parsed.data).where(eq(suppliersTable.id, id)).returning();
  if (!supplier) { res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Supplier not found" } }); return; }
  await auditWrite(req, { action: "UPDATE", entityType: "supplier", entityId: id, before, after: supplier });
  res.json(supplier);
});

router.delete("/suppliers/:id", authenticate, requireDelete, async (req: AuthRequest, res) => {
  const id = req.params["id"] as string;
  try {
    const [supplier] = await db.delete(suppliersTable).where(eq(suppliersTable.id, id)).returning();
    if (!supplier) { res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Supplier not found" } }); return; }
    await auditWrite(req, { action: "DELETE", entityType: "supplier", entityId: id, before: supplier });
    res.json({ success: true, data: { id } });
  } catch (err: any) {
    if (err?.code === "23503") {
      res.status(409).json({ success: false, error: { code: "IN_USE", message: "Supplier is referenced by other records" } });
      return;
    }
    throw err;
  }
});

export default router;
