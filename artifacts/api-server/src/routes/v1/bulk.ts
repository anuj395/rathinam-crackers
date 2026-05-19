import { Router } from "express";
import {
  db,
  productsTable,
  customersTable,
  agentsTable,
  couponsTable,
  brandsTable,
  categoriesTable,
  locationsTable,
  suppliersTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { authenticate, requireRole, type AuthRequest } from "../../middleware/authenticate.js";
import { auditWrite } from "../../lib/audit.js";
import {
  serializeCsv,
  parseCsv,
  parseBool,
  parseNumber,
  parseJsonOr,
  parseStringArray,
} from "../../lib/csv.js";

const router: Router = Router();
const requireWrite = requireRole("SUPER_ADMIN", "ADMIN", "ERP_MANAGER");

type ResourceKey =
  | "products"
  | "customers"
  | "agents"
  | "coupons"
  | "brands"
  | "categories"
  | "locations"
  | "suppliers";

const RESOURCES: ResourceKey[] = [
  "products",
  "customers",
  "agents",
  "coupons",
  "brands",
  "categories",
  "locations",
  "suppliers",
];

const HEADERS: Record<ResourceKey, string[]> = {
  products: [
    "code", "name", "category", "shortDescription", "description", "safetyInfo",
    "hsnCode", "gstRate", "onlineDisplay", "featured", "status", "reorderLevel",
    "imageUrl", "gallery", "occasions", "seoTitle", "seoDescription", "specs", "variants",
  ],
  customers: [
    "name", "phone", "email", "address", "city", "state", "gstin",
    "customerType", "creditLimit", "status",
  ],
  agents: [
    "name", "phone", "email", "promoCode", "maxDiscountPct", "monthlyTarget",
    "status", "commissionTiers",
  ],
  coupons: [
    "code", "type", "discountValue", "maxDiscountCap", "minOrderValue",
    "usageLimit", "perCustomerLimit", "status", "autoApply",
    "validFrom", "validUntil", "description",
    "applicableChannels", "applicableCustomerTypes",
  ],
  brands: ["name", "slug", "logoUrl", "description", "sortOrder", "isActive"],
  categories: [
    "name", "slug", "description", "emoji", "imageUrl", "color",
    "sortOrder", "isActive",
  ],
  locations: ["name", "type", "address", "city", "phone", "isActive"],
  suppliers: [
    "name", "contactPerson", "phone", "email", "address", "gstin", "status",
  ],
};

// Per-resource header aliases — incoming headers are matched case-insensitively
// after stripping spaces/underscores/hyphens. Aliases below let users use
// friendlier column names like "Mobile" → phone, "SKU" → code, etc.
const ALIASES: Record<ResourceKey, Record<string, string>> = {
  products: {
    sku: "code", productcode: "code", productname: "name", title: "name",
    cat: "category", price: "salePrice", saleprice: "salePrice",
    mrp: "mrpPrice", regularprice: "mrpPrice", costprice: "costPrice",
    stock: "stockQty", quantity: "stockQty", qty: "stockQty",
    image: "imageUrl", img: "imageUrl", thumbnail: "imageUrl",
    active: "isActive", enabled: "isActive", featured: "isFeatured",
  },
  customers: {
    customername: "name", fullname: "name",
    mobile: "phone", mobileno: "phone", phoneno: "phone", contact: "phone",
    emailaddress: "email", mailid: "email",
    type: "customerType", customertype: "customerType",
    gst: "gstin", gstno: "gstin", gstnumber: "gstin",
    credit: "creditLimit", limit: "creditLimit",
  },
  agents: {
    agentname: "name", fullname: "name",
    mobile: "phone", mobileno: "phone", contact: "phone",
    code: "promoCode", referralcode: "promoCode", agentcode: "promoCode",
    commission: "commissionRate", commissionpercent: "commissionRate",
  },
  coupons: {
    couponcode: "code", promocode: "code",
    type: "discountType", discounttype: "discountType",
    value: "discountValue", discount: "discountValue",
    mincart: "minCartValue", minamount: "minCartValue",
    maxdiscount: "maxDiscount", limit: "usageLimit", uses: "usageLimit",
    from: "validFrom", to: "validUntil", expiry: "validUntil",
  },
  brands: {
    brandname: "name", logo: "logoUrl", image: "logoUrl",
    active: "isActive", enabled: "isActive", order: "sortOrder",
  },
  categories: {
    categoryname: "name", icon: "emoji",
    image: "imageUrl", img: "imageUrl",
    active: "isActive", enabled: "isActive", order: "sortOrder",
  },
  locations: {
    locationname: "name", branchname: "name",
    locationtype: "type", branchtype: "type",
    mobile: "phone", contact: "phone",
    active: "isActive", enabled: "isActive",
  },
  suppliers: {
    suppliername: "name", vendorname: "name",
    contact: "contactPerson", contactname: "contactPerson",
    mobile: "phone", phoneno: "phone",
    emailaddress: "email", mailid: "email",
    gst: "gstin", gstno: "gstin", gstnumber: "gstin",
  },
};

// Sample rows used for the "Download template" — gives users a working
// reference they can edit in Excel/Sheets.
const SAMPLES: Record<ResourceKey, Array<Record<string, unknown>>> = {
  products: [
    {
      code: "SKY-100", name: "100 Wala Lar", category: "Sparklers",
      shortDescription: "Classic 100 wala garland", description: "Long-lasting traditional cracker.",
      safetyInfo: "Light fuse and stand back 5m.",
      brand: "Standard", subcategory: "", tags: '["family","loud"]',
      mrpPrice: 250, salePrice: 199, costPrice: 120,
      stockQty: 100, lowStockThreshold: 10, unit: "pcs", weight: "0.5",
      hsnCode: "3604", taxRate: 18,
      imageUrl: "", images: "[]", isActive: true, isFeatured: false, sortOrder: 0,
    },
  ],
  customers: [
    {
      name: "Sample Customer", phone: "9000000001", email: "sample@example.com",
      address: "1 Demo Road", city: "Sivakasi", state: "TN", gstin: "",
      customerType: "RETAIL", creditLimit: 0, status: "active",
    },
  ],
  agents: [
    {
      name: "Sample Agent", phone: "9000000002", email: "agent@example.com",
      promoCode: "SAMPLE10", commissionRate: 5, status: "active",
    },
  ],
  coupons: [
    {
      code: "WELCOME10", discountType: "percentage", discountValue: 10,
      minCartValue: 500, maxDiscount: 200, usageLimit: 100, perCustomerLimit: 1,
      status: "active", autoApply: false,
      validFrom: "2025-01-01", validUntil: "2025-12-31",
      description: "10% off first order",
      applicableChannels: '["website","pos"]',
      applicableCustomerTypes: '["RETAIL"]',
    },
  ],
  brands: [
    { name: "Standard Fireworks", slug: "standard-fireworks", logoUrl: "", description: "Premium brand", sortOrder: 1, isActive: true },
  ],
  categories: [
    { name: "Sparklers", slug: "sparklers", description: "Hand-held sparkles", emoji: "✨", imageUrl: "", color: "#facc15", sortOrder: 1, isActive: true },
  ],
  locations: [
    { name: "Main Warehouse", type: "warehouse", address: "Industrial Estate", city: "Sivakasi", phone: "9000000003", isActive: true },
    { name: "Retail Outlet 1", type: "shop", address: "Main Bazaar", city: "Madurai", phone: "9000000004", isActive: true },
  ],
  suppliers: [
    { name: "Demo Supplier", contactPerson: "Mr. Sample", phone: "9000000005", email: "supplier@example.com", address: "Vendor Lane", gstin: "33ABCDE0001Z2", status: "active" },
  ],
};

const normHeader = (s: string): string =>
  s.toLowerCase().replace(/[\s_\-]+/g, "");

function buildHeaderMap(resource: ResourceKey, incomingHeaders: string[]): Record<string, string> {
  // canonicalNorm → canonicalName
  const canonicalByNorm: Record<string, string> = {};
  for (const h of HEADERS[resource]) canonicalByNorm[normHeader(h)] = h;
  const aliases = ALIASES[resource];
  // returns: incomingHeader → canonical (or undefined to ignore)
  const map: Record<string, string> = {};
  for (const h of incomingHeaders) {
    const n = normHeader(h);
    if (canonicalByNorm[n]) {
      map[h] = canonicalByNorm[n];
    } else if (aliases[n]) {
      map[h] = aliases[n];
    }
    // else: unknown column — silently ignored
  }
  return map;
}

function normalizeRows(resource: ResourceKey, rows: Array<Record<string, string>>): ImportRow[] {
  if (rows.length === 0) return [];
  const incomingHeaders = Object.keys(rows[0]);
  const map = buildHeaderMap(resource, incomingHeaders);
  return rows.map((r) => {
    const out: ImportRow = {};
    for (const [src, val] of Object.entries(r)) {
      const canonical = map[src];
      if (canonical) out[canonical] = val;
    }
    return out;
  });
}

function rowFor(resource: ResourceKey, r: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const h of HEADERS[resource]) out[h] = r[h];
  return out;
}

// ---------- EXPORT ----------
router.get("/bulk/:resource/export", authenticate, async (req, res) => {
  const resource = req.params.resource as ResourceKey;
  if (!RESOURCES.includes(resource)) {
    return res.status(404).json({ success: false, error: "Unknown resource" });
  }
  const tableMap = {
    products: productsTable,
    customers: customersTable,
    agents: agentsTable,
    coupons: couponsTable,
    brands: brandsTable,
    categories: categoriesTable,
    locations: locationsTable,
    suppliers: suppliersTable,
  };
  const rows = await db.select().from(tableMap[resource] as never);
  const projected = (rows as Array<Record<string, unknown>>).map((r) => rowFor(resource, r));
  const csv = serializeCsv(projected, HEADERS[resource]);
  const filename = `${resource}-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(csv);
});

// ---------- IMPORT ----------
type ImportRow = Record<string, string>;
type ImportResult = { created: number; updated: number; skipped: number; errors: Array<{ row: number; error: string }> };

router.get("/bulk/:resource/template", authenticate, (req, res) => {
  const resource = req.params.resource as ResourceKey;
  if (!RESOURCES.includes(resource)) {
    return res.status(404).json({ success: false, error: "Unknown resource" });
  }
  const csv = serializeCsv(SAMPLES[resource], HEADERS[resource]);
  const filename = `${resource}-template.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(`\uFEFF${csv}`);
});

router.post("/bulk/:resource/import", authenticate, requireWrite, async (req: AuthRequest, res) => {
  const resource = req.params.resource as ResourceKey;
  if (!RESOURCES.includes(resource)) {
    return res.status(404).json({ success: false, error: "Unknown resource" });
  }
  const body = req.body as { csv?: string; rows?: ImportRow[] };
  let rows: ImportRow[] = [];
  if (typeof body?.csv === "string" && body.csv.length > 0) {
    const raw = parseCsv(body.csv);
    rows = normalizeRows(resource, raw);
  } else if (Array.isArray(body?.rows)) {
    // JSON-rows path: still apply alias normalization in case caller used
    // friendly names (e.g. "Mobile" instead of "phone").
    const asStrings = body.rows.map((r) => {
      const o: Record<string, string> = {};
      for (const [k, v] of Object.entries(r)) o[k] = v == null ? "" : String(v);
      return o;
    });
    rows = normalizeRows(resource, asStrings);
  } else {
    return res.status(400).json({ success: false, error: "Provide csv (string) or rows (array)" });
  }
  if (rows.length === 0) {
    return res.json({ success: true, data: { created: 0, updated: 0, skipped: 0, errors: [] } });
  }
  if (rows.length > 5000) {
    return res.status(400).json({ success: false, error: "Maximum 5000 rows per import" });
  }

  const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      switch (resource) {
        case "products":
          await upsertProduct(row, result);
          break;
        case "customers":
          await upsertCustomer(row, result);
          break;
        case "agents":
          await upsertAgent(row, result);
          break;
        case "coupons":
          await upsertCoupon(row, result);
          break;
        case "brands":
          await upsertBrand(row, result);
          break;
        case "categories":
          await upsertCategory(row, result);
          break;
        case "locations":
          await upsertLocation(row, result);
          break;
        case "suppliers":
          await upsertSupplier(row, result);
          break;
      }
    } catch (err) {
      result.errors.push({ row: i + 2, error: err instanceof Error ? err.message : String(err) });
    }
  }

  await auditWrite(req, {
    action: "CREATE",
    entityType: resource,
    entityId: `bulk-import:${resource}`,
    after: { created: result.created, updated: result.updated, errors: result.errors.length },
  });

  return res.json({ success: true, data: result });
});

// ---------- per-resource upserts ----------

async function upsertProduct(r: ImportRow, result: ImportResult) {
  const code = (r.code ?? "").trim();
  const name = (r.name ?? "").trim();
  const category = (r.category ?? "").trim();
  if (!code || !name || !category) {
    throw new Error("code, name and category are required");
  }
  const existing = await db.select().from(productsTable).where(eq(productsTable.code, code)).limit(1);
  const status = (r.status ?? "Active").trim() === "Discontinued" ? "Discontinued" : "Active";
  const payload = {
    code,
    name,
    category,
    description: r.description || null,
    shortDescription: r.shortDescription || null,
    safetyInfo: r.safetyInfo || null,
    hsnCode: r.hsnCode || null,
    gstRate: parseNumber(r.gstRate),
    onlineDisplay: parseBool(r.onlineDisplay),
    featured: parseBool(r.featured),
    status: status as "Active" | "Discontinued",
    reorderLevel: parseNumber(r.reorderLevel) ?? 10,
    imageUrl: r.imageUrl || null,
    gallery: parseStringArray(r.gallery),
    occasions: parseStringArray(r.occasions),
    seoTitle: r.seoTitle || null,
    seoDescription: r.seoDescription || null,
    specs: parseJsonOr<Record<string, string>>(r.specs, {}),
    variants: parseJsonOr<unknown[]>(r.variants, []),
  };
  if (existing.length > 0) {
    await db
      .update(productsTable)
      .set({ ...payload, updatedAt: new Date() } as never)
      .where(eq(productsTable.id, existing[0].id));
    result.updated++;
  } else {
    await db.insert(productsTable).values(payload as never);
    result.created++;
  }
}

async function upsertCustomer(r: ImportRow, result: ImportResult) {
  const phone = (r.phone ?? "").trim();
  const name = (r.name ?? "").trim();
  if (!phone || !name) throw new Error("name and phone are required");
  const existing = await db.select().from(customersTable).where(eq(customersTable.phone, phone)).limit(1);
  const validTypes = ["RETAIL", "WHOLESALE", "AGENT_CUSTOMER", "VIP", "WALK_IN"] as const;
  const ct = validTypes.includes(r.customerType as never) ? (r.customerType as (typeof validTypes)[number]) : "RETAIL";
  const status = (r.status ?? "active") === "inactive" ? "inactive" : "active";
  const credit = parseNumber(r.creditLimit);
  const basePayload = {
    name,
    phone,
    email: r.email || null,
    address: r.address || null,
    city: r.city || null,
    state: r.state || null,
    gstin: r.gstin || null,
    customerType: ct,
    creditLimit: credit !== null ? String(credit) : "0",
    status: status as "active" | "inactive",
  };
  if (existing.length > 0) {
    // Preserve original `source` (website/pos/erp/import) so analytics keep
    // attribution for self-signed-up customers when re-importing edited data.
    await db
      .update(customersTable)
      .set({ ...basePayload, updatedAt: new Date() } as never)
      .where(eq(customersTable.id, existing[0].id));
    result.updated++;
  } else {
    await db.insert(customersTable).values({ ...basePayload, source: "import" as const } as never);
    result.created++;
  }
}

async function upsertAgent(r: ImportRow, result: ImportResult) {
  const phone = (r.phone ?? "").trim();
  const name = (r.name ?? "").trim();
  const promoCode = (r.promoCode ?? "").trim() || null;
  if (!phone || !name) throw new Error("name and phone are required");
  let existing: { id: string }[] = [];
  if (promoCode) {
    existing = await db.select({ id: agentsTable.id }).from(agentsTable).where(eq(agentsTable.promoCode, promoCode)).limit(1);
  }
  if (existing.length === 0) {
    existing = await db.select({ id: agentsTable.id }).from(agentsTable).where(eq(agentsTable.phone, phone)).limit(1);
  }
  const status = (r.status ?? "active") === "inactive" ? "inactive" : "active";
  const payload = {
    name,
    phone,
    email: r.email || null,
    promoCode,
    maxDiscountPct: parseNumber(r.maxDiscountPct) !== null ? String(parseNumber(r.maxDiscountPct)) : "0",
    monthlyTarget: parseNumber(r.monthlyTarget) !== null ? String(parseNumber(r.monthlyTarget)) : "0",
    status: status as "active" | "inactive",
    commissionTiers: parseJsonOr<unknown[]>(r.commissionTiers, []),
  };
  if (existing.length > 0) {
    await db.update(agentsTable).set(payload as never).where(eq(agentsTable.id, existing[0].id));
    result.updated++;
  } else {
    await db.insert(agentsTable).values(payload as never);
    result.created++;
  }
}

async function upsertCoupon(r: ImportRow, result: ImportResult) {
  const code = (r.code ?? "").trim();
  if (!code) throw new Error("code is required");
  const validTypes = ["flat", "percent", "minorder", "bxgy", "bundle", "firstorder", "agentpromo"] as const;
  if (!validTypes.includes(r.type as never)) throw new Error(`type must be one of ${validTypes.join("|")}`);
  const validStatus = ["active", "paused", "expired"] as const;
  const status = validStatus.includes(r.status as never) ? (r.status as (typeof validStatus)[number]) : "active";
  const dv = parseNumber(r.discountValue);
  if (dv === null) throw new Error("discountValue must be a number");
  const cap = parseNumber(r.maxDiscountCap);
  const moq = parseNumber(r.minOrderValue);
  const validFrom = (r.validFrom ?? "").trim();
  const validUntil = (r.validUntil ?? "").trim();
  if (!validFrom || !validUntil) throw new Error("validFrom and validUntil are required (YYYY-MM-DD)");
  const existing = await db.select().from(couponsTable).where(eq(couponsTable.code, code)).limit(1);
  const payload = {
    code,
    type: r.type as (typeof validTypes)[number],
    discountValue: String(dv),
    maxDiscountCap: cap !== null ? String(cap) : null,
    minOrderValue: moq !== null ? String(moq) : "0",
    usageLimit: parseNumber(r.usageLimit),
    perCustomerLimit: parseNumber(r.perCustomerLimit) ?? 1,
    status,
    autoApply: parseBool(r.autoApply),
    validFrom,
    validUntil,
    description: r.description || null,
    applicableChannels: parseStringArray(r.applicableChannels),
    applicableCustomerTypes: parseStringArray(r.applicableCustomerTypes),
  };
  if (existing.length > 0) {
    await db.update(couponsTable).set(payload as never).where(eq(couponsTable.id, existing[0].id));
    result.updated++;
  } else {
    await db.insert(couponsTable).values(payload as never);
    result.created++;
  }
}

async function upsertBrand(r: ImportRow, result: ImportResult) {
  const name = (r.name ?? "").trim();
  const slug = ((r.slug ?? "").trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")).trim();
  if (!name || !slug) throw new Error("name (and derivable slug) is required");
  const existing = await db.select().from(brandsTable).where(eq(brandsTable.slug, slug)).limit(1);
  const payload = {
    name,
    slug,
    logoUrl: r.logoUrl || null,
    description: r.description || null,
    sortOrder: parseNumber(r.sortOrder) ?? 0,
    isActive: parseBool(r.isActive, true),
  };
  if (existing.length > 0) {
    await db
      .update(brandsTable)
      .set({ ...payload, updatedAt: new Date() } as never)
      .where(eq(brandsTable.id, existing[0].id));
    result.updated++;
  } else {
    await db.insert(brandsTable).values(payload as never);
    result.created++;
  }
}

async function upsertCategory(r: ImportRow, result: ImportResult) {
  const name = (r.name ?? "").trim();
  const slug = ((r.slug ?? "").trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")).trim();
  if (!name || !slug) throw new Error("name (and derivable slug) is required");
  const existing = await db.select().from(categoriesTable).where(eq(categoriesTable.slug, slug)).limit(1);
  const payload = {
    name,
    slug,
    description: r.description || null,
    emoji: r.emoji || null,
    imageUrl: r.imageUrl || null,
    color: r.color || null,
    sortOrder: parseNumber(r.sortOrder) ?? 0,
    isActive: parseBool(r.isActive, true),
  };
  if (existing.length > 0) {
    await db
      .update(categoriesTable)
      .set({ ...payload, updatedAt: new Date() } as never)
      .where(eq(categoriesTable.id, existing[0].id));
    result.updated++;
  } else {
    await db.insert(categoriesTable).values(payload as never);
    result.created++;
  }
}

async function upsertLocation(r: ImportRow, result: ImportResult) {
  const name = (r.name ?? "").trim();
  const address = (r.address ?? "").trim();
  const type = (r.type ?? "").trim();
  if (!name || !address) throw new Error("name and address are required");
  if (type !== "warehouse" && type !== "shop") {
    throw new Error('type must be "warehouse" or "shop"');
  }
  const existing = await db.select().from(locationsTable).where(eq(locationsTable.name, name)).limit(1);
  const payload = {
    name,
    type: type as "warehouse" | "shop",
    address,
    city: r.city || null,
    phone: r.phone || null,
    isActive: parseBool(r.isActive, true),
  };
  if (existing.length > 0) {
    await db.update(locationsTable).set(payload as never).where(eq(locationsTable.id, existing[0].id));
    result.updated++;
  } else {
    await db.insert(locationsTable).values(payload as never);
    result.created++;
  }
}

async function upsertSupplier(r: ImportRow, result: ImportResult) {
  const name = (r.name ?? "").trim();
  const phone = (r.phone ?? "").trim();
  if (!name || !phone) throw new Error("name and phone are required");
  const existing = await db.select().from(suppliersTable).where(eq(suppliersTable.phone, phone)).limit(1);
  const status = (r.status ?? "active") === "inactive" ? "inactive" : "active";
  const payload = {
    name,
    contactPerson: r.contactPerson || null,
    phone,
    email: r.email || null,
    address: r.address || null,
    gstin: r.gstin || null,
    status: status as "active" | "inactive",
  };
  if (existing.length > 0) {
    await db.update(suppliersTable).set(payload as never).where(eq(suppliersTable.id, existing[0].id));
    result.updated++;
  } else {
    await db.insert(suppliersTable).values(payload as never);
    result.created++;
  }
}

// keep `sql` import live (used in several drizzle helpers elsewhere we may add)
void sql;

export default router;
