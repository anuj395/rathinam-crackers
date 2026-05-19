import { pgTable, text, timestamp, decimal, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const posShiftsTable = pgTable(
  "pos_shifts",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    locationId: text("location_id").notNull(),
    userId: text("user_id").notNull(),
    openedAt: timestamp("opened_at").defaultNow().notNull(),
    closedAt: timestamp("closed_at"),
    openingCash: decimal("opening_cash", { precision: 12, scale: 2 }).notNull().default("0"),
    closingCash: decimal("closing_cash", { precision: 12, scale: 2 }),
    totalSales: decimal("total_sales", { precision: 12, scale: 2 }).default("0"),
    cashSales: decimal("cash_sales", { precision: 12, scale: 2 }).default("0"),
    upiSales: decimal("upi_sales", { precision: 12, scale: 2 }).default("0"),
    cardSales: decimal("card_sales", { precision: 12, scale: 2 }).default("0"),
    creditSales: decimal("credit_sales", { precision: 12, scale: 2 }).default("0"),
    status: text("status", { enum: ["open","closed"] }).notNull().default("open"),
    notes: text("notes"),
  },
  (t) => ({
    oneOpenShiftPerUser: uniqueIndex("one_open_shift_per_user")
      .on(t.userId)
      .where(sql`closed_at IS NULL`),
  }),
);

// Stored shape: either the raw line items array (legacy) or a wrapper
// that bundles items with a coupon snapshot so Resume can rehydrate both.
export type HeldBillItemsPayload =
  | unknown[]
  | { lines: unknown[]; coupon: unknown };

export const heldBillsTable = pgTable("held_bills", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  locationId: text("location_id").notNull(),
  customerId: text("customer_id"),
  label: text("label"),
  items: jsonb("items").$type<HeldBillItemsPayload>().notNull().default([]),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPosShiftSchema = createInsertSchema(posShiftsTable).omit({ id: true });
export type PosShift = typeof posShiftsTable.$inferSelect;
