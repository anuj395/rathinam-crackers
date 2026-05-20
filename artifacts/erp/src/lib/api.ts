// Centralised API base URL for every network call this app makes.
//
// In production each frontend lives on its own subdomain
// (erp.rathinamcracker.com, pos…, wh…, rathinamcracker.com) but they all
// talk to ONE backend at https://api.rathinamcracker.com — we therefore
// MUST NOT use window.location.origin or relative `/api/v1` paths.
//
// Resolution order:
//   1. `VITE_API_URL` from .env / build-time env (the canonical source).
//   2. Empty string → relative URL → same-origin. This is what we want
//      in Replit dev (the workspace proxy maps /api → API server) and
//      in any single-host deployment.
//
// Production .env.production hard-codes VITE_API_URL=https://api.rathinamcracker.com.
// Local dev with a separate API server can set
//   VITE_API_URL=http://localhost:3000   (or whatever port).

import { setBaseUrl, setUnauthorizedHandler } from "@workspace/api-client-react";

export const API_BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "") ?? "";

/** Build a full URL for an API path (always starts with `/`, e.g. "/api/v1/foo"). */
export const API_URL = (path: string): string => {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${p}`;
};

/** Drop-in replacement for fetch() that prefixes the API base URL. */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(API_URL(path), init);
}

// Wire the same base into the Orval-generated React Query client so the
// generated hooks call the right host as well. Orval's customFetch will
// only prepend when the path is relative (starts with "/").
if (API_BASE) {
  setBaseUrl(API_BASE);
}

export { setUnauthorizedHandler };

/**
 * Resolve an image/media URL returned by the API into something a browser
 * can fetch. The API returns "/uploads/foo.jpg" — in production with split
 * subdomains the file lives on api.rathinamcracker.com, NOT on the frontend
 * subdomain that's rendering the page, so we must prepend API_BASE.
 * External https URLs and data: URIs are returned unchanged.
 */
export function mediaUrl(u: string | null | undefined): string {
  if (!u) return "";
  if (/^https?:\/\//i.test(u) || u.startsWith("data:")) return u;
  if (!u.startsWith("/")) return u;
  // Vite dev resolves local imports to paths like `/@fs/...` or `/@id/...`.
  // Static frontend assets live under `/assets/...` and should be served
  // by the frontend origin. API-hosted uploads (e.g. `/uploads/...`) must
  // be prefixed with `API_BASE` in production.
  if (u.startsWith("/@") || u.startsWith("/assets/") || !API_BASE) return u;
  return `${API_BASE}${u}`;
}
