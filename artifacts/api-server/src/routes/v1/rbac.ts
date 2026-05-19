import { Router } from "express";
import { db, rolesTable, permissionsTable, rolePermissionsTable, usersTable } from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";
import { authenticate, requireRole, clearPermissionsCache } from "../../middleware/authenticate.js";
import type { AuthRequest } from "../../middleware/authenticate.js";

const router = Router();

// Only privileged operators can manage RBAC.
const adminGuard = [authenticate, requireRole("SUPER_ADMIN", "ERP_MANAGER")];

router.get("/rbac/permissions", ...adminGuard, async (_req, res) => {
  const rows = await db.select().from(permissionsTable).orderBy(permissionsTable.category, permissionsTable.key);
  res.json({ success: true, data: rows });
});

router.get("/rbac/roles", ...adminGuard, async (_req, res) => {
  const roles = await db.select().from(rolesTable).orderBy(rolesTable.name);
  if (roles.length === 0) {
    res.json({ success: true, data: [] });
    return;
  }
  const rps = await db
    .select({ roleId: rolePermissionsTable.roleId, key: rolePermissionsTable.permissionKey })
    .from(rolePermissionsTable)
    .where(inArray(rolePermissionsTable.roleId, roles.map((r) => r.id)));
  // Count users per role for visibility.
  const counts = await db
    .select({ role: usersTable.role, count: sql<number>`count(*)::int` })
    .from(usersTable)
    .groupBy(usersTable.role);
  const byName = new Map(counts.map((c) => [c.role, c.count]));
  const byRole = new Map<string, string[]>();
  for (const r of rps) {
    const list = byRole.get(r.roleId) ?? [];
    list.push(r.key);
    byRole.set(r.roleId, list);
  }
  res.json({
    success: true,
    data: roles.map((r) => ({
      ...r,
      permissions: byRole.get(r.id) ?? [],
      userCount: byName.get(r.name) ?? 0,
    })),
  });
});

router.post("/rbac/roles", ...adminGuard, async (req: AuthRequest, res) => {
  const { name, description, permissions } = req.body as { name: string; description?: string; permissions?: string[] };
  if (!name || !/^[A-Z][A-Z0-9_]{1,40}$/.test(name)) {
    res.status(400).json({ success: false, error: { code: "VALIDATION", message: "name must be UPPER_SNAKE (2–41 chars, starting with a letter)" } });
    return;
  }
  const existing = (await db.select().from(rolesTable).where(eq(rolesTable.name, name)).limit(1))[0];
  if (existing) {
    res.status(409).json({ success: false, error: { code: "DUPLICATE", message: "A role with this name already exists" } });
    return;
  }
  const [row] = await db.insert(rolesTable).values({ name, description: description ?? null, isSystem: false }).returning();
  if (permissions?.length) {
    await db.insert(rolePermissionsTable).values(permissions.map((k) => ({ roleId: row.id, permissionKey: k }))).onConflictDoNothing();
  }
  clearPermissionsCache(name);
  res.status(201).json({ success: true, data: { ...row, permissions: permissions ?? [] } });
});

router.put("/rbac/roles/:id", ...adminGuard, async (req: AuthRequest, res) => {
  const { id } = req.params as { id: string };
  const { description, permissions } = req.body as { description?: string; permissions?: string[] };
  const role = (await db.select().from(rolesTable).where(eq(rolesTable.id, id)).limit(1))[0];
  if (!role) {
    res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Role not found" } });
    return;
  }
  // SUPER_ADMIN must always retain full access — refuse any edit so a manager
  // cannot lock everyone out by stripping it.
  if (role.name === "SUPER_ADMIN") {
    res.status(400).json({ success: false, error: { code: "PROTECTED", message: "SUPER_ADMIN cannot be modified" } });
    return;
  }
  // Wrap in a transaction so the role is never left empty on a partial failure.
  await db.transaction(async (tx) => {
    if (description !== undefined) {
      await tx.update(rolesTable).set({ description, updatedAt: new Date() }).where(eq(rolesTable.id, id));
    }
    if (Array.isArray(permissions)) {
      await tx.delete(rolePermissionsTable).where(eq(rolePermissionsTable.roleId, id));
      if (permissions.length) {
        await tx.insert(rolePermissionsTable).values(permissions.map((k) => ({ roleId: id, permissionKey: k }))).onConflictDoNothing();
      }
    }
  });
  clearPermissionsCache(role.name);
  res.json({ success: true, data: { id, permissions: permissions ?? [] } });
});

router.delete("/rbac/roles/:id", ...adminGuard, async (req: AuthRequest, res) => {
  const { id } = req.params as { id: string };
  const role = (await db.select().from(rolesTable).where(eq(rolesTable.id, id)).limit(1))[0];
  if (!role) {
    res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Role not found" } });
    return;
  }
  if (role.isSystem || role.name === "SUPER_ADMIN") {
    res.status(400).json({ success: false, error: { code: "PROTECTED", message: "System roles cannot be deleted" } });
    return;
  }
  // Refuse if any user still uses this role.
  const inUse = (await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, role.name)).limit(1))[0];
  if (inUse) {
    res.status(409).json({ success: false, error: { code: "IN_USE", message: "Reassign users off this role before deleting" } });
    return;
  }
  await db.delete(rolesTable).where(eq(rolesTable.id, id));
  clearPermissionsCache(role.name);
  res.json({ success: true, message: "Deleted" });
});

export default router;
