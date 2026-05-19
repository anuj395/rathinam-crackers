import { DEFAULT_COMPANY, type CompanyInfo } from "@workspace/pdf";

export function resolveCompanyInfo(raw: unknown): CompanyInfo {
  if (!raw || typeof raw !== "object") return DEFAULT_COMPANY;
  const r = raw as Record<string, unknown>;
  const src = (r.data && typeof r.data === "object") ? (r.data as Record<string, unknown>) : r;
  const name = (src.companyName as string) || (src.name as string) || DEFAULT_COMPANY.name;
  return {
    name,
    address: (src.address as string) || DEFAULT_COMPANY.address,
    gstin: (src.gstin as string) || DEFAULT_COMPANY.gstin,
    phone: (src.phone as string) || DEFAULT_COMPANY.phone,
    email: (src.email as string) || DEFAULT_COMPANY.email,
  };
}
