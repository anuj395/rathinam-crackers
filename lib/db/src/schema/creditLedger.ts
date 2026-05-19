import { pgTable, text, timestamp, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const creditLedgerTable = pgTable("credit_ledger", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  customerId: text("customer_id").notNull(),
  type: text("type", { enum: ["DEBIT","CREDIT","PAYMENT","ADJUSTMENT"] }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  runningBalance: decimal("running_balance", { precision: 12, scale: 2 }).notNull(),
  reference: text("reference"),
  refType: text("ref_type"),
  refId: text("ref_id"),
  notes: text("notes"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const loyaltyLedgerTable = pgTable("loyalty_ledger", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  customerId: text("customer_id").notNull(),
  type: text("type", { enum: ["EARN","REDEEM","EXPIRE","ADJUST"] }).notNull(),
  points: decimal("points", { precision: 10, scale: 0 }).notNull(),
  referenceId: text("reference_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCreditLedgerSchema = createInsertSchema(creditLedgerTable).omit({ id: true, createdAt: true });
export type InsertCreditLedger = z.infer<typeof insertCreditLedgerSchema>;
export type CreditLedger = typeof creditLedgerTable.$inferSelect;
