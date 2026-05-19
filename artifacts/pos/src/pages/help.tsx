import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  KeyRound,
  ShoppingCart,
  Pause,
  Tag,
  Award,
  Printer,
  X,
  ScanLine,
  Bluetooth,
  Usb,
  Smartphone,
  CheckCircle2,
  Settings2,
  AlertTriangle,
} from "lucide-react";

const STEPS = [
  {
    icon: KeyRound,
    title: "1. Sign in with PIN",
    body: "Pick your name from the cashier dropdown, then tap your 4-digit PIN on the keypad. Default cashier PIN is 3456.",
  },
  {
    icon: ShoppingCart,
    title: "2. Build the sale",
    body: "Search a product on the left panel, or scan a barcode — the cart updates instantly. Use + / − on each cart line to adjust qty. Tap the trash icon to remove.",
  },
  {
    icon: Tag,
    title: "3. Apply coupon (optional)",
    body: "Enter a coupon code in the cart, tap Apply. The discount appears in the totals box. Coupons are validated against the live ERP — invalid or expired codes are rejected.",
  },
  {
    icon: Award,
    title: "4. Loyalty redeem (optional)",
    body: "Search and select the customer (top of cart). If they have loyalty points, toggle Redeem to apply. Walk-in sales skip this step.",
  },
  {
    icon: Pause,
    title: "5. Hold a bill",
    body: "Customer wandered off? Tap Hold to park the cart. Open the Held Bills sheet later to resume any saved cart on any terminal.",
  },
  {
    icon: ShoppingCart,
    title: "6. Checkout",
    body: "Choose CASH, CARD, or UPI. For CASH, enter the received amount — change is calculated automatically. Tap CHECKOUT.",
  },
  {
    icon: Printer,
    title: "7. Receipt & print",
    body: "The receipt screen shows invoice number and totals. Tap Print to print, or New Sale to start the next customer.",
  },
];

const RULES = [
  "qty ≥ 10 of the same item auto-switches to wholesale rate.",
  "Cashiers cannot change prices — talk to your manager for overrides.",
  "Stock is checked at checkout — out-of-stock items will block the sale.",
  "Every sale is idempotent — accidental double-tap won't double-charge.",
];

// ---------- Barcode scanner section ----------

type ScannerEntry = {
  brand: string;
  models: string;
  connection: string;
  oob: "Plug & play" | "Plug & play (set CR suffix)" | "Pair as keyboard";
  notes: string;
};

const SCANNER_TABLE: ScannerEntry[] = [
  {
    brand: "Honeywell",
    models: "Voyager 1200g / 1250g, Xenon 1900 / 1902, Eclipse 5145, Hyperion 1300g",
    connection: "USB-HID, RS-232, Bluetooth (1902)",
    oob: "Plug & play",
    notes: "Default config emits CR after the code — works straight away. For Bluetooth pairing use HID-Keyboard mode.",
  },
  {
    brand: "Zebra / Symbol / Motorola",
    models: "DS2208, DS3608, DS4308, DS8108, LI2208, LS2208, LS4208, CS3070, CS4070",
    connection: "USB-HID, USB-CDC, Bluetooth",
    oob: "Plug & play",
    notes: "If your DS3608 is in USB-CDC (serial) mode, scan the \"HID Keyboard\" config barcode from the Zebra product reference guide.",
  },
  {
    brand: "Datalogic",
    models: "QuickScan QD2430 / QM2430, Gryphon GD4430, Heron HD3430, Magellan 3450VSi",
    connection: "USB-HID, Bluetooth",
    oob: "Plug & play",
    notes: "Defaults to keyboard wedge with Enter terminator. Use the Aladdin software for prefix/suffix tweaks if needed.",
  },
  {
    brand: "Tera / NETUM / Eyoyo",
    models: "Tera 8100 / HW0002, NETUM C740 / C750, Eyoyo EY-001 / EY-007L",
    connection: "USB-HID, 2.4 GHz dongle, Bluetooth",
    oob: "Plug & play",
    notes: "Affordable workhorses. Ship with CR-LF — toggle to CR-only via the programming sheet if double-Enter is detected.",
  },
  {
    brand: "Intermec / CipherLab / Opticon",
    models: "SR30 / SR61, CipherLab 1500/1660/1862, Opticon OPI3601 / OPN-2002",
    connection: "USB-HID, Bluetooth",
    oob: "Plug & play (set CR suffix)",
    notes: "Some ship in batch / serial mode. Scan \"USB-HID Keyboard\" from the manual, then add CR suffix.",
  },
  {
    brand: "Generic USB-HID scanners",
    models: "Any \"plug-and-play\" wired scanner sold as keyboard-wedge",
    connection: "USB-HID",
    oob: "Plug & play",
    notes: "If the OS recognises it as a keyboard, this POS recognises it. No driver needed on Windows / macOS / Linux / ChromeOS.",
  },
  {
    brand: "Bluetooth HID scanners",
    models: "Any BT 4.0+ scanner that pairs as a keyboard (HID profile)",
    connection: "Bluetooth Classic / BLE",
    oob: "Pair as keyboard",
    notes: "Pair via OS Bluetooth → choose HID-Keyboard mode (not SPP / serial). After pairing, scans appear as keystrokes.",
  },
  {
    brand: "Phone camera (keyboard-wedge apps)",
    models: "ScanKey, Barcode to PC, KDC scan apps",
    connection: "Bluetooth / Wi-Fi → HID emulation",
    oob: "Pair as keyboard",
    notes: "Useful as a stand-in scanner. Ensure the app sends Enter / Tab as terminator.",
  },
];

const TROUBLESHOOTING = [
  {
    q: "Nothing happens when I scan",
    a: "Check the scanner is in HID-Keyboard mode (not Serial / SPP). Open Notepad / a text field on this device — if the code does not appear there either, it is a scanner / OS pairing issue, not a POS issue.",
  },
  {
    q: "The code arrives but doesn't add a product",
    a: "The scanned code must match a product code in your catalogue. Open the Scanner Settings dialog, scan into the test box, and confirm the decoded text exactly matches the product code in ERP.",
  },
  {
    q: "Each scan adds an extra empty line / submits twice",
    a: "Your scanner is sending CR + LF (two terminators). Reprogram it to send CR only, or change Terminator to \"Enter / CR\" in Scanner Settings.",
  },
  {
    q: "Scanner sends a junk character at the start (e.g. ]C1, ¬)",
    a: "That's an AIM symbology prefix. Put the prefix string into Scanner Settings → Prefix to strip, and it will be removed automatically.",
  },
  {
    q: "Fast typing accidentally triggers a scan",
    a: "Lower Inter-key threshold to 25–30 ms in Scanner Settings. Genuine scanners send keys far faster than any human typist.",
  },
  {
    q: "Bluetooth scanner is slow / drops keys",
    a: "Raise Inter-key threshold to 80–100 ms — some BLE scanners have variable delivery timing.",
  },
];

export default function PosHelp() {
  const [, setLocation] = useLocation();
  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/sale">
            <Button variant="ghost" size="sm" className="text-white hover:bg-white/10">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Back to Sale
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/sale")}
            className="text-white hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div>
          <h1 className="text-3xl font-bold tracking-tight">POS — How to use</h1>
          <p className="text-white/60 mt-1">Step-by-step cashier guide & barcode scanner reference</p>
        </div>

        {/* Cashier steps */}
        <div className="space-y-3">
          {STEPS.map((s) => (
            <Card key={s.title} className="bg-[#1a1a1a] border-white/10 text-white">
              <CardContent className="pt-5">
                <div className="flex gap-3">
                  <div className="rounded-md bg-primary/15 p-2 h-fit">
                    <s.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">{s.title}</h3>
                    <p className="text-sm text-white/70 leading-relaxed">{s.body}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="bg-amber-500/10 border-amber-500/30 text-white">
          <CardContent className="pt-5">
            <h3 className="font-semibold mb-2 text-amber-300">Important rules</h3>
            <ul className="space-y-1.5 text-sm text-white/80">
              {RULES.map((r) => <li key={r}>• {r}</li>)}
            </ul>
          </CardContent>
        </Card>

        {/* ---- Barcode scanner guide ---- */}
        <div className="pt-4">
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ScanLine className="h-6 w-6 text-primary" /> Barcode scanner compatibility
          </h2>
          <p className="text-white/60 mt-1 text-sm">
            This POS works out-of-the-box with virtually every retail barcode scanner sold today. No drivers, no integration code, no per-vendor setup.
          </p>
        </div>

        <Card className="bg-primary/10 border-primary/30 text-white">
          <CardContent className="pt-5 space-y-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div className="text-sm leading-relaxed">
                <p className="font-semibold mb-1">How it works</p>
                <p className="text-white/75">
                  Modern scanners present themselves as a USB or Bluetooth <em>keyboard</em>. They "type" the scanned code at ~1&nbsp;ms per character and finish with Enter or Tab. The POS detects this rapid-burst pattern globally — so scans work anywhere on the sale screen, even with no field focused.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="flex items-center gap-2 rounded-md bg-zinc-900/60 p-2.5 border border-white/5">
                <Usb className="h-4 w-4 text-primary" /> <span>USB-HID — plug it in, scan</span>
              </div>
              <div className="flex items-center gap-2 rounded-md bg-zinc-900/60 p-2.5 border border-white/5">
                <Bluetooth className="h-4 w-4 text-primary" /> <span>Bluetooth — pair as keyboard, scan</span>
              </div>
              <div className="flex items-center gap-2 rounded-md bg-zinc-900/60 p-2.5 border border-white/5">
                <Smartphone className="h-4 w-4 text-primary" /> <span>Phone camera apps — pair, scan</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Compatibility table */}
        <Card className="bg-[#1a1a1a] border-white/10 text-white">
          <CardContent className="pt-5">
            <h3 className="font-semibold mb-3">Tested & confirmed compatible</h3>
            <div className="space-y-3">
              {SCANNER_TABLE.map((s) => (
                <div
                  key={s.brand}
                  className="rounded-lg border border-white/10 bg-zinc-950/50 p-3 grid md:grid-cols-[1fr_auto] gap-3 items-start"
                >
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold">{s.brand}</span>
                      <Badge className="bg-primary/15 text-primary border border-primary/30 hover:bg-primary/15">
                        {s.connection}
                      </Badge>
                    </div>
                    <div className="text-xs text-white/60 mt-1">{s.models}</div>
                    <p className="text-xs text-white/70 mt-2 leading-relaxed">{s.notes}</p>
                  </div>
                  <Badge
                    className={
                      s.oob === "Plug & play"
                        ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/15"
                        : "bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/15"
                    }
                  >
                    {s.oob}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Customisation */}
        <Card className="bg-[#1a1a1a] border-white/10 text-white">
          <CardContent className="pt-5 space-y-3">
            <div className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Custom scanners — fine-tuning</h3>
            </div>
            <p className="text-sm text-white/75 leading-relaxed">
              Open <span className="text-primary font-semibold">Sale → Scanner Settings (gear icon)</span> to tune any of these without touching code:
            </p>
            <ul className="text-sm text-white/80 space-y-2 list-none pl-0">
              <li><span className="text-primary font-semibold">Terminator</span> — Enter (CR), Tab, none (timeout-flush), or auto-detect.</li>
              <li><span className="text-primary font-semibold">Prefix / suffix to strip</span> — for AIM symbology codes (<code className="bg-zinc-900 px-1 rounded">]C1</code>, <code className="bg-zinc-900 px-1 rounded">]E0</code>) or vendor-specific framing characters.</li>
              <li><span className="text-primary font-semibold">Min / max length</span> — reject obviously wrong reads (e.g. anything &lt; 3 chars).</li>
              <li><span className="text-primary font-semibold">Inter-key threshold</span> — how fast the keystrokes must arrive to count as a scan. 50&nbsp;ms is the sweet spot; raise for slow Bluetooth, lower for ultra-fast scanners.</li>
              <li><span className="text-primary font-semibold">Capture while typing</span> — keep capturing scans even when the cashier has another input focused.</li>
              <li><span className="text-primary font-semibold">Beep / vibrate</span> — in-app feedback for successful scans, independent of the scanner's own beeper.</li>
            </ul>
            <p className="text-xs text-white/55 pt-1">
              Settings are saved per device (browser localStorage), so each terminal can be tuned to its own scanner.
            </p>
          </CardContent>
        </Card>

        {/* Troubleshooting */}
        <Card className="bg-[#1a1a1a] border-white/10 text-white">
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              <h3 className="font-semibold">Troubleshooting</h3>
            </div>
            <div className="space-y-3">
              {TROUBLESHOOTING.map((t) => (
                <div key={t.q} className="rounded-md border border-white/5 bg-zinc-950/50 p-3">
                  <p className="text-sm font-semibold text-white/95">{t.q}</p>
                  <p className="text-sm text-white/70 mt-1 leading-relaxed">{t.a}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#1a1a1a] border-white/10 text-white">
          <CardContent className="pt-5 text-sm">
            <h3 className="font-semibold mb-2">Default PINs (demo)</h3>
            <div className="grid grid-cols-2 gap-2 text-white/80">
              <div>Admin — <code className="bg-white/10 px-1.5 py-0.5 rounded">1234</code></div>
              <div>Manager — <code className="bg-white/10 px-1.5 py-0.5 rounded">2345</code></div>
              <div>Cashier — <code className="bg-white/10 px-1.5 py-0.5 rounded">3456</code></div>
              <div>Warehouse — <code className="bg-white/10 px-1.5 py-0.5 rounded">4567</code></div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
