import { Router } from "express";
import { db, productReviewsTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { authenticate, requireRole } from "../../middleware/authenticate.js";
import { CATALOG_ADMIN } from "../../lib/auth-roles.js";
import { randomUUID } from "node:crypto";

const router = Router();

function summarize(rows: Array<{ rating: number }>) {
  const total = rows.length;
  const sum = rows.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
  const average = total > 0 ? Math.round((sum / total) * 10) / 10 : 0;
  const buckets: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of rows) {
    const k = Math.max(1, Math.min(5, Number(r.rating) || 0));
    buckets[k]++;
  }
  const distribution = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: buckets[stars] ?? 0,
    pct: total > 0 ? Math.round(((buckets[stars] ?? 0) / total) * 100) : 0,
  }));
  return { total, average, distribution };
}

router.get("/products/:id/reviews/public", async (req, res) => {
  const productId = req.params["id"] as string;
  const rows = await db
    .select()
    .from(productReviewsTable)
    .where(and(eq(productReviewsTable.productId, productId), eq(productReviewsTable.status, "approved")))
    .orderBy(desc(productReviewsTable.createdAt));
  res.json({ success: true, data: rows, summary: summarize(rows) });
});

router.post("/products/:id/reviews", async (req, res) => {
  const productId = req.params["id"] as string;
  const { authorName, city, rating, title, body, verified } = req.body ?? {};
  const r = Number(rating);
  if (!authorName || !body || !Number.isFinite(r) || r < 1 || r > 5) {
    res.status(400).json({ success: false, error: "authorName, body and rating (1-5) are required" });
    return;
  }
  const row = {
    id: randomUUID(),
    productId,
    authorName: String(authorName).slice(0, 120),
    city: city ? String(city).slice(0, 80) : null,
    rating: Math.round(r),
    title: title ? String(title).slice(0, 200) : null,
    body: String(body).slice(0, 4000),
    verified: Boolean(verified) === true ? false : false,
    status: "pending",
  };
  const [inserted] = await db.insert(productReviewsTable).values(row).returning();
  res.status(201).json(inserted);
});

router.get("/reviews", authenticate, async (req, res) => {
  const status = req.query["status"] as string | undefined;
  const rows = status
    ? await db.select().from(productReviewsTable).where(eq(productReviewsTable.status, status)).orderBy(desc(productReviewsTable.createdAt))
    : await db.select().from(productReviewsTable).orderBy(desc(productReviewsTable.createdAt));
  res.json({ success: true, data: rows });
});

router.put("/reviews/:id", authenticate, requireRole(...CATALOG_ADMIN), async (req, res) => {
  const id = req.params["id"] as string;
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of ["status", "verified", "title", "body", "rating"] as const) {
    if (req.body?.[key] !== undefined) patch[key] = req.body[key];
  }
  const [updated] = await db.update(productReviewsTable).set(patch).where(eq(productReviewsTable.id, id)).returning();
  if (!updated) {
    res.status(404).json({ success: false, error: "Review not found" });
    return;
  }
  res.json(updated);
});

router.delete("/reviews/:id", authenticate, requireRole(...CATALOG_ADMIN), async (req, res) => {
  const id = req.params["id"] as string;
  await db.delete(productReviewsTable).where(eq(productReviewsTable.id, id));
  res.json({ success: true });
});

export default router;
