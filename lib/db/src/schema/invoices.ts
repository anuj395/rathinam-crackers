import { pgTable, text, timestamp, decimal, jsonb, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { type EstimateLineItem } from "./estimates";

export const invoicesTable = pgTable("invoices", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  invoiceNo: text("invoice_no").notNull().unique(),
  customerId: text("customer_id"),
  customerName: text("customer_name"),
  customerGstin: text("customer_gstin"),
  agentId: text("agent_id"),
  locationId: text("location_id"),
  priceListId: text("price_list_id"),
  estimateId: text("estimate_id"),
  items: jsonb("items").$type<EstimateLineItem[]>().notNull().default([]),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull(),
  discountAmount: decimal("discount_amount", { precision: 12, scale: 2 }).default("0"),
  couponCode: text("coupon_code"),
  couponDiscount: decimal("coupon_discount", { precision: 12, scale: 2 }).default("0"),
  loyaltyPointsRedeemed: integer("loyalty_points_redeemed").default(0),
  loyaltyDiscount: decimal("loyalty_discount", { precision: 12, scale: 2 }).default("0"),
  taxableAmount: decimal("taxable_amount", { precision: 12, scale: 2 }).notNull(),
  cgst: decimal("cgst", { precision: 12, scale: 2 }).default("0"),
  sgst: decimal("sgst", { precision: 12, scale: 2 }).default("0"),
  igst: decimal("igst", { precision: 12, scale: 2 }).default("0"),
  total: decimal("total", { precision: 12, scale: 2 }).notNull(),
  paymentMode: text("payment_mode", { enum: ["CASH","UPI","CARD","CREDIT","SPLIT"] }).notNull(),
  channel: text("channel", { enum: ["RETAIL","WHOLESALE","AGENT","ONLINE","POS"] }).notNull().default("RETAIL"),
  financialYear: text("financial_year").notNull(),
  status: text("status", { enum: ["paid","credit","cancelled"] }).notNull().default("paid"),
  pdfUrl: text("pdf_url"),
  logisticsDetails: jsonb("logistics_details"),
  shiftId: text("shift_id"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertInvoiceSchema = createInsertSchema(invoicesTable).omit({ id: true, invoiceNo: true, createdAt: true });
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoicesTable.$inferSelect;
