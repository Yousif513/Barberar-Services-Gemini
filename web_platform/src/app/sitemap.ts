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

  // Every verified provider has a public shop page.
  const { data, error } = await supabase
    .from("providers")
    .select("id, created_at")
    .eq("is_verified", true)
    .limit(5000);
  if (error) {
    // The static routes are still valid; the shop list is retried on the next revalidation.
    console.error("[sitemap] could not list providers:", error.message);
    return staticRoutes;
  }

  const shopRoutes: MetadataRoute.Sitemap = (data || []).map((provider) => ({
    url: `${baseUrl}/shop/${provider.id}`,
    lastModified: provider.created_at ? new Date(provider.created_at) : now,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticRoutes, ...shopRoutes];
}
