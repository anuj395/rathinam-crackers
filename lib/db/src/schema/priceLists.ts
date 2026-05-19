import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const priceListsTable = pgTable("price_lists", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  season: text("season").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  validFrom: text("valid_from"),
  validUntil: text("valid_until"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPriceListSchema = createInsertSchema(priceListsTable).omit({ id: true, createdAt: true });
export type InsertPriceList = z.infer<typeof insertPriceListSchema>;
export type PriceList = typeof priceListsTable.$inferSelect;
