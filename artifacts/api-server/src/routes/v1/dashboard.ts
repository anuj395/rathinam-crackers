import { Router } from "express";
import {
  db,
  invoicesTable,
  stockLevelsTable,
  productsTable,
  customersTable,
  agentsTable,
  transfersTable,
  locationsTable,
  posShiftsTable,
} from "@workspace/db";
import { authenticate } from "../../middleware/authenticate.js";
import { eq, sql, gte, lte, and, desc, lt, isNull, ne, inArray } from "drizzle-orm";

const router = Router();

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const startOfPrevMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() - 1, 1);
const startOfYear = (d: Date) => new Date(d.getFullYear(), 0, 1);
const isPaid = () => ne(invoicesTable.status, "cancelled");

router.get("/dashboard/summary", authenticate, async (_req, res) => {
  const today = startOfDay(new Date());
  const monthStart = startOfMonth(today);
  const prevMonthStart = startOfPrevMonth(today);

  const [todayRows, monthRows, prevMonthRows, lowStockRows, activeTransfers, outstandingRows] =
    await Promise.all([
      db.select({
        total: sql<number>`coalesce(sum(cast(${invoicesTable.total} as numeric)),0)`,
        count: sql<number>`count(*)`,
      })
        .from(invoicesTable)
        .where(and(gte(invoicesTable.createdAt, today), isPaid())),
      db.select({ total: sql<number>`coalesce(sum(cast(${invoicesTable.total} as numeric)),0)` })
        .from(invoicesTable)
        .where(and(gte(invoicesTable.createdAt, monthStart), isPaid())),
      db.select({ total: sql<number>`coalesce(sum(cast(${invoicesTable.total} as numeric)),0)` })
        .from(invoicesTable)
        .where(and(gte(invoicesTable.createdAt, prevMonthStart), lt(invoicesTable.createdAt, monthStart), isPaid())),
      db.select({ count: sql<number>`count(*)` })
        .from(stockLevelsTable)
        .where(lt(stockLevelsTable.currentQty, 10)),
      db.select({ count: sql<number>`count(*)` })
        .from(transfersTable)
        .where(eq(transfersTable.status, "in_transit")),
      db.select({ total: sql<number>`coalesce(sum(cast(${customersTable.outstandingBalance} as numeric)),0)` })
        .from(customersTable),
    ]);

  const monthSales = Number(monthRows[0]?.total ?? 0);
  const prevMonthSales = Number(prevMonthRows[0]?.total ?? 0);
  const monthGrowth = prevMonthSales > 0
    ? Math.round(((monthSales - prevMonthSales) / prevMonthSales) * 100)
    : monthSales > 0 ? 100 : 0;

  res.json({
    success: true,
    data: {
      todaySales: Number(todayRows[0]?.total ?? 0),
      todayInvoices: Number(todayRows[0]?.count ?? 0),
      outstandingTotal: Number(outstandingRows[0]?.total ?? 0),
      lowStockCount: Number(lowStockRows[0]?.count ?? 0),
      activeTransfers: Number(activeTransfers[0]?.count ?? 0),
      monthSales,
      monthGrowth,
    },
  });
});

router.get("/dashboard/sales-by-channel", authenticate, async (_req, res) => {
  const rows = await db
    .select({
      channel: invoicesTable.channel,
      revenue: sql<number>`coalesce(sum(cast(${invoicesTable.total} as numeric)),0)`,
      count: sql<number>`count(*)`,
    })
    .from(invoicesTable)
    .where(isPaid())
    .groupBy(invoicesTable.channel);

  res.json({
    success: true,
    data: rows.map((r) => ({ channel: r.channel, revenue: Number(r.revenue), count: Number(r.count) })),
  });
});

router.get("/dashboard/top-products", authenticate, async (req, res) => {
  const limit = Number(req.query["limit"] ?? 5);
  const invoices = await db.select({ items: invoicesTable.items }).from(invoicesTable).limit(200);

  const map = new Map<string, { productName: string; totalQty: number; totalRevenue: number }>();
  for (const inv of invoices) {
    const items = (inv.items ?? []) as Array<{ productId: string; productName: string; qty: number; amount: number }>;
    for (const item of items) {
      const existing = map.get(item.productId) ?? { productName: item.productName, totalQty: 0, totalRevenue: 0 };
      existing.totalQty += Number(item.qty) || 0;
      existing.totalRevenue += Number(item.amount) || 0;
      map.set(item.productId, existing);
    }
  }

  const sorted = [...map.entries()]
    .sort((a, b) => b[1].totalRevenue - a[1].totalRevenue)
    .slice(0, limit)
    .map(([productId, v]) => ({ productId, ...v }));

  res.json({ success: true, data: sorted });
});

router.get("/dashboard/agent-performance", authenticate, async (_req, res) => {
  const agents = await db.select().from(agentsTable).where(eq(agentsTable.status, "active")).limit(10);
  const monthStart = startOfMonth(new Date());

  const results = await Promise.all(
    agents.map(async (agent) => {
      const rows = await db
        .select({ total: sql<number>`coalesce(sum(cast(${invoicesTable.total} as numeric)),0)` })
        .from(invoicesTable)
        .where(and(eq(invoicesTable.agentId, agent.id), gte(invoicesTable.createdAt, monthStart), isPaid()));
      const sales = Number(rows[0]?.total ?? 0);
      const target = Number(agent.monthlyTarget ?? 0);
      return {
        agentId: agent.id,
        agentName: agent.name,
        sales,
        target,
        achievement: target > 0 ? Math.round((sales / target) * 100) : 0,
      };
    })
  );

  res.json({ success: true, data: results });
});

// -------- New: location-wise metrics --------
router.get("/dashboard/by-location", authenticate, async (_req, res) => {
  const today = startOfDay(new Date());
  const monthStart = startOfMonth(today);

  const [locations, todayAgg, monthAgg, lowStockAgg, openShiftAgg] = await Promise.all([
    db.select().from(locationsTable).where(eq(locationsTable.isActive, true)),
    db.select({
      locationId: invoicesTable.locationId,
      total: sql<number>`coalesce(sum(cast(${invoicesTable.total} as numeric)),0)`,
      count: sql<number>`count(*)`,
    })
      .from(invoicesTable)
      .where(and(gte(invoicesTable.createdAt, today), isPaid()))
      .groupBy(invoicesTable.locationId),
    db.select({
      locationId: invoicesTable.locationId,
      total: sql<number>`coalesce(sum(cast(${invoicesTable.total} as numeric)),0)`,
      count: sql<number>`count(*)`,
    })
      .from(invoicesTable)
      .where(and(gte(invoicesTable.createdAt, monthStart), isPaid()))
      .groupBy(invoicesTable.locationId),
    db.select({
      locationId: stockLevelsTable.locationId,
      count: sql<number>`count(*)`,
    })
      .from(stockLevelsTable)
      .innerJoin(productsTable, eq(stockLevelsTable.productId, productsTable.id))
      .where(lt(stockLevelsTable.currentQty, sql`coalesce(${productsTable.reorderLevel}, 10)`))
      .groupBy(stockLevelsTable.locationId),
    db.select({
      locationId: posShiftsTable.locationId,
      count: sql<number>`count(*)`,
    })
      .from(posShiftsTable)
      .where(eq(posShiftsTable.status, "open"))
      .groupBy(posShiftsTable.locationId),
  ]);

  const todayMap = new Map(todayAgg.filter((r) => r.locationId).map((r) => [r.locationId!, r]));
  const monthMap = new Map(monthAgg.filter((r) => r.locationId).map((r) => [r.locationId!, r]));
  const lowStockMap = new Map(lowStockAgg.map((r) => [r.locationId, Number(r.count)]));
  const openShiftMap = new Map(openShiftAgg.map((r) => [r.locationId, Number(r.count)]));

  const results = locations.map((loc) => {
    const t = todayMap.get(loc.id);
    const m = monthMap.get(loc.id);
    const monthRevenue = Number(m?.total ?? 0);
    const monthCount = Number(m?.count ?? 0);
    return {
      locationId: loc.id,
      locationName: loc.name,
      type: loc.type,
      city: loc.city ?? null,
      todaySales: Number(t?.total ?? 0),
      todayInvoices: Number(t?.count ?? 0),
      monthSales: monthRevenue,
      monthInvoices: monthCount,
      averageOrderValue: monthCount > 0 ? Math.round(monthRevenue / monthCount) : 0,
      lowStockCount: lowStockMap.get(loc.id) ?? 0,
      openShifts: openShiftMap.get(loc.id) ?? 0,
    };
  });

  res.json({ success: true, data: results });
});

// -------- New: daily sales time series --------
router.get("/dashboard/daily-sales", authenticate, async (req, res) => {
  const days = Math.min(Math.max(Number(req.query["days"] ?? 30) | 0, 1), 365);
  const locationId = (req.query["locationId"] as string | undefined)?.trim();
  const today = startOfDay(new Date());
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));

  const whereClause = locationId
    ? and(gte(invoicesTable.createdAt, start), eq(invoicesTable.locationId, locationId), isPaid())
    : and(gte(invoicesTable.createdAt, start), isPaid());

  const rows = await db
    .select({
      date: sql<string>`to_char(date_trunc('day', ${invoicesTable.createdAt}), 'YYYY-MM-DD')`,
      revenue: sql<number>`coalesce(sum(cast(${invoicesTable.total} as numeric)),0)`,
      count: sql<number>`count(*)`,
    })
    .from(invoicesTable)
    .where(whereClause)
    .groupBy(sql`date_trunc('day', ${invoicesTable.createdAt})`)
    .orderBy(sql`date_trunc('day', ${invoicesTable.createdAt})`);

  // Backfill zero-days so the chart is dense.
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const series: Array<{ date: string; revenue: number; count: number }> = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const r = byDate.get(key);
    series.push({
      date: key,
      revenue: r ? Number(r.revenue) : 0,
      count: r ? Number(r.count) : 0,
    });
  }

  res.json({ success: true, data: series });
});

// -------- New: business overview --------
router.get("/dashboard/business-overview", authenticate, async (_req, res) => {
  const today = startOfDay(new Date());
  const monthStart = startOfMonth(today);
  const prevMonthStart = startOfPrevMonth(today);
  const yearStart = startOfYear(today);

  const [
    mtdRows,
    prevMonthRows,
    ytdRows,
    paymentModeRows,
    customerCountRows,
    activeProductRows,
    gstRows,
    topCustomersRows,
  ] = await Promise.all([
    db.select({
      total: sql<number>`coalesce(sum(cast(${invoicesTable.total} as numeric)),0)`,
      count: sql<number>`count(*)`,
    })
      .from(invoicesTable)
      .where(and(gte(invoicesTable.createdAt, monthStart), isPaid())),
    db.select({
      total: sql<number>`coalesce(sum(cast(${invoicesTable.total} as numeric)),0)`,
      count: sql<number>`count(*)`,
    })
      .from(invoicesTable)
      .where(and(gte(invoicesTable.createdAt, prevMonthStart), lt(invoicesTable.createdAt, monthStart), isPaid())),
    db.select({
      total: sql<number>`coalesce(sum(cast(${invoicesTable.total} as numeric)),0)`,
      count: sql<number>`count(*)`,
    })
      .from(invoicesTable)
      .where(and(gte(invoicesTable.createdAt, yearStart), isPaid())),
    db.select({
      mode: sql<string>`upper(${invoicesTable.paymentMode})`,
      revenue: sql<number>`coalesce(sum(cast(${invoicesTable.total} as numeric)),0)`,
      count: sql<number>`count(*)`,
    })
      .from(invoicesTable)
      .where(and(gte(invoicesTable.createdAt, monthStart), isPaid()))
      .groupBy(sql`upper(${invoicesTable.paymentMode})`),
    db.select({ count: sql<number>`count(*)` })
      .from(customersTable)
      .where(eq(customersTable.status, "active")),
    db.select({ count: sql<number>`count(*)` })
      .from(productsTable)
      .where(eq(productsTable.status, "Active")),
    db.select({
      cgst: sql<number>`coalesce(sum(cast(${invoicesTable.cgst} as numeric)),0)`,
      sgst: sql<number>`coalesce(sum(cast(${invoicesTable.sgst} as numeric)),0)`,
      igst: sql<number>`coalesce(sum(cast(${invoicesTable.igst} as numeric)),0)`,
    })
      .from(invoicesTable)
      .where(and(gte(invoicesTable.createdAt, monthStart), isPaid())),
    db.select({
      customerId: invoicesTable.customerId,
      revenue: sql<number>`coalesce(sum(cast(${invoicesTable.total} as numeric)),0)`,
      orders: sql<number>`count(*)`,
    })
      .from(invoicesTable)
      .where(and(gte(invoicesTable.createdAt, monthStart), isPaid()))
      .groupBy(invoicesTable.customerId)
      .orderBy(desc(sql`coalesce(sum(cast(${invoicesTable.total} as numeric)),0)`))
      .limit(5),
  ]);

  const mtdRevenue = Number(mtdRows[0]?.total ?? 0);
  const mtdInvoices = Number(mtdRows[0]?.count ?? 0);
  const prevMonthRevenue = Number(prevMonthRows[0]?.total ?? 0);
  const ytdRevenue = Number(ytdRows[0]?.total ?? 0);
  const ytdInvoices = Number(ytdRows[0]?.count ?? 0);
  const monthGrowth = prevMonthRevenue > 0
    ? Math.round(((mtdRevenue - prevMonthRevenue) / prevMonthRevenue) * 100)
    : mtdRevenue > 0 ? 100 : 0;

  // Resolve top customer names in a single query.
  const topCustIds = topCustomersRows
    .map((r) => r.customerId)
    .filter((id): id is string => !!id);
  const customerNameMap = new Map<string, string>();
  if (topCustIds.length > 0) {
    const custs = await db
      .select({ id: customersTable.id, name: customersTable.name })
      .from(customersTable)
      .where(inArray(customersTable.id, topCustIds));
    for (const c of custs) customerNameMap.set(c.id, c.name);
  }

  const cgst = Number(gstRows[0]?.cgst ?? 0);
  const sgst = Number(gstRows[0]?.sgst ?? 0);
  const igst = Number(gstRows[0]?.igst ?? 0);

  res.json({
    success: true,
    data: {
      mtdRevenue,
      mtdInvoices,
      prevMonthRevenue,
      monthGrowth,
      ytdRevenue,
      ytdInvoices,
      averageOrderValue: mtdInvoices > 0 ? Math.round(mtdRevenue / mtdInvoices) : 0,
      activeCustomers: Number(customerCountRows[0]?.count ?? 0),
      activeProducts: Number(activeProductRows[0]?.count ?? 0),
      gstCollectedMtd: cgst + sgst + igst,
      gstBreakdown: { cgst, sgst, igst },
      paymentModeMix: paymentModeRows.map((r) => ({
        mode: r.mode,
        revenue: Number(r.revenue),
        count: Number(r.count),
      })),
      topCustomers: topCustomersRows.map((r) => ({
        customerId: r.customerId ?? null,
        customerName: r.customerId ? customerNameMap.get(r.customerId) ?? "Walk-in" : "Walk-in",
        revenue: Number(r.revenue),
        orders: Number(r.orders),
      })),
    },
  });
});

export default router;
