import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

// Liveness — process is up. Used by pm2/systemd to decide whether to restart.
router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Readiness — process is up AND its dependencies (Postgres) are reachable.
// Used by the load balancer to decide whether to send traffic. Returns 503
// when the DB is down so we drain instead of returning 5xx to users.
router.get("/readyz", async (_req, res) => {
  try {
    await db.execute(sql`select 1`);
    res.json({ status: "ok", db: "ok" });
  } catch (err: any) {
    res.status(503).json({ status: "degraded", db: "down", error: err?.message ?? "db unreachable" });
  }
});

export default router;
