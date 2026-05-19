import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PackageCheck, ArrowLeftRight, Sliders, ScrollText, AlertTriangle, BookOpen } from "lucide-react";

const SECTIONS = [
  {
    icon: PackageCheck,
    title: "Receive Stock",
    body: (
      <>
        Goods arriving from a supplier? Use <strong>Receive Stock</strong>. Pick the location, link the
        purchase order if applicable, then add product lines with quantities and batch numbers. Each
        line creates an immutable <strong>IN</strong> entry in the stock ledger.
      </>
    ),
  },
  {
    icon: ArrowLeftRight,
    title: "Transfers between locations",
    body: (
      <>
        Move stock from warehouse to a shop counter? Use <strong>Transfers → New</strong>. Pick from/to
        location, add lines, save. At the source: tap <strong>Dispatch</strong> (creates RESERVE rows).
        At the destination: tap <strong>Receive</strong> (creates IN at destination + UNRESERVE at source).
        Discrepancies between dispatched and received qty are flagged automatically.
      </>
    ),
  },
  {
    icon: Sliders,
    title: "Stock adjustments",
    body: (
      <>
        Found damage, theft, or a count error? Use <strong>Adjust</strong>. Enter the delta (+ or −) and a
        <em> mandatory reason</em>. Adjustments cannot be deleted — the original entry stays in the audit
        trail forever. This is by design.
      </>
    ),
  },
  {
    icon: ScrollText,
    title: "Stock ledger (audit trail)",
    body: (
      <>
        Every movement is recorded — IN, OUT, MOVE, ADJUST, DAMAGE, RESERVE, UNRESERVE. Filter by product,
        location, type, or date range. Click any row to see the source document. Current stock = sum of
        all rows for that product/variant/location.
      </>
    ),
  },
];

const ALERTS = [
  "Low Stock items show with an amber badge on the Stock Levels page.",
  "Critical Stock items (below half of reorder level) show with a red badge.",
  "Pending transfers (in-transit) appear on the dashboard for quick action.",
];

export default function WarehouseHelp() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2.5">
          <BookOpen className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Warehouse — Working Guide</h1>
          <p className="text-sm text-muted-foreground">
            Everything you need to know to run stock operations efficiently.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SECTIONS.map((s) => (
          <Card key={s.title}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <s.icon className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">{s.title}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed [&_strong]:text-foreground">{s.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-amber-500/5 border-amber-500/30">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <CardTitle className="text-base">Stock alerts</CardTitle>
          </div>
          <CardDescription className="text-xs">How the system warns you about low stock</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1.5 text-sm">
            {ALERTS.map((a) => <li key={a}>• {a}</li>)}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Default credentials (demo)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            Username: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">warehouse</code> · Password: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">admin123</code> · PIN: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">4567</code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
