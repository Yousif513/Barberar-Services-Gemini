import type { Metadata } from "next";
import { cache } from "react";
import { supabase } from "@/lib/supabase";
import { buildProviderJsonLd, serializeJsonLd } from "@/lib/distribution.mjs";
import { AttributionCapture } from "./attribution-capture";

type Props = {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// A suspended or rejected shop stays out of search results.
const NOT_LISTED = new Set(["suspended", "rejected"]);

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || "https://primora.sa";

// One round of public reads, shared by generateMetadata and the layout for the same request. Only the shop itself is required: a failed secondary read
// leaves that fact out of the structured data (nothing is invented), and it is logged.
const loadShopSeo = cache(async (id: string) => {
  if (!UUID_RE.test(id)) return null;
  const { data: provider } = await supabase
    .from("providers")
    .select("business_name_en, business_name_ar, description_en, description_ar, logo_url, cover_image_url, is_verified, status")
    .eq("id", id)
    .maybeSingle();
  if (!provider || !provider.is_verified || NOT_LISTED.has(String(provider.status))) return null;

  const [branchRes, serviceRes, ratingRes] = await Promise.all([
    supabase.from("branches").select("id, address_text_en, address_text_ar, city, latitude, longitude, is_active")
      .eq("provider_id", id).order("created_at", { ascending: true }),
    supabase.from("services").select("base_price").eq("provider_id", id).eq("is_active", true).limit(1000),
    supabase.rpc("provider_rating_summaries", { p_provider_ids: [id] }),
  ]);
  for (const [label, res] of [["branches", branchRes], ["services", serviceRes], ["ratings", ratingRes]] as const) {
    if (res.error) console.error(`[shop seo] could not read ${label}:`, res.error.message);
  }
  const branch = (branchRes.data ?? []).find((b: { is_active: boolean | null }) => b.is_active !== false) ?? null;

  let shifts: Array<{ day_of_week: number; start_time: string; end_time: string; is_working_day: boolean | null; has_second_shift: boolean | null; second_start_time: string | null; second_end_time: string | null }> = [];
  if (branch) {
    const staff = await supabase.from("employees").select("id").eq("branch_id", branch.id).eq("is_active", true).limit(200);
    const ids = (staff.data ?? []).map((e: { id: string }) => e.id);
    if (staff.error) console.error("[shop seo] could not read staff:", staff.error.message);
    if (ids.length > 0) {
      const availability = await supabase.from("employee_availability")
        .select("day_of_week, start_time, end_time, is_working_day, has_second_shift, second_start_time, second_end_time")
        .in("employee_id", ids).limit(2000);
      if (availability.error) console.error("[shop seo] could not read hours:", availability.error.message);
      else shifts = availability.data ?? [];
    }
  }
  return {
    provider,
    branch,
    rating: ratingRes.data?.[0] ?? null,
    prices: (serviceRes.data ?? []).map((s: { base_price: number | string | null }) => s.base_price),
    shifts,
  };
});

// Server-rendered metadata for each verified shop (the page itself is a client component). The language is chosen on the page, so every language
// alternate points to the same address; x-default tells crawlers which one to prefer.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const baseUrl = siteUrl();
  const seo = await loadShopSeo(id);
  if (!seo) return { title: "PRIMORA", robots: { index: false } };
  const { provider } = seo;

  const nameAr = provider.business_name_ar || provider.business_name_en || "";
  const nameEn = provider.business_name_en || provider.business_name_ar || "";
  const description = provider.description_ar || provider.description_en || `احجز موعدك في ${nameAr} عبر بريمورا.`;
  const url = `${baseUrl}/shop/${id}`;
  const image = [provider.cover_image_url, provider.logo_url].find((u: unknown) => typeof u === "string" && /^https?:\/\//i.test(u));
  const title = `${nameAr}${nameEn && nameEn !== nameAr ? ` | ${nameEn}` : ""} | PRIMORA`;

  return {
    title,
    description: description.slice(0, 160),
    robots: { index: true, follow: true },
    alternates: { canonical: url, languages: { "ar-SA": url, "en-US": url, "x-default": url } },
    openGraph: {
      title: nameAr || nameEn,
      description: description.slice(0, 200),
      url,
      siteName: "PRIMORA",
      locale: "ar_SA",
      alternateLocale: ["en_US"],
      type: "website",
      ...(image ? { images: [{ url: image, alt: nameAr || nameEn }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: nameAr || nameEn,
      description: description.slice(0, 200),
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function ShopLayout({ params, children }: Props) {
  const { id } = await params;
  const seo = await loadShopSeo(id);
  let structuredData: string | null = null;
  if (seo) {
    try {
      structuredData = serializeJsonLd(buildProviderJsonLd({
        origin: siteUrl(), providerId: id, provider: seo.provider, branch: seo.branch, rating: seo.rating, prices: seo.prices, shifts: seo.shifts,
      }));
    } catch (error) {
      console.error("[shop seo] structured data skipped:", error instanceof Error ? error.message : error);
    }
  }
  return (
    <>
      {structuredData && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData }} />}
      <AttributionCapture />
      {children}
    </>
  );
}
