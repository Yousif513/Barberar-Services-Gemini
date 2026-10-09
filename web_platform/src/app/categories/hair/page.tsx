"use client";

import CategoryProviders from "@/components/category-providers";

const copy = {
  en: { category: "Hair Styling & Color", title: "Hair Salons & Colorists", subtitle: "Book hair salons, colorists, blow-dry bars and stylists near you." },
  ar: { category: "تصفيف وتلوين الشعر", title: "صالونات وأخصائيو الشعر", subtitle: "احجز جلسات تلوين الشعر وتصفيفه وعلاجاته لدى الصالونات والمصففين القريبين منك." },
};

const categorySlugs = ["barber-hair", "hair-styling"];

export default function HairCategoryPage() {
  return <CategoryProviders categorySlugs={categorySlugs} copy={copy} />;
}
