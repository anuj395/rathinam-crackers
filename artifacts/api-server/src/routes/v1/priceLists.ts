import { Router } from "express";
import { db, priceListsTable, insertPriceListSchema } from "@workspace/db";
import { z } from "zod/v4";
import { authenticate, requireRole, type AuthRequest } from "../../middleware/authenticate.js";
import { CATALOG_ADMIN } from "../../lib/auth-roles.js";
import { auditWrite } from "../../lib/audit.js";

const router = Router();

router.get("/price-lists", authenticate, async (_req, res) => {
  const rows = await db.select().from(priceListsTable);
  res.json({ success: true, data: rows });
});

router.post("/price-lists", authenticate, requireRole(...CATALOG_ADMIN), async (req: AuthRequest, res) => {
  const parsed = insertPriceListSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: z.prettifyError(parsed.error) } });
    return;
  }
  const [pl] = await db.insert(priceListsTable).values({ ...parsed.data, id: crypto.randomUUID() }).returning();
  await auditWrite(req, { action: "CREATE", entityType: "priceList", entityId: pl?.id, after: pl });
  res.status(201).json(pl);
});

export default router;
