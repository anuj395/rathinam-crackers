import { Link } from "wouter";
import { mediaUrl } from "../../lib/api";
import { Phone, Mail, MapPin, ShieldCheck, Award, Truck, FileCheck, MessageCircle, Instagram, Facebook, Youtube, Twitter } from "lucide-react";
import logoUrl from "@assets/rathinam_logo.png";
import { useSiteContent, telHref, whatsAppHref, safeHref } from "@/hooks/useSiteContent";

export function Footer() {
  const c = useSiteContent();
  const since = c.brand?.establishedYear ?? 1985;
  const yearsBadge = `${Math.max(1, new Date().getFullYear() - since)}+ Years`;
  const trust = [
    { Icon: ShieldCheck, t: "PESO Licensed",      s: "Govt. of India approved" },
    { Icon: Award,       t: yearsBadge,           s: `Trusted since ${since}` },
    { Icon: Truck,       t: "Pan-India Delivery", s: "Licensed logistics only" },
    { Icon: FileCheck,   t: "GST Invoice",        s: "B2B & B2C compliant" },
  ];

  const socials = c.socials ?? {};
  const socialLinks = [
    { href: whatsAppHref(c),            label: "WhatsApp",  Icon: MessageCircle, cls: "bg-green-600/20 hover:bg-green-600/40 text-green-400", visible: !!c.contact?.whatsapp || !!socials.whatsapp },
    { href: safeHref(socials.instagram), label: "Instagram", Icon: Instagram, cls: "bg-pink-600/20 hover:bg-pink-600/40 text-pink-400", visible: !!socials.instagram },
    { href: safeHref(socials.facebook),  label: "Facebook",  Icon: Facebook,  cls: "bg-blue-600/20 hover:bg-blue-600/40 text-blue-400", visible: !!socials.facebook },
    { href: safeHref(socials.youtube),   label: "YouTube",   Icon: Youtube,   cls: "bg-red-600/20 hover:bg-red-600/40 text-red-400",   visible: !!socials.youtube },
    { href: safeHref(socials.twitter),   label: "Twitter",   Icon: Twitter,   cls: "bg-sky-600/20 hover:bg-sky-600/40 text-sky-400",   visible: !!socials.twitter },
  ].filter((s) => s.visible && s.href !== "#");

  const addrLine1 = c.contact?.addressLine1 ?? c.contact?.address ?? "";
  const addrLine2 = c.contact?.addressLine2 ?? "";
  const phone = c.contact?.phone ?? "";
  const email = c.contact?.email ?? "";
  const gstin = c.contact?.gstin ?? "";

  return (
    <footer className="bg-gradient-to-b from-[hsl(197,65%,12%)] via-[hsl(200,35%,7%)] to-[hsl(200,35%,4%)] text-gray-300 pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Trust strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pb-10 mb-10 border-b border-gray-800">
          {trust.map(({ Icon, t, s }) => (
            <div key={t} className="flex items-start gap-3">
              <Icon className="h-6 w-6 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-white font-semibold text-sm">{t}</p>
                <p className="text-xs text-gray-500">{s}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
          {/* Brand column */}
          <div className="md:col-span-5">
            <div className="bg-white/95 inline-block rounded-lg p-2 mb-4">
              <img src={mediaUrl(logoUrl)} alt={c.brand?.name ?? "Logo"} className="h-14 w-auto" />
            </div>
            <p className="text-sm leading-relaxed text-gray-400 mb-5 max-w-md">
              {c.brand?.tagline ?? "Premium Sivakasi fireworks since 1985."} Three generations of cracker craftsmanship, delivering safe and brilliant celebrations to every Indian home.
            </p>
            {socialLinks.length > 0 && (
              <div className="flex items-center gap-3">
                {socialLinks.map(({ href, label, Icon, cls }) => (
                  <a key={label} href={href} target="_blank" rel="noreferrer" className={`h-9 w-9 rounded-full flex items-center justify-center transition-colors ${cls}`} aria-label={label}>
                    <Icon className="h-4 w-4" />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Shop links */}
          <div className="md:col-span-2">
            <h3 className="text-white font-semibold mb-4 text-sm tracking-wider uppercase">Shop</h3>
            <ul className="space-y-2 text-sm">
              <li><Link href="/catalogue" className="hover:text-amber-400 transition-colors">All Crackers</Link></li>
              <li><Link href="/catalogue?category=Aerial" className="hover:text-amber-400 transition-colors">Aerial</Link></li>
              <li><Link href="/catalogue?category=Ground" className="hover:text-amber-400 transition-colors">Ground</Link></li>
              <li><Link href="/catalogue?category=Sparkler" className="hover:text-amber-400 transition-colors">Sparklers</Link></li>
              <li><Link href="/catalogue?category=Gift Box" className="hover:text-amber-400 transition-colors">Gift Boxes</Link></li>
              <li><Link href="/catalogue?category=Bundle" className="hover:text-amber-400 transition-colors">Family Bundles</Link></li>
            </ul>
          </div>

          {/* Company */}
          <div className="md:col-span-2">
            <h3 className="text-white font-semibold mb-4 text-sm tracking-wider uppercase">Company</h3>
            <ul className="space-y-2 text-sm">
              <li><Link href="/help" className="hover:text-amber-400 transition-colors">Help &amp; FAQ</Link></li>
              <li><Link href="/help" className="hover:text-amber-400 transition-colors">Safety Guide</Link></li>
              <li><Link href="/help" className="hover:text-amber-400 transition-colors">Bulk Orders</Link></li>
              <li><Link href="/help" className="hover:text-amber-400 transition-colors">Wedding &amp; Events</Link></li>
              <li><Link href="/help" className="hover:text-amber-400 transition-colors">Returns &amp; Refunds</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div className="md:col-span-3">
            <h3 className="text-white font-semibold mb-4 text-sm tracking-wider uppercase">Contact</h3>
            <ul className="space-y-3 text-sm text-gray-400">
              {(addrLine1 || addrLine2) && (
                <li className="flex gap-2">
                  <MapPin className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    {addrLine1}
                    {addrLine2 && <><br />{addrLine2}</>}
                  </span>
                </li>
              )}
              {phone && (
                <li className="flex gap-2">
                  <Phone className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <a href={telHref(c)} className="hover:text-amber-400 transition-colors">{phone}</a>
                </li>
              )}
              {email && (
                <li className="flex gap-2">
                  <Mail className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <a href={`mailto:${email}`} className="hover:text-amber-400 transition-colors break-all">{email}</a>
                </li>
              )}
              {gstin && <li className="text-xs text-gray-500 pt-1">GSTIN: {gstin}</li>}
            </ul>
          </div>
        </div>

        {/* Payment & legal strip */}
        <div className="mt-12 pt-6 border-t border-gray-800 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-gray-500">
          <p>&copy; {new Date().getFullYear()} {c.brand?.name ?? "Rathinam Crackers"}. All rights reserved.</p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-gray-400 font-medium">We accept:</span>
            <span className="px-2 py-1 bg-white/5 border border-white/10 rounded">UPI</span>
            <span className="px-2 py-1 bg-white/5 border border-white/10 rounded">Net Banking</span>
            <span className="px-2 py-1 bg-white/5 border border-white/10 rounded">NEFT/RTGS</span>
            <span className="px-2 py-1 bg-white/5 border border-white/10 rounded">Cash on Delivery</span>
          </div>
        </div>

        <p className="mt-6 text-[10px] text-gray-600 text-center max-w-3xl mx-auto leading-relaxed">
          Fireworks are dangerous if mishandled. Use only under adult supervision. Read safety instructions on each box. Sale and use of fireworks are subject to local laws and Supreme Court guidelines on permissible noise and emissions.
        </p>
      </div>
    </footer>
  );
}
