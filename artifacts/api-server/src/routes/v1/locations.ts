import { Router } from "express";
import { db, locationsTable, insertLocationSchema } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { authenticate, requireRole, type AuthRequest } from "../../middleware/authenticate.js";
import { auditWrite } from "../../lib/audit.js";

const router = Router();

const updateLocationSchema = insertLocationSchema.partial();

// Locations are part of the company's physical operating footprint;
// only privileged operators may create/edit/delete them.
const requireWrite = requireRole("SUPER_ADMIN", "ADMIN", "ERP_MANAGER");
const requireDelete = requireRole("SUPER_ADMIN", "ADMIN");

router.get("/locations", authenticate, async (req, res) => {
  const { type } = req.query as Record<string, string>;
  const conditions = [];
  if (type) conditions.push(eq(locationsTable.type, type as any));
  const rows = await db.select().from(locationsTable).where(conditions.length > 0 ? conditions[0] : undefined).limit(100);
  res.json({ success: true, data: rows });
});

router.post("/locations", authenticate, requireWrite, async (req: AuthRequest, res) => {
  const parsed = insertLocationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: z.prettifyError(parsed.error) } });
    return;
  }
  const [location] = await db.insert(locationsTable).values({ ...parsed.data, id: crypto.randomUUID() }).returning();
  await auditWrite(req, { action: "CREATE", entityType: "location", entityId: location?.id, after: location });
  res.status(201).json({ success: true, data: location });
});

router.put("/locations/:id", authenticate, requireWrite, async (req: AuthRequest, res) => {
  const id = req.params["id"] as string;
  const parsed = updateLocationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: z.prettifyError(parsed.error) } });
    return;
  }
  if (Object.keys(parsed.data).length === 0) {
    res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "No updatable fields supplied" } });
    return;
  }
  const before = (await db.select().from(locationsTable).where(eq(locationsTable.id, id)).limit(1))[0] ?? null;
  // locationsTable has no updatedAt column — only set caller-supplied fields.
  const [location] = await db.update(locationsTable).set(parsed.data).where(eq(locationsTable.id, id)).returning();
  if (!location) { res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Location not found" } }); return; }
  await auditWrite(req, { action: "UPDATE", entityType: "location", entityId: id, before, after: location });
  res.json({ success: true, data: location });
});

router.delete("/locations/:id", authenticate, requireDelete, async (req: AuthRequest, res) => {
  const id = req.params["id"] as string;
  try {
    const [location] = await db.delete(locationsTable).where(eq(locationsTable.id, id)).returning();
    if (!location) { res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Location not found" } }); return; }
    await auditWrite(req, { action: "DELETE", entityType: "location", entityId: id, before: location });
    res.json({ success: true, data: { id } });
  } catch (err: any) {
    if (err?.code === "23503") {
      res.status(409).json({ success: false, error: { code: "IN_USE", message: "Location is referenced by other records" } });
      return;
    }
    throw err;
  }
});

export default router;
