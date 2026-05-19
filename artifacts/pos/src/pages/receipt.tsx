import React, { useEffect, useMemo, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { useGetInvoice } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Printer, ShoppingBag, ChevronRight, Download } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { generateInvoicePdf, savePdf } from "@workspace/pdf";
import { useCart } from "@/context/cart";

// 80mm thermal slip CSS — scoped to print only.
const thermalPrintCSS = `
  @media print {
    @page { size: 80mm auto; margin: 0; }
    html, body { background: white !important; }
    body * { visibility: hidden; }
    .pos-thermal-slip, .pos-thermal-slip * { visibility: visible; }
    .pos-thermal-slip {
      position: absolute; left: 0; top: 0;
      width: 80mm; padding: 4mm 5mm;
      color: #000; background: #fff;
      font-family: "Courier New", ui-monospace, monospace;
      font-size: 11px; line-height: 1.35;
    }
    .pos-thermal-slip .center { text-align: center; }
    .pos-thermal-slip .right { text-align: right; }
    .pos-thermal-slip .row { display: flex; justify-content: space-between; gap: 6px; }
    .pos-thermal-slip .hr { border: 0; border-top: 1px dashed #000; margin: 4px 0; }
    .pos-thermal-slip .hr-solid { border: 0; border-top: 1px solid #000; margin: 4px 0; }
    .pos-thermal-slip h1 { font-size: 14px; font-weight: 800; margin: 0; letter-spacing: 1px; }
    .pos-thermal-slip h2 { font-size: 12px; font-weight: 700; margin: 0; }
    .pos-thermal-slip table { width: 100%; border-collapse: collapse; }
    .pos-thermal-slip th, .pos-thermal-slip td { padding: 1px 0; font-size: 11px; vertical-align: top; }
    .pos-thermal-slip .item-name { word-break: break-word; }
    .pos-thermal-slip .total-line { font-weight: 800; font-size: 13px; }
    .pos-thermal-slip .footer { font-size: 10px; }
  }
`;

const inr = (n: number) => `₹${(Math.round(n * 100) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n: any) => Number(n) || 0;

const ReceiptScreen = () => {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const params = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const invoiceId = params.get("id");
  const cashReceived = params.get("received");
  const changeFromUrl = params.get("change");
  const printBtnRef = useRef<HTMLButtonElement>(null);
  const { clearCart } = useCart();

  const { data: invoice, isLoading } = useGetInvoice(invoiceId || "");

  useEffect(() => {
    // The sale is now committed — drop the local cart so the next "New Sale"
    // starts on a fresh slate, and focus the Print button so the cashier can
    // press Enter to send the slip to the printer.
    if (invoice) {
      clearCart();
      printBtnRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice]);

  const handleNewSale = () => setLocation("/sale");
  const handlePrint = () => window.print();
  const handleDownloadPdf = () => {
    if (!invoice) return;
    const doc = generateInvoicePdf(invoice as any);
    savePdf(doc, `invoice-${invoice.invoiceNo || invoiceId?.slice(0, 8) || "receipt"}`);
  };

  if (isLoading || !invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0d0d0d] print:hidden">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const subtotal = num(invoice.subtotal);
  const discountAmount = num((invoice as any).discountAmount);
  const cgst = num((invoice as any).cgst);
  const sgst = num((invoice as any).sgst);
  const igst = num((invoice as any).igst);
  const totalGst = cgst + sgst + igst;
  const total = num(invoice.total);
  const cash = cashReceived ? num(cashReceived) : total;
  const change = changeFromUrl ? num(changeFromUrl) : Math.max(0, cash - total);
  const date = new Date(invoice.createdAt || Date.now());

  type Addr = { name?: string; phone?: string; line1?: string; line2?: string | null; city?: string; state?: string; pincode?: string; landmark?: string | null };
  const logistics = ((invoice as any).logisticsDetails ?? null) as
    | {
        tenders?: Array<{ mode: string; amount: number; reference?: string }>;
        discountReason?: string | null;
        shippingAddress?: Addr;
        billingAddress?: Addr;
        address?: Addr;
        sameAsShipping?: boolean;
      }
    | null;
  const shipAddr: Addr | null = logistics?.shippingAddress ?? logistics?.address ?? null;
  const billAddr: Addr | null = logistics?.billingAddress ?? null;
  const sameAsShipping =
    logistics?.sameAsShipping ?? (!billAddr || JSON.stringify(billAddr) === JSON.stringify(shipAddr));
  const tenders = Array.isArray(logistics?.tenders) ? logistics!.tenders : [];
  const isSplit = invoice.paymentMode === "SPLIT" || tenders.length > 1;

  return (
    <>
      <style>{thermalPrintCSS}</style>

      {/* SCREEN UI (hidden in print) */}
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#0d0d0d] print:hidden">
        <div className="w-full max-w-lg animate-in zoom-in-95 duration-300">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="h-20 w-20 bg-green-500/10 rounded-full flex items-center justify-center mb-3">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
            </div>
            <h1 className="text-3xl font-black">SALE COMPLETE</h1>
            <p className="text-zinc-500 mt-1">Invoice #{invoice.invoiceNo || invoiceId?.slice(0, 8)}</p>
          </div>

          <Card className="bg-zinc-900 border-zinc-800 text-white mb-6 overflow-hidden">
            <CardContent className="p-0">
              <div className="p-5 border-b border-zinc-800 bg-zinc-900/50">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs text-zinc-500 uppercase font-black">Customer</p>
                    <p className="text-lg font-bold">{invoice.customerName || "Walk-in Customer"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-zinc-500 uppercase font-black">Total</p>
                    <p className="text-3xl font-black text-primary">{inr(total)}</p>
                  </div>
                </div>
              </div>

              <ScrollArea className="max-h-[260px]">
                <div className="p-5 space-y-3">
                  {(invoice.items ?? []).map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center text-sm">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold truncate">{item.productName}</p>
                        <p className="text-zinc-500 text-xs">{item.variantSize} × {item.qty} @ {inr(num(item.resolvedPrice ?? item.unitPrice))}</p>
                      </div>
                      <p className="font-black ml-3">{inr(num(item.amount))}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-900/50 text-sm space-y-1">
                <div className="flex justify-between text-zinc-400"><span>Subtotal</span><span>{inr(subtotal)}</span></div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-green-500"><span>Discount</span><span>- {inr(discountAmount)}</span></div>
                )}
                <div className="flex justify-between text-zinc-400"><span>GST</span><span>{inr(totalGst)}</span></div>
                <div className="flex justify-between text-white text-lg font-black pt-1 border-t border-zinc-800 mt-1"><span>TOTAL</span><span>{inr(total)}</span></div>
                {invoice.paymentMode === "CASH" && !isSplit && (
                  <>
                    <div className="flex justify-between text-zinc-400 pt-1"><span>Cash</span><span>{inr(cash)}</span></div>
                    <div className="flex justify-between text-green-500 font-bold"><span>Change</span><span>{inr(change)}</span></div>
                  </>
                )}
                {isSplit && tenders.map((t, i) => (
                  <div key={i} className="flex justify-between text-zinc-400 pt-1">
                    <span>{t.mode}{t.reference ? ` (${t.reference})` : ""}</span>
                    <span>{inr(num(t.amount))}</span>
                  </div>
                ))}
              </div>

              <div className="p-5 border-t border-zinc-800 bg-zinc-900/50 flex justify-between items-center text-sm">
                <div>
                  <p className="text-xs text-zinc-500 uppercase font-black">Payment</p>
                  <p className="font-bold">{invoice.paymentMode || "CASH"}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-zinc-500 uppercase font-black">Date</p>
                  <p className="font-bold">{date.toLocaleString()}</p>
                </div>
              </div>

              {shipAddr && (
                <div className="p-5 border-t border-zinc-800 bg-zinc-900/30 text-sm" data-testid="receipt-ship-to">
                  <p className="text-xs text-zinc-500 uppercase font-black mb-1">Ship to</p>
                  <p className="font-bold">{shipAddr.name} · {shipAddr.phone}</p>
                  <p className="text-zinc-400">
                    {shipAddr.line1}{shipAddr.line2 ? `, ${shipAddr.line2}` : ""}, {shipAddr.city}, {shipAddr.state} - {shipAddr.pincode}
                  </p>
                  {billAddr && !sameAsShipping && (
                    <div className="mt-3 pt-3 border-t border-zinc-800">
                      <p className="text-xs text-zinc-500 uppercase font-black mb-1">Bill to</p>
                      <p className="font-bold">{billAddr.name} · {billAddr.phone}</p>
                      <p className="text-zinc-400">
                        {billAddr.line1}{billAddr.line2 ? `, ${billAddr.line2}` : ""}, {billAddr.city}, {billAddr.state} - {billAddr.pincode}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-3 gap-3">
            <Button
              ref={printBtnRef}
              variant="outline"
              className="h-16 text-base font-bold border-primary/40 bg-zinc-900 hover:bg-zinc-800"
              onClick={handlePrint}
              data-testid="receipt-print-btn"
            >
              <Printer className="mr-2 h-5 w-5" /> PRINT SLIP
            </Button>
            <Button
              variant="outline"
              className="h-16 text-base font-bold border-zinc-800 bg-zinc-900 hover:bg-zinc-800"
              onClick={handleDownloadPdf}
              data-testid="receipt-download-pdf"
            >
              <Download className="mr-2 h-5 w-5" /> PDF
            </Button>
            <Button className="h-16 text-base font-bold" onClick={handleNewSale} data-testid="receipt-new-sale">
              NEW SALE <ChevronRight className="ml-2 h-5 w-5" />
            </Button>
          </div>

          <div className="mt-6 text-center">
            <Button variant="link" className="text-zinc-500 hover:text-primary" onClick={() => setLocation("/sale")}>
              <ShoppingBag className="mr-2 h-4 w-4" /> Back to sale screen
            </Button>
          </div>
        </div>
      </div>

      {/* THERMAL SLIP — rendered in DOM but visually hidden until @media print */}
      <div className="pos-thermal-slip" aria-hidden="true">
        <div className="center">
          <h1>RATHINAM CRACKERS</h1>
          <div>Sivakasi, Tamil Nadu</div>
          <div>GSTIN: 33XXXXXXXXXXXXX</div>
          <div>Tel: +91 99999 99999</div>
        </div>
        <hr className="hr" />
        <div className="row"><span>Bill</span><strong>{invoice.invoiceNo}</strong></div>
        <div className="row"><span>Date</span><span>{date.toLocaleString()}</span></div>
        <div className="row"><span>Cust</span><span>{invoice.customerName || "Walk-in"}</span></div>
        <div className="row"><span>Pay</span><span>{invoice.paymentMode || "CASH"}</span></div>
        <hr className="hr" />
        <table>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Item</th>
              <th style={{ textAlign: "center", width: "10%" }}>Qty</th>
              <th style={{ textAlign: "right", width: "22%" }}>Rate</th>
              <th style={{ textAlign: "right", width: "26%" }}>Amt</th>
            </tr>
          </thead>
          <tbody>
            {(invoice.items ?? []).map((item: any, idx: number) => (
              <tr key={idx}>
                <td className="item-name">{item.productName}<div style={{ fontSize: 10, color: "#333" }}>{item.variantSize}</div></td>
                <td style={{ textAlign: "center" }}>{item.qty}</td>
                <td style={{ textAlign: "right" }}>{num(item.resolvedPrice ?? item.unitPrice).toFixed(2)}</td>
                <td style={{ textAlign: "right" }}>{num(item.amount).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <hr className="hr" />
        <div className="row"><span>Subtotal</span><span>{subtotal.toFixed(2)}</span></div>
        {discountAmount > 0 && <div className="row"><span>Discount</span><span>-{discountAmount.toFixed(2)}</span></div>}
        {cgst > 0 && <div className="row"><span>CGST</span><span>{cgst.toFixed(2)}</span></div>}
        {sgst > 0 && <div className="row"><span>SGST</span><span>{sgst.toFixed(2)}</span></div>}
        {igst > 0 && <div className="row"><span>IGST</span><span>{igst.toFixed(2)}</span></div>}
        <hr className="hr-solid" />
        <div className="row total-line"><span>TOTAL</span><span>₹{total.toFixed(2)}</span></div>
        {invoice.paymentMode === "CASH" && !isSplit && (
          <>
            <div className="row"><span>Cash</span><span>{cash.toFixed(2)}</span></div>
            <div className="row"><span>Change</span><span>{change.toFixed(2)}</span></div>
          </>
        )}
        {isSplit && tenders.map((t, i) => (
          <div key={i} className="row"><span>{t.mode}{t.reference ? ` ${t.reference}` : ""}</span><span>{num(t.amount).toFixed(2)}</span></div>
        ))}
        {shipAddr && (
          <>
            <hr className="hr" />
            <div>
              <strong>Ship To:</strong>
              <div>{shipAddr.name} · {shipAddr.phone}</div>
              <div>{shipAddr.line1}{shipAddr.line2 ? `, ${shipAddr.line2}` : ""}</div>
              <div>{shipAddr.city}, {shipAddr.state} - {shipAddr.pincode}</div>
            </div>
            {billAddr && !sameAsShipping && (
              <div style={{ marginTop: 4 }}>
                <strong>Bill To:</strong>
                <div>{billAddr.name} · {billAddr.phone}</div>
                <div>{billAddr.line1}{billAddr.line2 ? `, ${billAddr.line2}` : ""}</div>
                <div>{billAddr.city}, {billAddr.state} - {billAddr.pincode}</div>
              </div>
            )}
          </>
        )}
        <hr className="hr" />
        <div className="center footer">
          <div>Thank you, visit again!</div>
          <div>Goods once sold are non-returnable.</div>
          <div style={{ marginTop: 4 }}>** {invoice.invoiceNo} **</div>
        </div>
      </div>
    </>
  );
};

export default ReceiptScreen;
