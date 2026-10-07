"use client";

import CategoryProviders from "@/components/category-providers";

const copy = {
  en: { category: "Hair Styling & Color", title: "Luxury Hair Salons & Colorists in Riyadh", subtitle: "Book verified hair salons, master colorists, blow-dry bars, and certified stylists near you." },
  ar: { category: "تصفيف وتلوين الشعر", title: "صالونات وأخصائيي الشعر الفاخرة بالرياض", subtitle: "احجز جلسات تلوين الشعر وتصفيفه وعلاجاته الفاخرة لدى أفضل الصالونات المعتمدة بالرياض." },
};

export default function HairCategoryPage() {
  return <CategoryProviders categorySlug="barber-hair" copy={copy} />;
}
