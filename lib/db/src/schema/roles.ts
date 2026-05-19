import { pgTable, text, timestamp, boolean, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const rolesTable = pgTable("roles", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(),
  description: text("description"),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const permissionsTable = pgTable("permissions", {
  key: text("key").primaryKey(),
  description: text("description").notNull(),
  category: text("category").notNull().default("general"),
});

export const rolePermissionsTable = pgTable(
  "role_permissions",
  {
    roleId: text("role_id").notNull().references(() => rolesTable.id, { onDelete: "cascade" }),
    permissionKey: text("permission_key").notNull().references(() => permissionsTable.key, { onDelete: "cascade" }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.roleId, t.permissionKey] }) }),
);

export const insertRoleSchema = createInsertSchema(rolesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRole = z.infer<typeof insertRoleSchema>;
export type Role = typeof rolesTable.$inferSelect;
export type Permission = typeof permissionsTable.$inferSelect;
