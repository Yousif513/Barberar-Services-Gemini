"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";
import { formatBookingDateTime, policySentences } from "@/lib/booking-display.mjs";
import { providerFieldClass, providerLabelClass, providerPrimaryButton } from "./dialog";

type Lang = "en" | "ar";

const copy = {
  en: {
    title: "Booking policy",
    intro: "These are the terms customers see before they pay and the terms the system applies when a booking is cancelled or missed.",
    unconfirmed: "You have not confirmed these terms yet. They are the platform starting values until you save them here.",
    confirmedAt: "Confirmed on {date}",
    freeHours: "Free cancellation window (hours before the visit)",
    lateFee: "Late cancellation fee (% of the deposit kept)",
    noShowFee: "No-show fee (% of the deposit kept)",
    deposit: "Online deposit (% of the price)",
    hoursHelp: "0 to 720 hours. 0 means there is no free-cancellation window.",
    percentHelp: "0 to 100.",
    depositHelp: "Above 0 and at most 100. The platform may set a minimum.",
    preview: "What customers are told",
    reason: "Reason (optional)",
    save: "Save policy",
    saving: "Saving…",
    saved: "Booking policy saved.",
    loadFailed: "The policy could not be loaded: ",
    saveFailed: "The policy was not saved: ",
    invalidHours: "Enter a whole number of hours from 0 to 720.",
    invalidPercent: "Enter a percentage from 0 to 100.",
    invalidDeposit: "Enter a deposit above 0 and at most 100.",
  },
  ar: {
    title: "سياسة الحجز",
    intro: "هذه الشروط يراها العميل قبل الدفع، وهي ما يطبقه النظام عند إلغاء الحجز أو عدم الحضور.",
    unconfirmed: "لم تؤكد هذه الشروط بعد. هي القيم الابتدائية للمنصة إلى أن تحفظها هنا.",
    confirmedAt: "تم التأكيد في {date}",
    freeHours: "مهلة الإلغاء المجاني (ساعات قبل الموعد)",
    lateFee: "رسم الإلغاء المتأخر (% من العربون يُحتفظ به)",
    noShowFee: "رسم عدم الحضور (% من العربون يُحتفظ به)",
    deposit: "العربون الإلكتروني (% من السعر)",
    hoursHelp: "من 0 إلى 720 ساعة. الصفر يعني عدم وجود مهلة إلغاء مجاني.",
    percentHelp: "من 0 إلى 100.",
    depositHelp: "أكبر من 0 وحتى 100. قد تحدد المنصة حداً أدنى.",
    preview: "ما يُقال للعميل",
    reason: "السبب (اختياري)",
    save: "حفظ السياسة",
    saving: "جارٍ الحفظ…",
    saved: "تم حفظ سياسة الحجز.",
    loadFailed: "تعذر تحميل السياسة: ",
    saveFailed: "لم تُحفظ السياسة: ",
    invalidHours: "أدخل عدداً صحيحاً من الساعات بين 0 و720.",
    invalidPercent: "أدخل نسبة بين 0 و100.",
    invalidDeposit: "أدخل عربوناً أكبر من 0 وحتى 100.",
  },
};

type Loaded = { free: string; late: string; noShow: string; deposit: string; confirmedAt: string | null };

export function BookingPolicyCard({ lang, providerId, onSaved }: { lang: Lang; providerId: string; onSaved?: () => void }) {
  const t = copy[lang];
  const [form, setForm] = useState<Loaded>({ free: "", late: "", noShow: "", deposit: "", confirmedAt: null });
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState("");
  const [done, setDone] = useState("");
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const { data, error } = await supabase
        .from("providers")
        .select("free_cancellation_hours, late_cancellation_fee_percent, no_show_fee_percent, deposit_percentage, policy_confirmed_at")
        .eq("id", providerId)
        .maybeSingle();
      if (!live) return;
      if (error) setFailure(t.loadFailed + errorMessage(error));
      else if (data) {
        setForm({
          free: String(data.free_cancellation_hours ?? ""),
          late: String(data.late_cancellation_fee_percent ?? ""),
          noShow: String(data.no_show_fee_percent ?? ""),
          deposit: String(data.deposit_percentage ?? ""),
          confirmedAt: data.policy_confirmed_at ?? null,
        });
      }
      setLoading(false);
    })();
    return () => { live = false; };
  }, [providerId, t.loadFailed]);

  const num = (value: string) => (value.trim() === "" ? NaN : Number(value));
  const hoursBad = !(Number.isInteger(num(form.free)) && num(form.free) >= 0 && num(form.free) <= 720);
  const lateBad = !(num(form.late) >= 0 && num(form.late) <= 100);
  const noShowBad = !(num(form.noShow) >= 0 && num(form.noShow) <= 100);
  const depositBad = !(num(form.deposit) > 0 && num(form.deposit) <= 100);
  const valid = !(hoursBad || lateBad || noShowBad || depositBad);
  const sentences = valid
    ? policySentences({ freeHours: num(form.free), lateFeePercent: num(form.late), noShowFeePercent: num(form.noShow), depositPercent: num(form.deposit) }, lang)
    : [];

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    setDone("");
    if (!valid || saving) return;
    setSaving(true);
    setFailure("");
    const { data, error } = await supabase.rpc("set_provider_booking_policy", {
      p_provider_id: providerId,
      p_free_cancellation_hours: num(form.free),
      p_late_cancellation_fee_percent: num(form.late),
      p_no_show_fee_percent: num(form.noShow),
      p_deposit_percentage: num(form.deposit),
      p_reason: reason.trim() || null,
    });
    setSaving(false);
    if (error) { setFailure(t.saveFailed + errorMessage(error)); return; }
    setForm((current) => ({ ...current, confirmedAt: (data as { policy_confirmed_at?: string } | null)?.policy_confirmed_at ?? new Date().toISOString() }));
    setDone(t.saved);
    onSaved?.();
  };

  const set = (key: keyof Loaded) => (event: React.ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <section aria-labelledby="booking-policy-title" className="relative overflow-hidden rounded-3xl border border-[#ECECEC] bg-white p-6 shadow-[0_8px_30px_rgba(0,0,0,0.015)] md:p-8">
      <h3 id="booking-policy-title" className="text-lg font-bold text-[#101828]">{t.title}</h3>
      <p className="mt-1 text-xs leading-5 text-[#667085]">{t.intro}</p>
      {!loading && (
        <p className={`mt-3 rounded-xl border px-3 py-2 text-xs font-semibold ${form.confirmedAt ? "border-[#D1FADF] bg-[#ECFDF3] text-[#067647]" : "border-[#FEDF89] bg-[#FFFAEB] text-[#93370D]"}`}>
          {form.confirmedAt ? t.confirmedAt.replace("{date}", formatBookingDateTime(form.confirmedAt, lang)) : t.unconfirmed}
        </p>
      )}
      <form onSubmit={(event) => void save(event)} noValidate className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={providerLabelClass} htmlFor="policy-free">{t.freeHours}</label>
          <input id="policy-free" inputMode="numeric" dir="ltr" disabled={loading || saving} value={form.free} onChange={set("free")} aria-invalid={attempted && hoursBad} aria-describedby="policy-free-help" className={providerFieldClass} />
          <p id="policy-free-help" className={`mt-1 text-xs ${attempted && hoursBad ? "font-semibold text-[#B42318]" : "text-[#667085]"}`}>{attempted && hoursBad ? t.invalidHours : t.hoursHelp}</p>
        </div>
        <div>
          <label className={providerLabelClass} htmlFor="policy-deposit">{t.deposit}</label>
          <input id="policy-deposit" inputMode="decimal" dir="ltr" disabled={loading || saving} value={form.deposit} onChange={set("deposit")} aria-invalid={attempted && depositBad} aria-describedby="policy-deposit-help" className={providerFieldClass} />
          <p id="policy-deposit-help" className={`mt-1 text-xs ${attempted && depositBad ? "font-semibold text-[#B42318]" : "text-[#667085]"}`}>{attempted && depositBad ? t.invalidDeposit : t.depositHelp}</p>
        </div>
        <div>
          <label className={providerLabelClass} htmlFor="policy-late">{t.lateFee}</label>
          <input id="policy-late" inputMode="decimal" dir="ltr" disabled={loading || saving} value={form.late} onChange={set("late")} aria-invalid={attempted && lateBad} aria-describedby="policy-late-help" className={providerFieldClass} />
          <p id="policy-late-help" className={`mt-1 text-xs ${attempted && lateBad ? "font-semibold text-[#B42318]" : "text-[#667085]"}`}>{attempted && lateBad ? t.invalidPercent : t.percentHelp}</p>
        </div>
        <div>
          <label className={providerLabelClass} htmlFor="policy-noshow">{t.noShowFee}</label>
          <input id="policy-noshow" inputMode="decimal" dir="ltr" disabled={loading || saving} value={form.noShow} onChange={set("noShow")} aria-invalid={attempted && noShowBad} aria-describedby="policy-noshow-help" className={providerFieldClass} />
          <p id="policy-noshow-help" className={`mt-1 text-xs ${attempted && noShowBad ? "font-semibold text-[#B42318]" : "text-[#667085]"}`}>{attempted && noShowBad ? t.invalidPercent : t.percentHelp}</p>
        </div>
        <div className="sm:col-span-2">
          <label className={providerLabelClass} htmlFor="policy-reason">{t.reason}</label>
          <input id="policy-reason" disabled={loading || saving} value={reason} onChange={(event) => setReason(event.target.value)} className={providerFieldClass} />
        </div>
        {sentences.length > 0 && (
          <div className="rounded-xl border border-[#ECECEC] bg-[#F9F7F1] p-3 text-xs leading-5 text-[#344054] sm:col-span-2">
            <p className="font-black">{t.preview}</p>
            <ul className="mt-1 list-disc space-y-0.5 ps-5">{sentences.map((line: string) => <li key={line}>{line}</li>)}</ul>
          </div>
        )}
        {failure && <div role="alert" className="rounded-xl border border-[#FECDCA] bg-[#FEF3F2] px-3 py-2.5 text-sm font-semibold text-[#B42318] sm:col-span-2">{failure}</div>}
        {done && <div role="status" className="rounded-xl border border-[#D1FADF] bg-[#ECFDF3] px-3 py-2.5 text-sm font-semibold text-[#067647] sm:col-span-2">{done}</div>}
        <div className="flex justify-end sm:col-span-2">
          <button type="submit" disabled={loading || saving} className={providerPrimaryButton}>{saving ? t.saving : t.save}</button>
        </div>
      </form>
    </section>
  );
}
