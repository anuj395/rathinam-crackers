import { pgTable, text, timestamp, boolean, decimal, jsonb, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type EstimateLineItem = {
  productId: string;
  productName: string;
  variantId: string;
  variantSize: string;
  qty: number;
  resolvedPrice: number;
  resolutionReason: string;
  bulkRateApplied: boolean;
  amount: number;
};

export const estimatesTable = pgTable("estimates", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  estimateNo: text("estimate_no").notNull().unique(),
  type: text("type", { enum: ["WHOLESALE","RETAIL","AGENT"] }).notNull(),
  customerId: text("customer_id"),
  customerName: text("customer_name"),
  agentId: text("agent_id"),
  priceListId: text("price_list_id"),
  items: jsonb("items").$type<EstimateLineItem[]>().notNull().default([]),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  couponCode: text("coupon_code"),
  couponDiscount: decimal("coupon_discount", { precision: 12, scale: 2 }).default("0"),
  total: decimal("total", { precision: 12, scale: 2 }).notNull().default("0"),
  status: text("status", { enum: ["draft","confirmed","converted","cancelled"] }).notNull().default("draft"),
  convertedInvoiceId: text("converted_invoice_id"),
  stockReserved: boolean("stock_reserved").notNull().default(false),
  notes: text("notes"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertEstimateSchema = createInsertSchema(estimatesTable).omit({ id: true, estimateNo: true, createdAt: true, updatedAt: true });
export type InsertEstimate = z.infer<typeof insertEstimateSchema>;
export type Estimate = typeof estimatesTable.$inferSelect;
