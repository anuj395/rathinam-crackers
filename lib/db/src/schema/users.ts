import { pgTable, text, timestamp, boolean, integer, decimal, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  pin: text("pin"),
  // Free-text role name; resolved against the `roles` table for permission
  // lookups. Built-in defaults: SUPER_ADMIN, ERP_MANAGER, ACCOUNTANT, AGENT,
  // WH_MANAGER, CASHIER. Admins can mint additional roles at runtime.
  role: text("role").notNull().default("CASHIER"),
  locationIds: jsonb("location_ids").$type<string[]>().default([]),
  email: text("email"),
  phone: text("phone"),
  maxDiscountPct: decimal("max_discount_pct", { precision: 5, scale: 2 }).default("0"),
  isActive: boolean("is_active").notNull().default(true),
  refreshToken: text("refresh_token"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
