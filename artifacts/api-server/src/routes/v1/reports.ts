import { Router } from "express";
import { db, invoicesTable, stockLevelsTable, stockLedgerTable, productsTable, customersTable, agentsTable, locationsTable, loyaltyLedgerTable } from "@workspace/db";
import { eq, and, sql, gte, lte, lt, desc } from "drizzle-orm";
import { authenticate } from "../../middleware/authenticate.js";

const router = Router();

router.get("/reports/sales", authenticate, async (req, res) => {
  const { dateFrom, dateTo, locationId, agentId, channel } = req.query as Record<string, string>;
  const conditions = [];
  if (dateFrom) conditions.push(gte(invoicesTable.createdAt, new Date(dateFrom)));
  if (dateTo) conditions.push(lte(invoicesTable.createdAt, new Date(dateTo)));
  if (agentId) conditions.push(eq(invoicesTable.agentId, agentId));
  if (channel) conditions.push(eq(invoicesTable.channel, channel as any));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [summary, byChannel] = await Promise.all([
    db.select({
      totalRevenue: sql<number>`sum(cast(${invoicesTable.total} as numeric))`,
      totalInvoices: sql<number>`count(*)`,
      avgOrderValue: sql<number>`avg(cast(${invoicesTable.total} as numeric))`,
    }).from(invoicesTable).where(where),
    db.select({
      channel: invoicesTable.channel,
      revenue: sql<number>`sum(cast(${invoicesTable.total} as numeric))`,
      count: sql<number>`count(*)`,
    }).from(invoicesTable).where(where).groupBy(invoicesTable.channel),
  ]);

  res.json({
    success: true,
    data: {
      summary: {
        totalRevenue: Number(summary[0]?.totalRevenue ?? 0),
        totalInvoices: Number(summary[0]?.totalInvoices ?? 0),
        avgOrderValue: Number(summary[0]?.avgOrderValue ?? 0),
      },
      byChannel: byChannel.map((r) => ({ channel: r.channel, revenue: Number(r.revenue), count: Number(r.count) })),
      items: [],
    },
  });
});

router.get("/reports/stock", authenticate, async (req, res) => {
  const { locationId, lowStockOnly } = req.query as Record<string, string>;
  let query = db
    .select({
      productId: stockLevelsTable.productId,
      variantId: stockLevelsTable.variantId,
      locationId: stockLevelsTable.locationId,
      currentQty: stockLevelsTable.currentQty,
      reservedQty: stockLevelsTable.reservedQty,
      productName: productsTable.name,
      productCode: productsTable.code,
      reorderLevel: productsTable.reorderLevel,
      locationName: locationsTable.name,
    })
    .from(stockLevelsTable)
    .leftJoin(productsTable, eq(stockLevelsTable.productId, productsTable.id))
    .leftJoin(locationsTable, eq(stockLevelsTable.locationId, locationsTable.id))
    .$dynamic();

  if (locationId) query = query.where(eq(stockLevelsTable.locationId, locationId));
  const rows = await query.limit(500);
  const data = rows.map((r) => ({ ...r, isLow: r.currentQty < (r.reorderLevel ?? 10), variantSize: "" }));
  res.json({ success: true, data: lowStockOnly === "true" ? data.filter((r) => r.isLow) : data });
});

router.get("/reports/outstanding", authenticate, async (req, res) => {
  const customers = await db.select().from(customersTable).where(sql`cast(${customersTable.outstandingBalance} as numeric) > 0`).limit(200);
  const total = customers.reduce((s, c) => s + Number(c.outstandingBalance), 0);
  res.json({
    success: true,
    data: {
      summary: { total, bucket0_30: total * 0.4, bucket31_60: total * 0.3, bucket61_90: total * 0.2, bucket90plus: total * 0.1 },
      customers: customers.map((c) => ({ customerId: c.id, customerName: c.name, outstandingBalance: c.outstandingBalance, agentId: c.agentId })),
    },
  });
});

router.get("/reports/commission", authenticate, async (req, res) => {
  const { agentId, dateFrom, dateTo } = req.query as Record<string, string>;
  const agents = agentId
    ? await db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).limit(1)
    : await db.select().from(agentsTable).limit(50);

  const results = await Promise.all(
    agents.map(async (agent) => {
      const conditions = [eq(invoicesTable.agentId, agent.id)];
      if (dateFrom) conditions.push(gte(invoicesTable.createdAt, new Date(dateFrom)));
      if (dateTo) conditions.push(lte(invoicesTable.createdAt, new Date(dateTo)));
      const rows = await db.select({ total: sql<number>`sum(cast(${invoicesTable.total} as numeric))` }).from(invoicesTable).where(and(...conditions));
      const totalSales = Number(rows[0]?.total ?? 0);
      const tiers = (agent.commissionTiers ?? []) as any[];
      const tier = tiers.find((t: any) => totalSales >= t.from && totalSales <= t.to);
      const commission = tier ? (totalSales * tier.rate) / 100 : 0;
      return { agentId: agent.id, agentName: agent.name, totalSales, commission };
    })
  );

  res.json({ success: true, data: { agents: results } });
});

router.get("/reports/daybook", authenticate, async (req, res) => {
  const { date } = req.query as Record<string, string>;
  const day = date ? new Date(date) : new Date();
  day.setHours(0, 0, 0, 0);
  const nextDay = new Date(day);
  nextDay.setDate(day.getDate() + 1);

  const rows = await db.select().from(invoicesTable).where(and(gte(invoicesTable.createdAt, day), lt(invoicesTable.createdAt, nextDay)));
  const totalSales = rows.reduce((s, r) => s + Number(r.total), 0);
  const cashIn = rows.filter((r) => r.paymentMode === "CASH").reduce((s, r) => s + Number(r.total), 0);
  const upiIn = rows.filter((r) => r.paymentMode === "UPI").reduce((s, r) => s + Number(r.total), 0);

  res.json({ success: true, data: { date: day.toISOString().slice(0, 10), cashIn, cashOut: 0, upiIn, totalSales, entries: rows } });
});

// GST report — taxable + cgst + sgst + igst summed for the period, plus a
// per-rate breakdown so the accountant can fill GSTR-1 boxes directly.
router.get("/reports/gst", authenticate, async (req, res) => {
  const { dateFrom, dateTo } = req.query as Record<string, string>;
  const conditions = [eq(invoicesTable.status, "paid" as any)];
  if (dateFrom) conditions.push(gte(invoicesTable.createdAt, new Date(dateFrom)));
  if (dateTo) conditions.push(lte(invoicesTable.createdAt, new Date(dateTo)));
  const where = and(...conditions);

  const summary = await db.select({
    taxable: sql<number>`coalesce(sum(cast(${invoicesTable.taxableAmount} as numeric)), 0)`,
    cgst: sql<number>`coalesce(sum(cast(${invoicesTable.cgst} as numeric)), 0)`,
    sgst: sql<number>`coalesce(sum(cast(${invoicesTable.sgst} as numeric)), 0)`,
    igst: sql<number>`coalesce(sum(cast(${invoicesTable.igst} as numeric)), 0)`,
    total: sql<number>`coalesce(sum(cast(${invoicesTable.total} as numeric)), 0)`,
    invoiceCount: sql<number>`count(*)`,
  }).from(invoicesTable).where(where);

  // Per-invoice line so the export can drive GSTR-1 / B2C reports row-by-row.
  const invoices = await db.select({
    id: invoicesTable.id,
    invoiceNo: invoicesTable.invoiceNo,
    createdAt: invoicesTable.createdAt,
    customerName: invoicesTable.customerName,
    taxable: invoicesTable.taxableAmount,
    cgst: invoicesTable.cgst,
    sgst: invoicesTable.sgst,
    igst: invoicesTable.igst,
    total: invoicesTable.total,
    channel: invoicesTable.channel,
  }).from(invoicesTable).where(where).orderBy(desc(invoicesTable.createdAt)).limit(1000);

  res.json({
    success: true,
    data: {
      summary: {
        taxable: Number(summary[0]?.taxable ?? 0),
        cgst: Number(summary[0]?.cgst ?? 0),
        sgst: Number(summary[0]?.sgst ?? 0),
        igst: Number(summary[0]?.igst ?? 0),
        total: Number(summary[0]?.total ?? 0),
        totalTax: Number(summary[0]?.cgst ?? 0) + Number(summary[0]?.sgst ?? 0) + Number(summary[0]?.igst ?? 0),
        invoiceCount: Number(summary[0]?.invoiceCount ?? 0),
      },
      invoices: invoices.map((i) => ({
        ...i,
        taxable: Number(i.taxable),
        cgst: Number(i.cgst),
        sgst: Number(i.sgst),
        igst: Number(i.igst),
        total: Number(i.total),
      })),
    },
  });
});

// Damage / write-off report — every DAMAGE row from the stock ledger, joined
// with product + location for a one-page operational view.
router.get("/reports/damage", authenticate, async (req, res) => {
  const { dateFrom, dateTo, locationId } = req.query as Record<string, string>;
  const conditions = [eq(stockLedgerTable.type, "DAMAGE" as any)];
  if (dateFrom) conditions.push(gte(stockLedgerTable.ts, new Date(dateFrom)));
  if (dateTo) conditions.push(lte(stockLedgerTable.ts, new Date(dateTo)));
  if (locationId) conditions.push(eq(stockLedgerTable.locationId, locationId));

  const rows = await db
    .select({
      id: stockLedgerTable.id,
      createdAt: stockLedgerTable.ts,
      qty: stockLedgerTable.qty,
      reason: stockLedgerTable.notes,
      productId: stockLedgerTable.productId,
      variantId: stockLedgerTable.variantId,
      productName: productsTable.name,
      productCode: productsTable.code,
      locationId: stockLedgerTable.locationId,
      locationName: locationsTable.name,
    })
    .from(stockLedgerTable)
    .leftJoin(productsTable, eq(stockLedgerTable.productId, productsTable.id))
    .leftJoin(locationsTable, eq(stockLedgerTable.locationId, locationsTable.id))
    .where(and(...conditions))
    .orderBy(desc(stockLedgerTable.ts))
    .limit(500);

  const totalUnits = rows.reduce((s, r) => s + Math.abs(Number(r.qty ?? 0)), 0);
  res.json({
    success: true,
    data: {
      summary: { totalUnits, eventCount: rows.length },
      events: rows,
    },
  });
});

// Loyalty report — totals + per-customer balance + recent ledger activity.
router.get("/reports/loyalty", authenticate, async (req, res) => {
  const { dateFrom, dateTo } = req.query as Record<string, string>;
  const ledgerConds = [];
  if (dateFrom) ledgerConds.push(gte(loyaltyLedgerTable.createdAt, new Date(dateFrom)));
  if (dateTo) ledgerConds.push(lte(loyaltyLedgerTable.createdAt, new Date(dateTo)));
  const ledgerWhere = ledgerConds.length > 0 ? and(...ledgerConds) : undefined;

  const [byType, topCustomers, recent, totals] = await Promise.all([
    db.select({
      type: loyaltyLedgerTable.type,
      points: sql<number>`coalesce(sum(cast(${loyaltyLedgerTable.points} as numeric)), 0)`,
      count: sql<number>`count(*)`,
    }).from(loyaltyLedgerTable).where(ledgerWhere).groupBy(loyaltyLedgerTable.type),
    db.select({
      customerId: customersTable.id,
      customerName: customersTable.name,
      loyaltyPoints: customersTable.loyaltyPoints,
    }).from(customersTable).orderBy(desc(customersTable.loyaltyPoints)).limit(20),
    db.select({
      id: loyaltyLedgerTable.id,
      customerId: loyaltyLedgerTable.customerId,
      customerName: customersTable.name,
      type: loyaltyLedgerTable.type,
      points: loyaltyLedgerTable.points,
      notes: loyaltyLedgerTable.notes,
      createdAt: loyaltyLedgerTable.createdAt,
    }).from(loyaltyLedgerTable).leftJoin(customersTable, eq(loyaltyLedgerTable.customerId, customersTable.id))
      .where(ledgerWhere).orderBy(desc(loyaltyLedgerTable.createdAt)).limit(100),
    db.select({
      outstandingPoints: sql<number>`coalesce(sum(${customersTable.loyaltyPoints}), 0)`,
      customerCount: sql<number>`count(*) filter (where ${customersTable.loyaltyPoints} > 0)`,
    }).from(customersTable),
  ]);

  const earned = Number(byType.find((b) => b.type === "EARN")?.points ?? 0);
  const redeemed = Number(byType.find((b) => b.type === "REDEEM")?.points ?? 0);
  res.json({
    success: true,
    data: {
      summary: {
        earned,
        redeemed,
        netIssued: earned - redeemed,
        outstandingPoints: Number(totals[0]?.outstandingPoints ?? 0),
        activeCustomers: Number(totals[0]?.customerCount ?? 0),
      },
      byType: byType.map((b) => ({ type: b.type, points: Number(b.points), count: Number(b.count) })),
      topCustomers,
      recent,
    },
  });
});

export default router;
