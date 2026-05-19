import { db, auditLogTable } from "@workspace/db";
import type { Request } from "express";
import type { AuthRequest } from "../middleware/authenticate.js";

export type AuditAction = "CREATE" | "UPDATE" | "DELETE";

interface AuditOpts {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

/**
 * Append an immutable row to the admin audit log. Failures are swallowed and
 * logged so the user-visible write never fails just because logging failed.
 *
 * Pass the same Express request the route received — the helper extracts the
 * authenticated user, role, IP and user-agent for you.
 */
export async function auditWrite(
  req: AuthRequest | Request,
  { action, entityType, entityId, before, after }: AuditOpts,
): Promise<void> {
  try {
    const auth = req as AuthRequest;
    const ip =
      (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
      (req.socket as { remoteAddress?: string } | undefined)?.remoteAddress ||
      null;
    const ua = (req.headers["user-agent"] as string | undefined) ?? null;
    await db.insert(auditLogTable).values({
      actorUserId: auth.user?.id ?? null,
      actorRole: auth.user?.role ?? null,
      action,
      entityType,
      entityId: entityId ?? null,
      before: (before ?? null) as never,
      after: (after ?? null) as never,
      ip,
      userAgent: ua,
    });
  } catch (err) {
    // Logging failures must never break the actual write path.
    // eslint-disable-next-line no-console
    console.error("[audit] failed to record:", err);
  }
}
