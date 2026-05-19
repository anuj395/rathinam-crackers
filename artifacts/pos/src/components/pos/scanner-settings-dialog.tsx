import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScanLine, RotateCcw, CheckCircle2 } from "lucide-react";
import {
  DEFAULT_SCANNER_SETTINGS,
  loadScannerSettings,
  saveScannerSettings,
  type ScannerSettings,
  type ScannerTerminator,
} from "@/lib/barcode-scanner-settings";
import { useBarcodeScanner, type ScanEvent } from "@/hooks/useBarcodeScanner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function ScannerSettingsDialog({ open, onOpenChange }: Props) {
  const [draft, setDraft] = useState<ScannerSettings>(loadScannerSettings);
  const [lastScan, setLastScan] = useState<ScanEvent | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const testInputRef = useRef<HTMLInputElement>(null);

  // Reload from storage every time the dialog opens.
  useEffect(() => {
    if (open) {
      setDraft(loadScannerSettings());
      setLastScan(null);
    }
  }, [open]);

  // Persist & broadcast on every change so the live scanner uses the new
  // config immediately (so the in-dialog test field works against the new
  // settings without forcing a Save).
  useEffect(() => {
    if (!open) return;
    saveScannerSettings(draft);
  }, [draft, open]);

  // Live test scanner — only active while the dialog is open.
  useBarcodeScanner({
    enabled: open,
    onScan: (e) => setLastScan(e),
  });

  const update = <K extends keyof ScannerSettings>(key: K, value: ScannerSettings[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const reset = () => setDraft({ ...DEFAULT_SCANNER_SETTINGS });

  const save = () => {
    saveScannerSettings(draft);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
    setTimeout(() => onOpenChange(false), 400);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-zinc-950 border-primary/30 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-primary" /> Barcode scanner settings
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Works out-of-the-box with any USB or Bluetooth HID scanner. Tweak the timing or terminator below if your scanner behaves oddly.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 py-2 max-h-[60vh] overflow-y-auto pr-1">
          {/* Enabled */}
          <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
            <div>
              <Label className="text-white">Global scanner listening</Label>
              <p className="text-xs text-zinc-400 mt-0.5">When ON, the scanner works anywhere on the sale screen — even if no field is focused.</p>
            </div>
            <Switch checked={draft.enabled} onCheckedChange={(v) => update("enabled", v)} />
          </div>

          {/* Terminator */}
          <div className="grid grid-cols-3 gap-4 items-center">
            <div className="col-span-1">
              <Label className="text-white">Terminator</Label>
              <p className="text-xs text-zinc-500 mt-0.5">The key your scanner sends after the code.</p>
            </div>
            <div className="col-span-2">
              <Select value={draft.terminator} onValueChange={(v) => update("terminator", v as ScannerTerminator)}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto-detect (Enter / Tab / timeout)</SelectItem>
                  <SelectItem value="enter">Enter / CR (most common)</SelectItem>
                  <SelectItem value="tab">Tab</SelectItem>
                  <SelectItem value="none">None — flush on inactivity</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Prefix / Suffix */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-white">Prefix to strip</Label>
              <Input
                value={draft.prefix}
                onChange={(e) => update("prefix", e.target.value)}
                placeholder="e.g. ]C1"
                className="bg-zinc-900 border-zinc-800 text-white mt-1"
                data-testid="scanner-prefix"
              />
              <p className="text-xs text-zinc-500 mt-1">Some scanners prepend AIM/symbology codes. Leave blank if unsure.</p>
            </div>
            <div>
              <Label className="text-white">Suffix to strip</Label>
              <Input
                value={draft.suffix}
                onChange={(e) => update("suffix", e.target.value)}
                placeholder="e.g. ;"
                className="bg-zinc-900 border-zinc-800 text-white mt-1"
                data-testid="scanner-suffix"
              />
            </div>
          </div>

          {/* Lengths */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-white">Min length</Label>
              <Input
                type="number"
                min={1}
                value={draft.minLength}
                onChange={(e) => update("minLength", Math.max(1, Number(e.target.value) || 1))}
                className="bg-zinc-900 border-zinc-800 text-white mt-1"
                data-testid="scanner-min-length"
              />
            </div>
            <div>
              <Label className="text-white">Max length</Label>
              <Input
                type="number"
                min={1}
                value={draft.maxLength}
                onChange={(e) => update("maxLength", Math.max(1, Number(e.target.value) || 1))}
                className="bg-zinc-900 border-zinc-800 text-white mt-1"
                data-testid="scanner-max-length"
              />
            </div>
          </div>

          {/* Timing */}
          <div>
            <Label className="text-white">Inter-key threshold (ms)</Label>
            <Input
              type="number"
              min={10}
              max={500}
              value={draft.interKeyTimeoutMs}
              onChange={(e) => update("interKeyTimeoutMs", Math.max(10, Number(e.target.value) || 50))}
              className="bg-zinc-900 border-zinc-800 text-white mt-1 max-w-[140px]"
              data-testid="scanner-interkey"
            />
            <p className="text-xs text-zinc-500 mt-1">
              Keys arriving within this window are treated as part of one scan. Default 50&nbsp;ms suits virtually every retail scanner.
              Raise to 80–100&nbsp;ms for slow Bluetooth scanners; lower to 30&nbsp;ms if a fast typist accidentally triggers scans.
            </p>
          </div>

          {/* Capture-when-focused */}
          <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
            <div>
              <Label className="text-white">Capture even when an input is focused</Label>
              <p className="text-xs text-zinc-400 mt-0.5">Useful for wedge scanners where the cashier is editing the cart while scanning the next item.</p>
            </div>
            <Switch checked={draft.captureWhenInputFocused} onCheckedChange={(v) => update("captureWhenInputFocused", v)} />
          </div>

          {/* Beep */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
              <Label className="text-white">Beep on successful scan</Label>
              <Switch checked={draft.beepOnScan} onCheckedChange={(v) => update("beepOnScan", v)} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
              <Label className="text-white">Vibrate (mobile)</Label>
              <Switch checked={draft.vibrateOnScan} onCheckedChange={(v) => update("vibrateOnScan", v)} />
            </div>
          </div>

          {/* Test area */}
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <ScanLine className="h-4 w-4 text-primary" />
              <Label className="text-white">Test your scanner</Label>
            </div>
            <p className="text-xs text-zinc-400 mb-3">
              Click into the box and trigger a scan. You should see the decoded code appear with timing details below.
            </p>
            <Input
              ref={testInputRef}
              placeholder="Click here, then scan…"
              className="bg-zinc-900 border-zinc-800 text-white"
              data-testid="scanner-test-input"
              onKeyDown={(e) => {
                // Stop the test input from "winning" when global capture is on.
                if (e.key === "Enter") e.preventDefault();
              }}
            />
            <div className="mt-3 text-sm">
              {lastScan ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Scan detected
                  </Badge>
                  <code className="px-2 py-1 rounded bg-zinc-800 text-amber-300 font-mono text-sm break-all" data-testid="scanner-last-code">
                    {lastScan.code}
                  </code>
                  <span className="text-xs text-zinc-400">
                    {lastScan.code.length} chars · {Math.round(lastScan.durationMs)}&nbsp;ms total · avg&nbsp;
                    {Math.round(lastScan.averageInterKeyMs)}&nbsp;ms / key · terminator&nbsp;
                    <span className="text-zinc-200">{lastScan.terminator}</span>
                  </span>
                </div>
              ) : (
                <span className="text-zinc-500 text-xs">No scan captured yet.</span>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
          <Button variant="outline" onClick={reset} className="border-zinc-700 text-white hover:bg-zinc-800">
            <RotateCcw className="h-4 w-4 mr-1.5" /> Reset to defaults
          </Button>
          <div className="flex gap-2">
            {savedFlash && <span className="text-xs text-emerald-400 self-center">Saved ✓</span>}
            <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-white hover:bg-white/10">Close</Button>
            <Button onClick={save} className="bg-primary hover:bg-primary/90 text-primary-foreground" data-testid="scanner-save">
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
