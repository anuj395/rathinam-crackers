import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticate, requireRole, type AuthRequest } from "../../middleware/authenticate.js";
import { hashPassword } from "../../lib/auth.js";
import { auditWrite } from "../../lib/audit.js";

const router = Router();

// Admin-only: only SUPER_ADMIN may read or modify the user directory.
const adminOnly = requireRole("SUPER_ADMIN");

// Fields safe to surface to clients and snapshot in the audit log.
// We deliberately exclude passwordHash and pin so secrets never land
// in audit_log.before / audit_log.after.
const userPublicSelect = {
  id: usersTable.id,
  name: usersTable.name,
  username: usersTable.username,
  role: usersTable.role,
  email: usersTable.email,
  phone: usersTable.phone,
  locationIds: usersTable.locationIds,
  maxDiscountPct: usersTable.maxDiscountPct,
  isActive: usersTable.isActive,
  createdAt: usersTable.createdAt,
} as const;

router.get("/users", authenticate, adminOnly, async (_req, res) => {
  const rows = await db.select(userPublicSelect).from(usersTable).limit(100);
  res.json({ success: true, data: rows, meta: { page: 1, limit: 100, total: rows.length, pages: 1 } });
});

router.post("/users", authenticate, adminOnly, async (req: AuthRequest, res) => {
  const { password, pin, ...rest } = req.body;
  const passwordHash = await hashPassword(password);
  const [user] = await db.insert(usersTable).values({ ...rest, id: crypto.randomUUID(), passwordHash, pin }).returning(userPublicSelect);
  await auditWrite(req, { action: "CREATE", entityType: "user", entityId: user?.id, after: user });
  res.status(201).json({ success: true, data: user });
});

router.get("/users/:id", authenticate, adminOnly, async (req, res) => {
  const rows = await db.select(userPublicSelect).from(usersTable).where(eq(usersTable.id, req.params["id"] as string)).limit(1);
  if (!rows[0]) { res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "User not found" } }); return; }
  res.json({ success: true, data: rows[0] });
});

// Shared updater used by both PUT (full replace-style) and PATCH (partial).
// The two HTTP methods are intentionally identical here: the schema is small
// enough that we don't try to enforce required-fields on PUT.
async function updateUser(id: string, body: Record<string, unknown>) {
  const before = (await db.select(userPublicSelect).from(usersTable).where(eq(usersTable.id, id)).limit(1))[0] ?? null;
  const { password, ...rest } = body;
  const updates: Partial<typeof usersTable.$inferInsert> = {
    ...(rest as Partial<typeof usersTable.$inferInsert>),
    updatedAt: new Date(),
  };
  if (typeof password === "string" && password.length > 0) {
    updates.passwordHash = await hashPassword(password);
  }
  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning(userPublicSelect);
  return { before, after: user };
}

router.put("/users/:id", authenticate, adminOnly, async (req: AuthRequest, res) => {
  const id = req.params["id"] as string;
  const { before, after } = await updateUser(id, req.body as Record<string, unknown>);
  if (!after) { res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "User not found" } }); return; }
  await auditWrite(req, { action: "UPDATE", entityType: "user", entityId: id, before, after });
  res.json({ success: true, data: after });
});

router.patch("/users/:id", authenticate, adminOnly, async (req: AuthRequest, res) => {
  const id = req.params["id"] as string;
  const { before, after } = await updateUser(id, req.body as Record<string, unknown>);
  if (!after) { res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "User not found" } }); return; }
  await auditWrite(req, { action: "UPDATE", entityType: "user", entityId: id, before, after });
  res.json({ success: true, data: after });
});

router.delete("/users/:id", authenticate, adminOnly, async (req: AuthRequest, res) => {
  const id = req.params["id"] as string;
  if (req.user?.id === id) {
    res.status(400).json({ success: false, error: { code: "SELF_DELETE", message: "Cannot delete the currently signed-in user" } });
    return;
  }
  try {
    const [user] = await db.delete(usersTable).where(eq(usersTable.id, id)).returning(userPublicSelect);
    if (!user) { res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "User not found" } }); return; }
    await auditWrite(req, { action: "DELETE", entityType: "user", entityId: id, before: user });
    res.json({ success: true, data: { id } });
  } catch (err: any) {
    if (err?.code === "23503") {
      res.status(409).json({ success: false, error: { code: "IN_USE", message: "User is referenced by other records" } });
      return;
    }
    throw err;
  }
});

export default router;
