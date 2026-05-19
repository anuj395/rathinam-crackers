import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Long-lived API tokens for third-party integrations. The plaintext token is
// shown to the operator exactly once at creation time; only its sha256 hash
// is persisted. `prefix` is a short non-secret identifier (first chars of the
// token) shown in the ERP so users can recognise which token is which.
export const apiTokensTable = pgTable("api_tokens", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  prefix: text("prefix").notNull().unique(),
  tokenHash: text("token_hash").notNull(),
  // Free-form scope strings for future use (e.g. "products:read", "*"). For
  // now an empty array means "full access" — gate fine-grained checks later.
  scopes: text("scopes").array().notNull().default(sql`ARRAY[]::text[]`),
  createdById: text("created_by_id"),
  expiresAt: timestamp("expires_at"),
  lastUsedAt: timestamp("last_used_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ApiToken = typeof apiTokensTable.$inferSelect;
