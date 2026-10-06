"use client";
import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ForbiddenNotice, isForbidden, useOperationsLocale } from "@/components/operations-ui";

type FeeRule = { channel: string; is_first_visit: boolean | null; fee_percentage: number; min_fee_sar: number; max_fee_sar: number | null; is_active: boolean };

// Read-only by design: these rates are applied by the booking and invoicing functions on the server
// (booking_create_internal, calculate_booking_commission, generate_zatca_tax_invoice). Changing them is a
// reviewed database migration with owner approval, so the console shows them instead of offering inputs
// that would not change pricing.
const translations = {
  en: {
    title: "Taxes & Platform Fees",
    subtitle: "The rates the server applies to every booking. They are shown here for reference.",
    vatTitle: "VAT",
    vatValue: "15%",
    vatDetail: "Added to the taxable amount of every booking and shown on each tax invoice.",
    feeTitle: "Platform commission",
    channels: { marketplace: "PRIMORA marketplace", link: "Provider booking link", qr: "QR code", whatsapp: "WhatsApp", instagram: "Instagram", import: "Imported contacts", walk_in: "Walk-in" } as Record<string, string>,
    firstVisit: "first visit", repeatVisit: "repeat visits", anyVisit: "all visits",
    min: "minimum", max: "maximum", sar: "SAR",
    tips: "Tips: 0%, the full tip goes to the professional.",
    fallback: "If no active rule matches a booking source, the server applies 15%.",
    loading: "Loading fee rules...", loadFailed: "Could not load the fee rules", retry: "Try again", noRules: "No active fee rules.",
    otherTitle: "Other charges",
    otherValue: "None",
    otherDetail: "No municipality or service fee is added to customer prices.",
    howTitle: "How to change a rate",
    howDetail: "Rates change only through a reviewed database migration approved by the platform owner, so pricing, invoices and reports always agree."
  },
  ar: {
    title: "الضرائب والرسوم المالية",
    subtitle: "النسب التي يطبقها الخادم على كل حجز، معروضة هنا للمرجعية.",
    vatTitle: "ضريبة القيمة المضافة",
    vatValue: "15%",
    vatDetail: "تُضاف إلى المبلغ الخاضع للضريبة في كل حجز وتظهر في كل فاتورة ضريبية.",
    feeTitle: "عمولة المنصة",
    channels: { marketplace: "سوق بريمورا", link: "رابط الحجز الخاص بالمزود", qr: "رمز QR", whatsapp: "واتساب", instagram: "إنستغرام", import: "جهات الاتصال المستوردة", walk_in: "الحضور المباشر" } as Record<string, string>,
    firstVisit: "الزيارة الأولى", repeatVisit: "الزيارات المتكررة", anyVisit: "كل الزيارات",
    min: "حد أدنى", max: "حد أقصى", sar: "ر.س",
    tips: "الإكراميات: 0%، تذهب الإكرامية كاملة للأخصائي.",
    fallback: "إذا لم تطابق أي قاعدة نشطة مصدر الحجز، يطبق الخادم 15%.",
    loading: "جارٍ تحميل قواعد الرسوم...", loadFailed: "تعذر تحميل قواعد الرسوم", retry: "إعادة المحاولة", noRules: "لا توجد قواعد رسوم نشطة.",
    otherTitle: "رسوم أخرى",
    otherValue: "لا يوجد",
    otherDetail: "لا تُضاف رسوم بلدية أو رسوم خدمة إلى أسعار العملاء.",
    howTitle: "كيفية تغيير النسبة",
    howDetail: "تتغير النسب فقط عبر ترحيل قاعدة بيانات تمت مراجعته واعتمده مالك المنصة، حتى تتطابق الأسعار والفواتير والتقارير دائماً."
  }
};

export default function AdminTaxes() {
  const lang = useOperationsLocale();
  const t = translations[lang];
  const [rules, setRules] = useState<FeeRule[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    supabase.from("fee_rules").select("channel, is_first_visit, fee_percentage, min_fee_sar, max_fee_sar, is_active")
      .eq("is_active", true).order("channel").then(({ data, error }) => {
        if (cancelled) return;
        if (error) { setLoadError(error.message); setForbidden(isForbidden(error)); setRules([]); return; }
        setLoadError("");
        setForbidden(false);
        setRules((data || []) as FeeRule[]);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const describeRate = (r: FeeRule) => {
    const pct = `${Number(r.fee_percentage)}%`;
    if (Number(r.fee_percentage) === 0) return pct;
    const bounds = [Number(r.min_fee_sar) > 0 ? `${t.min} ${Number(r.min_fee_sar)} ${t.sar}` : "", r.max_fee_sar != null ? `${t.max} ${Number(r.max_fee_sar)} ${t.sar}` : ""].filter(Boolean);
    return bounds.length ? `${pct} (${bounds.join(lang === "ar" ? "، " : ", ")})` : pct;
  };
  const isRTL = lang === "ar";
  const cardBase = "rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)]";

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-6 ${isRTL ? "text-right" : "text-left"}`}>
      <div>
        <h1 className="text-2xl font-serif font-black text-gray-900 leading-tight">{t.title}</h1>
        <p className="text-xs text-gray-500 font-semibold mt-1">{t.subtitle}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className={cardBase} aria-labelledby="vat-title">
          <h3 id="vat-title" className="text-[11px] font-extrabold uppercase tracking-widest text-[#667085]">{t.vatTitle}</h3>
          <p className="mt-3 font-serif text-3xl font-black text-gray-900">{t.vatValue}</p>
          <p className="mt-2 text-xs text-gray-500">{t.vatDetail}</p>
        </section>
        <section className={cardBase} aria-labelledby="other-title">
          <h3 id="other-title" className="text-[11px] font-extrabold uppercase tracking-widest text-[#667085]">{t.otherTitle}</h3>
          <p className="mt-3 font-serif text-3xl font-black text-gray-900">{t.otherValue}</p>
          <p className="mt-2 text-xs text-gray-500">{t.otherDetail}</p>
        </section>
      </div>

      <section className={cardBase} aria-labelledby="fee-title">
        <h3 id="fee-title" className="text-[11px] font-extrabold uppercase tracking-widest text-[#667085]">{t.feeTitle}</h3>
        {rules === null && <p role="status" className="mt-3 text-xs text-gray-600">{t.loading}</p>}
        {loadError && forbidden && <div className="mt-3"><ForbiddenNotice locale={lang} /></div>}
        {loadError && !forbidden && (
          <div role="alert" className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[#B42318]">
            <span>{t.loadFailed}: {loadError}</span>
            <button type="button" onClick={() => { setRules(null); setReloadKey((key) => key + 1); }} className="rounded-lg border border-red-300 bg-white px-3 py-1.5 font-black text-red-800 focus-visible:outline-2 focus-visible:outline-[#9B7928]">{t.retry}</button>
          </div>
        )}
        {rules !== null && !loadError && rules.length === 0 && <p className="mt-3 text-xs text-gray-500">{t.noRules}</p>}
        {rules !== null && rules.length > 0 && (
          <table className="mt-3 w-full text-sm">
            <tbody>
              {rules.map((r) => (
                <tr key={`${r.channel}-${String(r.is_first_visit)}`} className="border-t border-[#F2F4F7]">
                  <th scope="row" className="py-3 pe-4 text-start font-semibold text-gray-700">
                    {t.channels[r.channel] || r.channel} · {r.is_first_visit === null ? t.anyVisit : r.is_first_visit ? t.firstVisit : t.repeatVisit}
                  </th>
                  <td className="py-3 text-end font-black text-gray-900">{describeRate(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-gray-500">{t.tips}</p>
        <p className="mt-1 text-xs text-gray-500">{t.fallback}</p>
      </section>

      <section className="rounded-2xl border border-[#D1AF47]/30 bg-[#FFFAEB] p-5 text-xs text-[#7A5B12]">
        <h3 className="font-black">{t.howTitle}</h3>
        <p className="mt-1">{t.howDetail}</p>
      </section>
    </div>
  );
}
