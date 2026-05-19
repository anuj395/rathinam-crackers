import { Link, useRoute } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight, Info, AlertTriangle, CheckCircle2 } from "lucide-react";

type Section = { heading?: string; type?: "info" | "warn" | "success"; body: React.ReactNode };
type Topic = { title: string; lead: string; sections: Section[] };

const TOPICS: Record<string, Topic> = {
  "quick-start": {
    title: "Quick Start",
    lead: "Get from zero to your first sale in 5 minutes.",
    sections: [
      {
        heading: "1. Log in",
        body: (
          <>
            Open the ERP and log in with <code>admin / admin123</code>. The default
            seeded users are listed under Help → Default Login Credentials.
          </>
        ),
      },
      {
        heading: "2. Dashboard tour",
        body: (
          <>
            The dashboard shows today's sales, outstanding receivables, low-stock
            alerts, and a sales-by-channel chart. Click any KPI card to drill into
            the matching report.
          </>
        ),
      },
      {
        heading: "3. Add your first product",
        body: (
          <>
            Go to <strong>Products → New Product</strong>. Fill code, name, HSN, category,
            then add at least one variant with size and price tiers (purchase, wholesale,
            retail, agent).
          </>
        ),
      },
      {
        heading: "4. Receive stock",
        body: (
          <>
            Go to <strong>Stock → Receive</strong>. Pick a location, then add product
            lines with quantities. Submit — this creates immutable IN entries in the
            stock ledger.
          </>
        ),
      },
      {
        heading: "5. Make your first sale",
        body: (
          <>
            Open the POS panel at <code>/pos/</code>, log in with PIN, search a product,
            tap variant to add to cart, choose payment mode, and CHECKOUT. Done.
          </>
        ),
      },
      {
        type: "success",
        body: (
          <>That's the loop: <strong>Add product → Stock in → Sell → Track</strong>. Everything
          else (estimates, agents, transfers, coupons) is built on top of this.</>
        ),
      },
    ],
  },
  pricing: {
    title: "Products & 5-Tier Pricing",
    lead: "How prices are resolved at sale time — the heart of the system.",
    sections: [
      {
        heading: "The 5 tiers",
        body: (
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong>1. Purchase</strong> — internal cost only. NEVER printed on customer documents.</li>
            <li><strong>2. Wholesale Bulk</strong> — used for wholesale customers, OR when any line quantity ≥ threshold (default 10).</li>
            <li><strong>3. Retail/Online</strong> — same single price for retail POS, website, and walk-in customers.</li>
            <li><strong>4. Retail Estimate</strong> — used only on the ERP "Retail Estimate" channel.</li>
            <li><strong>5. Agent Special</strong> — used only when an Agent user bills their assigned customer.</li>
          </ul>
        ),
      },
      {
        heading: "Wholesale qty trigger",
        body: (
          <>
            For any customer (including walk-ins), if a single line quantity hits the
            wholesale threshold, the system silently switches that line to the wholesale
            tier. Default = 10 units. Configure in <Link href="/settings" className="text-primary underline">Settings → Pricing</Link>.
          </>
        ),
      },
      {
        type: "info",
        body: (
          <>Every price response from the API includes <code>resolutionReason</code> and
          <code> bulkRateApplied</code> so cashiers and agents always see WHY a price was
          chosen.</>
        ),
      },
      {
        heading: "Custom overrides",
        body: (
          <>
            On the product detail page you can add a <strong>Custom Price</strong> for a
            specific customer with validity dates and a reason. Custom overrides take
            highest priority and override every other tier.
          </>
        ),
      },
    ],
  },
  stock: {
    title: "Stock & Inventory",
    lead: "Multi-location inventory with an immutable ledger.",
    sections: [
      {
        heading: "Append-only ledger",
        body: (
          <>
            Every stock movement (IN, OUT, MOVE, ADJUST, DAMAGE, RESERVE, UNRESERVE) creates a
            new ledger row. <strong>Rows are never updated or deleted.</strong> Current stock is
            computed by aggregating all rows for a product/variant/location.
          </>
        ),
      },
      {
        heading: "Receive stock",
        body: (
          <><strong>Stock → Receive</strong>: pick a location and add lines (product, variant, qty,
          batch). Each line creates an IN entry. Optionally link a purchase order.</>
        ),
      },
      {
        heading: "Adjust stock",
        body: (
          <><strong>Stock → Adjust</strong>: enter the delta (+ or −) and a <em>required reason</em>.
          Use this for damage, theft, or correcting count errors.</>
        ),
      },
      {
        heading: "Transfers between locations",
        body: (
          <>
            <strong>Transfers → New</strong>: pick from/to location, add lines, save as draft.
            Click <strong>Dispatch</strong> at source — creates RESERVE rows. Click <strong>Receive</strong> at
            destination — creates IN at destination + UNRESERVE at source. Discrepancies between
            dispatched and received qty are flagged.
          </>
        ),
      },
      {
        type: "warn",
        body: <>Never try to reverse a ledger row by editing — always use Adjust with a reason. The audit trail is the source of truth.</>,
      },
    ],
  },
  sales: {
    title: "Estimates → Invoices",
    lead: "Quote first, confirm later — with stock reservation and brochure upload.",
    sections: [
      {
        heading: "Create an estimate",
        body: (
          <>
            <strong>Estimates → New</strong>: pick customer, optional agent, add product lines.
            Prices auto-resolve from the 5-tier engine. Save as draft or send.
          </>
        ),
      },
      {
        heading: "Convert to invoice",
        body: (
          <>
            On the estimate detail page, click <strong>Convert to Invoice</strong>. The system:
            <ul className="list-disc pl-5 mt-1.5 space-y-1">
              <li>Validates stock (hard-block if insufficient)</li>
              <li>Creates the invoice with sequential GST-compliant number</li>
              <li>Creates OUT stock ledger entries</li>
              <li>Records coupon usage if a coupon was applied</li>
              <li>Awards loyalty points (retail customers only)</li>
              <li>Updates customer credit balance if payment mode = CREDIT</li>
            </ul>
          </>
        ),
      },
      {
        heading: "Brochure Excel upload",
        body: (
          <>
            Customers fill the brochure Excel (Column A = product Code, Column F = Qty) and
            send it back. Upload it on <strong>Estimates → New → Upload Brochure</strong>. The system
            matches codes against your active products and creates the estimate. Unmatched
            codes are returned in a list for you to fix.
          </>
        ),
      },
      {
        heading: "GST handling",
        body: (
          <>
            Intra-state: CGST 9% + SGST 9% = 18%. Inter-state (different state GSTIN): IGST 18%.
            HSN code is mandatory and printed on the invoice (default 3604 for fireworks).
          </>
        ),
      },
    ],
  },
  crm: {
    title: "Customers, Suppliers, Agents",
    lead: "Contact management with credit, loyalty, and commission.",
    sections: [
      {
        heading: "Customer types",
        body: (
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Retail</strong> — standard retail price + earns loyalty points</li>
            <li><strong>Wholesale</strong> — always wholesale tier, regardless of qty</li>
            <li><strong>Agent Customer</strong> — billed at agent rate by their assigned agent</li>
            <li><strong>VIP</strong> — retail tier (same as standard retail)</li>
            <li><strong>Walk-in</strong> — anonymous; qty rule still applies</li>
          </ul>
        ),
      },
      {
        heading: "Credit & payments",
        body: (
          <>
            On a customer's detail page, the <strong>Statement</strong> tab shows every credit
            ledger entry with running balance. Use <strong>Record Payment</strong> to log incoming
            payments — this auto-decreases the outstanding balance.
          </>
        ),
      },
      {
        heading: "Loyalty",
        body: (
          <>Retail customers earn points on every invoice (default 1 point per ₹100). Points
          can be redeemed at POS or website checkout. Full ledger is on the customer detail page.</>
        ),
      },
      {
        heading: "Agents & commission",
        body: (
          <>
            Agents have a promo code, max discount %, monthly target, and tiered commission rates.
            The Commission report (Reports → Commission) calculates earned commission per agent
            for any date range.
          </>
        ),
      },
    ],
  },
  coupons: {
    title: "Coupons & Loyalty",
    lead: "Promotional discounts validated server-side.",
    sections: [
      {
        heading: "Coupon types",
        body: (
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>PERCENT</strong> — % off (with optional cap)</li>
            <li><strong>FLAT</strong> — fixed rupee amount off</li>
          </ul>
        ),
      },
      {
        heading: "Restrictions",
        body: (
          <>Each coupon supports: minimum order value, total usage limit, per-customer limit,
          channel restriction (POS / Website / ERP / All), customer type restriction, and date validity.</>
        ),
      },
      {
        type: "info",
        body: <>Coupon validation is ALWAYS server-side. The client sends the code and cart
        total; the server returns the discount amount. Usage is recorded only after the order is confirmed.</>,
      },
    ],
  },
  "pos-warehouse": {
    title: "POS & Warehouse",
    lead: "Front-of-house and back-of-house operations.",
    sections: [
      {
        heading: "POS — cashier flow",
        body: (
          <ol className="list-decimal pl-5 space-y-1">
            <li>Open <code>/pos/</code> and PIN-login</li>
            <li>Search/scan a product, tap variant to add</li>
            <li>Adjust qty with +/− steppers</li>
            <li>Optional: apply coupon, select customer, redeem loyalty</li>
            <li>Choose payment: CASH, CARD, or UPI</li>
            <li>CHECKOUT → receipt screen → print or new sale</li>
          </ol>
        ),
      },
      {
        heading: "Hold bills",
        body: <>Click <strong>Hold</strong> to park a sale. Open the held bills sheet later to resume
        any saved cart. Useful for customers who wander off mid-purchase.</>,
      },
      {
        heading: "Warehouse — receive flow",
        body: (
          <><strong>Warehouse → Receive</strong>: pick a location, add product lines from a PO or
          freely, submit. Each line becomes an IN ledger entry.</>
        ),
      },
      {
        heading: "Warehouse — transfer flow",
        body: (
          <>From the Transfers tab, click DISPATCH to send goods (creates RESERVE at source) or
          RECEIVE to confirm arrival (creates IN at destination + UNRESERVE at source).</>
        ),
      },
    ],
  },
  reports: {
    title: "Reports & GST",
    lead: "Operational and statutory reports.",
    sections: [
      {
        heading: "Sales report",
        body: <>Filter by date range. Shows total sales, invoice count, average order value,
        and a sales-by-channel bar chart.</>,
      },
      {
        heading: "Outstanding report",
        body: <>Customer-wise receivables with last payment date and days overdue. Use this
        to prioritize collection calls.</>,
      },
      {
        heading: "Commission report",
        body: <>Per-agent commission for a date range, with sales total and applicable
        commission rate. Use the "Mark Paid" action when paying agents out.</>,
      },
      {
        heading: "GST (GSTR-1)",
        body: <>HSN-wise breakdown for any month/year, showing taxable value, CGST, SGST, and
        total GST. Export and feed directly into your GSTR-1 filing.</>,
      },
    ],
  },
  settings: {
    title: "Settings & Users",
    lead: "Company info, users, and system preferences.",
    sections: [
      {
        heading: "Company tab",
        body: <>Company name, GSTIN, address, phone, email, bank details — these print on
        all invoices and PDFs.</>,
      },
      {
        heading: "Pricing tab",
        body: <>Wholesale qty threshold (default 10), loyalty earn rate (default 1 point per ₹100),
        and default GST rate (18%).</>,
      },
      {
        heading: "User roles",
        body: (
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>SUPER_ADMIN</strong> — full access including price overrides and user management</li>
            <li><strong>ERP_MANAGER</strong> — all operational features, no user management</li>
            <li><strong>CASHIER</strong> — POS only</li>
            <li><strong>WH_MANAGER</strong> — warehouse only</li>
            <li><strong>AGENT</strong> — read-only ERP + agent billing</li>
          </ul>
        ),
      },
      {
        heading: "Locations",
        body: <>Add warehouses and shop counters. Stock is tracked per location. Each user is
        assigned to one or more locations.</>,
      },
    ],
  },
  "online-orders": {
    title: "Online Orders Lifecycle",
    lead: "How an order travels from website checkout to the customer's door.",
    sections: [
      {
        heading: "Stages",
        body: (
          <ol className="list-decimal pl-5 space-y-1">
            <li><strong>pending_confirmation</strong> — customer just placed the order; stock is already deducted via the OUT ledger entry tagged with the order id.</li>
            <li><strong>confirmed</strong> — staff reviewed and accepted the order.</li>
            <li><strong>packed</strong> — items physically packed, ready for courier.</li>
            <li><strong>dispatched</strong> — handed to courier; courier name + tracking code captured (entered ONLY through the Dispatch action — not by editing the status directly).</li>
            <li><strong>delivered</strong> — courier confirmed delivery.</li>
          </ol>
        ),
      },
      {
        heading: "Where to manage online orders",
        body: (
          <>
            <strong>Online Orders</strong> in the sidebar (visible to SUPER_ADMIN, ADMIN and ERP_MANAGER only). The list page
            shows status filter, search, and quick stats. Click any order to open the detail view with the
            stage stepper, item lines, courier info, customer details, and actions (Advance Stage, Dispatch, Cancel).
          </>
        ),
      },
      {
        heading: "Dispatch",
        body: (
          <>
            On a <strong>packed</strong> order, click <strong>Dispatch</strong>. The modal asks for courier name (Delhivery, BlueDart,
            India Post, etc.) and AWB / tracking number. On submit, the status moves to <code>dispatched</code> and
            both fields are stored in <code>logisticsDetails</code>. The customer sees the courier and tracking
            code on their order detail page.
          </>
        ),
      },
      {
        heading: "Staff cancellation",
        body: (
          <>
            Click <strong>Cancel Order</strong> on any non-delivered, non-dispatched order. Pick a reason (Out of Stock,
            Payment Failed, Customer Request, Address Issue, Other) and add notes. The system runs an atomic
            transaction that:
            <ul className="list-disc pl-5 mt-1.5 space-y-1">
              <li>Locks the order row (<code>FOR UPDATE</code>) to prevent races</li>
              <li>Marks the order <code>cancelled</code> with reason &amp; cancelled-by user</li>
              <li>Restores stock by writing IN ledger entries that reference the original OUT entries (so the audit trail is perfect)</li>
              <li>Releases reserved coupon usage and loyalty points</li>
            </ul>
          </>
        ),
      },
      {
        heading: "Customer cancellation",
        body: (
          <>
            Customers can self-cancel from the website Account → Order detail page, but only while the order
            is in <code>pending_confirmation</code> or <code>confirmed</code>. Once it's packed or beyond, the cancel
            button disappears and they must contact support. Same atomic restore logic runs server-side.
          </>
        ),
      },
      {
        type: "warn",
        body: <>Status edits via PATCH skip the dispatch step on purpose. Trying to set status directly to
        <code>dispatched</code> through the generic update endpoint returns <code>USE_DISPATCH</code> — you must use
        the Dispatch action so the courier &amp; AWB are captured.</>,
      },
      {
        type: "info",
        body: <>Bypass guards: generic <code>POST /invoices</code> with <code>channel=ONLINE</code> is rejected
        (<code>USE_SHOP_PLACEMENT</code>) — online orders must come through the shop endpoint. Returns against
        a non-delivered online order are blocked (<code>NOT_DELIVERED</code>); against a cancelled online order
        are blocked (<code>ORDER_CANCELLED</code>).</>,
      },
    ],
  },
  returns: {
    title: "Returns & Refunds",
    lead: "Recording customer returns and reversing the stock + revenue impact.",
    sections: [
      {
        heading: "When a return is allowed",
        body: (
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>POS / Retail Estimate / Invoice</strong> — any settled invoice can have a return raised against it.</li>
            <li><strong>Online order</strong> — only after status is <code>delivered</code>. Pending or cancelled orders are blocked at the API layer.</li>
            <li>Return quantity per line cannot exceed the original sold quantity (server-validated).</li>
          </ul>
        ),
      },
      {
        heading: "Recording a return",
        body: (
          <>
            <strong>Returns → New Return</strong>: pick the source invoice / order, choose the lines and quantities being
            returned, pick a reason (Damaged, Wrong Item, Customer Changed Mind, Defective, Other), and submit.
            The system creates a return document and writes IN ledger entries to put the stock back into the
            original location.
          </>
        ),
      },
      {
        heading: "Refund modes",
        body: (
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Cash refund</strong> — recorded against the day's cash drawer.</li>
            <li><strong>Credit note</strong> — added to the customer's credit ledger so it can offset their next invoice.</li>
            <li><strong>UPI / Bank transfer</strong> — staff records the reference number after refunding through their bank app.</li>
          </ul>
        ),
      },
      {
        type: "warn",
        body: <>Returns are append-only. To "undo" a wrongly-recorded return, raise a counter-adjustment with
        a clear reason — never try to delete it. The audit trail is the source of truth.</>,
      },
    ],
  },
  website: {
    title: "Website & Customer Portal",
    lead: "What customers see and do on the public storefront.",
    sections: [
      {
        heading: "Public storefront",
        body: (
          <>
            Mounted at <code>/website/</code>. Catalog, product detail, search, and category pages are fully
            public (no login). Pricing is the Retail/Online tier — same as walk-in retail. The cart works for
            anonymous users and persists in localStorage.
          </>
        ),
      },
      {
        heading: "Account & checkout",
        body: (
          <>
            Customers register with phone + OTP (or email + password). On checkout, they pick a delivery
            address, choose a payment mode (COD or online), and confirm. The order goes straight into the ERP's
            Online Orders queue at <code>pending_confirmation</code>.
          </>
        ),
      },
      {
        heading: "Order tracking",
        body: (
          <>
            <strong>Account → My Orders</strong> shows every past order with status. Order detail shows the stage
            stepper, item lines, total, courier info (after dispatch), and a Cancel button while still
            cancellable.
          </>
        ),
      },
      {
        heading: "Self-service cancel",
        body: <>Allowed only at <code>pending_confirmation</code> and <code>confirmed</code>. Customer picks a reason,
        confirms in a dialog, and the same atomic stock restore runs server-side as a staff cancel.</>,
      },
      {
        heading: "CMS pages",
        body: (
          <>
            About, Privacy Policy, Refund Policy, Terms, Shipping Policy, and FAQ live in <strong>Site
            Content</strong> in the ERP. Edit any of them and the website picks up the change on next load — no
            redeploy needed.
          </>
        ),
      },
    ],
  },
  "bulk-csv": {
    title: "Bulk CSV Import / Export",
    lead: "Move data in and out of the system using spreadsheets.",
    sections: [
      {
        heading: "Where it lives",
        body: (
          <>
            Every master-data list page (Products, Customers, Suppliers, Agents, Brands, Categories, Locations,
            Coupons) has three buttons in the top-right: <strong>Template</strong>, <strong>Export CSV</strong>, <strong>Import CSV</strong>.
          </>
        ),
      },
      {
        heading: "Template",
        body: <>Downloads a sample CSV with the correct headers and one example row. Use this when starting
        fresh — open in Excel or Google Sheets, fill rows, save as CSV, then click Import.</>,
      },
      {
        heading: "Export CSV",
        body: <>Downloads ALL existing rows for that resource as CSV. Use this to bulk-edit (export → edit → import)
        or for backup before a risky change.</>,
      },
      {
        heading: "Import CSV",
        body: (
          <>
            Upserts rows by their unique key. Friendly column aliases work (e.g. "Mobile" → phone, "SKU" → code).
            Unknown columns are ignored. Result dialog shows created / updated / skipped counts plus a
            row-by-row error list for anything that failed validation.
            <ul className="list-disc pl-5 mt-1.5 space-y-1">
              <li><strong>Products</strong> upsert by <code>code</code></li>
              <li><strong>Customers / Agents / Suppliers</strong> upsert by <code>phone</code></li>
              <li><strong>Brands / Categories / Coupons</strong> upsert by <code>slug</code> / <code>code</code></li>
              <li><strong>Locations</strong> upsert by <code>name</code></li>
            </ul>
          </>
        ),
      },
      {
        type: "info",
        body: <>All bulk endpoints require an admin token. The buttons send your live ERP session token
        automatically — if you ever see a 401, sign out and back in.</>,
      },
    ],
  },
  verifier: {
    title: "Self-Check Verifier",
    lead: "Built-in end-to-end smoke test you can run any time.",
    sections: [
      {
        heading: "What it is",
        body: (
          <>
            Open <strong>Verifier</strong> from the sidebar (or visit <code>/verifier</code>). Click <strong>Run all checks</strong>
            and the page exercises every critical path of the system end-to-end: infrastructure, auth, RBAC,
            pricing engine, stock immutability, sales, coupons, online orders, returns, public APIs, bypass
            guards, etc. Each check shows green or red with a short detail.
          </>
        ),
      },
      {
        heading: "Credentials",
        body: (
          <>
            The verifier first reuses your <strong>currently logged-in admin token</strong>, so it always uses the
            latest password — even after you change it. If you ever open <code>/verifier</code> in a fresh tab
            without an ERP login, fill in the optional override fields at the top of the page (admin / cashier
            password). Falls back to the seed defaults as a last resort.
          </>
        ),
      },
      {
        heading: "When to run it",
        body: (
          <ul className="list-disc pl-5 space-y-1">
            <li>Right after every deploy</li>
            <li>Before going live for the day (morning health check)</li>
            <li>After running a database migration</li>
            <li>Whenever a user reports something "weird" — to narrow down the broken section quickly</li>
          </ul>
        ),
      },
      {
        type: "success",
        body: <>A fully green verifier run is a strong signal that the entire stack is healthy. Take a screenshot
        and keep it as your "last known good" reference before any risky change.</>,
      },
    ],
  },
  production: {
    title: "Production Go-Live Checklist",
    lead: "Final pass before flipping the switch and inviting real customers.",
    sections: [
      {
        heading: "1. Rotate every default password",
        body: (
          <>
            Settings → Users. Change the password and PIN of every seeded account: <code>admin</code>,
            <code> manager</code>, <code>cashier</code>, <code>warehouse</code>. Pick strong, unique passwords and store them
            in a password manager. The verifier's auto-detect always uses your live token, so changing passwords
            won't break it.
          </>
        ),
      },
      {
        heading: "2. Update company info",
        body: <>Settings → Company. Real legal name, GSTIN, address, phone, email, bank details. These print on
        every invoice and PDF — get them right before the first real sale.</>,
      },
      {
        heading: "3. Confirm pricing config",
        body: <>Settings → Pricing. Wholesale qty threshold (default 10), loyalty earn rate (₹100 = 1 point),
        default GST 18%. Adjust if your business runs different rules.</>,
      },
      {
        heading: "4. Replace seed data",
        body: <>Use Bulk CSV → Export to download your real product / customer / supplier / agent lists, then
        Import them. Disable or delete the demo "Test Brand AAA" and any demo products you don't need.</>,
      },
      {
        heading: "5. Stock receive",
        body: <>Stock → Receive at each location. Enter opening stock counts as an initial IN movement so the
        ledger starts from a real baseline. Reason: "Opening stock as on &lt;date&gt;".</>,
      },
      {
        heading: "6. Configure CMS pages",
        body: <>Site Content → edit About, Privacy, Refund, Terms, Shipping, FAQ to match your real policies.
        These are linked from the website footer and order pages.</>,
      },
      {
        heading: "7. Smoke test",
        body: (
          <ul className="list-disc pl-5 space-y-1">
            <li>Run the Verifier — every section green</li>
            <li>Place a real test sale on POS, verify printout</li>
            <li>Place a test order on the website, advance it through the lifecycle in the ERP</li>
            <li>Cancel a test order — verify stock is restored on the product</li>
            <li>Raise a return on a test invoice — verify ledger</li>
            <li>Run a GSTR-1 report — verify totals reconcile</li>
            <li>Do a backup of the database</li>
          </ul>
        ),
      },
      {
        heading: "8. Monitoring",
        body: <>Bookmark the Verifier page. Schedule a daily morning run. The Reports → Dashboard surfaces
        anomalies (low stock, negative cash drawer, overdue receivables) — make a habit of glancing at it.</>,
      },
      {
        type: "success",
        body: <>Once steps 1–8 are done and the Verifier is fully green, you are cleared for live traffic.
        Welcome to production!</>,
      },
    ],
  },
  architecture: {
    title: "Architecture & API",
    lead: "How the Rathinam system is built — for technical users and integrators.",
    sections: [
      {
        heading: "Stack",
        body: (
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Backend</strong>: Node.js + Express 5 + TypeScript ESM</li>
            <li><strong>Database</strong>: PostgreSQL via Drizzle ORM</li>
            <li><strong>Frontend</strong>: React 18 + Vite + shadcn/ui + TanStack Query + wouter</li>
            <li><strong>API contract</strong>: OpenAPI 3.1 → codegen → Zod schemas + React Query hooks</li>
            <li><strong>Auth</strong>: JWT (15m access / 7d refresh) + bcrypt password hashing</li>
          </ul>
        ),
      },
      {
        heading: "Apps",
        body: (
          <ul className="list-disc pl-5 space-y-1">
            <li><code>/</code> — ERP Admin Panel (this app)</li>
            <li><code>/pos/</code> — POS cashier terminal</li>
            <li><code>/warehouse/</code> — Warehouse stock dashboard</li>
            <li><code>/website/</code> — Public e-commerce site</li>
            <li><code>/api/v1/</code> — REST API</li>
          </ul>
        ),
      },
      {
        heading: "Key API endpoints",
        body: (
          <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
{`POST /api/v1/auth/login           — username/password login
POST /api/v1/auth/pin-login       — POS PIN login
GET  /api/v1/products             — list products (auth)
GET  /api/v1/products/public      — public catalog (no auth)
GET  /api/v1/products/:id/price   — resolve price (5-tier engine)
GET  /api/v1/stock/levels         — current stock by location
POST /api/v1/stock/receive        — record IN movement
POST /api/v1/stock/adjust         — record adjustment (reason required)
POST /api/v1/estimates            — create estimate
PUT  /api/v1/estimates/:id/convert — convert to invoice + stock OUT
POST /api/v1/coupons/validate     — validate coupon (server-side)
POST /api/v1/pos/sale             — POS sale (idempotent)
GET  /api/v1/reports/gst          — GSTR-1 report data`}
          </pre>
        ),
      },
      {
        heading: "Verifier",
        body: (
          <>Run <code>pnpm --filter @workspace/scripts run verify</code> from the project root to run
          end-to-end health checks against all endpoints. The verifier validates infrastructure,
          auth, RBAC, pricing engine, stock immutability, coupons, and public APIs — printing a
          green/red report.</>
        ),
      },
    ],
  },
};

const ORDER = [
  "quick-start", "pricing", "stock", "sales", "crm", "coupons", "pos-warehouse",
  "online-orders", "returns", "website", "bulk-csv", "reports", "settings",
  "verifier", "production", "architecture",
];

export default function HelpTopic() {
  const [, params] = useRoute("/help/:topic");
  const slug = params?.topic ?? "";
  const topic = TOPICS[slug];
  const idx = ORDER.indexOf(slug);
  const prev = idx > 0 ? ORDER[idx - 1] : null;
  const next = idx < ORDER.length - 1 ? ORDER[idx + 1] : null;

  if (!topic) {
    return (
      <div className="space-y-3">
        <p className="text-muted-foreground">Topic not found.</p>
        <Link href="/help"><Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4 mr-1.5" />Back to Help</Button></Link>
      </div>
    );
  }

  const iconFor = (type?: Section["type"]) => {
    if (type === "info") return <Info className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />;
    if (type === "warn") return <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />;
    if (type === "success") return <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />;
    return null;
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <Link href="/help"><Button variant="ghost" size="sm" className="mb-2 -ml-2"><ArrowLeft className="h-4 w-4 mr-1.5" />All Help Topics</Button></Link>
        <h1 className="text-2xl font-bold tracking-tight">{topic.title}</h1>
        <p className="text-muted-foreground mt-1">{topic.lead}</p>
      </div>

      <div className="space-y-4">
        {topic.sections.map((s, i) => (
          <Card key={i}>
            <CardContent className="pt-5">
              {s.heading && <h2 className="font-semibold mb-2">{s.heading}</h2>}
              <div className="flex gap-2 text-sm text-muted-foreground leading-relaxed">
                {iconFor(s.type)}
                <div className="flex-1 [&_code]:text-xs [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_strong]:text-foreground">
                  {s.body}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-between pt-4 border-t">
        {prev ? (
          <Link href={`/help/${prev}`}>
            <Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4 mr-1.5" />{TOPICS[prev]!.title}</Button>
          </Link>
        ) : <span />}
        {next ? (
          <Link href={`/help/${next}`}>
            <Button variant="outline" size="sm">{TOPICS[next]!.title}<ArrowRight className="h-4 w-4 ml-1.5" /></Button>
          </Link>
        ) : <span />}
      </div>

      <div className="pt-2">
        <Badge variant="outline" className="text-[10px]">Topic: {slug}</Badge>
      </div>
    </div>
  );
}
