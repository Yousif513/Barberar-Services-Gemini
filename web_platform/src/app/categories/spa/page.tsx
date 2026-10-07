"use client";

import CategoryProviders from "@/components/category-providers";

const copy = {
  en: { category: "Wellness & Spa", title: "Luxury Spas & Hammams in Riyadh", subtitle: "Rejuvenate your body and mind. Book verified wellness retreats, custom massage rooms, and steam baths." },
  ar: { category: "المنتجعات الصحية والعافية", title: "حمامات وسبا العافية الفاخرة بالرياض", subtitle: "استعد نشاط وحيوية جسدك وذهنك. احجز غرف المساج المتخصصة، والحمامات المغربية، والمنتجعات الصحية بالرياض." },
};

export default function SpaCategoryPage() {
  return <CategoryProviders categorySlug="spa-wellness" copy={copy} />;
}
