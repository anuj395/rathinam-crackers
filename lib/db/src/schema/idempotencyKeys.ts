import { pgTable, varchar, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

export const idempotencyKeysTable = pgTable(
  "idempotency_keys",
  {
    key: varchar("key", { length: 128 }).primaryKey(),
    scope: varchar("scope", { length: 64 }).notNull(),
    userId: varchar("user_id", { length: 64 }),
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    // Nullable: a row is inserted up-front (before the sale runs) to claim the
    // key and block concurrent duplicates. response/statusCode are filled in
    // once the sale succeeds. A row with response=null means "in flight".
    response: jsonb("response").$type<unknown>(),
    statusCode: text("status_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    scopeUserIdx: index("idempotency_scope_user_idx").on(t.scope, t.userId),
    createdAtIdx: index("idempotency_created_idx").on(t.createdAt),
  }),
);
