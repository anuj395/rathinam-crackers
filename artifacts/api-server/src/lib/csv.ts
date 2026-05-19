export function serializeCsv(rows: Array<Record<string, unknown>>, headers: string[]): string {
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    let s: string;
    if (typeof v === "object") {
      try {
        s = JSON.stringify(v);
      } catch {
        s = String(v);
      }
    } else {
      s = String(v);
    }
    // CSV formula-injection guard: prefix dangerous leading chars so spreadsheets
    // (Excel/Sheets) treat the cell as text instead of executing a formula.
    if (s.length > 0 && /^[=+\-@\t\r]/.test(s)) {
      s = `'${s}`;
    }
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const head = headers.map(escape).join(",");
  const body = rows.map((r) => headers.map((h) => escape(r[h])).join(",")).join("\n");
  return body ? `${head}\n${body}\n` : `${head}\n`;
}

export function parseCsv(text: string): Array<Record<string, string>> {
  const src = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const records: string[][] = [];
  let field = "";
  let row: string[] = [];
  let i = 0;
  let inQuotes = false;
  while (i < src.length) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      records.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    records.push(row);
  }
  if (records.length === 0) return [];
  const header = records[0].map((h) => h.trim());
  const out: Array<Record<string, string>> = [];
  for (let r = 1; r < records.length; r++) {
    const cells = records[r];
    if (cells.length === 1 && cells[0] === "") continue;
    const obj: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) {
      obj[header[c]] = (cells[c] ?? "").trim();
    }
    out.push(obj);
  }
  return out;
}

export function parseBool(v: string | undefined, fallback = false): boolean {
  if (v === undefined || v === null || v === "") return fallback;
  return /^(1|true|yes|y|on)$/i.test(v.trim());
}

export function parseNumber(v: string | undefined): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function parseJsonOr<T>(v: string | undefined, fallback: T): T {
  if (!v) return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}

export function parseStringArray(v: string | undefined): string[] {
  if (!v) return [];
  const s = v.trim();
  if (!s) return [];
  if (s.startsWith("[")) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      /* fall through */
    }
  }
  return s.split("|").map((p) => p.trim()).filter(Boolean);
}
