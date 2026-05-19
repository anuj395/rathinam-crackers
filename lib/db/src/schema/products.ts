import { pgTable, text, timestamp, boolean, jsonb, integer } from "drizzle-orm/pg-core";
// occasions: string[] of CMS occasion keys (e.g. ["diwali","wedding"]).
// Empty / null means "no occasion tag" — product still appears in unfiltered lists.
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const productsTable = pgTable("products", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  // Category is now a free-form text field that mirrors `categoriesTable.name`.
  // Kept as a string (not a FK) so legacy data and reseeded categories stay
  // resilient. The ERP `/categories` page is the source of truth.
  category: text("category").notNull(),
  description: text("description"),
  // Short tagline for product cards on the website (1 line).
  shortDescription: text("short_description"),
  // Bullet-point safety / usage notes shown on the product page.
  safetyInfo: text("safety_info"),
  hsnCode: text("hsn_code"),
  // Per-product GST override as a percentage (0–28). NULL means "fall back
  // to the HSN slab map, then to the default rate" — see lib/tax.ts.
  gstRate: integer("gst_rate"),
  onlineDisplay: boolean("online_display").notNull().default(false),
  featured: boolean("featured").notNull().default(false),
  imageUrl: text("image_url"),
  // Extra image URLs for the product gallery on the website.
  gallery: text("gallery").array().notNull().default(sql`ARRAY[]::text[]`),
  // Free-form key/value spec sheet, e.g. {"Shots":"60","Duration":"45s"}.
  specs: jsonb("specs").$type<Record<string, string>>().notNull().default({}),
  // SEO metadata used by the website's <Seo> helper.
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  status: text("status", { enum: ["Active","Discontinued"] }).notNull().default("Active"),
  // variants stored as JSON: [{variantId, size, packContent, unit, prices:{purchase,wholesaleBulk,retailOnline,retailEst,agent}}]
  variants: jsonb("variants").$type<ProductVariant[]>().notNull().default([]),
  occasions: text("occasions").array().notNull().default(sql`ARRAY[]::text[]`),
  reorderLevel: integer("reorder_level").default(10),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ProductVariant = {
  variantId: string;
  size: string;
  packContent?: string;
  unit?: string;
  brand?: string;
  prices: {
    purchase: number;
    wholesaleBulk: number;
    retailOnline: number;
    retailEst: number;
    agent: number;
  };
};

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
