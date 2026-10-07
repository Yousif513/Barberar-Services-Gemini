"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";
import { useOperationsLocale } from "@/components/operations-ui";
import { useProviderContext } from "../_components/provider-context";
import { providerGhostButton } from "../_components/dialog";
import { ClosuresSection, LeaveSection, SeasonsSection, type BranchOption } from "../_components/time-off-sections";

const copy = {
  en: {
    title: "Closures, seasons and leave",
    subtitle: "Tell customers when you are closed, when your hours change for a season, and who is on leave.",
    back: "Back to settings",
    ownerOnly: "Only the business owner manages closures, seasons and leave.",
    noBusiness: "No business is linked to your account.",
    loadFailed: "Your branches could not be loaded: ",
    noBranches: "Add a branch first; closures and seasons belong to a business with at least one branch.",
  },
  ar: {
    title: "الإغلاقات والمواسم والإجازات",
    subtitle: "أخبر العملاء متى تكون مغلقاً، ومتى تتغير ساعاتك في موسم، ومن هو في إجازة.",
    back: "العودة إلى الإعدادات",
    ownerOnly: "صاحب النشاط وحده يدير الإغلاقات والمواسم والإجازات.",
    noBusiness: "لا يوجد نشاط تجاري مرتبط بحسابك.",
    loadFailed: "تعذر تحميل فروعك: ",
    noBranches: "أضف فرعاً أولاً؛ الإغلاقات والمواسم تخص نشاطاً له فرع واحد على الأقل.",
  },
};

export default function TimeOffPage() {
  const locale = useOperationsLocale();
  const t = copy[locale];
  const state = useProviderContext();
  const providerId = state.status === "ready" && state.context.role === "owner" ? state.context.providerId : null;
  const [branches, setBranches] = useState<BranchOption[] | null>(null);
  const [failure, setFailure] = useState("");

  useEffect(() => {
    if (!providerId) return;
    let live = true;
    void (async () => {
      const { data, error } = await supabase.from("branches").select("id, name_en, name_ar").eq("provider_id", providerId).order("created_at", { ascending: true });
      if (!live) return;
      if (error) { setFailure(t.loadFailed + errorMessage(error)); setBranches([]); return; }
      setBranches((data ?? []).map((row) => ({ id: row.id as string, name: ((locale === "ar" ? row.name_ar || row.name_en : row.name_en || row.name_ar) as string) || "" })));
    })();
    return () => { live = false; };
  }, [providerId, locale, t.loadFailed]);

  if (state.status !== "ready") return null;
  if (state.context.role === "none") return <p className="p-6 text-sm font-semibold text-[#667085]">{t.noBusiness}</p>;
  if (!providerId) return <p className="p-6 text-sm font-semibold text-[#667085]">{t.ownerOnly}</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-6 text-start">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-black text-[#101828]">{t.title}</h1>
          <p className="mt-1 text-sm text-[#667085]">{t.subtitle}</p>
        </div>
        <Link href="/provider/settings" className={providerGhostButton}>{t.back}</Link>
      </header>
      {failure && <div role="alert" className="rounded-2xl border border-[#FECDCA] bg-[#FEF3F2] p-4 text-sm font-semibold text-[#B42318]">{failure}</div>}
      {branches && branches.length === 0 && !failure && <p className="rounded-2xl border border-[#ECECEC] bg-white p-5 text-sm text-[#475467]">{t.noBranches}</p>}
      {branches && branches.length > 0 && (
        <>
          <ClosuresSection lang={locale} providerId={providerId} branches={branches} />
          <SeasonsSection lang={locale} providerId={providerId} branches={branches} />
          <LeaveSection lang={locale} branches={branches} />
        </>
      )}
    </div>
  );
}
