import { Router } from "express";
import crypto from "node:crypto";
import { db, apiTokensTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { authenticate, type AuthRequest } from "../../middleware/authenticate.js";
import { auditWrite } from "../../lib/audit.js";

const router = Router();

const isAdmin = (role?: string) => role === "SUPER_ADMIN" || role === "ADMIN";

const hashToken = (raw: string) => crypto.createHash("sha256").update(raw).digest("hex");

// Cryptographically random token. Format: rkc_<24-byte url-safe random>.
// The first 8 characters of the random part are also stored as a non-secret
// `prefix` so operators can recognise tokens in the dashboard.
const generateToken = () => {
  const random = crypto.randomBytes(24).toString("base64url");
  const token = `rkc_${random}`;
  const prefix = `rkc_${random.slice(0, 8)}`;
  return { token, prefix };
};

router.get("/api-tokens", authenticate, async (req: AuthRequest, res) => {
  if (!isAdmin(req.user?.role)) {
    res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Admin role required" } });
    return;
  }
  const rows = await db
    .select({
      id: apiTokensTable.id,
      name: apiTokensTable.name,
      prefix: apiTokensTable.prefix,
      scopes: apiTokensTable.scopes,
      createdById: apiTokensTable.createdById,
      expiresAt: apiTokensTable.expiresAt,
      lastUsedAt: apiTokensTable.lastUsedAt,
      revokedAt: apiTokensTable.revokedAt,
      createdAt: apiTokensTable.createdAt,
    })
    .from(apiTokensTable)
    .orderBy(desc(apiTokensTable.createdAt));
  res.json({ success: true, data: rows });
});

router.post("/api-tokens", authenticate, async (req: AuthRequest, res) => {
  if (!isAdmin(req.user?.role)) {
    res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Admin role required" } });
    return;
  }
  const { name, scopes, expiresAt } = req.body ?? {};
  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ success: false, error: { code: "VALIDATION", message: "Token name is required" } });
    return;
  }
  const { token, prefix } = generateToken();
  const expires = expiresAt ? new Date(expiresAt) : null;
  if (expires && Number.isNaN(expires.getTime())) {
    res.status(400).json({ success: false, error: { code: "VALIDATION", message: "Invalid expiresAt" } });
    return;
  }
  const [row] = await db
    .insert(apiTokensTable)
    .values({
      name: name.trim(),
      prefix,
      tokenHash: hashToken(token),
      scopes: Array.isArray(scopes) ? scopes.filter((s) => typeof s === "string") : [],
      createdById: req.user?.id ?? null,
      expiresAt: expires,
    })
    .returning();
  await auditWrite(req, { action: "CREATE", entityType: "apiToken", entityId: row?.id, after: { ...row, tokenHash: undefined } });
  // The plaintext token is returned ONCE — never stored or logged.
  res.status(201).json({ success: true, data: { ...row, token } });
});

router.post("/api-tokens/:id/revoke", authenticate, async (req: AuthRequest, res) => {
  if (!isAdmin(req.user?.role)) {
    res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Admin role required" } });
    return;
  }
  const id = req.params["id"] as string;
  const [row] = await db
    .update(apiTokensTable)
    .set({ revokedAt: new Date() })
    .where(eq(apiTokensTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Token not found" } });
    return;
  }
  await auditWrite(req, { action: "UPDATE", entityType: "apiToken", entityId: id, after: row });
  res.json({ success: true, data: { id, revokedAt: row.revokedAt } });
});

router.delete("/api-tokens/:id", authenticate, async (req: AuthRequest, res) => {
  if (!isAdmin(req.user?.role)) {
    res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Admin role required" } });
    return;
  }
  const id = req.params["id"] as string;
  const [row] = await db.delete(apiTokensTable).where(eq(apiTokensTable.id, id)).returning();
  if (!row) {
    res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Token not found" } });
    return;
  }
  await auditWrite(req, { action: "DELETE", entityType: "apiToken", entityId: id, before: row });
  res.json({ success: true, data: { id } });
});

// Exported so the auth middleware can verify api-token Bearer headers without
// a circular import between modules.
export async function verifyApiToken(token: string): Promise<{ id: string; role: string; scopes: string[] } | null> {
  if (!token.startsWith("rkc_")) return null;
  const hash = hashToken(token);
  const rows = await db.select().from(apiTokensTable).where(eq(apiTokensTable.tokenHash, hash)).limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;
  // Touch lastUsedAt asynchronously — do not block the request.
  db.update(apiTokensTable).set({ lastUsedAt: new Date() }).where(eq(apiTokensTable.id, row.id)).catch(() => {});
  return { id: `apitoken:${row.id}`, role: "API_TOKEN", scopes: (row.scopes ?? []) as string[] };
}

export default router;
