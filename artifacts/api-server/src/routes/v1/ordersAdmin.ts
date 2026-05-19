import { Router } from "express";
import { db, invoicesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { authenticate, requireRole, type AuthRequest } from "../../middleware/authenticate.js";
import { auditWrite } from "../../lib/audit.js";
import {
  STAGE_ORDER,
  type Stage,
  canTransition,
  cancelOnlineOrder,
  notifyCustomerLifecycle,
  OrderCancelError,
  type Courier,
} from "../../lib/orderLifecycle.js";

const router = Router();
const requireWrite = requireRole("SUPER_ADMIN", "ADMIN", "ERP_MANAGER");
// Reading customer order data is sensitive (PII, addresses, phone). Limit to
// roles that legitimately fulfil orders. Add WAREHOUSE_MANAGER if/when the
// warehouse panel needs it.
const requireOrdersRead = requireRole("SUPER_ADMIN", "ADMIN", "ERP_MANAGER");

// ---------- LIST ONLINE ORDERS ----------
router.get("/admin/orders", authenticate, requireOrdersRead, async (req: AuthRequest, res) => {
  const status = String(req.query["status"] ?? "ALL");
  const all = await db
    .select()
    .from(invoicesTable)
    .where(eq(invoicesTable.channel, "ONLINE"))
    .orderBy(desc(invoicesTable.createdAt));
  const filtered =
    status === "ALL"
      ? all
      : all.filter((r: any) => {
          if (status === "cancelled") return r.status === "cancelled";
          const s = (r.logisticsDetails?.status ?? "").toLowerCase();
          return s === status && r.status !== "cancelled";
        });
  res.json({ success: true, data: filtered });
});

// ---------- STAGE TRANSITION ----------
router.patch(
  "/admin/orders/:id/status",
  authenticate,
  requireWrite,
  async (req: AuthRequest, res) => {
    const id = req.params["id"] as string;
    const to = String((req.body ?? {}).status ?? "") as Stage;
    if (!STAGE_ORDER.includes(to)) {
      res
        .status(400)
        .json({ success: false, error: { code: "BAD_REQUEST", message: "Invalid status" } });
      return;
    }
    if (to === "dispatched") {
      res.status(400).json({
        success: false,
        error: {
          code: "USE_DISPATCH",
          message: "Use the dispatch endpoint to mark dispatched (requires courier info)",
        },
      });
      return;
    }
    const orders = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id)).limit(1);
    const order = orders[0];
    if (!order) {
      res
        .status(404)
        .json({ success: false, error: { code: "NOT_FOUND", message: "Order not found" } });
      return;
    }
    if (order.channel !== "ONLINE") {
      res.status(400).json({
        success: false,
        error: { code: "BAD_REQUEST", message: "Only online orders use this flow" },
      });
      return;
    }
    if (order.status === "cancelled") {
      res
        .status(400)
        .json({ success: false, error: { code: "CANCELLED", message: "Order is cancelled" } });
      return;
    }
    const ld: any = order.logisticsDetails ?? {};
    const from = ld.status ?? "pending_confirmation";
    if (!canTransition(from, to)) {
      res.status(409).json({
        success: false,
        error: {
          code: "INVALID_TRANSITION",
          message: `Cannot move from ${from} to ${to}`,
        },
      });
      return;
    }
    const now = new Date().toISOString();
    const history = Array.isArray(ld.statusHistory) ? ld.statusHistory : [];
    const newLd = {
      ...ld,
      status: to,
      statusHistory: [...history, { status: to, at: now, by: req.user?.id ?? null }],
    };
    const [updated] = await db
      .update(invoicesTable)
      .set({ logisticsDetails: newLd })
      .where(eq(invoicesTable.id, id))
      .returning();
    await auditWrite(req, {
      action: "UPDATE",
      entityType: "invoice",
      entityId: id,
      before: { status: from },
      after: { status: to },
    });
    void notifyCustomerLifecycle(updated, to);
    res.json({ success: true, data: updated });
  },
);

// ---------- DISPATCH ----------
router.post(
  "/admin/orders/:id/dispatch",
  authenticate,
  requireWrite,
  async (req: AuthRequest, res) => {
    const id = req.params["id"] as string;
    const b = (req.body ?? {}) as Record<string, any>;
    const courierName = String(b["courierName"] ?? "").trim();
    const trackingNumber = String(b["trackingNumber"] ?? "").trim();
    const trackingUrl = String(b["trackingUrl"] ?? "").trim();
    if (!courierName) {
      res.status(400).json({
        success: false,
        error: { code: "BAD_REQUEST", message: "Courier name required" },
      });
      return;
    }
    const orders = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id)).limit(1);
    const order = orders[0];
    if (!order) {
      res
        .status(404)
        .json({ success: false, error: { code: "NOT_FOUND", message: "Order not found" } });
      return;
    }
    if (order.channel !== "ONLINE") {
      res.status(400).json({
        success: false,
        error: { code: "BAD_REQUEST", message: "Only online orders use this flow" },
      });
      return;
    }
    if (order.status === "cancelled") {
      res
        .status(400)
        .json({ success: false, error: { code: "CANCELLED", message: "Order is cancelled" } });
      return;
    }
    const ld: any = order.logisticsDetails ?? {};
    const from = ld.status ?? "pending_confirmation";
    if (from !== "packed") {
      res.status(409).json({
        success: false,
        error: {
          code: "INVALID_TRANSITION",
          message: "Order must be packed before dispatch",
        },
      });
      return;
    }
    const now = new Date().toISOString();
    let expectedDeliveryAt: string | null = null;
    if (b["expectedDeliveryAt"]) {
      const d = new Date(b["expectedDeliveryAt"]);
      if (!isNaN(d.getTime())) expectedDeliveryAt = d.toISOString();
    }
    const courier: Courier = {
      name: courierName,
      trackingNumber: trackingNumber || null,
      trackingUrl: trackingUrl || null,
      dispatchedAt: now,
      expectedDeliveryAt,
    };
    const history = Array.isArray(ld.statusHistory) ? ld.statusHistory : [];
    const newLd = {
      ...ld,
      status: "dispatched",
      courier,
      statusHistory: [
        ...history,
        { status: "dispatched", at: now, by: req.user?.id ?? null },
      ],
    };
    const [updated] = await db
      .update(invoicesTable)
      .set({ logisticsDetails: newLd })
      .where(eq(invoicesTable.id, id))
      .returning();
    await auditWrite(req, {
      action: "UPDATE",
      entityType: "invoice",
      entityId: id,
      before: { status: from },
      after: { status: "dispatched", courier },
    });
    void notifyCustomerLifecycle(updated, "dispatched", { courier });
    res.json({ success: true, data: updated });
  },
);

// ---------- STAFF CANCEL ----------
router.post(
  "/admin/orders/:id/cancel",
  authenticate,
  requireWrite,
  async (req: AuthRequest, res) => {
    const id = req.params["id"] as string;
    const reason = String((req.body ?? {}).reason ?? "").trim() || "Cancelled by staff";
    const orders = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id)).limit(1);
    const order = orders[0];
    if (!order) {
      res
        .status(404)
        .json({ success: false, error: { code: "NOT_FOUND", message: "Order not found" } });
      return;
    }
    if (order.channel !== "ONLINE") {
      res.status(400).json({
        success: false,
        error: { code: "BAD_REQUEST", message: "Only online orders use this flow" },
      });
      return;
    }
    if (order.status === "cancelled") {
      res.status(400).json({
        success: false,
        error: { code: "ALREADY_CANCELLED", message: "Order is already cancelled" },
      });
      return;
    }
    const ld: any = order.logisticsDetails ?? {};
    const from = ld.status ?? "pending_confirmation";
    try {
      const updated = await cancelOnlineOrder(order, reason, "staff", req.user?.id ?? null);
      await auditWrite(req, {
        action: "UPDATE",
        entityType: "invoice",
        entityId: id,
        before: { status: from },
        after: { status: "cancelled", reason },
      });
      void notifyCustomerLifecycle(updated, "cancelled", {
        cancelReason: reason,
        cancelledBy: "staff",
      });
      res.json({ success: true, data: updated });
    } catch (err: any) {
      if (err instanceof OrderCancelError) {
        const status = err.code === "NOT_FOUND" ? 404 : 400;
        res.status(status).json({ success: false, error: { code: err.code, message: err.message } });
        return;
      }
      throw err;
    }
  },
);

export default router;
