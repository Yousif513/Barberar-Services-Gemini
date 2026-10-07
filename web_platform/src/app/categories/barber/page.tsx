"use client";

import CategoryProviders from "@/components/category-providers";

const copy = {
  en: { category: "Grooming & Barbering", title: "Barbershops & Haircuts", subtitle: "Book unisex grooming lounges, beard specialists and stylists near you." },
  ar: { category: "العناية والحلاقة", title: "محلات الحلاقة وقص الشعر", subtitle: "احجز في صالونات الحلاقة والعناية بالبشرة واللحية الرجالية والنسائية القريبة منك." },
};

export default function BarberCategoryPage() {
  return <CategoryProviders categorySlug="barber-hair" copy={copy} />;
}
