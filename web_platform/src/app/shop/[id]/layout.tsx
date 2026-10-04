import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";

type Props = {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Server-rendered title and description for each verified shop (the page itself is a client component).
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://primora.sa";
  if (!UUID_RE.test(id)) return { title: "PRIMORA", robots: { index: false } };

  const { data: provider } = await supabase
    .from("providers")
    .select("business_name_en, business_name_ar, description_en, description_ar, is_verified")
    .eq("id", id)
    .maybeSingle();
  if (!provider || !provider.is_verified) return { title: "PRIMORA", robots: { index: false } };

  const nameAr = provider.business_name_ar || provider.business_name_en || "";
  const nameEn = provider.business_name_en || provider.business_name_ar || "";
  const description = provider.description_ar || provider.description_en || `احجز موعدك في ${nameAr} عبر بريمورا.`;

  return {
    title: `${nameAr}${nameEn && nameEn !== nameAr ? ` | ${nameEn}` : ""} | PRIMORA`,
    description: description.slice(0, 160),
    alternates: { canonical: `${baseUrl}/shop/${id}` },
    openGraph: {
      title: nameAr || nameEn,
      description: description.slice(0, 200),
      url: `${baseUrl}/shop/${id}`,
      siteName: "PRIMORA",
      locale: "ar_SA",
      type: "website",
    },
  };
}

export default function ShopLayout({ children }: Props) {
  return children;
}
