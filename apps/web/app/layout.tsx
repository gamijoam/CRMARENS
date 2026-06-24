import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CRM Omnicanal",
  description: "CRM SaaS omnicanal multiempresa para ventas y atencion."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
