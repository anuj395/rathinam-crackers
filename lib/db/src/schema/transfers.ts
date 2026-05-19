import { pgTable, text, timestamp, jsonb, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type TransferItem = {
  productId: string;
  productName: string;
  variantId: string;
  qty: number;
  receivedQty: number;
  batchNo?: string;
};

export const transfersTable = pgTable("transfers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  transferNo: text("transfer_no").notNull().unique(),
  fromLocationId: text("from_location_id").notNull(),
  fromLocationName: text("from_location_name"),
  toLocationId: text("to_location_id").notNull(),
  toLocationName: text("to_location_name"),
  status: text("status", { enum: ["draft","pending_approval","in_transit","received","cancelled"] }).notNull().default("draft"),
  items: jsonb("items").$type<TransferItem[]>().notNull().default([]),
  vehicleNo: text("vehicle_no"),
  notes: text("notes"),
  dispatchedAt: timestamp("dispatched_at"),
  receivedAt: timestamp("received_at"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTransferSchema = createInsertSchema(transfersTable).omit({ id: true, transferNo: true, createdAt: true, updatedAt: true });
export type InsertTransfer = z.infer<typeof insertTransferSchema>;
export type Transfer = typeof transfersTable.$inferSelect;
