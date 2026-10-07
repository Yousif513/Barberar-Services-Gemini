import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";

type Props = {
  params: Promise<{ handle: string }>;
  children: React.ReactNode;
};

// Server-rendered title and description for a published professional page (the page itself is a client component).
// An unpublished, hidden or unknown handle gets the generic title and is kept out of search indexes.
export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const generic: Metadata = { title: "PRIMORA", robots: { index: false } };
  try {
    const { data, error } = await supabase.rpc("public_professional_profile", { p_handle: handle });
    if (error || !data || typeof data !== "object" || "redirect_to" in data) return generic;
    const profile = data as { display_name_en: string; display_name_ar: string; headline_en: string | null; headline_ar: string | null; handle: string };
    const same = profile.display_name_en === profile.display_name_ar;
    return {
      title: `${profile.display_name_ar}${same ? "" : ` | ${profile.display_name_en}`} | PRIMORA`,
      description: (profile.headline_ar || profile.headline_en || `${profile.display_name_ar} على بريمورا`).slice(0, 160),
      alternates: { canonical: `/pro/${profile.handle}` },
    };
  } catch {
    return generic;
  }
}

export default async function ProfessionalLayout({ children }: Props) {
  return children;
}
