"use client";

import CategoryProviders from "@/components/category-providers";

const copy = {
  en: { category: "Grooming & Barbering", title: "Master Barbershops & Haircuts in Riyadh", subtitle: "Instantly book Riyadh's highest-rated unisex grooming lounges, beard specialists, and master stylists." },
  ar: { category: "العناية والحلاقة", title: "محلات الحلاقة وقص الشعر المتميزة بالرياض", subtitle: "احجز فوراً في أرقى صالونات الحلاقة والعناية بالبشرة واللحية الرجالية والنسائية بالرياض." },
};

export default function BarberCategoryPage() {
  return <CategoryProviders categorySlug="barber-hair" copy={copy} />;
}
