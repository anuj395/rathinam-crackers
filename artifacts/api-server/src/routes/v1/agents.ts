import { Router } from "express";
import { db, agentsTable, invoicesTable, insertAgentSchema } from "@workspace/db";
import { eq, ilike, and, sql, gte, lte } from "drizzle-orm";
import { z } from "zod/v4";
import { authenticate, requireRole, type AuthRequest } from "../../middleware/authenticate.js";
import { auditWrite } from "../../lib/audit.js";

const router = Router();

const requireWrite = requireRole("SUPER_ADMIN", "ADMIN", "ERP_MANAGER");
const requireDelete = requireRole("SUPER_ADMIN", "ADMIN");
const updateAgentSchema = insertAgentSchema.partial();

router.get("/agents", authenticate, async (req, res) => {
  const { search, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pg = Math.max(1, parseInt(page));
  const lim = Math.min(100, parseInt(limit));
  const offset = (pg - 1) * lim;
  const conditions = [];
  if (search) conditions.push(ilike(agentsTable.name, `%${search}%`));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [rows, countRows] = await Promise.all([
    db.select().from(agentsTable).where(where).limit(lim).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(agentsTable).where(where),
  ]);
  const total = Number(countRows[0]?.count ?? 0);
  res.json({ success: true, data: rows, meta: { page: pg, limit: lim, total, pages: Math.ceil(total / lim) } });
});

router.post("/agents", authenticate, requireWrite, async (req: AuthRequest, res) => {
  const parsed = insertAgentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: z.prettifyError(parsed.error) } });
    return;
  }
  const [agent] = await db.insert(agentsTable).values({ ...parsed.data, id: crypto.randomUUID() }).returning();
  await auditWrite(req, { action: "CREATE", entityType: "agent", entityId: agent?.id, after: agent });
  res.status(201).json(agent);
});

router.get("/agents/:id", authenticate, async (req, res) => {
  const rows = await db.select().from(agentsTable).where(eq(agentsTable.id, req.params["id"] as string)).limit(1);
  if (!rows[0]) { res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Agent not found" } }); return; }
  res.json(rows[0]);
});

router.put("/agents/:id", authenticate, requireWrite, async (req: AuthRequest, res) => {
  const id = req.params["id"] as string;
  const parsed = updateAgentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: z.prettifyError(parsed.error) } });
    return;
  }
  const before = (await db.select().from(agentsTable).where(eq(agentsTable.id, id)).limit(1))[0] ?? null;
  const [agent] = await db.update(agentsTable).set(parsed.data).where(eq(agentsTable.id, id)).returning();
  if (!agent) { res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Agent not found" } }); return; }
  await auditWrite(req, { action: "UPDATE", entityType: "agent", entityId: id, before, after: agent });
  res.json(agent);
});

router.delete("/agents/:id", authenticate, requireDelete, async (req: AuthRequest, res) => {
  const id = req.params["id"] as string;
  try {
    const [agent] = await db.delete(agentsTable).where(eq(agentsTable.id, id)).returning();
    if (!agent) { res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Agent not found" } }); return; }
    await auditWrite(req, { action: "DELETE", entityType: "agent", entityId: id, before: agent });
    res.json({ success: true, data: { id } });
  } catch (err: any) {
    if (err?.code === "23503") {
      res.status(409).json({ success: false, error: { code: "IN_USE", message: "Agent is referenced by other records" } });
      return;
    }
    throw err;
  }
});

router.get("/agents/:id/commission", authenticate, async (req, res) => {
  const { dateFrom, dateTo } = req.query as Record<string, string>;
  const agentId = req.params["id"] as string;
  const agentRows = await db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).limit(1);
  if (!agentRows[0]) { res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Agent not found" } }); return; }
  const agent = agentRows[0];
  const tiers = (agent.commissionTiers ?? []) as Array<{ from: number; to: number; rate: number }>;

  const conditions = [eq(invoicesTable.agentId, agentId)];
  if (dateFrom) conditions.push(gte(invoicesTable.createdAt, new Date(dateFrom)));
  if (dateTo) conditions.push(lte(invoicesTable.createdAt, new Date(dateTo)));
  const invoices = await db.select().from(invoicesTable).where(and(...conditions));

  const items = invoices.map((inv) => {
    const amount = Number(inv.total);
    const tier = tiers.find((t) => amount >= t.from && amount <= t.to);
    const commission = tier ? (amount * tier.rate) / 100 : 0;
    return { invoiceNo: inv.invoiceNo, amount, commission, date: inv.createdAt?.toISOString() };
  });

  const totalCommission = items.reduce((sum, i) => sum + i.commission, 0);
  const totalSales = items.reduce((sum, i) => sum + i.amount, 0);
  res.json({ success: true, data: { items, totalCommission, totalSales } });
});

export default router;
