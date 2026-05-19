import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, UploadCloud, Copy, Image as ImageIcon } from "lucide-react";
import { apiFetch, mediaUrl } from "../../lib/api";

type MediaItem = {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  originalName: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  folder: string;
  altText: string | null;
  createdAt: string;
};

const fmtKB = (b: number) => (b < 1024 ? `${b} B` : `${(b / 1024).toFixed(1)} KB`);

export default function MediaLibraryPage() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const token = () => localStorage.getItem("erp_token") || "";

  const load = async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`/api/v1/media?limit=200`, { headers: { Authorization: `Bearer ${token()}` } });
      const j = await r.json();
      if (j.success) setItems(j.data ?? []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "uploads");
      const r = await apiFetch(`/api/v1/media`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}` },
        body: fd,
      });
      const j = await r.json();
      if (!r.ok || !j.success) {
        toast({ title: j?.error?.message ?? "Upload failed", variant: "destructive" });
        return;
      }
      toast({ title: "Uploaded" });
      setItems((prev) => [j.data as MediaItem, ...prev]);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async (it: MediaItem) => {
    if (!confirm(`Delete ${it.originalName}? Anything currently using this image will break.`)) return;
    const r = await apiFetch(`/api/v1/media/${it.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token()}` },
    });
    if (r.ok) setItems((prev) => prev.filter((x) => x.id !== it.id));
    else toast({ title: "Delete failed", variant: "destructive" });
  };

  const copy = async (url: string) => {
    await navigator.clipboard.writeText(url);
    toast({ title: "URL copied to clipboard" });
  };

  const visible = filter
    ? items.filter((i) => i.originalName.toLowerCase().includes(filter.toLowerCase()) || (i.altText ?? "").toLowerCase().includes(filter.toLowerCase()))
    : items;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><ImageIcon className="h-7 w-7 text-primary" /> Media Library</h1>
          <p className="text-muted-foreground text-sm mt-1">Centralised store for product photos, banners and any other images used across the website, ERP, and POS.</p>
        </div>
        <div className="flex gap-2">
          <Input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="w-auto"
            disabled={uploading}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
            data-testid="media-upload"
          />
          {uploading && <Loader2 className="h-5 w-5 animate-spin self-center text-muted-foreground" />}
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{items.length} image{items.length === 1 ? "" : "s"}</CardTitle>
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search by filename / alt text" className="w-64" />
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-16 text-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin inline mr-2" /> Loading…</div>
          ) : visible.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <UploadCloud className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>No images yet. Upload one with the file picker above.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {visible.map((it) => (
                <div key={it.id} className="group border rounded overflow-hidden bg-muted/30">
                  <img src={mediaUrl(it.thumbnailUrl ?? it.url)} alt={it.altText ?? ""} className="aspect-square w-full object-cover" />
                  <div className="p-2 text-xs space-y-1">
                    <div className="font-medium truncate" title={it.originalName}>{it.originalName}</div>
                    <div className="text-muted-foreground">{it.width}×{it.height} · {fmtKB(it.sizeBytes)}</div>
                    <div className="flex gap-1 pt-1">
                      <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs flex-1" onClick={() => copy(it.url)}>
                        <Copy className="h-3 w-3 mr-1" /> Copy URL
                      </Button>
                      <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remove(it)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
