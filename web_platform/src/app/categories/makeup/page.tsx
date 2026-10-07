"use client";

import CategoryProviders from "@/components/category-providers";

const copy = {
  en: { category: "Makeup & Cosmetics", title: "Makeup Artists", subtitle: "Book freelance makeup artists, cosmetics consultants, nail artists and bridal specialists." },
  ar: { category: "المكياج ومستحضرات التجميل", title: "خبيرات المكياج", subtitle: "احجزي خبيرات التجميل المستقلات، واستشارات المكياج، وأخصائيات الأظافر والعرائس." },
};

const queries = ["makeup", "مكياج"];

export default function MakeupCategoryPage() {
  return <CategoryProviders queries={queries} copy={copy} />;
}
