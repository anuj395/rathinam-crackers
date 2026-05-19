import {
  db,
  usersTable,
  locationsTable,
  productsTable,
  customersTable,
  suppliersTable,
  agentsTable,
  settingsTable,
  priceListsTable,
} from "@workspace/db";
import bcrypt from "bcryptjs";

async function seed() {
  console.log("Seeding database...");

  // Settings
  await db
    .insert(settingsTable)
    .values([
      {
        key: "company",
        value: {
          companyName: "Rathinam Crackers",
          gstin: "33AABCR1234A1Z5",
          address: "123 Main Road, Sivakasi, Tamil Nadu - 626123",
          phone: "9876543210",
          email: "info@rathinamcrackers.com",
          defaultHSN: "36049000",
          financialYear: "2025-2026",
          bankDetails: "SBI - 1234567890 - SBIN0001234",
        },
      },
      {
        key: "pricing",
        value: {
          wholesaleQtyThreshold: 10,
          loyaltyEarnRate: 1,
          loyaltyRedemptionRate: 1,
          taxRate: 0.18,
        },
      },
    ])
    .onConflictDoNothing();

  // Admin user
  const passwordHash = await bcrypt.hash("admin123", 10);
  await db
    .insert(usersTable)
    .values([
      {
        id: "usr-admin",
        name: "Super Admin",
        username: "admin",
        passwordHash,
        pin: "1234",
        role: "SUPER_ADMIN",
        locationIds: [],
        email: "admin@rathinam.com",
        isActive: true,
      },
      {
        id: "usr-mgr",
        name: "ERP Manager",
        username: "manager",
        passwordHash,
        pin: "2345",
        role: "ERP_MANAGER",
        locationIds: [],
        email: "manager@rathinam.com",
        isActive: true,
      },
      {
        id: "usr-cashier",
        name: "POS Cashier",
        username: "cashier",
        passwordHash,
        pin: "3456",
        role: "CASHIER",
        locationIds: ["loc-shop1"],
        email: "cashier@rathinam.com",
        isActive: true,
      },
      {
        id: "usr-wh",
        name: "Warehouse Manager",
        username: "warehouse",
        passwordHash,
        pin: "4567",
        role: "WH_MANAGER",
        locationIds: ["loc-wh1"],
        email: "wh@rathinam.com",
        isActive: true,
      },
    ])
    .onConflictDoNothing();

  // Locations
  await db
    .insert(locationsTable)
    .values([
      {
        id: "loc-wh1",
        name: "Main Warehouse - Sivakasi",
        type: "warehouse",
        address: "Industrial Area, Sivakasi",
        city: "Sivakasi",
        phone: "9876543201",
        isActive: true,
      },
      {
        id: "loc-shop1",
        name: "Retail Shop - Chennai",
        type: "shop",
        address: "T. Nagar, Chennai",
        city: "Chennai",
        phone: "9876543202",
        isActive: true,
      },
      {
        id: "loc-shop2",
        name: "Retail Shop - Madurai",
        type: "shop",
        address: "Anna Nagar, Madurai",
        city: "Madurai",
        phone: "9876543203",
        isActive: true,
      },
    ])
    .onConflictDoNothing();

  // Products
  // Single-brand product (3 sizes, same brand). brand defaults to "Standard".
  const makeVariants = (base: number, brand: string = "Standard") => [
    {
      variantId: `${brand.toLowerCase().replace(/\s+/g, "-")}-s`,
      brand,
      size: "Small",
      packContent: "10 pcs",
      unit: "Box",
      prices: {
        purchase: base * 0.6,
        wholesaleBulk: base * 0.8,
        retailOnline: base,
        retailEst: base * 1.05,
        agent: base * 0.85,
      },
    },
    {
      variantId: `${brand.toLowerCase().replace(/\s+/g, "-")}-m`,
      brand,
      size: "Medium",
      packContent: "6 pcs",
      unit: "Box",
      prices: {
        purchase: base * 1.2,
        wholesaleBulk: base * 1.6,
        retailOnline: base * 2,
        retailEst: base * 2.1,
        agent: base * 1.7,
      },
    },
    {
      variantId: `${brand.toLowerCase().replace(/\s+/g, "-")}-l`,
      brand,
      size: "Large",
      packContent: "4 pcs",
      unit: "Box",
      prices: {
        purchase: base * 2,
        wholesaleBulk: base * 2.7,
        retailOnline: base * 3.5,
        retailEst: base * 3.6,
        agent: base * 2.8,
      },
    },
  ];

  // Multi-brand product: same physical product offered under multiple manufacturer brands
  // at different price points. brands is [name, priceMultiplier] pairs (premium > standard > budget).
  const makeMultiBrandVariants = (
    base: number,
    brands: Array<[string, number]>,
  ) => brands.flatMap(([brand, mul]) => makeVariants(base * mul, brand));

  // Common Sivakasi fireworks brand mix: Standard (in-house), Sri Kaliswari (premium),
  // Cock Brand (budget but iconic), Coronation (mid-tier).
  const products = [
    {
      id: "prod-001",
      code: "GND001",
      name: "Classic Flower Pot",
      category: "Ground",
      hsnCode: "36049000",
      variants: makeMultiBrandVariants(50, [
        ["Standard", 1],
        ["Sri Kaliswari", 1.3],
        ["Cock Brand", 0.9],
      ]),
      onlineDisplay: true,
      featured: true,
    },
    {
      id: "prod-002",
      code: "GND002",
      name: "Colour Flower Pot",
      category: "Ground",
      hsnCode: "36049000",
      variants: makeMultiBrandVariants(80, [
        ["Standard", 1],
        ["Sri Kaliswari", 1.25],
      ]),
      onlineDisplay: true,
    },
    {
      id: "prod-003",
      code: "ARL001",
      name: "Sky Shot 60 Shells",
      category: "Aerial",
      hsnCode: "36049000",
      variants: makeMultiBrandVariants(150, [
        ["Standard", 1],
        ["Sri Kaliswari", 1.4],
        ["Coronation", 1.15],
      ]),
      onlineDisplay: true,
      featured: true,
    },
    {
      id: "prod-004",
      code: "ARL002",
      name: "Multi Colour Aerial",
      category: "Aerial",
      hsnCode: "36049000",
      variants: makeVariants(200, "Sri Kaliswari"),
      onlineDisplay: true,
    },
    {
      id: "prod-005",
      code: "SPK001",
      name: "Silver Sparkler 30cm",
      category: "Sparkler",
      hsnCode: "36049000",
      variants: makeMultiBrandVariants(30, [
        ["Standard", 1],
        ["Cock Brand", 0.85],
      ]),
      onlineDisplay: true,
    },
    {
      id: "prod-006",
      code: "SPK002",
      name: "Golden Sparkler 50cm",
      category: "Sparkler",
      hsnCode: "36049000",
      variants: makeVariants(45, "Coronation"),
      onlineDisplay: true,
    },
    {
      id: "prod-007",
      code: "NOV001",
      name: "Wishing Well Fountain",
      category: "Novelty",
      hsnCode: "36049000",
      variants: makeMultiBrandVariants(120, [
        ["Standard", 1],
        ["Sri Kaliswari", 1.3],
      ]),
      onlineDisplay: true,
      featured: true,
    },
    {
      id: "prod-008",
      code: "GBX001",
      name: "Diwali Gift Box - Premium",
      category: "Gift Box",
      hsnCode: "36049000",
      variants: makeVariants(500, "Sri Kaliswari"),
      onlineDisplay: true,
      featured: true,
    },
    {
      id: "prod-009",
      code: "GBX002",
      name: "Family Pack",
      category: "Gift Box",
      hsnCode: "36049000",
      variants: makeVariants(300, "Standard"),
      onlineDisplay: true,
    },
    {
      id: "prod-010",
      code: "BND001",
      name: "Starter Bundle",
      category: "Bundle",
      hsnCode: "36049000",
      variants: makeVariants(200, "Standard"),
      onlineDisplay: true,
    },
  ];

  for (const p of products) {
    await db
      .insert(productsTable)
      .values({ ...p, status: "Active" } as any)
      .onConflictDoNothing();
  }

  // Customers
  await db
    .insert(customersTable)
    .values([
      {
        id: "cust-001",
        name: "Rajan Fireworks Store",
        phone: "9876500001",
        email: "rajan@example.com",
        customerType: "WHOLESALE",
        city: "Chennai",
        gstin: "33AABCR0001A1Z1",
        creditLimit: "50000",
        outstandingBalance: "12500",
        loyaltyPoints: 0,
      },
      {
        id: "cust-002",
        name: "Kumar Crackers",
        phone: "9876500002",
        customerType: "WHOLESALE",
        city: "Coimbatore",
        outstandingBalance: "0",
        loyaltyPoints: 150,
      },
      {
        id: "cust-003",
        name: "Priya Retail",
        phone: "9876500003",
        customerType: "RETAIL",
        city: "Madurai",
        outstandingBalance: "0",
        loyaltyPoints: 320,
      },
      {
        id: "cust-004",
        name: "Walk-in Customer",
        phone: "0000000000",
        customerType: "WALK_IN",
        outstandingBalance: "0",
        loyaltyPoints: 0,
      },
    ])
    .onConflictDoNothing();

  // Suppliers
  await db
    .insert(suppliersTable)
    .values([
      {
        id: "supp-001",
        name: "Sri Murugan Fireworks Factory",
        contactPerson: "Murugan",
        phone: "9876501001",
        address: "Sivakasi Industrial Area",
        gstin: "33AABCS0001A1Z1",
      },
      {
        id: "supp-002",
        name: "Kalyani Pyro Industries",
        contactPerson: "Kalyani",
        phone: "9876501002",
        address: "Virudhunagar District",
      },
    ])
    .onConflictDoNothing();

  // Agents
  await db
    .insert(agentsTable)
    .values([
      {
        id: "agt-001",
        name: "Senthil Kumar",
        phone: "9876502001",
        email: "senthil@example.com",
        promoCode: "SENTHIL10",
        commissionTiers: [
          { from: 0, to: 50000, rate: 5 },
          { from: 50001, to: 200000, rate: 7 },
          { from: 200001, to: 9999999, rate: 10 },
        ],
        maxDiscountPct: "5",
        monthlyTarget: "200000",
      },
      {
        id: "agt-002",
        name: "Meena Devi",
        phone: "9876502002",
        email: "meena@example.com",
        promoCode: "MEENA15",
        commissionTiers: [
          { from: 0, to: 100000, rate: 6 },
          { from: 100001, to: 9999999, rate: 9 },
        ],
        maxDiscountPct: "3",
        monthlyTarget: "150000",
      },
    ])
    .onConflictDoNothing();

  // Price lists
  await db
    .insert(priceListsTable)
    .values([
      {
        id: "pl-001",
        name: "Standard 2025",
        season: "Diwali 2025",
        isActive: true,
        validFrom: "2025-08-01",
        validUntil: "2025-11-30",
      },
      {
        id: "pl-002",
        name: "Off-Season 2025",
        season: "Off-Season",
        isActive: false,
        validFrom: "2025-12-01",
        validUntil: "2026-07-31",
      },
    ])
    .onConflictDoNothing();

  console.log("Seeding complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
