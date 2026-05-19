import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  useListAllReviews,
  useUpdateReviewStatus,
  useDeleteReview,
} from "@workspace/api-client-react";
import { Star, CheckCircle2, XCircle, Trash2 } from "lucide-react";

const STATUS_FILTERS = [
  { key: "", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

export default function Reviews() {
  const [filter, setFilter] = useState<string>("pending");
  const { data, isLoading, refetch } = useListAllReviews(filter ? { status: filter } : undefined);
  const update = useUpdateReviewStatus();
  const remove = useDeleteReview();
  const { toast } = useToast();

  const reviews = ((data as any)?.data ?? []) as Array<any>;

  const setStatus = async (id: string, status: "approved" | "rejected") => {
    try {
      await update.mutateAsync({ id, data: { status } as any });
      toast({ title: status === "approved" ? "Approved" : "Rejected" });
      refetch();
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    }
  };
  const handleDelete = async (id: string) => {
    if (!confirm("Delete this review permanently?")) return;
    try {
      await remove.mutateAsync({ id });
      toast({ title: "Deleted" });
      refetch();
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold mb-1">Product reviews</h1>
        <p className="text-sm text-muted-foreground mb-4">
          Moderate reviews submitted from the public website. Approved reviews appear on the product page.
        </p>

        <div className="flex gap-2 mb-4">
          {STATUS_FILTERS.map((f) => (
            <Button
              key={f.key || "all"}
              size="sm"
              variant={filter === f.key ? "default" : "outline"}
              onClick={() => setFilter(f.key)}
              data-testid={`reviews-filter-${f.key || "all"}`}
            >
              {f.label}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : reviews.length === 0 ? (
          <p className="text-muted-foreground">No reviews in this view.</p>
        ) : (
          <div className="space-y-3">
            {reviews.map((r) => (
              <div key={r.id} className="rounded border bg-white p-4" data-testid={`review-row-${r.id}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{r.authorName}</span>
                    {r.city ? <span className="text-xs text-muted-foreground">· {r.city}</span> : null}
                    <Badge variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : "secondary"}>
                      {r.status}
                    </Badge>
                    <div className="flex">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`h-3.5 w-3.5 ${s <= (r.rating || 0) ? "fill-amber-400 text-amber-400" : "text-gray-300"}`}
                        />
                      ))}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {r.createdAt ? new Date(r.createdAt).toLocaleString() : ""}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-1">Product: {r.productId}</p>
                {r.title ? <p className="font-semibold text-sm mb-1">{r.title}</p> : null}
                <p className="text-sm text-slate-700 mb-3">{r.body}</p>
                <div className="flex gap-2">
                  {r.status !== "approved" && (
                    <Button size="sm" onClick={() => setStatus(r.id, "approved")} data-testid={`approve-${r.id}`}>
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                    </Button>
                  )}
                  {r.status !== "rejected" && (
                    <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "rejected")} data-testid={`reject-${r.id}`}>
                      <XCircle className="h-4 w-4 mr-1" /> Reject
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => handleDelete(r.id)} data-testid={`delete-${r.id}`}>
                    <Trash2 className="h-4 w-4 mr-1" /> Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
