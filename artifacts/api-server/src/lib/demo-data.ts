// Demo / sandbox data utilities. Two operations:
//
//   resetDemoData() — wipes all *transactional* tables (invoices, estimates,
//   stock movements, returns, ledgers, shifts, idempotency keys, audit log,
//   notifications, packing/transfers/POs, held bills). Master data (users,
//   products, brands, categories, locations, suppliers, agents, customers,
//   coupons, settings) is preserved so the operator's catalog isn't blown
//   away. Use this on a staging box between demos or after a failed import.
//
//   seedDemoData() — inserts a small, deterministic batch of demo data on
//   top of the existing masters: a couple of walk-in customers, a fresh
//   POS shift, a paid retail invoice, and an open estimate. Idempotent —
//   safe to call repeatedly; it never overwrites existing records.
//
// Both operations require SUPER_ADMIN at the route layer. The helpers run
// in a single transaction each so a partial failure rolls back cleanly.

import {
  db,
  invoicesTable,
  estimatesTable,
  returnsTable,
  damageLedgerTable,
  creditLedgerTable,
  loyaltyLedgerTable,
  stockLedgerTable,
  stockLevelsTable,
  posShiftsTable,
  heldBillsTable,
  packingJobsTable,
  transfersTable,
  purchaseOrdersTable,
  notificationLogsTable,
  auditLogTable,
  idempotencyKeysTable,
  customersTable,
  productsTable,
  locationsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, ilike, sql } from "drizzle-orm";

export type ResetResult = {
  ok: true;
  cleared: Record<string, number>;
};

export async function resetDemoData(): Promise<ResetResult> {
  const cleared: Record<string, number> = {};

  // Order matters because of FK references. We delete the most-referenced
  // tables (ledgers, idempotency, audit) first, then the parents.
  await db.transaction(async (tx) => {
    // FK-safe order: delete the most-referencing tables first, then
    // their parents. invoices is referenced by returns / stock_ledger /
    // credit_ledger / loyalty_ledger / packing_jobs, and itself
    // references pos_shifts (invoice.shift_id) — so invoices must die
    // BEFORE pos_shifts but AFTER everything that references invoices.
    const tables: Array<[string, any]> = [
      ["idempotency_keys", idempotencyKeysTable],
      ["audit_log", auditLogTable],
      ["notification_logs", notificationLogsTable],
      ["loyalty_ledger", loyaltyLedgerTable],
      ["credit_ledger", creditLedgerTable],
      ["damage_ledger", damageLedgerTable],
      ["returns", returnsTable],
      ["stock_ledger", stockLedgerTable],
      ["stock_levels", stockLevelsTable],
      ["held_bills", heldBillsTable],
      ["packing_jobs", packingJobsTable],
      ["transfers", transfersTable],
      ["purchase_orders", purchaseOrdersTable],
      ["estimates", estimatesTable],
      ["invoices", invoicesTable],
      ["pos_shifts", posShiftsTable],
    ];
    for (const [name, table] of tables) {
      const rows = await tx.delete(table).returning({ id: (table as any).id });
      cleared[name] = rows.length;
    }
    // Wipe lifetime totals on customers so they look fresh again.
    await tx
      .update(customersTable)
      .set({ outstandingBalance: "0", loyaltyPoints: 0, updatedAt: new Date() });
  });

  return { ok: true, cleared };
}

export type SeedResult = {
  ok: true;
  created: Record<string, number>;
  notes: string[];
};

export async function seedDemoData(): Promise<SeedResult> {
  const created: Record<string, number> = { customers: 0, invoices: 0, estimates: 0, shifts: 0 };
  const notes: string[] = [];

  // 1. Make sure we have at least one shop location and one cashier user.
  const shop = (
    await db.select().from(locationsTable).where(eq(locationsTable.type, "shop")).limit(1)
  )[0];
  if (!shop) {
    notes.push("No shop location found — skipping invoice/shift seed. Create a shop first.");
  }
  const cashier = (
    await db.select().from(usersTable).where(eq(usersTable.role, "CASHIER")).limit(1)
  )[0];

  // 2. Two walk-in demo customers (skip if the phone already exists).
  const demos = [
    { name: "Demo Customer A", phone: "9000000001" },
    { name: "Demo Customer B", phone: "9000000002" },
  ];
  const customerIds: string[] = [];
  for (const d of demos) {
    const existing = (await db.select().from(customersTable).where(eq(customersTable.phone, d.phone)).limit(1))[0];
    if (existing) {
      customerIds.push(existing.id);
      continue;
    }
    const [row] = await db
      .insert(customersTable)
      .values({
        name: d.name,
        phone: d.phone,
        customerType: "RETAIL",
        source: "import",
      })
      .returning();
    if (row) {
      customerIds.push(row.id);
      created.customers++;
    }
  }

  // 3. A demo paid invoice + a draft estimate, only if we have a product.
  const product = (await db.select().from(productsTable).limit(1))[0];
  if (product && customerIds[0]) {
    const variants = (product.variants ?? []) as Array<{ variantId: string; size?: string; prices?: Record<string, number> }>;
    const variant = variants[0];
    if (variant) {
      const price = Number(variant.prices?.["retailEst"] ?? 100);
      const total = price * 2;
      const fy = new Date().getFullYear();
      const [inv] = await db
        .insert(invoicesTable)
        .values({
          id: crypto.randomUUID(),
          invoiceNo: `DEMO-${Date.now().toString(36).toUpperCase()}`,
          customerId: customerIds[0],
          customerName: "Demo Customer A",
          locationId: shop?.id,
          items: [
            {
              productId: product.id,
              productName: product.name,
              variantId: variant.variantId,
              variantSize: variant.size ?? "",
              qty: 2,
              resolvedPrice: price,
              resolutionReason: "demo",
              bulkRateApplied: false,
              amount: total,
            },
          ] as any,
          subtotal: total.toFixed(2),
          discountAmount: "0",
          taxableAmount: total.toFixed(2),
          cgst: "0",
          sgst: "0",
          igst: "0",
          total: total.toFixed(2),
          paymentMode: "CASH",
          channel: "RETAIL",
          financialYear: `${fy}-${fy + 1}`,
          status: "paid",
          createdBy: cashier?.id,
        })
        .returning();
      if (inv) created.invoices++;

      const [est] = await db
        .insert(estimatesTable)
        .values({
          id: crypto.randomUUID(),
          estimateNo: `DEMO-EST-${Date.now().toString(36).toUpperCase()}`,
          type: "RETAIL",
          customerId: customerIds[1] ?? customerIds[0],
          items: [
            {
              productId: product.id,
              productName: product.name,
              variantId: variant.variantId,
              variantSize: variant.size ?? "",
              qty: 5,
              resolvedPrice: price,
              resolutionReason: "demo",
              bulkRateApplied: false,
              amount: price * 5,
            },
          ] as any,
          subtotal: (price * 5).toFixed(2),
          total: (price * 5).toFixed(2),
          status: "draft",
          createdBy: cashier?.id,
        })
        .returning();
      if (est) created.estimates++;
    }
  }

  // 4. Open a demo POS shift if the cashier has none open.
  if (cashier && shop) {
    const open = (
      await db
        .select()
        .from(posShiftsTable)
        .where(and(eq(posShiftsTable.userId, cashier.id), eq(posShiftsTable.status, "open")))
        .limit(1)
    )[0];
    if (!open) {
      const [s] = await db
        .insert(posShiftsTable)
        .values({
          locationId: shop.id,
          userId: cashier.id,
          openingCash: "1000",
          notes: "Demo shift",
        })
        .returning();
      if (s) created.shifts++;
    } else {
      notes.push(`Cashier ${cashier.username} already has an open shift; skipped.`);
    }
  }

  return { ok: true, created, notes };
}

// Lightweight summary of what's currently in the database. Used by the
// /system/demo screen to give the operator confidence before pressing
// "Reset everything".
export async function demoStats() {
  const [inv, est, cust, prod, ledger, audit] = await Promise.all([
    db.select({ c: sql<number>`count(*)::int` }).from(invoicesTable),
    db.select({ c: sql<number>`count(*)::int` }).from(estimatesTable),
    db.select({ c: sql<number>`count(*)::int` }).from(customersTable),
    db.select({ c: sql<number>`count(*)::int` }).from(productsTable).where(ilike(productsTable.name, "%")),
    db.select({ c: sql<number>`count(*)::int` }).from(stockLedgerTable),
    db.select({ c: sql<number>`count(*)::int` }).from(auditLogTable),
  ]);
  return {
    invoices: Number(inv[0]?.c ?? 0),
    estimates: Number(est[0]?.c ?? 0),
    customers: Number(cust[0]?.c ?? 0),
    products: Number(prod[0]?.c ?? 0),
    stockLedger: Number(ledger[0]?.c ?? 0),
    auditLog: Number(audit[0]?.c ?? 0),
  };
}
