"use client";

import CategoryProviders from "@/components/category-providers";

const copy = {
  en: { category: "Wellness & Spa", title: "Spas & Wellness", subtitle: "Book wellness retreats, massage rooms and steam baths." },
  ar: { category: "المنتجعات الصحية والعافية", title: "السبا والعافية", subtitle: "احجز المنتجعات الصحية وغرف المساج والحمامات المغربية." },
};

const categorySlugs = ["spa-wellness"];

export default function SpaCategoryPage() {
  return <CategoryProviders categorySlugs={categorySlugs} copy={copy} />;
}
