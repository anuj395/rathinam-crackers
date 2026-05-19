import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Centralised asset library. Every uploaded image (product photos, gallery
 * shots, website hero banners, brand logos…) gets a row here. The actual
 * binary lives on disk under UPLOAD_DIR (configured per environment) and is
 * served by the API at GET /uploads/:filename. We keep both the original
 * full-size URL and a 400px thumbnail URL so list/grid views in the ERP and
 * the website can fetch a small image.
 */
export const mediaTable = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Stored filename on disk, e.g. "ab12cd34.webp". Globally unique. */
    filename: text("filename").notNull().unique(),
    /** Original filename the user uploaded, kept for display only. */
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    /** Public URL of the full-size asset (relative, served from /uploads/...). */
    url: text("url").notNull(),
    /** Public URL of the 400px-wide thumbnail (relative). */
    thumbnailUrl: text("thumbnail_url"),
    /** Free-text label for organising the library (e.g. "products", "banners"). */
    folder: text("folder").notNull().default("uploads"),
    /** Optional alt text for accessibility. */
    altText: text("alt_text"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    byCreatedAt: index("media_created_at_idx").on(t.createdAt),
    byFolder: index("media_folder_idx").on(t.folder),
  }),
);

export type MediaRow = typeof mediaTable.$inferSelect;
export type NewMediaRow = typeof mediaTable.$inferInsert;
