import { pgTable, text, timestamp, boolean, integer, decimal } from "drizzle-orm/pg-core";
// boolean used for emailVerified column below
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const customersTable = pgTable("customers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  email: text("email"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  gstin: text("gstin"),
  customerType: text("customer_type", { enum: ["RETAIL","WHOLESALE","AGENT_CUSTOMER","VIP","WALK_IN"] }).notNull().default("RETAIL"),
  agentId: text("agent_id"),
  creditLimit: decimal("credit_limit", { precision: 12, scale: 2 }).default("0"),
  outstandingBalance: decimal("outstanding_balance", { precision: 12, scale: 2 }).notNull().default("0"),
  loyaltyPoints: integer("loyalty_points").notNull().default(0),
  passwordHash: text("password_hash"),
  emailVerified: boolean("email_verified").notNull().default(false),
  // How the customer first entered the system. "website" = self-signed up
  // through the public storefront; "pos" = walk-in added by a cashier;
  // "erp" = staff-added (back-office data entry / agent on behalf of buyer);
  // "import" = bulk loaded from a spreadsheet or external system. Used by
  // the ERP customer list/detail to show provenance and by analytics to
  // segment online vs offline acquisition.
  source: text("source", { enum: ["website", "pos", "erp", "import"] }).notNull().default("erp"),
  status: text("status", { enum: ["active","inactive"] }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCustomerSchema = createInsertSchema(customersTable).omit({ id: true, createdAt: true, updatedAt: true, outstandingBalance: true, loyaltyPoints: true });
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customersTable.$inferSelect;
