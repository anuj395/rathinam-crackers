import type { RequestHandler } from "express";
import crypto from "node:crypto";

// Honor an upstream X-Request-Id when nginx (or a load balancer) sets one,
// otherwise mint a fresh UUID. Echoed back as a response header so curl/log
// correlation works end-to-end. Also stitched into req.id which pino-http
// uses to tag every log line for the request.
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header("x-request-id");
  const id = incoming && /^[A-Za-z0-9._-]{1,128}$/.test(incoming) ? incoming : crypto.randomUUID();
  (req as unknown as { id: string }).id = id;
  res.setHeader("X-Request-Id", id);
  next();
};
