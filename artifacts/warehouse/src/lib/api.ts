// Centralised API base URL for every network call this app makes.
// See artifacts/erp/src/lib/api.ts for the full rationale.

import { setBaseUrl, setUnauthorizedHandler } from "@workspace/api-client-react";

export const API_BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "") ?? "";

export const API_URL = (path: string): string => {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${p}`;
};

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(API_URL(path), init);
}

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
  const baseUrl = (import.meta.env.BASE_URL as string | undefined) ?? "/";
  const basePrefix = baseUrl.replace(/\/$/, "");

  if (u.startsWith("/@")) return u;
  const assetsIdx = u.lastIndexOf("/assets/");
  if (assetsIdx !== -1) {
    const basename = u.slice(assetsIdx + "/assets/".length);
    if (import.meta.env.DEV) {
      return `${basePrefix}/${basename}`.replace(/\/+/g, "/");
    }
    return `${basePrefix}${u.slice(assetsIdx)}`;
  }
  if (u.startsWith("/@fs/") || u.startsWith("/fs/") || u.startsWith("/@id/")) return u;
  if (u.startsWith("/assets/")) return `${basePrefix}${u}`;
  if (!API_BASE) return u;
  return `${API_BASE}${u}`;
}
