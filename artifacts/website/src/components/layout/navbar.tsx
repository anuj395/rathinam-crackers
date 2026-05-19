import { Link, useLocation } from "wouter";
import { mediaUrl } from "../../lib/api";
import { useCart } from "@/context/cart";
import { useShopAuth } from "@/context/auth";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Menu, X, Phone, Sparkles, User, LogOut, Package, Heart, MapPin, ChevronDown } from "lucide-react";
import { useState } from "react";
import logoUrl from "@assets/rathinam_logo.png";
import { useSiteContent, telHref, whatsAppHref } from "@/hooks/useSiteContent";

export function Navbar() {
  const { totalItems } = useCart();
  const { isLoggedIn, customer, logout } = useShopAuth();
  const [location, navigate] = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const c = useSiteContent();
  const promo = c.brand?.promoBarText ?? "Festive Offers Live · Free GST Invoice · Pan-India Delivery";
  const phone = c.contact?.phone ?? "";

  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/catalogue", label: "Catalogue" },
    { href: "/help", label: "Help" },
  ];

  return (
    <>
      {/* Top promo bar */}
      <div className="bg-gradient-to-r from-[hsl(197,65%,18%)] via-[hsl(197,71%,28%)] to-[hsl(41,89%,45%)] text-white text-xs sm:text-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-amber-200 animate-pulse" />
            <span className="font-medium tracking-wide">{promo}</span>
          </div>
          {phone && (
            <a href={telHref(c)} className="hidden sm:flex items-center gap-1.5 hover:text-amber-200 transition-colors">
              <Phone className="h-3.5 w-3.5" />
              <span className="font-semibold">{phone}</span>
            </a>
          )}
        </div>
      </div>

      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center">
              <Link href="/" className="flex items-center gap-2.5">
                <img src={mediaUrl(logoUrl)} alt="Rathinam Crackers" className="h-10 w-auto" />
                <span className="hidden sm:inline text-[10px] font-bold tracking-[0.2em] text-gray-400 uppercase pt-0.5">Est. 1985</span>
              </Link>
            </div>

            {/* Desktop Links */}
            <div className="hidden md:flex items-center space-x-8">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-sm font-medium transition-colors hover:text-primary ${
                    location === link.href ? "text-primary" : "text-gray-600"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              <a
                href={whatsAppHref(c, "Hi Rathinam Crackers, I'd like to enquire about bulk orders")}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-green-600 hover:text-green-700 transition-colors"
              >
                Bulk Orders
              </a>
              <Link href="/cart">
                <Button variant="ghost" size="icon" className="relative">
                  <ShoppingCart className="h-5 w-5" />
                  {totalItems > 0 && (
                    <span className="absolute -top-1 -right-1 bg-amber-500 text-[hsl(197,65%,12%)] text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                      {totalItems}
                    </span>
                  )}
                </Button>
              </Link>
              {isLoggedIn ? (
                <div className="relative">
                  <button
                    onClick={() => setAccountOpen((v) => !v)}
                    className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-primary"
                    data-testid="account-menu-trigger"
                  >
                    <User className="h-4 w-4" />
                    <span className="max-w-[100px] truncate">{customer?.name?.split(" ")[0] ?? "Account"}</span>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  {accountOpen && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setAccountOpen(false)} />
                      <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-100 rounded-2xl shadow-lg p-2 z-40">
                        <Link href="/account" onClick={() => setAccountOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50"><User className="h-4 w-4" /> My account</Link>
                        <Link href="/account/orders" onClick={() => setAccountOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50"><Package className="h-4 w-4" /> Orders</Link>
                        <Link href="/account/wishlist" onClick={() => setAccountOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50"><Heart className="h-4 w-4" /> Wishlist</Link>
                        <Link href="/account/addresses" onClick={() => setAccountOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50"><MapPin className="h-4 w-4" /> Addresses</Link>
                        <button
                          onClick={() => { logout(); setAccountOpen(false); navigate("/"); }}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-destructive hover:bg-destructive/10"
                          data-testid="navbar-logout"
                        >
                          <LogOut className="h-4 w-4" /> Logout
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <Link href="/login">
                  <Button variant="outline" size="sm" data-testid="navbar-login">
                    <User className="h-4 w-4 mr-1" /> Login
                  </Button>
                </Link>
              )}
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden flex items-center space-x-4">
              <Link href="/cart">
                <Button variant="ghost" size="icon" className="relative">
                  <ShoppingCart className="h-5 w-5" />
                  {totalItems > 0 && (
                    <span className="absolute -top-1 -right-1 bg-amber-500 text-[hsl(197,65%,12%)] text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                      {totalItems}
                    </span>
                  )}
                </Button>
              </Link>
              <Button variant="ghost" size="icon" onClick={() => setIsMenuOpen(!isMenuOpen)}>
                {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden bg-white border-b border-gray-100 py-4 px-4 space-y-2">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsMenuOpen(false)}
                className={`block px-3 py-2 rounded-md text-base font-medium ${
                  location === link.href ? "bg-primary/10 text-primary" : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <a
              href={whatsAppHref(c)}
              target="_blank"
              rel="noreferrer"
              className="block px-3 py-2 rounded-md text-base font-medium text-green-700 hover:bg-green-50"
            >
              Bulk Orders (WhatsApp)
            </a>
            {isLoggedIn ? (
              <>
                <Link href="/account" onClick={() => setIsMenuOpen(false)} className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:bg-gray-50">My account</Link>
                <Link href="/account/orders" onClick={() => setIsMenuOpen(false)} className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:bg-gray-50">My orders</Link>
                <button onClick={() => { logout(); setIsMenuOpen(false); }} className="block w-full text-left px-3 py-2 rounded-md text-base font-medium text-destructive hover:bg-destructive/10">Logout</button>
              </>
            ) : (
              <>
                <Link href="/login" onClick={() => setIsMenuOpen(false)} className="block px-3 py-2 rounded-md text-base font-medium text-primary hover:bg-primary/10">Login</Link>
                <Link href="/signup" onClick={() => setIsMenuOpen(false)} className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:bg-gray-50">Create account</Link>
              </>
            )}
          </div>
        )}
      </nav>
    </>
  );
}
