import type { Metadata } from "next";
import "./globals.css";
import { GlobalDevTools } from "@/components/global-dev-tools";

export const metadata: Metadata = {
  title: "PRIMORA - Luxury Beauty & Grooming Marketplace",
  description: "Book premier beauty salons, barber shops, spas, and wellness professionals in Riyadh.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans bg-stone-50 text-stone-900">
        {children}
        <GlobalDevTools />
      </body>
    </html>
  );
}
