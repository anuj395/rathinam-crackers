// Browser-only PDF generation helpers built on jsPDF + jspdf-autotable.
// Each generator returns the jsPDF doc so callers can either save or open it.
// Inputs use permissive unions so we can accept the *real* DB-shaped payloads
// (invoiceNo, total, cgst, sgst, items[].resolvedPrice/amount, etc.) as well as
// any legacy camelCase names that older render code may pass in.
import { jsPDF } from "jspdf";
import autoTable, { type RowInput } from "jspdf-autotable";

export type CompanyInfo = {
  name: string;
  address?: string;
  gstin?: string;
  phone?: string;
  email?: string;
};

export const DEFAULT_COMPANY: CompanyInfo = {
  name: "RATHINAM CRACKERS",
  address: "Sivakasi, Tamil Nadu",
  gstin: "33AABCR1234F1Z5",
  phone: "+91 98765 43210",
  email: "info@rathinamcrackers.com",
};

const ACCENT: [number, number, number] = [220, 38, 38]; // brand red

const num = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmtINR = (n: unknown): string =>
  `Rs. ${num(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const fmtDate = (d: string | Date | undefined | null): string => {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("en-IN");
};

function drawHeader(doc: jsPDF, company: CompanyInfo, docTitle: string, docNumber?: string): number {
  doc.setFillColor(...ACCENT);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 6, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...ACCENT);
  doc.text(company.name, 14, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80);
  let y = 24;
  if (company.address) { doc.text(company.address, 14, y); y += 4; }
  if (company.gstin) { doc.text(`GSTIN: ${company.gstin}`, 14, y); y += 4; }
  const contact = [company.phone, company.email].filter(Boolean).join("  |  ");
  if (contact) { doc.text(contact, 14, y); y += 4; }

  const pageW = doc.internal.pageSize.getWidth();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(30);
  doc.text(docTitle.toUpperCase(), pageW - 14, 18, { align: "right" });
  if (docNumber) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(80);
    doc.text(`# ${docNumber}`, pageW - 14, 24, { align: "right" });
  }

  doc.setDrawColor(220);
  doc.line(14, y + 2, pageW - 14, y + 2);
  return y + 8;
}

function drawFooter(doc: jsPDF, note?: string): void {
  const pageCount = doc.getNumberOfPages();
  const pageH = doc.internal.pageSize.getHeight();
  const pageW = doc.internal.pageSize.getWidth();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    if (note) doc.text(note, 14, pageH - 8);
    doc.text(`Page ${i} of ${pageCount}`, pageW - 14, pageH - 8, { align: "right" });
  }
}

function drawPartyBlock(
  doc: jsPDF,
  startY: number,
  left: { title: string; lines: string[] },
  right?: { title: string; lines: string[] },
): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(left.title.toUpperCase(), 14, startY);
  if (right) doc.text(right.title.toUpperCase(), 110, startY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(30);
  let y = startY + 5;
  const leftLines = left.lines.filter(Boolean);
  const rightLines = right?.lines.filter(Boolean) ?? [];
  const max = Math.max(leftLines.length, rightLines.length);
  for (let i = 0; i < max; i++) {
    if (leftLines[i]) doc.text(leftLines[i] ?? "", 14, y);
    if (rightLines[i]) doc.text(rightLines[i] ?? "", 110, y);
    y += 5;
  }
  return y + 2;
}

function drawTotals(
  doc: jsPDF,
  startY: number,
  rows: Array<[string, string, boolean?]>,
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const rightX = pageW - 14;
  const labelX = pageW - 75;
  let y = startY;
  for (const [label, value, emphasize] of rows) {
    if (emphasize) {
      doc.setDrawColor(220);
      doc.line(labelX - 2, y - 2, rightX, y - 2);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...ACCENT);
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(60);
    }
    doc.text(label, labelX, y);
    doc.text(value, rightX, y, { align: "right" });
    y += 6;
  }
  return y + 2;
}

// ---------- Invoice ----------

export type InvoiceLineItemLike = {
  productName?: string;
  variantLabel?: string;
  variantSize?: string;
  // qty
  qty?: number | string;
  quantity?: number | string;
  // unit price (DB uses resolvedPrice; legacy renders use unitPrice)
  resolvedPrice?: number | string;
  unitPrice?: number | string;
  // line total (DB uses amount; legacy uses lineTotal)
  amount?: number | string;
  lineTotal?: number | string;
};

export type AddressLike = {
  name?: string; phone?: string; line1?: string; line2?: string | null;
  city?: string; state?: string; pincode?: string; landmark?: string | null;
};

const addrLines = (a: AddressLike): string[] => [
  a.name ?? "",
  a.phone ? `Ph: ${a.phone}` : "",
  a.line1 ?? "",
  a.line2 ?? "",
  [a.city, a.state].filter(Boolean).join(", "),
  a.pincode ? `Pincode: ${a.pincode}` : "",
  a.landmark ? `Landmark: ${a.landmark}` : "",
];

export type InvoiceLike = {
  id?: string;
  // Number (DB is invoiceNo; some legacy code uses invoiceNumber)
  invoiceNo?: string;
  invoiceNumber?: string;
  customerName?: string;
  customerId?: string;
  customerGstin?: string;
  logisticsDetails?: {
    shippingAddress?: AddressLike;
    billingAddress?: AddressLike;
    address?: AddressLike;
    sameAsShipping?: boolean;
  } | null;
  paymentMode?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  status?: string;
  channel?: string;
  createdAt?: string | Date;
  // Totals (DB shape)
  subtotal?: number | string;
  taxableAmount?: number | string;
  cgst?: number | string;
  sgst?: number | string;
  igst?: number | string;
  total?: number | string;
  discountAmount?: number | string;
  couponDiscount?: number | string;
  // Legacy aliases
  subtotalAmount?: number | string;
  taxAmount?: number | string;
  totalAmount?: number | string;
  items?: InvoiceLineItemLike[];
};

const itemQty = (it: InvoiceLineItemLike): number => num(it.qty ?? it.quantity);
const itemUnitPrice = (it: InvoiceLineItemLike): number => num(it.resolvedPrice ?? it.unitPrice);
const itemLineTotal = (it: InvoiceLineItemLike): number => {
  const explicit = it.amount ?? it.lineTotal;
  if (explicit !== undefined && explicit !== null && explicit !== "") return num(explicit);
  return itemQty(it) * itemUnitPrice(it);
};

export function generateInvoicePdf(invoice: InvoiceLike, company: CompanyInfo = DEFAULT_COMPANY): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const number = invoice.invoiceNo ?? invoice.invoiceNumber ?? invoice.id?.slice(0, 8) ?? "";
  let y = drawHeader(doc, company, "Tax Invoice", number);

  y = drawPartyBlock(
    doc,
    y,
    {
      title: "Bill To",
      lines: [
        invoice.customerName ?? "Walk-in Customer",
        invoice.customerId ? `ID: ${invoice.customerId}` : "",
        invoice.customerGstin ? `GSTIN: ${invoice.customerGstin}` : "",
      ],
    },
    {
      title: "Invoice Details",
      lines: [
        `Date: ${fmtDate(invoice.createdAt)}`,
        invoice.paymentMode || invoice.paymentMethod ? `Payment: ${invoice.paymentMode ?? invoice.paymentMethod}` : "",
        invoice.status || invoice.paymentStatus ? `Status: ${invoice.status ?? invoice.paymentStatus}` : "",
        invoice.channel ? `Channel: ${invoice.channel}` : "",
      ],
    },
  );

  // Optional Ship-To / Bill-To block from logisticsDetails.
  const ld = invoice.logisticsDetails ?? null;
  const ship = ld?.shippingAddress ?? ld?.address ?? null;
  const bill = ld?.billingAddress ?? null;
  const sameAsShipping = ld?.sameAsShipping ?? (!bill || (ship && JSON.stringify(ship) === JSON.stringify(bill)));
  if (ship || bill) {
    y = drawPartyBlock(
      doc,
      y,
      {
        title: "Ship To",
        lines: ship ? addrLines(ship) : ["—"],
      },
      {
        title: "Bill To",
        lines: bill && !sameAsShipping
          ? addrLines(bill)
          : ship
            ? ["Same as shipping address"]
            : ["—"],
      },
    );
  }

  const items = invoice.items ?? [];
  const computedLineTotals: number[] = items.map(itemLineTotal);
  const rows: RowInput[] = items.map((it, i) => [
    String(i + 1),
    [it.productName, it.variantLabel ?? it.variantSize].filter(Boolean).join(" — "),
    String(itemQty(it)),
    fmtINR(itemUnitPrice(it)),
    fmtINR(computedLineTotals[i] ?? 0),
  ]);

  autoTable(doc, {
    startY: y,
    head: [["#", "Item", "Qty", "Unit Price", "Total"]],
    body: rows,
    theme: "striped",
    headStyles: { fillColor: ACCENT, textColor: 255, fontStyle: "bold" },
    columnStyles: {
      0: { halign: "center", cellWidth: 10 },
      2: { halign: "right", cellWidth: 18 },
      3: { halign: "right", cellWidth: 30 },
      4: { halign: "right", cellWidth: 32 },
    },
    margin: { left: 14, right: 14 },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;

  // Prefer real DB fields; fall back to legacy aliases; finally compute.
  const subtotal = invoice.subtotal !== undefined
    ? num(invoice.subtotal)
    : invoice.subtotalAmount !== undefined
      ? num(invoice.subtotalAmount)
      : computedLineTotals.reduce((s, n) => s + n, 0);

  const cgst = num(invoice.cgst);
  const sgst = num(invoice.sgst);
  const igst = num(invoice.igst);
  const totalGst = cgst + sgst + igst > 0 ? cgst + sgst + igst : num(invoice.taxAmount);

  const total = invoice.total !== undefined
    ? num(invoice.total)
    : invoice.totalAmount !== undefined
      ? num(invoice.totalAmount)
      : subtotal + totalGst;

  const discount = num(invoice.discountAmount) + num(invoice.couponDiscount);

  const totalRows: Array<[string, string, boolean?]> = [["Subtotal", fmtINR(subtotal)]];
  if (discount > 0) totalRows.push(["Discount", `- ${fmtINR(discount)}`]);
  if (igst > 0) {
    totalRows.push(["IGST (18%)", fmtINR(igst)]);
  } else {
    totalRows.push(["CGST (9%)", fmtINR(cgst || totalGst / 2)]);
    totalRows.push(["SGST (9%)", fmtINR(sgst || totalGst / 2)]);
  }
  totalRows.push(["Grand Total", fmtINR(total), true]);
  drawTotals(doc, finalY + 8, totalRows);

  drawFooter(doc, "Thank you for your business — Rathinam Crackers");
  return doc;
}

// ---------- Estimate ----------

export type EstimateLike = {
  id?: string;
  estimateNo?: string;
  estimateNumber?: string;
  customerName?: string;
  customerId?: string;
  status?: string;
  type?: string;
  channel?: string;
  createdAt?: string | Date;
  validUntil?: string | Date;
  subtotal?: number | string;
  couponDiscount?: number | string;
  total?: number | string;
  totalAmount?: number | string;
  notes?: string;
  items?: InvoiceLineItemLike[];
};

export function generateEstimatePdf(estimate: EstimateLike, company: CompanyInfo = DEFAULT_COMPANY): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const number = estimate.estimateNo ?? estimate.estimateNumber ?? estimate.id?.slice(0, 8) ?? "";
  let y = drawHeader(doc, company, "Estimate / Quotation", number);

  y = drawPartyBlock(
    doc,
    y,
    {
      title: "Quote For",
      lines: [
        estimate.customerName ?? "—",
        estimate.customerId ? `ID: ${estimate.customerId}` : "",
      ],
    },
    {
      title: "Quote Details",
      lines: [
        `Date: ${fmtDate(estimate.createdAt)}`,
        `Valid Until: ${fmtDate(estimate.validUntil)}`,
        estimate.status ? `Status: ${estimate.status}` : "",
        estimate.type ?? estimate.channel ? `Channel: ${estimate.type ?? estimate.channel}` : "",
      ],
    },
  );

  const items = estimate.items ?? [];
  const computedLineTotals = items.map(itemLineTotal);
  const rows: RowInput[] = items.map((it, i) => [
    String(i + 1),
    [it.productName, it.variantLabel ?? it.variantSize].filter(Boolean).join(" — "),
    String(itemQty(it)),
    fmtINR(itemUnitPrice(it)),
    fmtINR(computedLineTotals[i] ?? 0),
  ]);

  autoTable(doc, {
    startY: y,
    head: [["#", "Item", "Qty", "Unit Price", "Total"]],
    body: rows,
    theme: "striped",
    headStyles: { fillColor: ACCENT, textColor: 255, fontStyle: "bold" },
    columnStyles: {
      0: { halign: "center", cellWidth: 10 },
      2: { halign: "right", cellWidth: 18 },
      3: { halign: "right", cellWidth: 30 },
      4: { halign: "right", cellWidth: 32 },
    },
    margin: { left: 14, right: 14 },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  const subtotal = num(estimate.subtotal) || computedLineTotals.reduce((s, n) => s + n, 0);
  const discount = num(estimate.couponDiscount);
  const total = num(estimate.total ?? estimate.totalAmount) || subtotal - discount;

  const totalRows: Array<[string, string, boolean?]> = [["Subtotal", fmtINR(subtotal)]];
  if (discount > 0) totalRows.push(["Coupon Discount", `- ${fmtINR(discount)}`]);
  totalRows.push(["Estimate Total", fmtINR(total), true]);
  drawTotals(doc, finalY + 8, totalRows);

  if (estimate.notes) {
    const noteY = finalY + 30;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text("NOTES", 14, noteY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(40);
    const wrapped = doc.splitTextToSize(estimate.notes, 180);
    doc.text(wrapped, 14, noteY + 5);
  }

  drawFooter(doc, "This is an estimate and not a tax invoice.");
  return doc;
}

// ---------- Purchase Order ----------

export type POLineItemLike = {
  productName?: string;
  variantLabel?: string;
  variantSize?: string;
  // DB uses orderedQty + unitPrice; legacy uses qty + unitCost
  orderedQty?: number | string;
  qty?: number | string;
  unitPrice?: number | string;
  unitCost?: number | string;
  receivedQty?: number | string;
};

export type PurchaseOrderLike = {
  id?: string;
  poNumber?: string;
  supplierName?: string;
  supplierId?: string;
  warehouseId?: string;
  status?: string;
  // DB uses expectedDate; legacy uses expectedDeliveryDate
  expectedDate?: string | Date;
  expectedDeliveryDate?: string | Date;
  createdAt?: string | Date;
  totalAmount?: number | string;
  notes?: string;
  items?: POLineItemLike[];
};

const poItemQty = (it: POLineItemLike): number => num(it.orderedQty ?? it.qty);
const poItemUnitPrice = (it: POLineItemLike): number => num(it.unitPrice ?? it.unitCost);

export function generatePurchaseOrderPdf(po: PurchaseOrderLike, company: CompanyInfo = DEFAULT_COMPANY): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const number = po.poNumber ?? po.id?.slice(0, 8) ?? "";
  let y = drawHeader(doc, company, "Purchase Order", number);

  y = drawPartyBlock(
    doc,
    y,
    {
      title: "Supplier",
      lines: [
        po.supplierName ?? "—",
        po.supplierId ? `ID: ${po.supplierId}` : "",
      ],
    },
    {
      title: "Order Details",
      lines: [
        `Ordered: ${fmtDate(po.createdAt)}`,
        `Expected: ${fmtDate(po.expectedDate ?? po.expectedDeliveryDate)}`,
        po.status ? `Status: ${po.status}` : "",
        po.warehouseId ? `Warehouse: ${po.warehouseId}` : "",
      ],
    },
  );

  const items = po.items ?? [];
  const computedLineTotals = items.map((it) => poItemQty(it) * poItemUnitPrice(it));
  const rows: RowInput[] = items.map((it, i) => [
    String(i + 1),
    [it.productName, it.variantLabel ?? it.variantSize].filter(Boolean).join(" — "),
    String(poItemQty(it)),
    fmtINR(poItemUnitPrice(it)),
    fmtINR(computedLineTotals[i] ?? 0),
    String(num(it.receivedQty)),
  ]);

  autoTable(doc, {
    startY: y,
    head: [["#", "Item", "Ordered", "Unit Cost", "Line Total", "Received"]],
    body: rows,
    theme: "striped",
    headStyles: { fillColor: ACCENT, textColor: 255, fontStyle: "bold" },
    columnStyles: {
      0: { halign: "center", cellWidth: 10 },
      2: { halign: "right", cellWidth: 22 },
      3: { halign: "right", cellWidth: 30 },
      4: { halign: "right", cellWidth: 32 },
      5: { halign: "right", cellWidth: 24 },
    },
    margin: { left: 14, right: 14 },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  const totalAmount = num(po.totalAmount) || computedLineTotals.reduce((s, n) => s + n, 0);
  drawTotals(doc, finalY + 8, [
    ["Purchase Order Total", fmtINR(totalAmount), true],
  ]);

  if (po.notes) {
    const noteY = finalY + 30;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text("NOTES", 14, noteY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(40);
    const wrapped = doc.splitTextToSize(po.notes, 180);
    doc.text(wrapped, 14, noteY + 5);
  }

  drawFooter(doc, "Authorized signatory: ____________________");
  return doc;
}

// ---------- Transfer ----------

export type TransferLike = {
  id?: string;
  transferNo?: string;
  status?: string;
  fromLocationName?: string;
  fromLocationId?: string;
  toLocationName?: string;
  toLocationId?: string;
  vehicleNo?: string;
  createdAt?: string | Date;
  dispatchedAt?: string | Date;
  receivedAt?: string | Date;
  notes?: string;
  items?: Array<{
    productName?: string;
    productId?: string;
    variantLabel?: string;
    variantSize?: string;
    variantId?: string;
    batchNo?: string;
    qty?: number | string;
    receivedQty?: number | string;
  }>;
};

export function generateTransferPdf(transfer: TransferLike, company: CompanyInfo = DEFAULT_COMPANY): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const number = transfer.transferNo ?? transfer.id?.slice(0, 8) ?? "";
  let y = drawHeader(doc, company, "Stock Transfer Note", number);

  y = drawPartyBlock(
    doc,
    y,
    {
      title: "From",
      lines: [
        transfer.fromLocationName ?? "—",
        transfer.fromLocationId ? `ID: ${transfer.fromLocationId}` : "",
        transfer.dispatchedAt ? `Dispatched: ${fmtDate(transfer.dispatchedAt)}` : "",
      ],
    },
    {
      title: "To",
      lines: [
        transfer.toLocationName ?? "—",
        transfer.toLocationId ? `ID: ${transfer.toLocationId}` : "",
        transfer.receivedAt ? `Received: ${fmtDate(transfer.receivedAt)}` : "",
      ],
    },
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(60);
  doc.text(
    `Status: ${transfer.status ?? "-"}    |    Vehicle: ${transfer.vehicleNo ?? "-"}    |    Created: ${fmtDate(transfer.createdAt)}`,
    14,
    y,
  );
  y += 6;

  const rows: RowInput[] = (transfer.items ?? []).map((it, i) => [
    String(i + 1),
    [it.productName ?? it.productId, it.variantLabel ?? it.variantSize ?? it.variantId].filter(Boolean).join(" — "),
    it.batchNo ?? "—",
    String(num(it.qty)),
    String(num(it.receivedQty)),
  ]);

  autoTable(doc, {
    startY: y,
    head: [["#", "Item", "Batch", "Qty Sent", "Qty Received"]],
    body: rows,
    theme: "striped",
    headStyles: { fillColor: ACCENT, textColor: 255, fontStyle: "bold" },
    columnStyles: {
      0: { halign: "center", cellWidth: 10 },
      3: { halign: "right", cellWidth: 24 },
      4: { halign: "right", cellWidth: 28 },
    },
    margin: { left: 14, right: 14 },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  if (transfer.notes) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text("NOTES", 14, finalY + 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(40);
    const wrapped = doc.splitTextToSize(transfer.notes, 180);
    doc.text(wrapped, 14, finalY + 17);
  }

  drawFooter(doc, "Sender signature: __________    Receiver signature: __________");
  return doc;
}

// ---------- Generic Report ----------

export type ReportPdfOptions = {
  title: string;
  subtitle?: string;
  period?: string;
  summary?: Array<{ label: string; value: string }>;
  columns: string[];
  rows: Array<Array<string | number>>;
  company?: CompanyInfo;
  footerNote?: string;
};

export function generateReportPdf(opts: ReportPdfOptions): jsPDF {
  const company = opts.company ?? DEFAULT_COMPANY;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  let y = drawHeader(doc, company, opts.title, opts.period);

  if (opts.subtitle) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(80);
    doc.text(opts.subtitle, 14, y);
    y += 6;
  }

  if (opts.summary && opts.summary.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text("SUMMARY", 14, y);
    y += 5;
    const colW = 60;
    opts.summary.forEach((s, i) => {
      const x = 14 + (i % 4) * colW;
      const ry = y + Math.floor(i / 4) * 12;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(110);
      doc.text(s.label, x, ry);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(30);
      doc.text(s.value, x, ry + 5);
    });
    y += Math.ceil(opts.summary.length / 4) * 12 + 4;
  }

  autoTable(doc, {
    startY: y,
    head: [opts.columns],
    body: opts.rows.map((r) => r.map((c) => (typeof c === "number" ? c.toLocaleString("en-IN") : c))) as RowInput[],
    theme: "striped",
    headStyles: { fillColor: ACCENT, textColor: 255, fontStyle: "bold" },
    margin: { left: 14, right: 14 },
  });

  drawFooter(doc, opts.footerNote ?? `${opts.title} — generated ${new Date().toLocaleString("en-IN")}`);
  return doc;
}

export function savePdf(doc: jsPDF, fileName: string): void {
  const safe = fileName.replace(/[^A-Za-z0-9_.-]+/g, "_");
  doc.save(safe.endsWith(".pdf") ? safe : `${safe}.pdf`);
}
