import { pgTable, text, timestamp, decimal, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type CommissionTier = { from: number; to: number; rate: number };

export const agentsTable = pgTable("agents", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id"),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  promoCode: text("promo_code").unique(),
  commissionTiers: jsonb("commission_tiers").$type<CommissionTier[]>().default([]),
  maxDiscountPct: decimal("max_discount_pct", { precision: 5, scale: 2 }).default("0"),
  monthlyTarget: decimal("monthly_target", { precision: 12, scale: 2 }).default("0"),
  status: text("status", { enum: ["active","inactive"] }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAgentSchema = createInsertSchema(agentsTable).omit({ id: true, createdAt: true });
export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Agent = typeof agentsTable.$inferSelect;
