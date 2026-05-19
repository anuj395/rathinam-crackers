import { Router } from "express";
import {
  db,
  customersTable,
  creditLedgerTable,
  loyaltyLedgerTable,
  invoicesTable,
  estimatesTable,
  customerAddressesTable,
  customerWishlistTable,
  productsTable,
  agentsTable,
  insertCustomerSchema,
} from "@workspace/db";
import { eq, ilike, and, sql, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { authenticate, requireRole, type AuthRequest } from "../../middleware/authenticate.js";
import { CUSTOMER_WRITE, FINANCE_ROLES } from "../../lib/auth-roles.js";
import { auditWrite } from "../../lib/audit.js";

const router = Router();
const updateCustomerSchema = insertCustomerSchema.partial();

router.get("/customers", authenticate, async (req, res) => {
  const { search, customerType, agentId, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pg = Math.max(1, parseInt(page));
  const lim = Math.min(100, parseInt(limit));
  const offset = (pg - 1) * lim;

  const conditions = [];
  if (search) conditions.push(ilike(customersTable.name, `%${search}%`));
  if (customerType) conditions.push(eq(customersTable.customerType, customerType as any));
  if (agentId) conditions.push(eq(customersTable.agentId, agentId));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countRows] = await Promise.all([
    db.select().from(customersTable).where(where).limit(lim).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(customersTable).where(where),
  ]);
  const total = Number(countRows[0]?.count ?? 0);
  res.json({ success: true, data: rows, meta: { page: pg, limit: lim, total, pages: Math.ceil(total / lim) } });
});

router.post("/customers", authenticate, requireRole(...CUSTOMER_WRITE), async (req: AuthRequest, res) => {
  const parsed = insertCustomerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: z.prettifyError(parsed.error) } });
    return;
  }
  const phone = typeof parsed.data.phone === "string" ? parsed.data.phone.trim() : "";
  // Provenance: cashier-added walk-ins are tagged "pos"; everything else
  // staff-creates from the ERP UI defaults to "erp". The only client-supplied
  // override we honour is "import" (for bulk loaders) — and only when the
  // caller is a privileged operator. Any other body value is dropped so a
  // cashier or compromised token can't spoof "website" provenance and skew
  // acquisition analytics.
  const bodySource = typeof parsed.data.source === "string" ? parsed.data.source : "";
  const role = req.user?.role ?? "";
  const isPrivileged = role === "SUPER_ADMIN" || role === "ADMIN" || role === "ERP_MANAGER";
  const inferred = role === "CASHIER" ? "pos" : "erp";
  const source = bodySource === "import" && isPrivileged ? "import" : inferred;
  if (phone) {
    const existing = (await db.select().from(customersTable).where(eq(customersTable.phone, phone)).limit(1))[0];
    if (existing) {
      // Phone is unique. Surface the duplicate as a 409 with the existing
      // record so callers (e.g. POS quick-add) can attach the existing
      // customer instead of erroring out the cashier mid-checkout.
      res.status(409).json({
        success: false,
        error: { code: "DUPLICATE_PHONE", message: "A customer with this phone already exists" },
        data: existing,
      });
      return;
    }
  }
  try {
    const [customer] = await db.insert(customersTable).values({ ...parsed.data, phone, source, id: crypto.randomUUID() }).returning();
    await auditWrite(req, { action: "CREATE", entityType: "customer", entityId: customer?.id, after: customer });
    res.status(201).json(customer);
  } catch (err: any) {
    if (err?.code === "23505") {
      const existing = (await db.select().from(customersTable).where(eq(customersTable.phone, phone)).limit(1))[0];
      res.status(409).json({
        success: false,
        error: { code: "DUPLICATE_PHONE", message: "A customer with this phone already exists" },
        data: existing ?? null,
      });
      return;
    }
    throw err;
  }
});

router.get("/customers/:id", authenticate, async (req, res) => {
  const rows = await db.select().from(customersTable).where(eq(customersTable.id, req.params["id"] as string)).limit(1);
  if (!rows[0]) { res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Customer not found" } }); return; }
  res.json(rows[0]);
});

router.put("/customers/:id", authenticate, requireRole(...CUSTOMER_WRITE), async (req: AuthRequest, res) => {
  const id = req.params["id"] as string;
  const parsed = updateCustomerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: z.prettifyError(parsed.error) } });
    return;
  }
  const before = (await db.select().from(customersTable).where(eq(customersTable.id, id)).limit(1))[0] ?? null;
  const [customer] = await db.update(customersTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(customersTable.id, id)).returning();
  if (!customer) { res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Customer not found" } }); return; }
  await auditWrite(req, { action: "UPDATE", entityType: "customer", entityId: id, before, after: customer });
  res.json(customer);
});

router.get("/customers/:id/statement", authenticate, async (req, res) => {
  const entries = await db
    .select()
    .from(creditLedgerTable)
    .where(eq(creditLedgerTable.customerId, req.params["id"] as string))
    .orderBy(desc(creditLedgerTable.createdAt))
    .limit(100);
  const customerRows = await db.select().from(customersTable).where(eq(customersTable.id, req.params["id"] as string)).limit(1);
  const balance = Number(customerRows[0]?.outstandingBalance ?? 0);
  res.json({ success: true, data: { entries, currentBalance: balance } });
});

router.get("/customers/:id/loyalty", authenticate, async (req, res) => {
  const entries = await db
    .select()
    .from(loyaltyLedgerTable)
    .where(eq(loyaltyLedgerTable.customerId, req.params["id"] as string))
    .orderBy(desc(loyaltyLedgerTable.createdAt))
    .limit(100);
  const customerRows = await db.select().from(customersTable).where(eq(customersTable.id, req.params["id"] as string)).limit(1);
  const totalPoints = customerRows[0]?.loyaltyPoints ?? 0;
  res.json({ success: true, data: { entries, totalPoints } });
});

router.post("/customers/:id/payment", authenticate, requireRole(...FINANCE_ROLES), async (req, res) => {
  const { amount, date, reference, notes } = req.body as { amount: number; date: string; reference?: string; notes?: string };
  const cid = req.params["id"] as string;
  const customerRows = await db.select().from(customersTable).where(eq(customersTable.id, cid)).limit(1);
  if (!customerRows[0]) { res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Customer not found" } }); return; }
  const newBalance = Number(customerRows[0].outstandingBalance) - amount;
  await Promise.all([
    db.update(customersTable).set({ outstandingBalance: newBalance.toFixed(2), updatedAt: new Date() }).where(eq(customersTable.id, cid)),
    db.insert(creditLedgerTable).values({
      id: crypto.randomUUID(),
      customerId: cid,
      type: "PAYMENT",
      amount: (-amount).toFixed(2),
      runningBalance: newBalance.toFixed(2),
      reference,
      notes,
      refType: "PAYMENT",
    }),
  ]);
  res.json({ success: true, message: "Payment recorded" });
});

// Aggregate every related record for a single customer in one round-trip.
// The ERP detail page used to fire 4–5 separate fetches and stitch the
// results together client-side, which made the page feel sluggish and made
// loading-state handling fiddly. This endpoint owns the joins so the UI
// just renders sections.
router.get("/customers/:id/related", authenticate, async (req, res) => {
  const id = req.params["id"] as string;
  const customer = (await db.select().from(customersTable).where(eq(customersTable.id, id)).limit(1))[0];
  if (!customer) {
    res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Customer not found" } });
    return;
  }
  // Run the dependent reads in parallel — none of them depend on each other
  // and none mutate state, so a single Promise.all keeps page load snappy
  // even on a customer with hundreds of invoices.
  const [invoices, estimates, addresses, wishlistRows, agentRow, totals] = await Promise.all([
    db.select().from(invoicesTable).where(eq(invoicesTable.customerId, id)).orderBy(desc(invoicesTable.createdAt)).limit(50),
    db.select().from(estimatesTable).where(eq(estimatesTable.customerId, id)).orderBy(desc(estimatesTable.createdAt)).limit(20),
    db.select().from(customerAddressesTable).where(eq(customerAddressesTable.customerId, id)).orderBy(desc(customerAddressesTable.isDefault)),
    db
      .select({
        productId: customerWishlistTable.productId,
        addedAt: customerWishlistTable.createdAt,
        productName: productsTable.name,
        productSku: productsTable.code,
      })
      .from(customerWishlistTable)
      .leftJoin(productsTable, eq(productsTable.id, customerWishlistTable.productId))
      .where(eq(customerWishlistTable.customerId, id))
      .orderBy(desc(customerWishlistTable.createdAt))
      .limit(50),
    customer.agentId
      ? db.select().from(agentsTable).where(eq(agentsTable.id, customer.agentId)).limit(1)
      : Promise.resolve([] as any[]),
    // Lifetime totals sourced from `invoices` (excluding cancelled). Done in
    // SQL so we don't have to load every row to sum it on the server.
    db
      .select({
        totalSpend: sql<number>`coalesce(sum(case when ${invoicesTable.status} <> 'cancelled' then ${invoicesTable.total}::numeric else 0 end), 0)::float`,
        orderCount: sql<number>`count(*) filter (where ${invoicesTable.status} <> 'cancelled')::int`,
        lastOrderAt: sql<string | null>`max(${invoicesTable.createdAt})`,
      })
      .from(invoicesTable)
      .where(eq(invoicesTable.customerId, id)),
  ]);
  res.json({
    success: true,
    data: {
      customer,
      invoices,
      estimates,
      addresses,
      wishlist: wishlistRows,
      agent: agentRow[0] ?? null,
      stats: {
        totalSpend: Number(totals[0]?.totalSpend ?? 0),
        orderCount: Number(totals[0]?.orderCount ?? 0),
        lastOrderAt: totals[0]?.lastOrderAt ?? null,
      },
    },
  });
});

export default router;
