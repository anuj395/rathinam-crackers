import { Navbar } from "./navbar";
import { Footer } from "./footer";
import { FloatingWhatsApp } from "./floating-whatsapp";
import { ReactNode } from "react";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen bg-cream-50">
      <Navbar />
      <main className="flex-grow">
        {children}
      </main>
      <Footer />
      <FloatingWhatsApp />
    </div>
  );
}
