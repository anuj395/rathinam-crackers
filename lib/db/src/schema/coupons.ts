import { pgTable, text, timestamp, boolean, decimal, jsonb, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const couponsTable = pgTable("coupons", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  code: text("code").notNull().unique(),
  type: text("type", { enum: ["flat","percent","minorder","bxgy","bundle","firstorder","agentpromo"] }).notNull(),
  discountValue: decimal("discount_value", { precision: 10, scale: 2 }).notNull(),
  maxDiscountCap: decimal("max_discount_cap", { precision: 10, scale: 2 }),
  minOrderValue: decimal("min_order_value", { precision: 10, scale: 2 }).default("0"),
  usageLimit: integer("usage_limit"),
  usedCount: integer("used_count").notNull().default(0),
  perCustomerLimit: integer("per_customer_limit").default(1),
  applicableChannels: jsonb("applicable_channels").$type<string[]>().default([]),
  applicableCustomerTypes: jsonb("applicable_customer_types").$type<string[]>().default([]),
  status: text("status", { enum: ["active","paused","expired"] }).notNull().default("active"),
  autoApply: boolean("auto_apply").notNull().default(false),
  validFrom: text("valid_from").notNull(),
  validUntil: text("valid_until").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const couponUsagesTable = pgTable("coupon_usages", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  couponId: text("coupon_id").notNull(),
  customerId: text("customer_id"),
  invoiceId: text("invoice_id"),
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }).notNull(),
  usedAt: timestamp("used_at").defaultNow().notNull(),
});

export const insertCouponSchema = createInsertSchema(couponsTable).omit({ id: true, usedCount: true, createdAt: true });
export type InsertCoupon = z.infer<typeof insertCouponSchema>;
export type Coupon = typeof couponsTable.$inferSelect;
