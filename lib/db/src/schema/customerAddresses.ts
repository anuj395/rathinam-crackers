import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const customerAddressesTable = pgTable("customer_addresses", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  customerId: text("customer_id").notNull(),
  label: text("label"),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  line1: text("line1").notNull(),
  line2: text("line2"),
  city: text("city").notNull(),
  state: text("state").notNull(),
  pincode: text("pincode").notNull(),
  landmark: text("landmark"),
  addressType: text("address_type", { enum: ["shipping", "billing", "both"] }).notNull().default("both"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type CustomerAddress = typeof customerAddressesTable.$inferSelect;
