import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ImagePlus, UploadCloud, Loader2, Trash2 } from "lucide-react";
import { apiFetch, mediaUrl } from "../lib/api";

export type MediaItem = {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  originalName: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  folder: string;
  altText: string | null;
};

type Props = {
  /** Current value (a URL or empty string). */
  value?: string;
  /** Called with the public URL of the chosen / uploaded image. */
  onChange: (url: string) => void;
  /** Folder to bucket new uploads into (e.g. "products"). */
  folder?: string;
  /** Render the picker as a small button — used in row contexts. */
  compact?: boolean;
  buttonLabel?: string;
};

/**
 * A drop-in image picker that lets the user either:
 *  1. upload a new file (multer + sharp on the API), or
 *  2. pick an existing asset from the library, or
 *  3. paste a URL by hand (legacy escape hatch).
 *
 * Backed by the /v1/media endpoints. Uses fetch directly because the
 * generated client doesn't yet know about the media routes — keeping the
 * picker self-contained means we can ship it without re-running codegen.
 */
export function MediaPicker({ value, onChange, folder = "uploads", compact, buttonLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [manualUrl, setManualUrl] = useState(value ?? "");
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => { setManualUrl(value ?? ""); }, [value]);

  const token = () => localStorage.getItem("erp_token") || "";

  const reload = async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`/api/v1/media?limit=120`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const j = await r.json();
      if (j.success) setItems(j.data ?? []);
    } catch {
      toast({ title: "Couldn't load media library", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (open) void reload(); }, [open]);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", folder);
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
      toast({ title: "Image uploaded" });
      const item = j.data as MediaItem;
      // Auto-select the freshly uploaded image and close — that's the user's
      // expected outcome 95 % of the time.
      onChange(item.url);
      setOpen(false);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onPick = (it: MediaItem) => { onChange(it.url); setOpen(false); };

  const onDelete = async (it: MediaItem) => {
    if (!confirm(`Delete ${it.originalName}? This is irreversible.`)) return;
    const r = await apiFetch(`/api/v1/media/${it.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token()}` },
    });
    if (r.ok) {
      setItems((prev) => prev.filter((x) => x.id !== it.id));
      if (value === it.url) onChange("");
    } else {
      toast({ title: "Could not delete asset", variant: "destructive" });
    }
  };

  return (
    <>
      <div className={compact ? "flex items-center gap-2" : "space-y-2"}>
        {!compact && value ? (
          <img
            src={mediaUrl(value)}
            alt=""
            className="h-24 w-24 object-cover rounded border bg-muted"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : compact && value ? (
          <img src={mediaUrl(value)} alt="" className="h-9 w-9 object-cover rounded border" />
        ) : null}
        <Button
          type="button"
          size={compact ? "sm" : "default"}
          variant="outline"
          onClick={() => setOpen(true)}
          data-testid="media-picker-open"
        >
          <ImagePlus className="h-4 w-4 mr-2" />
          {buttonLabel ?? (value ? "Change image" : "Pick or upload image")}
        </Button>
        {value && !compact && (
          <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => onChange("")}>Clear</Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Media Library</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="library">
            <TabsList>
              <TabsTrigger value="library">Library</TabsTrigger>
              <TabsTrigger value="upload">Upload new</TabsTrigger>
              <TabsTrigger value="url">Paste URL</TabsTrigger>
            </TabsList>

            <TabsContent value="library" className="mt-4">
              {loading ? (
                <div className="py-12 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…</div>
              ) : items.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">No images yet — upload one in the next tab.</div>
              ) : (
                <div className="grid grid-cols-4 gap-3 max-h-[60vh] overflow-y-auto p-1">
                  {items.map((it) => (
                    <div key={it.id} className="group relative border rounded overflow-hidden hover:ring-2 hover:ring-primary cursor-pointer" onClick={() => onPick(it)}>
                      <img src={mediaUrl(it.thumbnailUrl ?? it.url)} alt={it.altText ?? ""} className="aspect-square w-full object-cover" />
                      <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[10px] px-1.5 py-0.5 truncate">{it.originalName}</div>
                      <Button
                        type="button"
                        size="icon"
                        variant="destructive"
                        className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => { e.stopPropagation(); void onDelete(it); }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="upload" className="mt-4 space-y-3">
              <Label>Choose an image (JPG, PNG, WEBP, GIF — up to 8 MB)</Label>
              <Input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f);
                }}
              />
              {uploading && <p className="text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Optimising and uploading…</p>}
              <p className="text-xs text-muted-foreground"><UploadCloud className="h-3 w-3 inline mr-1" />Images are auto-converted to WebP and a 400 px thumbnail is generated.</p>
            </TabsContent>

            <TabsContent value="url" className="mt-4 space-y-3">
              <Label>External image URL</Label>
              <Input
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
              />
              <p className="text-xs text-muted-foreground">Use this only for images already hosted elsewhere — uploaded assets are preferred.</p>
              <DialogFooter>
                <Button type="button" onClick={() => { onChange(manualUrl.trim()); setOpen(false); }} disabled={!manualUrl.trim()}>Use this URL</Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
