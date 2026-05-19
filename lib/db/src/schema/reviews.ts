import { pgTable, text, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";

export const productReviewsTable = pgTable("product_reviews", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull(),
  authorName: text("author_name").notNull(),
  city: text("city"),
  rating: integer("rating").notNull(),
  title: text("title"),
  body: text("body").notNull(),
  verified: boolean("verified").default(false).notNull(),
  status: text("status").default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("product_reviews_product_idx").on(t.productId),
  index("product_reviews_status_idx").on(t.status),
]);

export type ProductReview = typeof productReviewsTable.$inferSelect;
export type InsertProductReview = typeof productReviewsTable.$inferInsert;
