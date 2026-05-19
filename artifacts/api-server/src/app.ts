import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { requestId } from "./middleware/request-id";

const app: Express = express();

// Trust the upstream Replit proxy so the rate-limiter sees real client IPs.
app.set("trust proxy", 1);

// Security headers: HSTS, X-Frame-Options, no-sniff, referrer policy, etc.
// CSP is left unset because the API is consumed cross-origin by 4 frontends
// and a custom CSP would belong on each frontend's static host.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

// Generous default limit to absorb burst traffic from POS terminals while
// stopping single-source flooders. Tighter limits are applied per-route
// (see routes/v1/auth.ts).
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, error: { code: "RATE_LIMITED", message: "Too many requests, please slow down." } },
});
app.use(generalLimiter);

// Stamp every request with a stable id (honoring upstream X-Request-Id) so
// log lines and error responses can be correlated end-to-end.
app.use(requestId);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use("/api", router);

export default app;
