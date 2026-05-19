import { Router } from "express";
import { db, categoriesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { authenticate, requireRole, type AuthRequest } from "../../middleware/authenticate.js";
import { CATALOG_ADMIN } from "../../lib/auth-roles.js";
import { auditWrite } from "../../lib/audit.js";

const router = Router();

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

router.get("/categories", authenticate, async (_req, res) => {
  const rows = await db
    .select()
    .from(categoriesTable)
    .orderBy(asc(categoriesTable.sortOrder), asc(categoriesTable.name));
  res.json({ success: true, data: rows });
});

router.get("/categories/public", async (_req, res) => {
  const rows = await db
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.isActive, true))
    .orderBy(asc(categoriesTable.sortOrder), asc(categoriesTable.name));
  res.json({ success: true, data: rows });
});

router.post("/categories", authenticate, requireRole(...CATALOG_ADMIN), async (req: AuthRequest, res) => {
  const { name, description, emoji, imageUrl, color, sortOrder, isActive } = req.body ?? {};
  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ success: false, error: { code: "VALIDATION", message: "Category name is required" } });
    return;
  }
  try {
    const [row] = await db
      .insert(categoriesTable)
      .values({
        name: name.trim(),
        slug: slugify(name),
        description: description || null,
        emoji: emoji || null,
        imageUrl: imageUrl || null,
        color: color || null,
        sortOrder: Number.isFinite(sortOrder) ? Number(sortOrder) : 0,
        isActive: isActive !== false,
      })
      .returning();
    await auditWrite(req, { action: "CREATE", entityType: "category", entityId: row?.id, after: row });
    res.status(201).json({ success: true, data: row });
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === "23505") {
      res.status(409).json({ success: false, error: { code: "DUPLICATE", message: "Category with that name already exists" } });
      return;
    }
    throw err;
  }
});

router.patch("/categories/:id", authenticate, requireRole(...CATALOG_ADMIN), async (req: AuthRequest, res) => {
  const id = req.params["id"] as string;
  const { name, description, emoji, imageUrl, color, sortOrder, isActive } = req.body ?? {};
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof name === "string" && name.trim()) {
    patch["name"] = name.trim();
    patch["slug"] = slugify(name);
  }
  if (description !== undefined) patch["description"] = description || null;
  if (emoji !== undefined) patch["emoji"] = emoji || null;
  if (imageUrl !== undefined) patch["imageUrl"] = imageUrl || null;
  if (color !== undefined) patch["color"] = color || null;
  if (Number.isFinite(sortOrder)) patch["sortOrder"] = Number(sortOrder);
  if (typeof isActive === "boolean") patch["isActive"] = isActive;

  try {
    const before = (await db.select().from(categoriesTable).where(eq(categoriesTable.id, id)).limit(1))[0] ?? null;
    const [row] = await db.update(categoriesTable).set(patch).where(eq(categoriesTable.id, id)).returning();
    if (!row) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Category not found" } });
      return;
    }
    await auditWrite(req, { action: "UPDATE", entityType: "category", entityId: id, before, after: row });
    res.json({ success: true, data: row });
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === "23505") {
      res.status(409).json({ success: false, error: { code: "DUPLICATE", message: "Category with that name already exists" } });
      return;
    }
    throw err;
  }
});

router.delete("/categories/:id", authenticate, async (req: AuthRequest, res) => {
  if (req.user?.role !== "SUPER_ADMIN" && req.user?.role !== "ADMIN") {
    res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Admin role required" } });
    return;
  }
  const id = req.params["id"] as string;
  const [row] = await db.delete(categoriesTable).where(eq(categoriesTable.id, id)).returning();
  if (!row) {
    res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Category not found" } });
    return;
  }
  await auditWrite(req, { action: "DELETE", entityType: "category", entityId: id, before: row });
  res.json({ success: true, data: { id } });
});

export default router;
