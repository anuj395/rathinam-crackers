// Central RBAC role groups. Use these in route files instead of repeating
// hard-coded role lists; this keeps the security surface auditable from one
// place. Every group includes SUPER_ADMIN + ADMIN by default — they're the
// "operator" tier and can never be locked out of an operation by group choice.
//
// API_TOKEN is included where third-party integrations are expected to call
// the route (catalog, stock, sales). It is NOT included for destructive admin
// operations (rbac, audit, settings, demo-data) — those require a real
// human-attached session.

const ADMIN = ["SUPER_ADMIN", "ADMIN"] as const;

/** Day-to-day catalog & customer-data writes. */
export const WRITE_ROLES = [...ADMIN, "ERP_MANAGER", "MANAGER", "API_TOKEN"];

/** Catalog admin (products, brands, categories, coupons, price lists). */
export const CATALOG_ADMIN = [...ADMIN, "ERP_MANAGER", "MANAGER", "API_TOKEN"];

/** Sales-side writes (invoices, estimates, customers, returns). Agents
 *  can create estimates and customer records they introduced. */
export const SALES_WRITE = [...ADMIN, "ERP_MANAGER", "MANAGER", "AGENT", "ACCOUNTANT", "API_TOKEN"];

/** Finance reads / writes (reports, purchase orders, GST, daybook). */
export const FINANCE_ROLES = [...ADMIN, "ERP_MANAGER", "MANAGER", "ACCOUNTANT", "API_TOKEN"];

/** Stock & warehouse operations (transfers, packing, receive, adjust). */
export const WAREHOUSE_ROLES = [...ADMIN, "ERP_MANAGER", "MANAGER", "WH_MANAGER", "API_TOKEN"];

/** POS terminal operations (sale, shift open/close). */
export const POS_ROLES = [...ADMIN, "ERP_MANAGER", "MANAGER", "CASHIER", "API_TOKEN"];

/** Customer-data writes — broader than WRITE_ROLES because cashiers create
 *  walk-in customers and agents create their own customers. */
export const CUSTOMER_WRITE = [...ADMIN, "ERP_MANAGER", "MANAGER", "AGENT", "CASHIER", "API_TOKEN"];

/** Media library uploads. */
export const MEDIA_WRITE = [...ADMIN, "ERP_MANAGER", "MANAGER", "API_TOKEN"];

/** Highest-trust operations (demo data, destructive utilities, rbac). */
export const SUPER_ONLY = ["SUPER_ADMIN"];
