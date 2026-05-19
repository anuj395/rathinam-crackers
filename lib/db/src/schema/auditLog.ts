import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

export const auditLogTable = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: text("actor_user_id"),
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    byCreatedAt: index("audit_log_created_at_idx").on(t.createdAt),
    byEntity: index("audit_log_entity_idx").on(t.entityType, t.entityId),
    byActor: index("audit_log_actor_idx").on(t.actorUserId),
  }),
);

export type AuditLogRow = typeof auditLogTable.$inferSelect;
