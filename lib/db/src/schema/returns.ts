import { pgTable, text, timestamp, decimal, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type ReturnLineItem = {
  productId: string;
  variantId: string;
  productName?: string;
  variantLabel?: string;
  qty: number;
  unitPrice?: number;
  lineTotal?: number;
  reason?: string;
};

export const returnsTable = pgTable("returns", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  returnNo: text("return_no").unique(),
  type: text("type", { enum: ["customer","supplier","online"] }).notNull(),
  // referenceId = invoice id (for customer/online) or PO id (supplier)
  referenceId: text("reference_id"),
  referenceNo: text("reference_no"),
  customerId: text("customer_id"),
  customerName: text("customer_name"),
  locationId: text("location_id"),
  items: jsonb("items").$type<ReturnLineItem[]>().notNull().default([]),
  reason: text("reason").notNull(),
  creditAmount: decimal("credit_amount", { precision: 12, scale: 2 }).default("0"),
  // How the refund was issued. CREDIT_NOTE = added to customer wallet /
  // reduces their outstanding balance. CASH = paid out from till. NONE =
  // goodwill replacement, no money movement.
  refundMode: text("refund_mode", { enum: ["CREDIT_NOTE","CASH","NONE"] }).notNull().default("CREDIT_NOTE"),
  creditNoteNo: text("credit_note_no").unique(),
  status: text("status", { enum: ["pending","approved","rejected"] }).notNull().default("approved"),
  notes: text("notes"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const damageLedgerTable = pgTable("damage_ledger", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  locationId: text("location_id").notNull(),
  productId: text("product_id").notNull(),
  variantId: text("variant_id").notNull(),
  batchNo: text("batch_no"),
  qty: decimal("qty", { precision: 10, scale: 0 }).notNull(),
  category: text("category", { enum: ["transit","storage","handling","expired","other"] }).notNull(),
  description: text("description"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertReturnSchema = createInsertSchema(returnsTable).omit({ id: true, createdAt: true });
export type InsertReturn = z.infer<typeof insertReturnSchema>;
export type Return = typeof returnsTable.$inferSelect;
