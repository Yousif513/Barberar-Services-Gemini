import { MetadataRoute } from "next";
import { supabase } from "@/lib/supabase";

// Regenerated hourly so new verified shops are indexed without a redeploy.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://primora.sa";
  const now = new Date();

  // Public routes that exist in this app. Language is chosen on the page, so there are no
  // per-language URL variants to advertise.
  const staticRoutes: MetadataRoute.Sitemap = [
    "",
    "/discover",
    "/services",
    "/become-provider",
    "/about",
    "/security",
    "/privacy",
    "/terms",
    "/categories/barber",
    "/categories/hair",
    "/categories/makeup",
    "/categories/spa",
  ].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: now,
    changeFrequency: route === "" || route === "/discover" ? "daily" : "weekly",
    priority: route === "" ? 1.0 : route.startsWith("/categories") || route === "/discover" ? 0.9 : 0.6,
  }));

  // Every verified provider that is still listed has a public shop page. The API caps one response at max_rows (1000), so the list is read page by page;
  // a single .limit(5000) would silently stop at 1000 shops.
  const PAGE = 1000;
  const MAX_SHOPS = 50000;
  const providers: Array<{ id: string; created_at: string | null; last_activity_at: string | null }> = [];
  for (let from = 0; from < MAX_SHOPS; from += PAGE) {
    const { data, error } = await supabase
      .from("providers")
      .select("id, created_at, last_activity_at")
      .eq("is_verified", true)
      .not("status", "in", "(suspended,rejected)")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      // The static routes are still valid; the shop list is retried on the next revalidation. A partial list is not published as if it were complete.
      console.error("[sitemap] could not list providers:", error.message);
      return staticRoutes;
    }
    providers.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }

  // The language is chosen on the page, so every language alternate is the same address.
  const shopRoutes: MetadataRoute.Sitemap = providers.map((provider) => {
    const url = `${baseUrl}/shop/${provider.id}`;
    const touched = provider.last_activity_at || provider.created_at;
    return {
      url,
      lastModified: touched ? new Date(touched) : now,
      changeFrequency: "weekly",
      priority: 0.8,
      alternates: { languages: { "ar-SA": url, "en-US": url } },
    };
  });

  return [...staticRoutes, ...shopRoutes];
}
