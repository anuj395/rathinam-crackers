import PDFDocument from "pdfkit";

type Addr = {
  name?: string | null;
  phone?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  landmark?: string | null;
};

export type InvoicePdfInput = {
  invoice: {
    invoiceNo: string;
    createdAt: Date | string;
    customerName?: string | null;
    customerGstin?: string | null;
    items: Array<{
      productName: string;
      variantSize?: string | null;
      hsnCode?: string | null;
      qty: number;
      resolvedPrice: number | string;
      amount: number | string;
      gstRate?: number | null;
    }>;
    subtotal: number | string;
    discountAmount?: number | string | null;
    cgst: number | string;
    sgst: number | string;
    igst?: number | string;
    total: number | string;
    paymentMode?: string | null;
    status?: string | null;
    logisticsDetails?: {
      shippingAddress?: Addr | null;
      billingAddress?: Addr | null;
      address?: Addr | null;
      sameAsShipping?: boolean;
      paymentMode?: string | null;
      notes?: string | null;
    } | null;
  };
  business: {
    name: string;
    gstin?: string;
    email?: string;
    phone?: string;
    address?: string;
    bankName?: string;
    accountNumber?: string;
    ifscCode?: string;
  };
};

const RS = "Rs. "; // PDFKit's default Helvetica font does not render the ₹ glyph.
const fmt = (v: number | string | null | undefined) =>
  RS + Number(v ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmtAddr(a?: Addr | null): string {
  if (!a) return "";
  const parts = [a.line1, a.line2, a.city, a.state, a.pincode ? `- ${a.pincode}` : null].filter(Boolean);
  return parts.join(", ");
}

export function buildInvoicePdf({ invoice, business }: InvoicePdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Header
    doc.fontSize(20).font("Helvetica-Bold").text(business.name, { align: "left" });
    doc.fontSize(9).font("Helvetica").fillColor("#555");
    if (business.address) doc.text(business.address);
    const meta = [business.phone, business.email].filter(Boolean).join(" · ");
    if (meta) doc.text(meta);
    if (business.gstin) doc.text(`GSTIN: ${business.gstin}`);
    doc.fillColor("#000");

    // Invoice meta box (top-right)
    const top = 40;
    doc.fontSize(16).font("Helvetica-Bold").text("TAX INVOICE", 400, top, { align: "right" });
    doc.fontSize(9).font("Helvetica");
    doc.text(`Invoice No: ${invoice.invoiceNo}`, 400, top + 24, { align: "right" });
    doc.text(`Date: ${new Date(invoice.createdAt).toLocaleString("en-IN")}`, 400, top + 38, { align: "right" });
    if (invoice.paymentMode) doc.text(`Payment: ${invoice.paymentMode}`, 400, top + 52, { align: "right" });
    if (invoice.status) doc.text(`Status: ${String(invoice.status).toUpperCase()}`, 400, top + 66, { align: "right" });

    doc.moveTo(40, 130).lineTo(555, 130).strokeColor("#ddd").stroke();

    // Bill To / Ship To
    const ld = invoice.logisticsDetails ?? {};
    const ship = ld.shippingAddress ?? ld.address ?? null;
    const bill = ld.billingAddress ?? ship;

    doc.fontSize(10).font("Helvetica-Bold").fillColor("#000").text("Bill To", 40, 145);
    doc.font("Helvetica").fontSize(9).fillColor("#333");
    doc.text(invoice.customerName || bill?.name || "—", 40, 160);
    if (bill?.phone) doc.text(`Phone: ${bill.phone}`);
    if (bill) doc.text(fmtAddr(bill), { width: 240 });
    if (invoice.customerGstin) doc.text(`GSTIN: ${invoice.customerGstin}`);

    doc.fontSize(10).font("Helvetica-Bold").fillColor("#000").text("Ship To", 310, 145);
    doc.font("Helvetica").fontSize(9).fillColor("#333");
    doc.text(ship?.name || invoice.customerName || "—", 310, 160);
    if (ship?.phone) doc.text(`Phone: ${ship.phone}`, 310);
    if (ship) doc.text(fmtAddr(ship), 310, doc.y, { width: 240 });
    if (ship?.landmark) doc.text(`Landmark: ${ship.landmark}`, 310);

    // Items table
    const tableTop = Math.max(doc.y + 20, 250);
    const cols = {
      sno: 40,
      desc: 70,
      hsn: 290,
      qty: 350,
      rate: 390,
      gst: 460,
      amt: 500,
    };
    doc.fillColor("#000").fontSize(9).font("Helvetica-Bold");
    doc.rect(40, tableTop - 4, 515, 18).fill("#f3f4f6");
    doc.fillColor("#000");
    doc.text("#", cols.sno, tableTop, { width: 20 });
    doc.text("Description", cols.desc, tableTop, { width: 215 });
    doc.text("HSN", cols.hsn, tableTop, { width: 55 });
    doc.text("Qty", cols.qty, tableTop, { width: 35, align: "right" });
    doc.text("Rate", cols.rate, tableTop, { width: 60, align: "right" });
    doc.text("GST%", cols.gst, tableTop, { width: 35, align: "right" });
    doc.text("Amount", cols.amt, tableTop, { width: 55, align: "right" });

    let y = tableTop + 22;
    doc.font("Helvetica").fontSize(9);
    invoice.items.forEach((it, i) => {
      const desc = `${it.productName}${it.variantSize ? ` (${it.variantSize})` : ""}`;
      const rowH = Math.max(14, doc.heightOfString(desc, { width: 215 }));
      doc.text(String(i + 1), cols.sno, y, { width: 20 });
      doc.text(desc, cols.desc, y, { width: 215 });
      doc.text(it.hsnCode ?? "—", cols.hsn, y, { width: 55 });
      doc.text(String(it.qty), cols.qty, y, { width: 35, align: "right" });
      doc.text(fmt(it.resolvedPrice), cols.rate, y, { width: 60, align: "right" });
      doc.text(it.gstRate != null ? `${it.gstRate}%` : "—", cols.gst, y, { width: 35, align: "right" });
      doc.text(fmt(it.amount), cols.amt, y, { width: 55, align: "right" });
      y += rowH + 6;
      doc.moveTo(40, y - 2).lineTo(555, y - 2).strokeColor("#eee").stroke();
    });

    // Totals
    y += 10;
    const totalsX = 380;
    const valX = 555;
    const row = (label: string, value: string, bold = false) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 11 : 9);
      doc.text(label, totalsX, y, { width: 110 });
      doc.text(value, totalsX, y, { width: valX - totalsX, align: "right" });
      y += bold ? 18 : 14;
    };
    row("Subtotal", fmt(invoice.subtotal));
    if (Number(invoice.discountAmount ?? 0) > 0) row("Discount", `- ${fmt(invoice.discountAmount)}`);
    if (Number(invoice.cgst) > 0) row("CGST", fmt(invoice.cgst));
    if (Number(invoice.sgst) > 0) row("SGST", fmt(invoice.sgst));
    if (Number(invoice.igst ?? 0) > 0) row("IGST", fmt(invoice.igst));
    doc.moveTo(totalsX, y).lineTo(valX, y).strokeColor("#000").stroke();
    y += 6;
    row("Total", fmt(invoice.total), true);

    // Footer
    if (business.bankName || business.accountNumber || business.ifscCode) {
      const footY = Math.max(y + 20, 720);
      doc.font("Helvetica-Bold").fontSize(9).text("Bank Details", 40, footY);
      doc.font("Helvetica").fontSize(9);
      if (business.bankName) doc.text(`Bank: ${business.bankName}`, 40);
      if (business.accountNumber) doc.text(`A/C: ${business.accountNumber}`, 40);
      if (business.ifscCode) doc.text(`IFSC: ${business.ifscCode}`, 40);
    }
    doc.font("Helvetica-Oblique").fontSize(8).fillColor("#666")
      .text("This is a computer-generated invoice.", 40, 780, { width: 515, align: "center" });

    doc.end();
  });
}
