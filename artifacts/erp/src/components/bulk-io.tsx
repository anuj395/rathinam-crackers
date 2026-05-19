import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "../lib/api";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Download, Upload, Loader2, CheckCircle2, AlertTriangle, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Resource =
  | "products"
  | "customers"
  | "agents"
  | "coupons"
  | "brands"
  | "categories"
  | "locations"
  | "suppliers";

interface Props {
  resource: Resource;
  label?: string;
  onImported?: () => void;
}

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; error: string }>;
}

export function BulkIO({ resource, label, onImported }: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [resultOpen, setResultOpen] = useState(false);

  const auth = (): Record<string, string> => {
    const token = localStorage.getItem("erp_token") || "";
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const downloadFrom = async (path: string, filename: string, errLabel: string) => {
    const r = await fetch(path, { headers: auth() });
    if (!r.ok) throw new Error(`${errLabel} failed (${r.status})`);
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadFrom(
        `/api/v1/bulk/${resource}/export`,
        `${resource}-${new Date().toISOString().slice(0, 10)}.csv`,
        "Export",
      );
      toast({ title: "Exported", description: `${label ?? resource} CSV downloaded.` });
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  const handleTemplate = async () => {
    try {
      await downloadFrom(
        `/api/v1/bulk/${resource}/template`,
        `${resource}-template.csv`,
        "Template",
      );
      toast({
        title: "Template downloaded",
        description: "Edit the sample row(s) in Excel/Sheets, then upload via Import CSV.",
      });
    } catch (err) {
      toast({
        title: "Template failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleFile = async (file: File) => {
    setImporting(true);
    try {
      const csv = await file.text();
      const r = await apiFetch(`/api/v1/bulk/${resource}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth() },
        body: JSON.stringify({ csv }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) {
        throw new Error(j.error || `Import failed (${r.status})`);
      }
      setResult(j.data as ImportResult);
      setResultOpen(true);
      onImported?.();
    } catch (err) {
      toast({
        title: "Import failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleTemplate}
          data-testid={`button-template-${resource}`}
          title="Download a sample CSV with one example row"
        >
          <FileText className="mr-2 h-4 w-4" />
          Template
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={exporting}
          data-testid={`button-export-${resource}`}
        >
          {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          Export CSV
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          data-testid={`button-import-${resource}`}
        >
          {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          Import CSV
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
      </div>

      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {result && result.errors.length === 0 ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              )}
              Import results — {label ?? resource}
            </DialogTitle>
            <DialogDescription>
              Tip: use <strong>Template</strong> for a fresh sample, or <strong>Export CSV</strong> to edit existing data. Column names
              are matched case-insensitively and friendly aliases work (e.g. "Mobile" → phone, "SKU" → code). Unknown columns are
              ignored. Rows are upserted by their unique key (code for products/coupons, phone for customers/agents/suppliers, slug for
              brands/categories, name for locations).
            </DialogDescription>
          </DialogHeader>
          {result && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="border rounded-md p-3">
                  <div className="text-2xl font-semibold text-green-600">{result.created}</div>
                  <div className="text-muted-foreground">Created</div>
                </div>
                <div className="border rounded-md p-3">
                  <div className="text-2xl font-semibold text-blue-600">{result.updated}</div>
                  <div className="text-muted-foreground">Updated</div>
                </div>
                <div className="border rounded-md p-3">
                  <div className="text-2xl font-semibold text-red-600">{result.errors.length}</div>
                  <div className="text-muted-foreground">Errors</div>
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="border rounded-md max-h-64 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted">
                      <tr>
                        <th className="p-2 text-left w-16">Row</th>
                        <th className="p-2 text-left">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.errors.map((e, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-2 font-mono">{e.row}</td>
                          <td className="p-2 text-red-600">{e.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setResultOpen(false)} data-testid="button-close-import-result">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
