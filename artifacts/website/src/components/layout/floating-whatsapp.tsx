import { MessageCircle } from "lucide-react";
import { useSiteContent, whatsAppHref } from "@/hooks/useSiteContent";

export function FloatingWhatsApp() {
  const c = useSiteContent();
  if (c.cta?.floatingWhatsApp?.enabled === false) return null;
  const href = whatsAppHref(c, "Hi, I have a question about your crackers");
  if (!href || href === "#") return null;
  const label = c.cta?.floatingWhatsApp?.label ?? "Chat on WhatsApp";
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      className="fixed bottom-5 right-5 z-50 flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white pl-3 pr-4 py-3 rounded-full shadow-2xl shadow-green-900/30 transition-all hover:scale-105"
      data-testid="floating-whatsapp"
    >
      <span className="relative flex h-9 w-9 items-center justify-center">
        <span className="absolute inline-flex h-full w-full rounded-full bg-green-300 opacity-75 animate-ping" />
        <MessageCircle className="relative h-5 w-5" />
      </span>
      <span className="hidden sm:inline text-sm font-semibold">{label}</span>
    </a>
  );
}
