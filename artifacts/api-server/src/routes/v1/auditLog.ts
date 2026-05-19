import { Router } from "express";
import { db, auditLogTable, usersTable } from "@workspace/db";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { authenticate, requireRole, type AuthRequest } from "../../middleware/authenticate.js";

const router = Router();

router.get(
  "/audit-log",
  authenticate,
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (req: AuthRequest, res) => {
    const {
      entityType,
      actorUserId,
      action,
      from,
      to,
      page = "1",
      limit = "25",
    } = req.query as Record<string, string>;
    // Clamp pagination so a malformed ?limit=0 or ?page=foo can't crash the
    // route or produce pages=Infinity.
    const pgRaw = Number.parseInt(page, 10);
    const limRaw = Number.parseInt(limit, 10);
    const pg = Number.isFinite(pgRaw) && pgRaw > 0 ? pgRaw : 1;
    const lim = Number.isFinite(limRaw) && limRaw > 0 ? Math.min(100, limRaw) : 25;
    const offset = (pg - 1) * lim;

    const safeDate = (s: string): Date | null => {
      const d = new Date(s);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    const conditions = [] as ReturnType<typeof eq>[];
    if (entityType) conditions.push(eq(auditLogTable.entityType, entityType));
    if (actorUserId) conditions.push(eq(auditLogTable.actorUserId, actorUserId));
    if (action) conditions.push(eq(auditLogTable.action, action));
    if (from) {
      const d = safeDate(from);
      if (d) conditions.push(gte(auditLogTable.createdAt, d));
    }
    if (to) {
      const d = safeDate(to);
      if (d) conditions.push(lte(auditLogTable.createdAt, d));
    }
    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, countRows] = await Promise.all([
      db
        .select({
          id: auditLogTable.id,
          actorUserId: auditLogTable.actorUserId,
          actorRole: auditLogTable.actorRole,
          actorName: usersTable.name,
          action: auditLogTable.action,
          entityType: auditLogTable.entityType,
          entityId: auditLogTable.entityId,
          before: auditLogTable.before,
          after: auditLogTable.after,
          ip: auditLogTable.ip,
          userAgent: auditLogTable.userAgent,
          createdAt: auditLogTable.createdAt,
        })
        .from(auditLogTable)
        .leftJoin(usersTable, eq(auditLogTable.actorUserId, usersTable.id))
        .where(where)
        .orderBy(desc(auditLogTable.createdAt))
        .limit(lim)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(auditLogTable).where(where),
    ]);

    const total = Number(countRows[0]?.count ?? 0);
    res.json({
      success: true,
      data: rows,
      meta: { page: pg, limit: lim, total, pages: Math.ceil(total / lim) },
    });
  },
);

router.get(
  "/audit-log/entity-types",
  authenticate,
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (_req, res) => {
    const rows = await db
      .selectDistinct({ entityType: auditLogTable.entityType })
      .from(auditLogTable);
    res.json({ success: true, data: rows.map((r) => r.entityType).filter(Boolean) });
  },
);

// Distinct list of actors that have written to the audit log.
// Backs the "Who" filter on the Activity page. Available to both
// SUPER_ADMIN and ADMIN — unlike /users, which is SUPER_ADMIN-only.
router.get(
  "/audit-log/actors",
  authenticate,
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (_req, res) => {
    const rows = await db
      .selectDistinct({
        id: auditLogTable.actorUserId,
        name: usersTable.name,
      })
      .from(auditLogTable)
      .leftJoin(usersTable, eq(auditLogTable.actorUserId, usersTable.id));
    const actors = rows
      .filter((r): r is { id: string; name: string | null } => Boolean(r.id))
      .map((r) => ({ id: r.id, name: r.name ?? "(unknown user)" }))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json({ success: true, data: actors });
  },
);

export default router;
