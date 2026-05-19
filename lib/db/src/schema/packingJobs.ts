import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const packingJobsTable = pgTable("packing_jobs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  jobNumber: text("job_number").notNull().unique(),
  locationId: text("location_id").notNull(),
  rawMaterials: jsonb("raw_materials").$type<Array<{productId:string;variantId:string;qty:number}>>().notNull().default([]),
  finishedGoods: jsonb("finished_goods").$type<Array<{productId:string;variantId:string;qty:number}>>().notNull().default([]),
  wasteItems: jsonb("waste_items").$type<Array<{productId:string;variantId:string;qty:number}>>().default([]),
  status: text("status", { enum: ["pending","in_progress","completed"] }).notNull().default("pending"),
  notes: text("notes"),
  completedAt: timestamp("completed_at"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPackingJobSchema = createInsertSchema(packingJobsTable).omit({ id: true, jobNumber: true, createdAt: true });
export type InsertPackingJob = z.infer<typeof insertPackingJobSchema>;
export type PackingJob = typeof packingJobsTable.$inferSelect;
