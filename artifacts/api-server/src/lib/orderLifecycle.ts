import { db, invoicesTable, customersTable, stockLedgerTable } from "@workspace/db";
import { eq, and, ne, sql } from "drizzle-orm";
import { appendLedger } from "./stockService.js";
import { sendEmail, sendWhatsapp } from "./notifier.js";

export const STAGE_ORDER = [
  "pending_confirmation",
  "confirmed",
  "packed",
  "dispatched",
  "delivered",
] as const;
export type Stage = (typeof STAGE_ORDER)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  pending_confirmation: "Order placed",
  confirmed: "Confirmed",
  packed: "Packed",
  dispatched: "Dispatched",
  delivered: "Delivered",
};

export function canTransition(from: string, to: Stage): boolean {
  const fromIdx = STAGE_ORDER.indexOf(from as Stage);
  const toIdx = STAGE_ORDER.indexOf(to);
  if (fromIdx < 0 || toIdx < 0) return false;
  return toIdx === fromIdx + 1;
}

export type Courier = {
  name: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  dispatchedAt: string;
  expectedDeliveryAt: string | null;
};

export class OrderCancelError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Cancel an online order and reverse its stock deductions.
 *
 * Concurrency-safe: takes a row-level lock on the invoice and only proceeds
 * if it is still in a cancellable state. Two concurrent cancel requests will
 * see exactly one winner; the loser sees ALREADY_CANCELLED / TOO_LATE.
 *
 * Stock restore replays the original OUT entries from `stock_ledger` (by
 * `refId`) so the IN goes back to the exact location and quantity that was
 * deducted. Falls back to "first location" only for legacy orders placed
 * before refId tracking was added.
 *
 * @param allowedStages Optional whitelist of logistics stages from which
 *   cancellation is permitted. Used by the customer-facing endpoint to block
 *   cancel-after-pack.
 */
export async function cancelOnlineOrder(
  order: any,
  reason: string,
  by: "staff" | "customer",
  actorId: string | null,
  allowedStages?: Stage[],
) {
  const now = new Date().toISOString();
  return await db.transaction(async (tx) => {
    // Lock and re-read the invoice inside the transaction so a concurrent
    // cancel/transition can't slip past our checks.
    const lockedRows = await tx.execute<any>(
      sql`SELECT * FROM invoices WHERE id = ${order.id} FOR UPDATE`,
    );
    const fresh = (lockedRows.rows?.[0] ?? null) as any;
    if (!fresh) throw new OrderCancelError("NOT_FOUND", "Order not found");
    if (fresh.channel !== "ONLINE")
      throw new OrderCancelError("BAD_REQUEST", "Only online orders use this flow");
    if (fresh.status === "cancelled")
      throw new OrderCancelError("ALREADY_CANCELLED", "Order is already cancelled");

    // Drizzle returns snake_case from raw SQL; normalize the JSONB field.
    const ld: any = fresh.logistics_details ?? fresh.logisticsDetails ?? {};
    const stage: string = ld.status ?? "pending_confirmation";
    if (stage === "delivered")
      throw new OrderCancelError("TOO_LATE", "Delivered orders cannot be cancelled");
    if (allowedStages && !allowedStages.includes(stage as Stage)) {
      throw new OrderCancelError(
        "TOO_LATE_TO_CANCEL",
        "This order has progressed beyond the stage where it can be cancelled",
      );
    }

    const history = Array.isArray(ld.statusHistory) ? ld.statusHistory : [];
    const newLd = {
      ...ld,
      status: "cancelled",
      cancelReason: reason,
      cancelledAt: now,
      cancelledBy: by,
      cancelledByUserId: actorId,
      statusHistory: [
        ...history,
        { status: "cancelled", at: now, by: actorId, reason, actor: by },
      ],
    };

    const [updated] = await tx
      .update(invoicesTable)
      .set({ status: "cancelled", logisticsDetails: newLd })
      .where(eq(invoicesTable.id, order.id))
      .returning();

    // Reverse the original deductions exactly. Use the ledger entries the
    // placement code wrote (refType="INVOICE", refId=invoice.id). This is
    // robust against multi-location setups and against the "first location"
    // changing between placement and cancel.
    const deductions = await tx
      .select()
      .from(stockLedgerTable)
      .where(
        and(
          eq(stockLedgerTable.refType, "INVOICE"),
          eq(stockLedgerTable.refId, order.id),
          eq(stockLedgerTable.type, "OUT"),
        ),
      );

    if (deductions.length > 0) {
      for (const d of deductions) {
        const qty = Math.abs(Number(d.qty) || 0);
        if (qty <= 0) continue;
        await appendLedger(
          {
            productId: d.productId,
            variantId: d.variantId,
            locationId: d.locationId,
            type: "IN",
            qty,
            refType: "INVOICE_CANCEL",
            refId: order.id,
            notes: `Cancel ${order.invoiceNo}: ${reason}`,
            ...(actorId ? { createdBy: actorId } : {}),
          },
          tx,
        );
      }
    } else {
      // Legacy fallback for orders placed before refId tracking. Use the
      // same first-location strategy that legacy placement used so stock
      // returns to the same bucket.
      const locRows = await tx.execute<{ id: string }>(sql`SELECT id FROM locations ORDER BY id LIMIT 1`);
      const locationId = (locRows.rows?.[0] as any)?.id;
      if (locationId) {
        for (const item of (order.items ?? []) as any[]) {
          const qty = Number(item.qty) || 0;
          if (qty <= 0) continue;
          await appendLedger(
            {
              productId: item.productId,
              variantId: item.variantId,
              locationId,
              type: "IN",
              qty,
              refType: "INVOICE_CANCEL",
              refId: order.id,
              notes: `Cancel ${order.invoiceNo} (legacy): ${reason}`,
              ...(actorId ? { createdBy: actorId } : {}),
            },
            tx,
          );
        }
      }
    }
    return updated;
  });
}

// Suppress unused-import warning for `ne` while keeping the import grouped
// with the other drizzle helpers we use throughout the file.
void ne;

/** Fire-and-forget customer notification for any lifecycle event. */
export async function notifyCustomerLifecycle(
  order: any,
  stage: Stage | "cancelled",
  extra?: { courier?: Courier; cancelReason?: string; cancelledBy?: "staff" | "customer" },
): Promise<void> {
  if (!order?.customerId) return;
  const cust = (
    await db.select().from(customersTable).where(eq(customersTable.id, order.customerId)).limit(1)
  )[0];
  if (!cust) return;

  let subject: string;
  let body: string;
  if (stage === "cancelled") {
    subject = `Order ${order.invoiceNo} cancelled`;
    const who = extra?.cancelledBy === "customer" ? " as requested" : "";
    body =
      `Hi ${cust.name},\n\nYour order ${order.invoiceNo} has been cancelled${who}.\n` +
      `Reason: ${extra?.cancelReason ?? "—"}\n\n` +
      `If payment was already collected, our team will reach out to process the refund.\n\n— Rathinam Crackers`;
  } else {
    subject = `Order ${order.invoiceNo}: ${STAGE_LABELS[stage]}`;
    body = `Hi ${cust.name},\n\nYour order ${order.invoiceNo} is now ${STAGE_LABELS[stage]}.`;
    if (stage === "dispatched" && extra?.courier) {
      const c = extra.courier;
      body += `\n\nCourier: ${c.name}`;
      if (c.trackingNumber) body += `\nTracking #: ${c.trackingNumber}`;
      if (c.trackingUrl) body += `\nTrack: ${c.trackingUrl}`;
      if (c.expectedDeliveryAt)
        body += `\nExpected by: ${new Date(c.expectedDeliveryAt).toLocaleDateString("en-IN")}`;
    }
    body += `\n\n— Rathinam Crackers`;
  }

  const tasks: Promise<unknown>[] = [];
  const eventType = stage === "cancelled" ? "order.cancelled" : `order.${stage}`;
  if (cust.email) {
    tasks.push(
      sendEmail({
        eventType,
        to: cust.email,
        subject,
        text: body,
        recipientId: cust.id,
        recipientType: "customer",
      }),
    );
  }
  if (cust.phone) {
    const phone = cust.phone.startsWith("+") ? cust.phone : `+91${cust.phone}`;
    tasks.push(
      sendWhatsapp({
        eventType,
        to: phone,
        body,
        recipientId: cust.id,
        recipientType: "customer",
      }),
    );
  }
  await Promise.allSettled(tasks);
}
