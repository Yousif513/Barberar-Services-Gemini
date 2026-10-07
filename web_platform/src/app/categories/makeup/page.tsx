"use client";

import CategoryProviders from "@/components/category-providers";

const copy = {
  en: { category: "Makeup & Cosmetics", title: "Professional Makeup Artists in Riyadh", subtitle: "Book Riyadh's finest freelance makeup artists, cosmetics consultants, nail artists, and bridal specialists." },
  ar: { category: "المكياج ومستحضرات التجميل", title: "أخصائيات خبيرات المكياج والتجميل بالرياض", subtitle: "احجزي خبيرات التجميل المستقلات، واستشارات المكياج، وأخصائيات الأظافر المعتمدات بالرياض." },
};

const queries = ["makeup", "مكياج"];

export default function MakeupCategoryPage() {
  return <CategoryProviders queries={queries} copy={copy} />;
}
