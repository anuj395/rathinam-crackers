import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../lib/auth.js";
import { db, usersTable, rolesTable, rolePermissionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { verifyApiToken } from "../routes/v1/apiTokens.js";

export interface AuthRequest extends Request {
  user?: { id: string; role: string; scopes?: string[] };
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing token" } });
    return;
  }
  const raw = auth.slice(7).trim();

  // Long-lived third-party API tokens (rkc_…) are validated against the
  // api_tokens table. They map to a synthetic admin-equivalent user so
  // existing routes and audit logging continue to work unchanged.
  if (raw.startsWith("rkc_")) {
    verifyApiToken(raw)
      .then((mapped) => {
        if (!mapped) {
          res.status(401).json({ success: false, error: { code: "INVALID_TOKEN", message: "Invalid, revoked or expired API token" } });
          return;
        }
        req.user = { id: mapped.id, role: mapped.role, scopes: mapped.scopes };
        next();
      })
      .catch(() => {
        res.status(500).json({ success: false, error: { code: "AUTH_FAILED", message: "Could not verify API token" } });
      });
    return;
  }

  try {
    const payload = verifyToken(raw);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ success: false, error: { code: "INVALID_TOKEN", message: "Invalid or expired token" } });
  }
}

/** RBAC guard. Use AFTER authenticate(). Returns 403 for any role not in `allowed`. */
export function requireRole(...allowed: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (!role || !allowed.includes(role)) {
      res.status(403).json({
        success: false,
        error: { code: "FORBIDDEN", message: "Insufficient permissions" },
      });
      return;
    }
    next();
  };
}

// Tiny in-process cache so we don't do 2 SQL hops on every request. Expires
// quickly (30s) to keep custom-role edits responsive.
const permsCache = new Map<string, { at: number; perms: Set<string> }>();
const PERMS_TTL = 30_000;

async function permsForRole(roleName: string): Promise<Set<string>> {
  const hit = permsCache.get(roleName);
  if (hit && Date.now() - hit.at < PERMS_TTL) return hit.perms;
  const role = (await db.select({ id: rolesTable.id }).from(rolesTable).where(eq(rolesTable.name, roleName)).limit(1))[0];
  if (!role) {
    const empty = new Set<string>();
    permsCache.set(roleName, { at: Date.now(), perms: empty });
    return empty;
  }
  const rows = await db.select({ key: rolePermissionsTable.permissionKey }).from(rolePermissionsTable).where(eq(rolePermissionsTable.roleId, role.id));
  const set = new Set(rows.map((r) => r.key));
  permsCache.set(roleName, { at: Date.now(), perms: set });
  return set;
}

export function clearPermissionsCache(roleName?: string) {
  if (roleName) permsCache.delete(roleName);
  else permsCache.clear();
}

/**
 * Permission guard. Use AFTER authenticate(). SUPER_ADMIN always passes.
 * Looks up the user's role in the `roles` table and checks if `permission`
 * is granted via `role_permissions`.
 */
export function requirePermission(permission: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (!role) {
      res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Login required" } });
      return;
    }
    if (role === "SUPER_ADMIN") return next();
    // API tokens are explicitly scoped — they must list this permission key
    // (or the wildcard "*") to be allowed in. No implicit free pass.
    if (role === "API_TOKEN") {
      const scopes = req.user?.scopes ?? [];
      if (scopes.includes("*") || scopes.includes(permission)) return next();
      res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: `API token missing scope: ${permission}` } });
      return;
    }
    try {
      const perms = await permsForRole(role);
      if (!perms.has(permission)) {
        res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: `Missing permission: ${permission}` } });
        return;
      }
      next();
    } catch (err) {
      res.status(500).json({ success: false, error: { code: "PERM_LOOKUP_FAILED", message: "Could not verify permissions" } });
    }
  };
}

// Re-export so route files can avoid importing usersTable directly when they
// just need a freshly-loaded user object.
export async function loadUser(id: string) {
  const rows = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  return rows[0];
}
