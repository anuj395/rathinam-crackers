import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./v1/auth.js";
import dashboardRouter from "./v1/dashboard.js";
import productsRouter from "./v1/products.js";
import brandsRouter from "./v1/brands.js";
import categoriesRouter from "./v1/categories.js";
import apiTokensRouter from "./v1/apiTokens.js";
import priceListsRouter from "./v1/priceLists.js";
import stockRouter from "./v1/stock.js";
import customersRouter from "./v1/customers.js";
import suppliersRouter from "./v1/suppliers.js";
import agentsRouter from "./v1/agents.js";
import estimatesRouter from "./v1/estimates.js";
import invoicesRouter from "./v1/invoices.js";
import purchaseOrdersRouter from "./v1/purchaseOrders.js";
import transfersRouter from "./v1/transfers.js";
import couponsRouter from "./v1/coupons.js";
import posRouter from "./v1/pos.js";
import returnsRouter from "./v1/returns.js";
import reportsRouter from "./v1/reports.js";
import settingsRouter from "./v1/settings.js";
import usersRouter from "./v1/users.js";
import locationsRouter from "./v1/locations.js";
import notificationsRouter from "./v1/notifications.js";
import packingJobsRouter from "./v1/packingJobs.js";
import brochureRouter from "./v1/brochure.js";
import siteContentRouter from "./v1/siteContent.js";
import reviewsRouter from "./v1/reviews.js";
import shopRouter from "./v1/shop.js";
import systemRouter from "./v1/system.js";
import auditLogRouter from "./v1/auditLog.js";
import rbacRouter from "./v1/rbac.js";
import bulkRouter from "./v1/bulk.js";
import ordersAdminRouter from "./v1/ordersAdmin.js";
import mediaRouter, { UPLOAD_DIR } from "./v1/media.js";
import express from "express";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/v1", authRouter);
router.use("/v1", dashboardRouter);
router.use("/v1", productsRouter);
router.use("/v1", brandsRouter);
router.use("/v1", categoriesRouter);
router.use("/v1", apiTokensRouter);
router.use("/v1", priceListsRouter);
router.use("/v1", stockRouter);
router.use("/v1", customersRouter);
router.use("/v1", suppliersRouter);
router.use("/v1", agentsRouter);
router.use("/v1", estimatesRouter);
router.use("/v1", invoicesRouter);
router.use("/v1", purchaseOrdersRouter);
router.use("/v1", transfersRouter);
router.use("/v1", couponsRouter);
router.use("/v1", posRouter);
router.use("/v1", returnsRouter);
router.use("/v1", reportsRouter);
router.use("/v1", settingsRouter);
router.use("/v1", usersRouter);
router.use("/v1", locationsRouter);
router.use("/v1", notificationsRouter);
router.use("/v1", packingJobsRouter);
router.use("/v1", brochureRouter);
router.use("/v1", siteContentRouter);
router.use("/v1", reviewsRouter);
router.use("/v1", shopRouter);
router.use("/v1", systemRouter);
router.use("/v1", auditLogRouter);
router.use("/v1", rbacRouter);
router.use("/v1", bulkRouter);
router.use("/v1", ordersAdminRouter);
router.use("/v1", mediaRouter);

// Serve uploaded media as PUBLIC static files. This is intentional and
// not an auth hole: the customer-facing website (rathinamcracker.com) is
// anonymous, so product photos and banners must be reachable without a
// bearer token. Filenames are unguessable nanoid(12) values so directory
// enumeration is infeasible. In production, nginx serves the same folder
// directly via /uploads/ alias and bypasses Node entirely for cached
// files (see deploy/nginx/ratinam-subdomains.conf); the Node handler
// below is a development-mode fallback so the dev workflow works without
// nginx in front.
router.use(
  "/uploads",
  express.static(UPLOAD_DIR, {
    fallthrough: false,
    maxAge: "30d",
    immutable: true,
  }),
);

export default router;
