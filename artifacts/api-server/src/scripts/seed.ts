import { db, usersTable, locationsTable, productsTable, customersTable, suppliersTable, agentsTable, settingsTable, priceListsTable, rolesTable, permissionsTable, rolePermissionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const DEFAULT_PERMISSIONS: Array<{ key: string; description: string; category: string }> = [
  // Users & access
  { key: "users.read", description: "View users", category: "users" },
  { key: "users.write", description: "Create / edit users", category: "users" },
  { key: "rbac.manage", description: "Manage roles and permissions", category: "users" },
  // Catalog
  { key: "products.read", description: "View products", category: "catalog" },
  { key: "products.write", description: "Create / edit products", category: "catalog" },
  { key: "pricing.write", description: "Edit prices and price lists", category: "catalog" },
  // Inventory
  { key: "inventory.read", description: "View stock levels", category: "inventory" },
  { key: "inventory.adjust", description: "Adjust stock and write damage / returns", category: "inventory" },
  { key: "transfers.write", description: "Create stock transfers", category: "inventory" },
  // Sales
  { key: "pos.use", description: "Operate the POS terminal", category: "sales" },
  { key: "pos.shift.open", description: "Open a cashier shift", category: "sales" },
  { key: "pos.shift.close", description: "Close a cashier shift", category: "sales" },
  { key: "pos.discount.override", description: "Override max-discount rules at checkout", category: "sales" },
  { key: "invoices.write", description: "Create and edit invoices and estimates", category: "sales" },
  // Finance
  { key: "finance.read", description: "View financial reports", category: "finance" },
  { key: "purchase.write", description: "Create purchase orders", category: "finance" },
  // System
  { key: "settings.write", description: "Edit company / system settings", category: "system" },
  { key: "audit.read", description: "View the audit log", category: "system" },
];

const DEFAULT_ROLES: Array<{ name: string; description: string; permissions: string[] }> = [
  { name: "SUPER_ADMIN", description: "Full system access (cannot be restricted)", permissions: DEFAULT_PERMISSIONS.map((p) => p.key) },
  { name: "ERP_MANAGER", description: "Day-to-day operations manager", permissions: DEFAULT_PERMISSIONS.filter((p) => !["rbac.manage", "settings.write"].includes(p.key)).map((p) => p.key) },
  { name: "ACCOUNTANT", description: "Finance & reporting", permissions: ["finance.read", "invoices.write", "purchase.write", "products.read", "inventory.read", "audit.read"] },
  { name: "AGENT", description: "Field sales agent", permissions: ["products.read", "invoices.write", "inventory.read"] },
  { name: "WH_MANAGER", description: "Warehouse manager", permissions: ["inventory.read", "inventory.adjust", "transfers.write", "products.read", "purchase.write"] },
  { name: "CASHIER", description: "POS cashier", permissions: ["pos.use", "pos.shift.open", "pos.shift.close", "products.read", "invoices.write", "inventory.read"] },
];

async function seed() {
  console.log("Seeding database...");

  // RBAC: ensure baseline roles + permissions exist before anything else.
  for (const p of DEFAULT_PERMISSIONS) {
    await db.insert(permissionsTable).values(p).onConflictDoNothing();
  }

  for (const r of DEFAULT_ROLES) {
    const existing = (await db.select().from(rolesTable).where(eq(rolesTable.name, r.name)).limit(1))[0];
    const role = existing ?? (await db.insert(rolesTable).values({ name: r.name, description: r.description, isSystem: true }).returning())[0];
    // Reset perms to the default set so we stay current with new releases. Custom roles are untouched.
    await db.delete(rolePermissionsTable).where(eq(rolePermissionsTable.roleId, role.id));
    if (r.permissions.length) {
      await db.insert(rolePermissionsTable).values(r.permissions.map((k) => ({ roleId: role.id, permissionKey: k }))).onConflictDoNothing();
    }
  }

  await db.insert(settingsTable).values([
    { key: "company", value: { companyName: "Rathinam Crackers", gstin: "33AABCR1234A1Z5", address: "123 Main Road, Sivakasi, Tamil Nadu - 626123", phone: "9876543210", email: "info@rathinamcrackers.com", defaultHSN: "36049000", financialYear: "2025-2026", bankDetails: "SBI - 1234567890 - SBIN0001234" } as any },
    { key: "pricing", value: { wholesaleQtyThreshold: 10, loyaltyEarnRate: 1, loyaltyRedemptionRate: 1, taxRate: 0.18 } as any },
  ]).onConflictDoNothing();

  const passwordHash = await bcrypt.hash("admin123", 10);
  await db.insert(usersTable).values([
    { id: "usr-admin", name: "Super Admin", username: "admin", passwordHash, pin: "1234", role: "SUPER_ADMIN" as any, locationIds: [], email: "admin@rathinam.com", isActive: true },
    { id: "usr-mgr", name: "ERP Manager", username: "manager", passwordHash, pin: "2345", role: "ERP_MANAGER" as any, locationIds: [], email: "manager@rathinam.com", isActive: true },
    { id: "usr-cashier", name: "POS Cashier", username: "cashier", passwordHash, pin: "3456", role: "CASHIER" as any, locationIds: ["loc-shop1"], email: "cashier@rathinam.com", isActive: true },
    { id: "usr-wh", name: "Warehouse Manager", username: "warehouse", passwordHash, pin: "4567", role: "WH_MANAGER" as any, locationIds: ["loc-wh1"], email: "wh@rathinam.com", isActive: true },
  ]).onConflictDoNothing();

  await db.insert(locationsTable).values([
    { id: "loc-wh1", name: "Main Warehouse - Sivakasi", type: "warehouse" as any, address: "Industrial Area, Sivakasi", city: "Sivakasi", phone: "9876543201", isActive: true },
    { id: "loc-shop1", name: "Retail Shop - Chennai", type: "shop" as any, address: "T. Nagar, Chennai", city: "Chennai", phone: "9876543202", isActive: true },
    { id: "loc-shop2", name: "Retail Shop - Madurai", type: "shop" as any, address: "Anna Nagar, Madurai", city: "Madurai", phone: "9876543203", isActive: true },
  ]).onConflictDoNothing();

  // Single-brand product (3 sizes, same brand). brand defaults to "Standard".
  const makeVariants = (base: number, brand: string = "Standard") => {
    const slug = brand.toLowerCase().replace(/\s+/g, "-");
    return [
      { variantId: `${slug}-s`, brand, size: "Small", packContent: "10 pcs", unit: "Box", prices: { purchase: base * 0.6, wholesaleBulk: base * 0.8, retailOnline: base, retailEst: base * 1.05, agent: base * 0.85 } },
      { variantId: `${slug}-m`, brand, size: "Medium", packContent: "6 pcs", unit: "Box", prices: { purchase: base * 1.2, wholesaleBulk: base * 1.6, retailOnline: base * 2, retailEst: base * 2.1, agent: base * 1.7 } },
      { variantId: `${slug}-l`, brand, size: "Large", packContent: "4 pcs", unit: "Box", prices: { purchase: base * 2, wholesaleBulk: base * 2.7, retailOnline: base * 3.5, retailEst: base * 3.6, agent: base * 2.8 } },
    ];
  };

  // Multi-brand product: same product offered under multiple manufacturer brands.
  const makeMultiBrandVariants = (base: number, brands: Array<[string, number]>) =>
    brands.flatMap(([brand, mul]) => makeVariants(base * mul, brand));

  const products = [
    { id: "prod-001", code: "GND001", name: "Classic Flower Pot", category: "Ground", variants: makeMultiBrandVariants(50, [["Standard", 1], ["Sri Kaliswari", 1.3], ["Cock Brand", 0.9]]), onlineDisplay: true, featured: true },
    { id: "prod-002", code: "GND002", name: "Colour Flower Pot", category: "Ground", variants: makeMultiBrandVariants(80, [["Standard", 1], ["Sri Kaliswari", 1.25]]), onlineDisplay: true },
    { id: "prod-003", code: "ARL001", name: "Sky Shot 60 Shells", category: "Aerial", variants: makeMultiBrandVariants(150, [["Standard", 1], ["Sri Kaliswari", 1.4], ["Coronation", 1.15]]), onlineDisplay: true, featured: true },
    { id: "prod-004", code: "ARL002", name: "Multi Colour Aerial", category: "Aerial", variants: makeVariants(200, "Sri Kaliswari"), onlineDisplay: true },
    { id: "prod-005", code: "SPK001", name: "Silver Sparkler 30cm", category: "Sparkler", variants: makeMultiBrandVariants(30, [["Standard", 1], ["Cock Brand", 0.85]]), onlineDisplay: true },
    { id: "prod-006", code: "SPK002", name: "Golden Sparkler 50cm", category: "Sparkler", variants: makeVariants(45, "Coronation"), onlineDisplay: true },
    { id: "prod-007", code: "NOV001", name: "Wishing Well Fountain", category: "Novelty", variants: makeMultiBrandVariants(120, [["Standard", 1], ["Sri Kaliswari", 1.3]]), onlineDisplay: true, featured: true },
    { id: "prod-008", code: "GBX001", name: "Diwali Gift Box - Premium", category: "Gift Box", variants: makeVariants(500, "Sri Kaliswari"), onlineDisplay: true, featured: true },
    { id: "prod-009", code: "GBX002", name: "Family Pack", category: "Gift Box", variants: makeVariants(300, "Standard"), onlineDisplay: true },
    { id: "prod-010", code: "BND001", name: "Starter Bundle", category: "Bundle", variants: makeVariants(200, "Standard"), onlineDisplay: true },
  ];

  for (const p of products) {
    await db.insert(productsTable).values({ ...p, hsnCode: "36049000", status: "Active" as any } as any).onConflictDoNothing();
  }

  await db.insert(customersTable).values([
    { id: "cust-001", name: "Rajan Fireworks Store", phone: "9876500001", email: "rajan@example.com", customerType: "WHOLESALE" as any, city: "Chennai", gstin: "33AABCR0001A1Z1", creditLimit: "50000", outstandingBalance: "12500", loyaltyPoints: 0 },
    { id: "cust-002", name: "Kumar Crackers", phone: "9876500002", customerType: "WHOLESALE" as any, city: "Coimbatore", outstandingBalance: "0", loyaltyPoints: 150 },
    { id: "cust-003", name: "Priya Retail", phone: "9876500003", customerType: "RETAIL" as any, city: "Madurai", outstandingBalance: "0", loyaltyPoints: 320 },
    { id: "cust-004", name: "Walk-in Customer", phone: "0000000000", customerType: "WALK_IN" as any, outstandingBalance: "0", loyaltyPoints: 0 },
  ]).onConflictDoNothing();

  await db.insert(suppliersTable).values([
    { id: "supp-001", name: "Sri Murugan Fireworks Factory", contactPerson: "Murugan", phone: "9876501001", address: "Sivakasi Industrial Area", gstin: "33AABCS0001A1Z1" },
    { id: "supp-002", name: "Kalyani Pyro Industries", contactPerson: "Kalyani", phone: "9876501002", address: "Virudhunagar District" },
  ]).onConflictDoNothing();

  await db.insert(agentsTable).values([
    { id: "agt-001", name: "Senthil Kumar", phone: "9876502001", email: "senthil@example.com", promoCode: "SENTHIL10", commissionTiers: [{ from: 0, to: 50000, rate: 5 }, { from: 50001, to: 200000, rate: 7 }, { from: 200001, to: 9999999, rate: 10 }] as any, maxDiscountPct: "5", monthlyTarget: "200000", status: "active" as any },
    { id: "agt-002", name: "Meena Devi", phone: "9876502002", email: "meena@example.com", promoCode: "MEENA15", commissionTiers: [{ from: 0, to: 100000, rate: 6 }, { from: 100001, to: 9999999, rate: 9 }] as any, maxDiscountPct: "3", monthlyTarget: "150000", status: "active" as any },
  ]).onConflictDoNothing();

  await db.insert(priceListsTable).values([
    { id: "pl-001", name: "Standard 2025", season: "Diwali 2025", isActive: true, validFrom: "2025-08-01", validUntil: "2025-11-30" },
    { id: "pl-002", name: "Off-Season 2025", season: "Off-Season", isActive: false, validFrom: "2025-12-01", validUntil: "2026-07-31" },
  ]).onConflictDoNothing();

  console.log("Seed complete!");
}

seed().catch((err) => { console.error(err); process.exit(1); }).then(() => process.exit(0));
