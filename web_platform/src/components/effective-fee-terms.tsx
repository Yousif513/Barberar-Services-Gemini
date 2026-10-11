"use client";
import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";
import { feeExample, validVatNumber, type FeeTerms } from "@/lib/money-display";
import { operationsDate, operationsInput, sar, type OperationsLocale } from "@/components/operations-ui";

// D-D3 (docs/legal/2026-10-10-adopted-decisions.md): the effective platform fee, computed from the fee rules in force on the
// account, with the date each took effect, "+ VAT on this fee" and a worked example on one of the provider's own prices.
// There is no free-standing commission percentage. Owners also declare their VAT registration status here.
type Rule = FeeTerms & { channel: string; is_first_visit: boolean | null; effective_from: string };
type Terms = {
  provider_id: string;
  rules: Rule[];
  scheduled: Rule[];
  own_channels: string[];
  vat_rate_percent: number | null;
  vat_registration_status: "registered" | "not_registered" | null;
  vat_verification_status: string;
  vat_number_last3: string | null;
  notices: { effective_from: string; is_first_visit: boolean | null; after: FeeTerms; notified_at: string }[];
  sample_prices: number[];
};

const copy = {
  en: {
    title: "Your platform fee",
    adminTitle: "Effective platform fee",
    intro: "Computed from the fee rules in force on this account. Bookings from your own link, QR code, WhatsApp, Instagram, walk-ins and imported clients carry no platform fee.",
    firstVisit: "Marketplace, a client's first visit",
    repeatVisit: "Marketplace, a returning client",
    anyVisit: "Marketplace bookings",
    noFee: "No platform fee",
    fee: "{pct}% of the booking (minimum {min}{max})",
    maxPart: ", maximum {max}",
    since: "In force since {date}",
    vat: "+ VAT ({rate}%) on this fee, where applicable",
    exampleTitle: "Worked example",
    exampleAmount: "Booking amount (SAR)",
    exampleLine: "On {amount}: platform fee {fee} + VAT {vat}. You receive {net}.",
    exampleNone: "Enter a booking amount to see the example.",
    scheduledTitle: "Scheduled change",
    scheduledLine: "From {date}: {terms}",
    loading: "Loading the fee terms...",
    failed: "The fee terms could not be loaded: {reason}",
    retry: "Retry",
    vatTitle: "VAT registration",
    vatRegistered: "VAT-registered, number ending {last3}",
    vatNotRegistered: "Not VAT-registered",
    vatUnknown: "Not declared",
    vatUnverified: "Not yet verified with ZATCA",
    vatVerified: "Verified",
    vatChange: "Update VAT status",
    vatStatusLabel: "VAT status",
    vatYes: "Registered for VAT",
    vatNo: "Not registered for VAT",
    vatNumber: "VAT number (15 digits, starts and ends with 3)",
    vatInvalid: "A VAT number has 15 digits and starts and ends with 3.",
    save: "Save",
    saving: "Saving...",
    cancel: "Cancel",
    vatSaved: "Saved. The status will be verified again.",
    reauth: "For your security, sign in again and repeat this change.",
  },
  ar: {
    title: "رسوم المنصة على حسابك",
    adminTitle: "رسوم المنصة الفعلية",
    intro: "محسوبة من قواعد الرسوم السارية على هذا الحساب. الحجوزات من رابطك أو رمز QR أو واتساب أو إنستغرام أو العملاء الحاضرين أو العملاء المستوردين بلا رسوم منصة.",
    firstVisit: "السوق، الزيارة الأولى للعميل",
    repeatVisit: "السوق، عميل عائد",
    anyVisit: "حجوزات السوق",
    noFee: "بلا رسوم منصة",
    fee: "{pct}% من قيمة الحجز (بحد أدنى {min}{max})",
    maxPart: "، وحد أقصى {max}",
    since: "سارية منذ {date}",
    vat: "+ ضريبة القيمة المضافة ({rate}%) على هذه الرسوم، حيثما تنطبق",
    exampleTitle: "مثال محسوب",
    exampleAmount: "قيمة الحجز (ر.س)",
    exampleLine: "على {amount}: رسوم المنصة {fee} + الضريبة {vat}. تستلم {net}.",
    exampleNone: "أدخل قيمة حجز لعرض المثال.",
    scheduledTitle: "تغيير مجدول",
    scheduledLine: "ابتداءً من {date}: {terms}",
    loading: "جارٍ تحميل شروط الرسوم...",
    failed: "تعذّر تحميل شروط الرسوم: {reason}",
    retry: "إعادة المحاولة",
    vatTitle: "التسجيل في ضريبة القيمة المضافة",
    vatRegistered: "مسجّل في الضريبة، رقم ينتهي بـ {last3}",
    vatNotRegistered: "غير مسجّل في الضريبة",
    vatUnknown: "لم يُصرَّح به",
    vatUnverified: "لم يُتحقق منه بعد لدى هيئة الزكاة والضريبة والجمارك",
    vatVerified: "تم التحقق",
    vatChange: "تحديث حالة الضريبة",
    vatStatusLabel: "حالة الضريبة",
    vatYes: "مسجّل في ضريبة القيمة المضافة",
    vatNo: "غير مسجّل في ضريبة القيمة المضافة",
    vatNumber: "الرقم الضريبي (15 رقماً يبدأ وينتهي بالرقم 3)",
    vatInvalid: "الرقم الضريبي 15 رقماً يبدأ وينتهي بالرقم 3.",
    save: "حفظ",
    saving: "جارٍ الحفظ...",
    cancel: "إلغاء",
    vatSaved: "تم الحفظ. سيُعاد التحقق من الحالة.",
    reauth: "لحمايتك، سجّل الدخول مرة أخرى ثم كرر هذا التغيير.",
  },
};

const fill = (text: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((out, [key, value]) => out.replace(`{${key}}`, String(value)), text);

export function EffectiveFeeTerms({ locale, providerId = null, mode }: { locale: OperationsLocale; providerId?: string | null; mode: "provider" | "admin" }) {
  const t = copy[locale];
  const [data, setData] = useState<Terms | null>(null);
  const [error, setError] = useState("");
  const [amount, setAmount] = useState("");
  const [vatForm, setVatForm] = useState<{ status: "registered" | "not_registered"; number: string; error: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");

  const load = useCallback(async () => {
    const { data: result, error: rpcError } = await supabase.rpc("provider_effective_fee_terms", { p_provider_id: providerId });
    if (rpcError) { setError(errorMessage(rpcError)); return; }
    setError("");
    const terms = result as Terms;
    setData(terms);
    setAmount((current) => current || (terms.sample_prices.length > 0 ? String(Number(terms.sample_prices[0])) : ""));
  }, [providerId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const saveVat = async () => {
    if (!vatForm || !data) return;
    if (vatForm.status === "registered" && !validVatNumber(vatForm.number.replace(/\s+/g, ""))) { setVatForm({ ...vatForm, error: t.vatInvalid }); return; }
    setSaving(true);
    const { error: rpcError } = await supabase.rpc("provider_set_vat_status", {
      p_provider_id: data.provider_id, p_status: vatForm.status, p_vat_number: vatForm.status === "registered" ? vatForm.number : null,
    });
    setSaving(false);
    if (rpcError) {
      setVatForm({ ...vatForm, error: rpcError.hint === "reauth_required" ? t.reauth : errorMessage(rpcError) });
      return;
    }
    setVatForm(null);
    setSaved(t.vatSaved);
    await load();
  };

  if (error) {
    return (
      <p role="alert" className="text-xs font-semibold text-[#B42318]">
        {fill(t.failed, { reason: error })}{" "}
        <button type="button" onClick={() => void load()} className="font-bold underline focus-visible:outline-2 focus-visible:outline-[#9B7928]">{t.retry}</button>
      </p>
    );
  }
  if (!data) return <p role="status" className="text-xs text-gray-500">{t.loading}</p>;

  const visit = (r: Rule) => (r.is_first_visit === null ? t.anyVisit : r.is_first_visit ? t.firstVisit : t.repeatVisit);
  const describe = (r: FeeTerms) => Number(r.fee_percentage) === 0 && Number(r.min_fee_sar) === 0 ? t.noFee : fill(t.fee, {
    pct: Number(r.fee_percentage).toLocaleString(locale === "ar" ? "ar-SA" : "en-US"),
    min: sar(Number(r.min_fee_sar), locale),
    max: r.max_fee_sar === null ? "" : fill(t.maxPart, { max: sar(Number(r.max_fee_sar), locale) }),
  });
  const vatRate = data.vat_rate_percent === null ? null : Number(data.vat_rate_percent);
  const sample = Number(amount);

  return (
    <section aria-labelledby="fee-terms-title" className="space-y-4 rounded-2xl border border-[#ECECEC] bg-white p-6 text-start">
      <div>
        <h3 id="fee-terms-title" className="text-sm font-black text-gray-900">{mode === "admin" ? t.adminTitle : t.title}</h3>
        <p className="mt-1 text-xs text-gray-500">{t.intro}</p>
      </div>
      <ul className="space-y-3">
        {data.rules.map((r) => {
          const example = feeExample(r, sample, vatRate);
          const charged = !(Number(r.fee_percentage) === 0 && Number(r.min_fee_sar) === 0);
          return (
            <li key={`${r.channel}-${String(r.is_first_visit)}`} className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs text-gray-700">
              <p className="font-black text-gray-900">{visit(r)}</p>
              <p className="mt-1 font-semibold">{describe(r)}</p>
              {charged && vatRate !== null ? <p className="mt-1">{fill(t.vat, { rate: vatRate.toLocaleString(locale === "ar" ? "ar-SA" : "en-US") })}</p> : null}
              <p className="mt-1 text-[11px] text-gray-500">{fill(t.since, { date: operationsDate(r.effective_from, locale) })}</p>
              {charged ? (
                <p className="mt-2 font-semibold text-gray-800">
                  {example ? fill(t.exampleLine, { amount: sar(example.amount, locale), fee: sar(example.fee, locale), vat: sar(example.vat, locale), net: sar(example.net, locale) }) : t.exampleNone}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      <label className="flex max-w-xs flex-col gap-1 text-[11px] font-bold text-[#667085]">
        <span>{t.exampleTitle}: {t.exampleAmount}</span>
        <input type="number" min={0} step="0.01" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} className={operationsInput} />
      </label>
      {data.scheduled.length > 0 ? (
        <div className="rounded-xl border border-[#FEDF89] bg-[#FFFAEB] p-3 text-xs text-[#B54708]">
          <p className="font-black">{t.scheduledTitle}</p>
          {data.scheduled.map((r) => (
            <p key={`${r.effective_from}-${String(r.is_first_visit)}`}>{visit(r)} · {fill(t.scheduledLine, { date: operationsDate(r.effective_from, locale), terms: describe(r) })}</p>
          ))}
        </div>
      ) : null}
      <div className="border-t border-[#ECECEC] pt-3 text-xs text-gray-700">
        <p className="font-black text-gray-900">{t.vatTitle}</p>
        <p className="mt-1">
          {data.vat_registration_status === "registered" ? fill(t.vatRegistered, { last3: data.vat_number_last3 ?? "" })
            : data.vat_registration_status === "not_registered" ? t.vatNotRegistered : t.vatUnknown}
          {data.vat_registration_status ? ` · ${data.vat_verification_status === "verified" ? t.vatVerified : t.vatUnverified}` : ""}
        </p>
        {saved ? <p role="status" className="mt-1 font-bold text-green-800">{saved}</p> : null}
        {mode === "provider" && !vatForm ? (
          <button type="button" onClick={() => { setSaved(""); setVatForm({ status: data.vat_registration_status ?? "registered", number: "", error: "" }); }}
            className="mt-2 rounded-xl border border-gray-300 px-4 py-2 text-xs font-black text-gray-900 hover:border-[#D1AF47] focus-visible:outline-2 focus-visible:outline-[#9B7928]">{t.vatChange}</button>
        ) : null}
        {mode === "provider" && vatForm ? (
          <div className="mt-2 space-y-2">
            <fieldset className="space-y-1">
              <legend className="text-[11px] font-bold text-[#667085]">{t.vatStatusLabel}</legend>
              <label className="flex items-center gap-2"><input type="radio" name="vat-status" checked={vatForm.status === "registered"} onChange={() => setVatForm({ ...vatForm, status: "registered", error: "" })} />{t.vatYes}</label>
              <label className="flex items-center gap-2"><input type="radio" name="vat-status" checked={vatForm.status === "not_registered"} onChange={() => setVatForm({ ...vatForm, status: "not_registered", error: "" })} />{t.vatNo}</label>
            </fieldset>
            {vatForm.status === "registered" ? (
              <label className="flex max-w-sm flex-col gap-1 text-[11px] font-bold text-[#667085]">
                <span>{t.vatNumber}</span>
                <input dir="ltr" inputMode="numeric" maxLength={20} value={vatForm.number} onChange={(e) => setVatForm({ ...vatForm, number: e.target.value, error: "" })} className={operationsInput}
                  aria-invalid={vatForm.error !== ""} />
              </label>
            ) : null}
            {vatForm.error ? <p role="alert" className="font-bold text-[#B42318]">{vatForm.error}</p> : null}
            <div className="flex gap-2">
              <button type="button" disabled={saving} onClick={() => void saveVat()} className="rounded-xl bg-gray-900 px-4 py-2 text-xs font-black text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[#9B7928]">{saving ? t.saving : t.save}</button>
              <button type="button" disabled={saving} onClick={() => setVatForm(null)} className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-black text-gray-900 focus-visible:outline-2 focus-visible:outline-[#9B7928]">{t.cancel}</button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
