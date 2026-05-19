import { Router } from "express";
import {
  db,
  customersTable,
  customerAddressesTable,
  customerWishlistTable,
  productsTable,
  invoicesTable,
  settingsTable,
  loyaltyLedgerTable,
} from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { hashPassword, verifyPassword, signShopToken } from "../../lib/auth.js";
import { shopAuthenticate, type ShopAuthRequest } from "../../middleware/shopAuth.js";
import { nextInvoiceNo } from "../../lib/counter.js";
import { resolvePrice, type PricingChannel } from "../../lib/pricing.js";
import { appendLedger } from "../../lib/stockService.js";
import { getTaxConfig, computeTax } from "../../lib/tax.js";
import { sendEmail, sendWhatsapp } from "../../lib/notifier.js";
import { buildInvoicePdf } from "../../lib/invoice-pdf.js";
import { cancelOnlineOrder, notifyCustomerLifecycle, OrderCancelError } from "../../lib/orderLifecycle.js";

const router = Router();

function publicCustomer(c: any) {
  if (!c) return null;
  const { passwordHash: _ph, ...rest } = c;
  return rest;
}

// ---------- AUTH ----------

router.post("/shop/auth/signup", async (req, res) => {
  const { name, email, phone, password } = (req.body ?? {}) as Record<string, string>;
  if (!name || !phone || !password) {
    res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "name, phone and password required" } });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "Password must be at least 6 characters" } });
    return;
  }
  const phoneClean = phone.replace(/\s+/g, "");
  // Refuse signup if phone is already on file (with or without a password). A
  // pre-existing walk-in customer record cannot be silently "claimed" via
  // signup — that would let anyone who knows a phone number take over an
  // existing customer's order history. Such customers must be migrated by
  // ERP staff (admin can set/reset their password) or we add OTP verification.
  const existingByPhone = await db.select().from(customersTable).where(eq(customersTable.phone, phoneClean)).limit(1);
  if (existingByPhone[0]) {
    res.status(409).json({ success: false, error: { code: "ACCOUNT_EXISTS", message: "An account with this phone already exists. Please log in or contact support." } });
    return;
  }
  const hashed = await hashPassword(password);
  const [created] = await db.insert(customersTable).values({
    id: crypto.randomUUID(),
    name,
    phone: phoneClean,
    email: email || null,
    customerType: "RETAIL",
    passwordHash: hashed,
    source: "website",
  }).returning();
  const customer = created!;
  const token = signShopToken({ id: customer.id });
  res.status(201).json({ success: true, data: { token, customer: publicCustomer(customer) } });
});

router.post("/shop/auth/login", async (req, res) => {
  const { identifier, password } = (req.body ?? {}) as Record<string, string>;
  if (!identifier || !password) {
    res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "identifier and password required" } });
    return;
  }
  const id = identifier.replace(/\s+/g, "");
  const isEmail = id.includes("@");
  const rows = isEmail
    ? await db.select().from(customersTable).where(eq(customersTable.email, id)).limit(1)
    : await db.select().from(customersTable).where(eq(customersTable.phone, id)).limit(1);
  const customer = rows[0];
  if (!customer || !customer.passwordHash) {
    res.status(401).json({ success: false, error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials" } });
    return;
  }
  const ok = await verifyPassword(password, customer.passwordHash);
  if (!ok) {
    res.status(401).json({ success: false, error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials" } });
    return;
  }
  const token = signShopToken({ id: customer.id });
  res.json({ success: true, data: { token, customer: publicCustomer(customer) } });
});

router.get("/shop/auth/me", shopAuthenticate, async (req: ShopAuthRequest, res) => {
  const rows = await db.select().from(customersTable).where(eq(customersTable.id, req.customer!.id)).limit(1);
  if (!rows[0]) {
    res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Customer not found" } });
    return;
  }
  res.json({ success: true, data: publicCustomer(rows[0]) });
});

router.put("/shop/auth/me", shopAuthenticate, async (req: ShopAuthRequest, res) => {
  const { name, email } = (req.body ?? {}) as Record<string, string>;
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (name) patch["name"] = name;
  if (email !== undefined) patch["email"] = email || null;
  const [updated] = await db.update(customersTable).set(patch).where(eq(customersTable.id, req.customer!.id)).returning();
  res.json({ success: true, data: publicCustomer(updated) });
});

router.put("/shop/auth/password", shopAuthenticate, async (req: ShopAuthRequest, res) => {
  const { currentPassword, newPassword } = (req.body ?? {}) as Record<string, string>;
  if (!newPassword || newPassword.length < 6) {
    res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "New password must be at least 6 characters" } });
    return;
  }
  const rows = await db.select().from(customersTable).where(eq(customersTable.id, req.customer!.id)).limit(1);
  const customer = rows[0];
  if (!customer || !customer.passwordHash) {
    res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Customer not found" } });
    return;
  }
  const ok = await verifyPassword(currentPassword ?? "", customer.passwordHash);
  if (!ok) {
    res.status(401).json({ success: false, error: { code: "INVALID_CREDENTIALS", message: "Current password is incorrect" } });
    return;
  }
  const hashed = await hashPassword(newPassword);
  await db.update(customersTable).set({ passwordHash: hashed, updatedAt: new Date() }).where(eq(customersTable.id, customer.id));
  res.json({ success: true });
});

// ---------- ADDRESSES ----------

router.get("/shop/addresses", shopAuthenticate, async (req: ShopAuthRequest, res) => {
  const rows = await db.select().from(customerAddressesTable)
    .where(eq(customerAddressesTable.customerId, req.customer!.id))
    .orderBy(desc(customerAddressesTable.isDefault), desc(customerAddressesTable.createdAt));
  res.json({ success: true, data: rows });
});

const ADDRESS_TYPES = new Set(["shipping", "billing", "both"]);

router.post("/shop/addresses", shopAuthenticate, async (req: ShopAuthRequest, res) => {
  const b = (req.body ?? {}) as Record<string, any>;
  if (!b["name"] || !b["phone"] || !b["line1"] || !b["city"] || !b["state"] || !b["pincode"]) {
    res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "name, phone, line1, city, state, pincode are required" } });
    return;
  }
  const phone = String(b["phone"]).replace(/\D/g, "");
  const pincode = String(b["pincode"]).replace(/\D/g, "");
  if (phone.length < 10) {
    res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "Phone must contain at least 10 digits" } });
    return;
  }
  if (pincode.length !== 6) {
    res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "Pincode must be 6 digits" } });
    return;
  }
  const addressType = ADDRESS_TYPES.has(b["addressType"]) ? b["addressType"] : "both";
  const cid = req.customer!.id;
  const existing = await db.select().from(customerAddressesTable).where(eq(customerAddressesTable.customerId, cid));
  const isDefault = !!b["isDefault"] || existing.length === 0;
  if (isDefault && existing.length > 0) {
    await db.update(customerAddressesTable).set({ isDefault: false }).where(eq(customerAddressesTable.customerId, cid));
  }
  const [created] = await db.insert(customerAddressesTable).values({
    id: crypto.randomUUID(),
    customerId: cid,
    label: b["label"] ?? null,
    name: b["name"],
    phone,
    line1: b["line1"],
    line2: b["line2"] ?? null,
    city: b["city"],
    state: b["state"],
    pincode,
    landmark: b["landmark"] ?? null,
    addressType: addressType as "shipping" | "billing" | "both",
    isDefault,
  }).returning();
  res.status(201).json({ success: true, data: created });
});

router.put("/shop/addresses/:id", shopAuthenticate, async (req: ShopAuthRequest, res) => {
  const id = req.params["id"] as string;
  const cid = req.customer!.id;
  const existing = await db.select().from(customerAddressesTable)
    .where(and(eq(customerAddressesTable.id, id), eq(customerAddressesTable.customerId, cid))).limit(1);
  if (!existing[0]) { res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Address not found" } }); return; }
  const b = (req.body ?? {}) as Record<string, any>;
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of ["label","name","phone","line1","line2","city","state","pincode","landmark"]) {
    if (b[k] !== undefined) patch[k] = b[k];
  }
  if (typeof b["phone"] === "string") {
    const phone = b["phone"].replace(/\D/g, "");
    if (phone.length < 10) { res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "Phone must contain at least 10 digits" } }); return; }
    patch["phone"] = phone;
  }
  if (typeof b["pincode"] === "string") {
    const pincode = b["pincode"].replace(/\D/g, "");
    if (pincode.length !== 6) { res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "Pincode must be 6 digits" } }); return; }
    patch["pincode"] = pincode;
  }
  if (typeof b["addressType"] === "string" && ADDRESS_TYPES.has(b["addressType"])) {
    patch["addressType"] = b["addressType"];
  }
  if (b["isDefault"] === true) {
    await db.update(customerAddressesTable).set({ isDefault: false }).where(eq(customerAddressesTable.customerId, cid));
    patch["isDefault"] = true;
  }
  const [updated] = await db.update(customerAddressesTable).set(patch).where(eq(customerAddressesTable.id, id)).returning();
  res.json({ success: true, data: updated });
});

router.delete("/shop/addresses/:id", shopAuthenticate, async (req: ShopAuthRequest, res) => {
  const id = req.params["id"] as string;
  await db.delete(customerAddressesTable)
    .where(and(eq(customerAddressesTable.id, id), eq(customerAddressesTable.customerId, req.customer!.id)));
  res.json({ success: true });
});

// ---------- WISHLIST ----------

router.get("/shop/wishlist", shopAuthenticate, async (req: ShopAuthRequest, res) => {
  const rows = await db.select().from(customerWishlistTable)
    .where(eq(customerWishlistTable.customerId, req.customer!.id))
    .orderBy(desc(customerWishlistTable.createdAt));
  res.json({ success: true, data: rows });
});

router.post("/shop/wishlist", shopAuthenticate, async (req: ShopAuthRequest, res) => {
  const productId = (req.body ?? {})["productId"] as string;
  if (!productId) { res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "productId required" } }); return; }
  await db.insert(customerWishlistTable)
    .values({ customerId: req.customer!.id, productId })
    .onConflictDoNothing();
  res.status(201).json({ success: true });
});

router.delete("/shop/wishlist/:productId", shopAuthenticate, async (req: ShopAuthRequest, res) => {
  const productId = req.params["productId"] as string;
  await db.delete(customerWishlistTable)
    .where(and(eq(customerWishlistTable.customerId, req.customer!.id), eq(customerWishlistTable.productId, productId)));
  res.json({ success: true });
});

// ---------- ORDERS ----------

router.get("/shop/orders", shopAuthenticate, async (req: ShopAuthRequest, res) => {
  const rows = await db.select().from(invoicesTable)
    .where(and(eq(invoicesTable.customerId, req.customer!.id), eq(invoicesTable.channel, "ONLINE")))
    .orderBy(desc(invoicesTable.createdAt));
  res.json({ success: true, data: rows });
});

// Customers can cancel their own order while it's still in pending_confirmation
// or confirmed. Once the warehouse has packed it, only staff can cancel.
router.post("/shop/orders/:id/cancel", shopAuthenticate, async (req: ShopAuthRequest, res) => {
  const id = req.params["id"] as string;
  const reason = String((req.body ?? {})["reason"] ?? "").trim() || "Cancelled by customer";
  const rows = await db.select().from(invoicesTable)
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.customerId, req.customer!.id))).limit(1);
  const order = rows[0];
  if (!order) {
    res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Order not found" } });
    return;
  }
  if (order.status === "cancelled") {
    res.status(400).json({ success: false, error: { code: "ALREADY_CANCELLED", message: "Order is already cancelled" } });
    return;
  }
  try {
    const updated = await cancelOnlineOrder(order, reason, "customer", null, [
      "pending_confirmation",
      "confirmed",
    ]);
    void notifyCustomerLifecycle(updated, "cancelled", { cancelReason: reason, cancelledBy: "customer" });
    res.json({ success: true, data: updated });
  } catch (err: any) {
    if (err instanceof OrderCancelError) {
      const status = err.code === "NOT_FOUND" ? 404 : err.code === "TOO_LATE_TO_CANCEL" ? 409 : 400;
      const message = err.code === "TOO_LATE_TO_CANCEL"
        ? "This order has already been packed. Please contact support to cancel."
        : err.message;
      res.status(status).json({ success: false, error: { code: err.code, message } });
      return;
    }
    req.log?.error({ err }, "customer order cancel failed");
    res.status(500).json({ success: false, error: { code: "CANCEL_FAILED", message: err?.message || "Could not cancel order" } });
  }
});

router.get("/shop/orders/:id", shopAuthenticate, async (req: ShopAuthRequest, res) => {
  const id = req.params["id"] as string;
  const rows = await db.select().from(invoicesTable)
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.customerId, req.customer!.id))).limit(1);
  if (!rows[0]) { res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Order not found" } }); return; }
  res.json({ success: true, data: rows[0] });
});

router.post("/shop/orders", shopAuthenticate, async (req: ShopAuthRequest, res) => {
  const cid = req.customer!.id;
  const body = (req.body ?? {}) as {
    items: Array<{ productId: string; variantId: string; qty: number }>;
    addressId?: string;
    shippingAddressId?: string;
    billingAddressId?: string;
    paymentMode?: "COD" | "UPI" | "BANK";
    notes?: string;
  };
  if (!Array.isArray(body.items) || body.items.length === 0) {
    res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "Cart is empty" } });
    return;
  }
  for (const item of body.items) {
    if (!item || typeof item.productId !== "string" || typeof item.variantId !== "string"
      || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 10000) {
      res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "Invalid item: productId, variantId and integer qty (1-10000) are required" } });
      return;
    }
  }
  const allowedModes = new Set(["COD", "UPI", "BANK"]);
  const paymentMode = body.paymentMode && allowedModes.has(body.paymentMode) ? body.paymentMode : "COD";

  const cust = (await db.select().from(customersTable).where(eq(customersTable.id, cid)).limit(1))[0];
  if (!cust) { res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Customer not found" } }); return; }

  const fetchAddr = async (id: string) => {
    const rows = await db.select().from(customerAddressesTable)
      .where(and(eq(customerAddressesTable.id, id), eq(customerAddressesTable.customerId, cid))).limit(1);
    return rows[0] ?? null;
  };
  // Shipping: prefer shippingAddressId, then legacy addressId, then customer's default.
  let shippingAddress = null;
  const shippingIdInput = body.shippingAddressId ?? body.addressId;
  if (shippingIdInput) shippingAddress = await fetchAddr(shippingIdInput);
  if (!shippingAddress) {
    const aRows = await db.select().from(customerAddressesTable)
      .where(and(eq(customerAddressesTable.customerId, cid), eq(customerAddressesTable.isDefault, true))).limit(1);
    shippingAddress = aRows[0] ?? null;
  }
  if (!shippingAddress) {
    res.status(400).json({ success: false, error: { code: "NO_ADDRESS", message: "Please add a delivery address before placing an order" } });
    return;
  }
  // Billing: prefer billingAddressId; otherwise reuse shipping.
  let billingAddress = shippingAddress;
  if (body.billingAddressId && body.billingAddressId !== shippingAddress.id) {
    const ba = await fetchAddr(body.billingAddressId);
    if (ba) billingAddress = ba;
  }
  // Legacy local var for downstream code that referenced `address`.
  const address = shippingAddress;

  const settingsRows = await db.select().from(settingsTable).where(eq(settingsTable.key, "pricing")).limit(1);
  const pricingSettings = (settingsRows[0]?.value ?? {}) as any;
  const threshold = Number(pricingSettings.wholesaleQtyThreshold ?? 10);
  const taxConfig = await getTaxConfig();
  const channel: PricingChannel = "ONLINE";

  const resolvedItems: any[] = [];
  const taxLines: { amount: number; product: { gstRate?: number | null; hsnCode?: string | null } }[] = [];
  for (const item of body.items) {
    const pRows = await db.select().from(productsTable).where(eq(productsTable.id, item.productId)).limit(1);
    const product = pRows[0];
    if (!product) {
      res.status(400).json({ success: false, error: { code: "PRODUCT_NOT_FOUND", message: `Product ${item.productId} no longer available. Please remove it from your cart.` } });
      return;
    }
    const variants = (product.variants ?? []) as any[];
    const variant = variants.find((v: any) => v.variantId === item.variantId);
    if (!variant) {
      res.status(400).json({ success: false, error: { code: "VARIANT_NOT_FOUND", message: `Selected size for ${product.name} is no longer available. Please update your cart.` } });
      return;
    }
    const priceResult = resolvePrice(variant, item.qty, channel, threshold);
    if (!(priceResult.resolvedPrice > 0)) {
      res.status(400).json({ success: false, error: { code: "PRICE_UNAVAILABLE", message: `Pricing for ${product.name} is unavailable. Please contact us before ordering.` } });
      return;
    }
    const lineAmount = priceResult.resolvedPrice * item.qty;
    resolvedItems.push({
      productId: item.productId,
      productName: product.name,
      variantId: variant.variantId,
      variantSize: variant.size ?? "",
      qty: item.qty,
      resolvedPrice: priceResult.resolvedPrice,
      resolutionReason: priceResult.resolutionReason,
      bulkRateApplied: priceResult.bulkRateApplied,
      amount: lineAmount,
      hsnCode: product.hsnCode ?? null,
      gstRate: product.gstRate ?? null,
    });
    taxLines.push({ amount: lineAmount, product: { gstRate: product.gstRate, hsnCode: product.hsnCode } });
  }

  const subtotal = resolvedItems.reduce((s, i) => s + i.amount, 0);
  // Per-line GST (override → HSN slab → default), zero when GST is disabled.
  const tx = computeTax(taxLines, 0, taxConfig, false);
  const taxableAmount = tx.taxable;
  const cgst = tx.cgst;
  const sgst = tx.sgst;
  const total = tx.total;

  const fy = new Date().getFullYear();
  const financialYear = `${fy}-${fy + 1}`;
  const invoiceNo = await nextInvoiceNo();

  // Find first location to deduct stock from.
  const locRows = await db.execute<{ id: string }>(sql`SELECT id FROM locations LIMIT 1`);
  const locationId = (locRows.rows?.[0] as any)?.id;

  const toInline = (a: typeof shippingAddress) => ({
    name: a.name, phone: a.phone, line1: a.line1, line2: a.line2,
    city: a.city, state: a.state, pincode: a.pincode, landmark: a.landmark,
  });
  const shippingInline = toInline(shippingAddress);
  const billingInline = billingAddress.id === shippingAddress.id ? shippingInline : toInline(billingAddress);
  const logistics = {
    // New canonical keys.
    shippingAddress: shippingInline,
    billingAddress: billingInline,
    sameAsShipping: billingAddress.id === shippingAddress.id,
    // Legacy alias retained so older order-detail / receipt code keeps working.
    address: shippingInline,
    paymentMode,
    status: "pending_confirmation",
    notes: body.notes ?? null,
    placedAt: new Date().toISOString(),
  };

  // For COD/UPI/BANK web orders, payment hasn't been collected yet, so the
  // invoice is recorded as `credit` (pending) until the ops team marks it
  // paid in the ERP. The `logisticsDetails.paymentMode` records the mode the
  // customer selected so staff can collect/verify accordingly.
  const loyaltyRate = Number(pricingSettings.loyaltyEarnRate ?? 1);
  const points = Math.floor(total * loyaltyRate / 100);

  // Generate the invoice id up-front so each OUT ledger entry can record
  // `refId = invoice.id`. Cancellation reads these entries back to know which
  // exact location/qty to restore.
  const newInvoiceId = crypto.randomUUID();

  let invoice: any;
  try {
    invoice = await db.transaction(async (tx) => {
      if (locationId) {
        for (const item of resolvedItems) {
          // Pass `tx` so stock-ledger and stock-level writes participate in
          // the same transaction as the invoice insert. Without this they
          // commit independently and a failed invoice insert would leave
          // orphaned ledger rows.
          await appendLedger({
            productId: item.productId,
            variantId: item.variantId,
            locationId,
            type: "OUT",
            qty: -item.qty,
            refType: "INVOICE",
            refId: newInvoiceId,
            createdBy: undefined,
          }, tx);
        }
      }
      const [inv] = await tx.insert(invoicesTable).values({
        id: newInvoiceId,
        invoiceNo,
        customerId: cid,
        customerName: cust.name,
        items: resolvedItems,
        subtotal: subtotal.toFixed(2),
        discountAmount: "0",
        taxableAmount: taxableAmount.toFixed(2),
        cgst: cgst.toFixed(2),
        sgst: sgst.toFixed(2),
        igst: "0",
        total: total.toFixed(2),
        paymentMode: "CASH",
        channel: "ONLINE",
        financialYear,
        status: "credit",
        logisticsDetails: logistics,
      }).returning();
      if (points > 0) {
        await tx.update(customersTable).set({
          loyaltyPoints: sql`${customersTable.loyaltyPoints} + ${points}`,
          updatedAt: new Date(),
        }).where(eq(customersTable.id, cid));
        await tx.insert(loyaltyLedgerTable).values({
          id: crypto.randomUUID(),
          customerId: cid,
          type: "EARN",
          points: points.toString(),
          referenceId: inv!.id,
          notes: `Earned on web order ${invoiceNo}`,
        });
      }
      return inv;
    });
  } catch (err: any) {
    req.log?.error({ err }, "shop order placement failed");
    res.status(500).json({ success: false, error: { code: "ORDER_FAILED", message: err?.message || "Could not place order. Please try again." } });
    return;
  }

  // Fire-and-forget order confirmation. Never blocks the response — a
  // notifier outage must not turn into a checkout outage.
  void (async () => {
    try {
      const subject = `Order confirmed: ${invoice.invoiceNo}`;
      const body =
        `Hi ${cust.name},\n\nThanks for your order!\n\n` +
        `Order: ${invoice.invoiceNo}\nAmount: ₹${total.toFixed(2)}\n` +
        `Payment: ${paymentMode}\n\n` +
        `We'll contact you shortly to confirm delivery.\n\n— Rathinam Crackers`;
      const tasks: Promise<unknown>[] = [];
      if (cust.email) {
        tasks.push(sendEmail({
          eventType: "shop.order.placed",
          to: cust.email,
          subject,
          text: body,
          recipientId: cust.id,
          recipientType: "customer",
        }));
      }
      if (cust.phone) {
        const phone = cust.phone.startsWith("+") ? cust.phone : `+91${cust.phone}`;
        tasks.push(sendWhatsapp({
          eventType: "shop.order.placed",
          to: phone,
          body,
          recipientId: cust.id,
          recipientType: "customer",
        }));
      }
      await Promise.allSettled(tasks);
    } catch (err) {
      req.log?.warn({ err, invoiceNo: invoice?.invoiceNo }, "shop order notification failed");
    }
  })();

  res.status(201).json({ success: true, data: invoice });
});

// ---------- INVOICE PDF + SHARE ----------
async function loadShopInvoice(orderId: string, customerId: string) {
  const rows = await db.select().from(invoicesTable)
    .where(and(eq(invoicesTable.id, orderId), eq(invoicesTable.customerId, customerId)))
    .limit(1);
  return rows[0] ?? null;
}

router.get("/shop/orders/:id/invoice.pdf", shopAuthenticate, async (req: ShopAuthRequest, res) => {
  const cid = req.customer!.id;
  const id = req.params["id"] as string;
  const inv = await loadShopInvoice(id, cid);
  if (!inv) {
    res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Order not found" } });
    return;
  }
  const businessRow = (await db.select().from(settingsTable).where(eq(settingsTable.key, "company")).limit(1))[0];
  const business = (businessRow?.value ?? { name: "Rathinam Crackers" }) as any;
  try {
    const pdf = await buildInvoicePdf({
      invoice: {
        invoiceNo: inv.invoiceNo,
        createdAt: inv.createdAt as Date,
        customerName: inv.customerName,
        customerGstin: inv.customerGstin,
        items: (inv.items ?? []) as any,
        subtotal: inv.subtotal ?? "0",
        discountAmount: inv.discountAmount ?? "0",
        cgst: inv.cgst ?? "0",
        sgst: inv.sgst ?? "0",
        igst: inv.igst ?? "0",
        total: inv.total ?? "0",
        paymentMode: (inv.logisticsDetails as any)?.paymentMode ?? inv.paymentMode,
        status: inv.status,
        logisticsDetails: inv.logisticsDetails as any,
      },
      business,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${inv.invoiceNo}.pdf"`);
    res.send(pdf);
  } catch (err: any) {
    req.log?.error({ err }, "shop invoice pdf generation failed");
    res.status(500).json({ success: false, error: { code: "PDF_FAILED", message: "Could not generate invoice PDF" } });
  }
});

router.post("/shop/orders/:id/share-invoice", shopAuthenticate, async (req: ShopAuthRequest, res) => {
  const cid = req.customer!.id;
  const id = req.params["id"] as string;
  const channel = req.body?.channel ?? "whatsapp";
  if (channel !== "whatsapp" && channel !== "email") {
    res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "channel must be 'whatsapp' or 'email'" } });
    return;
  }
  const inv = await loadShopInvoice(id, cid);
  if (!inv) {
    res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Order not found" } });
    return;
  }
  const cust = (await db.select().from(customersTable).where(eq(customersTable.id, cid)).limit(1))[0];
  if (!cust) {
    res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Customer not found" } });
    return;
  }
  const total = Number(inv.total ?? 0).toFixed(2);
  const summary = `Hi ${cust.name},\n\nYour invoice ${inv.invoiceNo} for ₹${total} from Rathinam Crackers is ready.\n\nThanks!`;
  if (channel === "email") {
    if (!cust.email) {
      res.status(400).json({ success: false, error: { code: "NO_EMAIL", message: "No email address on file" } });
      return;
    }
    const r = await sendEmail({
      eventType: "shop.invoice.share",
      to: cust.email,
      subject: `Invoice ${inv.invoiceNo} from Rathinam Crackers`,
      text: summary,
      html: `<p>${summary.replace(/\n/g, "<br/>")}</p>`,
      recipientId: cust.id,
      recipientType: "customer",
    });
    res.json({ success: r.ok, data: r });
    return;
  }
  if (!cust.phone) {
    res.status(400).json({ success: false, error: { code: "NO_PHONE", message: "No phone number on file" } });
    return;
  }
  const phone = cust.phone.startsWith("+") ? cust.phone : `+91${cust.phone.replace(/\D/g, "")}`;
  const r = await sendWhatsapp({
    eventType: "shop.invoice.share",
    to: phone,
    body: summary,
    recipientId: cust.id,
    recipientType: "customer",
  });
  res.json({ success: r.ok, data: r });
});

export default router;
