import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "../../lib/api";

// API base now centralised in src/lib/api.ts

type AuditRow = {
  id: string;
  actorUserId: string | null;
  actorRole: string | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
};

async function api<T>(path: string): Promise<T> {
  const token = localStorage.getItem("erp_token");
  const res = await apiFetch(`/api/v1${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

const actionColor: Record<string, string> = {
  CREATE: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  UPDATE: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  DELETE: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

type UserOption = { id: string; name: string };

type Primitive = string | number | boolean | null | undefined;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function flatten(value: unknown, prefix = ""): Record<string, Primitive> {
  const out: Record<string, Primitive> = {};
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) {
      out[prefix || "(empty)"] = "{}";
      return out;
    }
    for (const k of keys) {
      const next = prefix ? `${prefix}.${k}` : k;
      Object.assign(out, flatten(value[k], next));
    }
  } else if (Array.isArray(value)) {
    if (value.length === 0) {
      out[prefix || "(empty)"] = "(none)";
      return out;
    }
    value.forEach((item, i) => {
      const next = `${prefix}[${i}]`;
      Object.assign(out, flatten(item, next));
    });
  } else {
    out[prefix] = value as Primitive;
  }
  return out;
}

function formatValue(v: unknown): string {
  if (v === undefined) return "—";
  if (v === null) return "(empty)";
  if (typeof v === "string") return v === "" ? '""' : v;
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (Array.isArray(v)) {
    if (v.length === 0) return "(none)";
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

function humanizeKey(key: string): string {
  return key
    .split(".")
    .map((part) =>
      part.replace(/\[(\d+)\]/g, (_, n) => ` #${Number(n) + 1}`),
    )
    .map((part) =>
      part
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/_/g, " ")
        .replace(/^./, (c) => c.toUpperCase())
        .trim(),
    )
    .join(" › ");
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    return ak.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

type DiffEntry = { key: string; before: unknown; after: unknown; kind: "added" | "removed" | "changed" };

function computeDiff(before: unknown, after: unknown): DiffEntry[] {
  const beforeFlat = isPlainObject(before) || Array.isArray(before) ? flatten(before) : {};
  const afterFlat = isPlainObject(after) || Array.isArray(after) ? flatten(after) : {};
  const allKeys = new Set([...Object.keys(beforeFlat), ...Object.keys(afterFlat)]);
  const entries: DiffEntry[] = [];
  for (const k of allKeys) {
    const b = beforeFlat[k];
    const a = afterFlat[k];
    const inBefore = k in beforeFlat;
    const inAfter = k in afterFlat;
    if (inBefore && !inAfter) entries.push({ key: k, before: b, after: undefined, kind: "removed" });
    else if (!inBefore && inAfter) entries.push({ key: k, before: undefined, after: a, kind: "added" });
    else if (!deepEqual(b, a)) entries.push({ key: k, before: b, after: a, kind: "changed" });
  }
  return entries.sort((x, y) => x.key.localeCompare(y.key));
}

function FriendlyDiff({
  action,
  before,
  after,
  showRaw,
  onToggleRaw,
}: {
  action: string;
  before: unknown;
  after: unknown;
  showRaw: boolean;
  onToggleRaw: () => void;
}) {
  const diff = useMemo(() => computeDiff(before, after), [before, after]);
  const isCreate = action === "CREATE" || (before == null && after != null);
  const isDelete = action === "DELETE" || (after == null && before != null);

  const renderRows = () => {
    if (isCreate) {
      const flat = isPlainObject(after) || Array.isArray(after) ? flatten(after) : {};
      const keys = Object.keys(flat).sort();
      if (keys.length === 0) return <div className="text-sm text-muted-foreground">New record created.</div>;
      return (
        <div className="rounded border bg-background divide-y">
          {keys.map((k) => (
            <div key={k} className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-2 p-2 text-sm">
              <div className="font-medium text-muted-foreground">{humanizeKey(k)}</div>
              <div className="text-green-700 dark:text-green-300 break-all">{formatValue(flat[k])}</div>
            </div>
          ))}
        </div>
      );
    }
    if (isDelete) {
      const flat = isPlainObject(before) || Array.isArray(before) ? flatten(before) : {};
      const keys = Object.keys(flat).sort();
      if (keys.length === 0) return <div className="text-sm text-muted-foreground">Record was deleted.</div>;
      return (
        <div className="rounded border bg-background divide-y">
          {keys.map((k) => (
            <div key={k} className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-2 p-2 text-sm">
              <div className="font-medium text-muted-foreground">{humanizeKey(k)}</div>
              <div className="text-red-700 dark:text-red-300 break-all line-through">{formatValue(flat[k])}</div>
            </div>
          ))}
        </div>
      );
    }
    if (diff.length === 0) {
      return <div className="text-sm text-muted-foreground">No field-level changes detected.</div>;
    }
    return (
      <div className="rounded border bg-background divide-y" data-testid="activity-diff">
        {diff.map((d) => (
          <div key={d.key} className="grid grid-cols-1 md:grid-cols-[220px_1fr_auto_1fr] gap-2 p-2 text-sm items-start">
            <div className="font-medium text-muted-foreground">{humanizeKey(d.key)}</div>
            <div className="text-red-700 dark:text-red-300 break-all">
              {d.kind === "added" ? <span className="text-muted-foreground">—</span> : formatValue(d.before)}
            </div>
            <div className="text-muted-foreground hidden md:block">→</div>
            <div className="text-green-700 dark:text-green-300 break-all">
              {d.kind === "removed" ? <span className="text-muted-foreground">—</span> : formatValue(d.after)}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {isCreate ? "Created with these values" : isDelete ? "Deleted record" : `${diff.length} field${diff.length === 1 ? "" : "s"} changed`}
        </div>
        <Button variant="ghost" size="sm" onClick={onToggleRaw} data-testid="activity-toggle-raw">
          {showRaw ? "Hide full JSON" : "Show full JSON"}
        </Button>
      </div>
      {renderRows()}
      {showRaw && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono pt-2">
          <div>
            <div className="font-semibold mb-1">Before</div>
            <pre className="overflow-auto max-h-72 bg-background p-2 rounded border">{JSON.stringify(before, null, 2)}</pre>
          </div>
          <div>
            <div className="font-semibold mb-1">After</div>
            <pre className="overflow-auto max-h-72 bg-background p-2 rounded border">{JSON.stringify(after, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ActivityReport() {
  const [entityType, setEntityType] = useState<string>("all");
  const [action, setAction] = useState<string>("all");
  const [actorUserId, setActorUserId] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ data: AuditRow[]; meta: { total: number; pages: number } } | null>(null);
  const [types, setTypes] = useState<string[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState<Record<string, boolean>>({});

  const reload = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (entityType !== "all") params.set("entityType", entityType);
      if (action !== "all") params.set("action", action);
      if (actorUserId !== "all") params.set("actorUserId", actorUserId);
      if (from) params.set("from", new Date(from).toISOString());
      if (to) params.set("to", new Date(to).toISOString());
      params.set("page", String(page));
      params.set("limit", "25");
      const json = await api<{ success: boolean; data: AuditRow[]; meta: { total: number; pages: number } }>(
        `/audit-log?${params.toString()}`,
      );
      setData({ data: json.data, meta: json.meta });
    } catch {
      setData({ data: [], meta: { total: 0, pages: 0 } });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api<{ success: boolean; data: string[] }>("/audit-log/entity-types")
      .then((j) => setTypes(j.data ?? []))
      .catch(() => setTypes([]));
    // Populate the "Who" filter from a dedicated audit-log actors endpoint
    // (works for both SUPER_ADMIN and ADMIN — /users is SUPER_ADMIN-only).
    api<{ success: boolean; data: Array<{ id: string; name: string }> }>("/audit-log/actors")
      .then((j) => setUsers(j.data ?? []))
      .catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const fmt = useMemo(
    () =>
      new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [],
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Activity log</h1>
        <p className="text-sm text-muted-foreground">
          Every change made to settings, products, customers, coupons, brands and the website CMS — who changed
          what, and when.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
        <div>
          <Label className="text-xs">Entity</Label>
          <Select value={entityType} onValueChange={setEntityType}>
            <SelectTrigger data-testid="activity-entity"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {types.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Action</Label>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger data-testid="activity-action"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="CREATE">Create</SelectItem>
              <SelectItem value="UPDATE">Update</SelectItem>
              <SelectItem value="DELETE">Delete</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Who</Label>
          <Select value={actorUserId} onValueChange={setActorUserId}>
            <SelectTrigger data-testid="activity-actor"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Anyone</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Button
          onClick={() => {
            setPage(1);
            void reload();
          }}
          data-testid="activity-apply"
        >
          Apply
        </Button>
      </div>

      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[170px]">When</TableHead>
              <TableHead>Who</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead className="w-[80px]">Diff</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>
            )}
            {!loading && (data?.data?.length ?? 0) === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No activity recorded for this filter.</TableCell></TableRow>
            )}
            {!loading && data?.data?.map((row) => (
              <>
                <TableRow key={row.id} data-testid="activity-row">
                  <TableCell className="text-xs text-muted-foreground">{fmt.format(new Date(row.createdAt))}</TableCell>
                  <TableCell>
                    <div className="text-sm">{row.actorName ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{row.actorRole ?? ""}</div>
                  </TableCell>
                  <TableCell>
                    <Badge className={actionColor[row.action] ?? ""} variant="secondary">{row.action}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{row.entityType}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-[260px]">{row.entityId ?? ""}</div>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => setExpanded(expanded === row.id ? null : row.id)}>
                      {expanded === row.id ? "Hide" : "View"}
                    </Button>
                  </TableCell>
                </TableRow>
                {expanded === row.id && (
                  <TableRow key={row.id + "-diff"}>
                    <TableCell colSpan={5} className="bg-muted/40">
                      <FriendlyDiff
                        action={row.action}
                        before={row.before}
                        after={row.after}
                        showRaw={!!showRaw[row.id]}
                        onToggleRaw={() =>
                          setShowRaw((prev) => ({ ...prev, [row.id]: !prev[row.id] }))
                        }
                      />
                    </TableCell>
                  </TableRow>
                )}
              </>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-between items-center">
        <div className="text-xs text-muted-foreground">
          {data?.meta?.total ?? 0} entries · page {page} of {data?.meta?.pages ?? 1}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
          <Button variant="outline" size="sm" disabled={!data || page >= (data.meta.pages || 1)} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}
