import { pgTable, text, timestamp, primaryKey } from "drizzle-orm/pg-core";

export const customerWishlistTable = pgTable(
  "customer_wishlist",
  {
    customerId: text("customer_id").notNull(),
    productId: text("product_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.customerId, t.productId] }),
  }),
);

export type WishlistItem = typeof customerWishlistTable.$inferSelect;
