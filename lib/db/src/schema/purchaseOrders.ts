import { pgTable, text, timestamp, decimal, jsonb, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type POItem = {
  productId: string;
  productName: string;
  variantId: string;
  orderedQty: number;
  receivedQty: number;
  unitPrice: number;
};

export const purchaseOrdersTable = pgTable("purchase_orders", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  poNumber: text("po_number").notNull().unique(),
  supplierId: text("supplier_id").notNull(),
  supplierName: text("supplier_name"),
  warehouseId: text("warehouse_id").notNull(),
  status: text("status", { enum: ["draft","sent","partial","received","cancelled"] }).notNull().default("draft"),
  items: jsonb("items").$type<POItem[]>().notNull().default([]),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  expectedDate: text("expected_date"),
  notes: text("notes"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrdersTable).omit({ id: true, poNumber: true, createdAt: true, updatedAt: true });
export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;
export type PurchaseOrder = typeof purchaseOrdersTable.$inferSelect;
