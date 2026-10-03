import { MetadataRoute } from "next";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://primora.sa";
  const now = new Date();

  // Core public landing routes
  const staticRoutes = [
    "",
    "/about",
    "/discover",
    "/become-provider",
    "/privacy",
    "/terms",
    "/categories/barber",
    "/categories/hair",
    "/categories/makeup",
    "/categories/spa"
  ].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: now,
    changeFrequency: "daily" as const,
    priority: route === "" ? 1.0 : route.startsWith("/categories") ? 0.9 : 0.7,
    alternates: {
      languages: {
        "ar-SA": `${baseUrl}${route}?lang=ar`,
        "en-US": `${baseUrl}${route}?lang=en`
      }
    }
  }));

  // Riyadh district landing paths (G28)
  const districts = ["al-malqa", "olaya", "al-yasmin", "al-nakheel", "al-hamra", "al-sulaimaniyah"];
  const districtRoutes = districts.map((district) => ({
    url: `${baseUrl}/discover?district=${district}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.8,
    alternates: {
      languages: {
        "ar-SA": `${baseUrl}/discover?district=${district}&lang=ar`,
        "en-US": `${baseUrl}/discover?district=${district}&lang=en`
      }
    }
  }));

  return [...staticRoutes, ...districtRoutes];
}
