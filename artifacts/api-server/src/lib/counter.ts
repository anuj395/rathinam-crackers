import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

// Atomic counter — relies on Postgres `INSERT ... ON CONFLICT DO UPDATE
// RETURNING` so two concurrent callers can never observe the same `next` value.
// Previously a read-then-write pattern could hand out duplicate INV/RTN/CN
// numbers under POS rush load, breaking the unique constraints downstream.
async function getAndIncrement(key: string, prefix: string, pad = 5): Promise<string> {
  // settings.value is jsonb, so we must cast through text before incrementing
  // and wrap the result with to_jsonb to keep the column type happy.
  const [row] = await db
    .insert(settingsTable)
    .values({ key, value: 1 })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value: sql`to_jsonb((${settingsTable.value})::text::int + 1)` },
    })
    .returning({ value: settingsTable.value });
  const next = Number((row?.value as number | string | undefined) ?? 1);
  return `${prefix}${String(next).padStart(pad, "0")}`;
}

export const nextEstimateNo = () => getAndIncrement("counter_estimate", "EST", 5);
export const nextInvoiceNo = () => getAndIncrement("counter_invoice", "INV", 5);
export const nextPoNumber = () => getAndIncrement("counter_po", "PO", 5);
export const nextTransferNo = () => getAndIncrement("counter_transfer", "TRF", 5);
export const nextPackingJobNo = () => getAndIncrement("counter_packing", "PKG", 5);
export const nextReturnNo = () => getAndIncrement("counter_return", "RTN", 5);
export const nextCreditNoteNo = () => getAndIncrement("counter_credit_note", "CN", 5);
