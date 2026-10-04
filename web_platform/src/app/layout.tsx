import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { GlobalDevTools } from "@/components/global-dev-tools";

const arabicFont = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arabic",
  display: "swap",
});

// Applies the visitor's saved language before first paint so Arabic pages never flash LTR.
// Pages keep reading document.documentElement.lang / dir, and their toggles keep writing primora_lang.
const languageBootstrap = `try{var l=localStorage.getItem("primora_lang");if(l==="ar"||l==="en"){var d=document.documentElement;d.lang=l;d.dir=l==="ar"?"rtl":"ltr";}}catch(e){}`;

export const metadata: Metadata = {
  title: "PRIMORA - Luxury Beauty & Grooming Marketplace",
  description: "Book verified beauty salons, barber shops, spas and wellness professionals across Saudi Arabia.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr" className={`h-full antialiased ${arabicFont.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: languageBootstrap }} />
      </head>
      <body className="min-h-full flex flex-col font-sans bg-stone-50 text-stone-900">
        {children}
        <GlobalDevTools />
      </body>
    </html>
  );
}
