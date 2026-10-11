"use client";

import React, { useCallback, useEffect, useId, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CommandResult, operationsButton, operationsDate, operationsInput, sar, useOperationsLocale, type OperationsLocale } from "@/components/operations-ui";
import { CommandDialog, ModalOverlay, ModalPortal, useConfirm } from "@/components/modal";
import { membershipError, membershipStatusLabel, type MembershipStatus } from "@/lib/membership-copy";
import { oneOf, writeUrlState } from "@/lib/url-state";

type Plan = {
  id: string;
  name_en: string;
  name_ar: string;
  description_en: string | null;
  description_ar: string | null;
  price: number;
  period_days: number;
  visits_per_period: number;
  covers_all_services: boolean;
  is_active: boolean;
  membership_plan_services: Array<{ service_id: string }>;
};
type ServiceOption = { id: string; name_en: string; name_ar: string };
type MemberRow = {
  membership_id: string;
  customer_name: string | null;
  status: MembershipStatus;
  plan_name_en: string;
  plan_name_ar: string;
  visits_remaining: number;
  visits_per_period: number;
  period_start: string | null;
  period_end: string | null;
  amount_due: number;
  total_count: number;
};
type Redemption = {
  id: string;
  redeemed_at: string;
  notes: string | null;
  voided_at: string | null;
  void_reason: string | null;
  booking_id: string;
  memberships: { plan_name_en: string; plan_name_ar: string } | null;
};
type EligibleBooking = { booking_id: string; scheduled_at: string; status: string; service_names: string | null };

const PAGE_SIZE = 25;
const TABS = ["plans", "members", "history"] as const;
type Tab = (typeof TABS)[number];
const STATUS_FILTERS = ["", "active", "pending_payment", "expired", "cancelled"] as const;

const copy = {
  en: {
    title: "Memberships",
    subtitle: "Sell a period membership with a set number of included visits. Customers pay through the hosted payment page and the membership turns active only when the payment is confirmed.",
    plans: "Plans", members: "Members", history: "Visit history",
    loading: "Loading memberships...", noProvider: "No provider profile is linked to this account. Only the owner manages memberships.",
    loadFailed: "We could not load this screen.", retry: "Try again",
    newPlan: "New plan", editPlan: "Edit plan", emptyPlans: "You have not created a membership plan yet. Plans stay off sale until you switch them on.",
    emptyMembers: "No members match this filter.", emptyHistory: "No visits have been recorded yet.",
    nameEn: "Plan name (English)", nameAr: "Plan name (Arabic)", descEn: "Description (English)", descAr: "Description (Arabic)",
    price: "Price (SAR)", periodDays: "Period (days)", visits: "Included visits per period",
    coverage: "Covered services", coverageChoose: "Choose...", coverageAll: "Every service", coverageSelected: "Only the services I tick",
    coverageRequired: "Choose which services the plan covers.", servicesRequired: "Tick at least one service.",
    noServices: "You have no active services to cover yet.",
    save: "Save plan", saving: "Saving...", cancel: "Cancel", close: "Close",
    termsNote: "Changing a plan never changes memberships already sold; they keep the price, visits, period and services they were bought with.",
    planSaved: "Plan saved.", planOn: "Plan is now on sale.", planOff: "Plan taken off sale.",
    turnOn: "Put on sale", turnOff: "Take off sale", onSale: "On sale", draft: "Not on sale", edit: "Edit",
    turnOffTitle: "Take this plan off sale?", turnOffIntro: "New customers will no longer be able to buy it. Memberships already sold stay valid.",
    turnOnTitle: "Put this plan on sale?", turnOnIntro: "Customers will be able to buy it at the price shown.",
    each: "per period", days: "days", incl: "included visits", allServices: "Every service", someServices: "services",
    statusFilter: "Status", allStatuses: "All statuses",
    customer: "Customer", plan: "Plan", balance: "Visits left", ends: "Period ends", status: "Status", actions: "Actions",
    redeem: "Record a visit", redeemTitle: "Record an included visit",
    redeemIntro: "Pick the member's confirmed or completed booking this visit pays for. One booking carries one visit.",
    booking: "Booking", recorded: "Recorded on", pickBooking: "Choose a booking...", noEligible: "This member has no confirmed or completed booking at your salon that this membership covers and that has not already been used.",
    notes: "Notes (optional)", redeemConfirm: "Record visit", redeemed: "Visit recorded.", loadingBookings: "Loading bookings...",
    cancelMembership: "Cancel membership", cancelTitle: "Cancel this membership?", cancelIntro: "The member forfeits the remaining visits. This does not refund a payment; refunds go through the refund process.",
    cancelReason: "Reason for cancelling", cancelConfirm: "Cancel membership", cancelled: "Membership cancelled.",
    voidVisit: "Void", voidTitle: "Void this visit?", voidIntro: "The visit goes back to the member if the membership is still active, and the booking can be used again.",
    voidReason: "Reason for voiding", voidConfirm: "Void visit", voided: "Visit voided.", voidedTag: "Voided",
    previous: "Previous", next: "Next", pageOf: "Page", total: "members",
    notice: "v1 gives included visits only. Percentage discounts are not part of memberships yet. Renewal is started by the customer; there is no automatic card charge.",
    ownerOnly: "Only the owner can change plans.",
    lowPrice: "Enter a price above zero.", lowPeriod: "Enter a period between 1 and 3660 days.", lowVisits: "Enter between 1 and 1000 visits.", lowNames: "Enter the plan name in both languages.",
  },
  ar: {
    title: "العضويات",
    subtitle: "بع عضوية لفترة محددة بعدد من الزيارات المشمولة. يدفع العميل عبر صفحة الدفع الآمنة وتُفعَّل العضوية فقط بعد تأكيد الدفع.",
    plans: "الخطط", members: "الأعضاء", history: "سجل الزيارات",
    loading: "جارٍ تحميل العضويات...", noProvider: "لا يوجد ملف نشاط مرتبط بهذا الحساب. مالك النشاط فقط يدير العضويات.",
    loadFailed: "تعذر تحميل هذه الشاشة.", retry: "إعادة المحاولة",
    newPlan: "خطة جديدة", editPlan: "تعديل الخطة", emptyPlans: "لم تنشئ خطة عضوية بعد. تبقى الخطط غير معروضة للبيع حتى تفعّلها.",
    emptyMembers: "لا يوجد أعضاء مطابقون لهذا الفلتر.", emptyHistory: "لم تُسجَّل أي زيارة بعد.",
    nameEn: "اسم الخطة (إنجليزي)", nameAr: "اسم الخطة (عربي)", descEn: "الوصف (إنجليزي)", descAr: "الوصف (عربي)",
    price: "السعر (ريال)", periodDays: "المدة (أيام)", visits: "الزيارات المشمولة في الفترة",
    coverage: "الخدمات المشمولة", coverageChoose: "اختر...", coverageAll: "كل الخدمات", coverageSelected: "الخدمات التي أحددها فقط",
    coverageRequired: "اختر الخدمات التي تشملها الخطة.", servicesRequired: "حدّد خدمة واحدة على الأقل.",
    noServices: "ليست لديك خدمات نشطة لتشملها الخطة بعد.",
    save: "حفظ الخطة", saving: "جارٍ الحفظ...", cancel: "إلغاء", close: "إغلاق",
    termsNote: "تعديل الخطة لا يغيّر العضويات المباعة؛ تحتفظ بالسعر والزيارات والمدة والخدمات التي اشتُريت بها.",
    planSaved: "تم حفظ الخطة.", planOn: "الخطة معروضة للبيع الآن.", planOff: "تم إيقاف بيع الخطة.",
    turnOn: "عرض للبيع", turnOff: "إيقاف البيع", onSale: "معروضة للبيع", draft: "غير معروضة", edit: "تعديل",
    turnOffTitle: "إيقاف بيع هذه الخطة؟", turnOffIntro: "لن يتمكن عملاء جدد من شرائها. العضويات المباعة تبقى سارية.",
    turnOnTitle: "عرض هذه الخطة للبيع؟", turnOnIntro: "سيتمكن العملاء من شرائها بالسعر الموضح.",
    each: "للفترة", days: "يوم", incl: "زيارات مشمولة", allServices: "كل الخدمات", someServices: "خدمات",
    statusFilter: "الحالة", allStatuses: "كل الحالات",
    customer: "العميل", plan: "الخطة", balance: "الزيارات المتبقية", ends: "نهاية الفترة", status: "الحالة", actions: "إجراءات",
    redeem: "تسجيل زيارة", redeemTitle: "تسجيل زيارة مشمولة",
    redeemIntro: "اختر حجز العضو المؤكد أو المكتمل الذي تغطيه هذه الزيارة. كل حجز يحمل زيارة واحدة.",
    booking: "الحجز", recorded: "تاريخ التسجيل", pickBooking: "اختر حجزاً...", noEligible: "لا يوجد لهذا العضو حجز مؤكد أو مكتمل لدى صالونك تشمله العضوية ولم يُستخدم من قبل.",
    notes: "ملاحظات (اختياري)", redeemConfirm: "تسجيل الزيارة", redeemed: "تم تسجيل الزيارة.", loadingBookings: "جارٍ تحميل الحجوزات...",
    cancelMembership: "إلغاء العضوية", cancelTitle: "إلغاء هذه العضوية؟", cancelIntro: "يفقد العضو زياراته المتبقية. هذا لا يعيد أي مبلغ؛ الاسترداد يتم عبر مسار الاسترداد.",
    cancelReason: "سبب الإلغاء", cancelConfirm: "إلغاء العضوية", cancelled: "تم إلغاء العضوية.",
    voidVisit: "إبطال", voidTitle: "إبطال هذه الزيارة؟", voidIntro: "تعود الزيارة إلى العضو إذا كانت العضوية نشطة، ويمكن استخدام الحجز من جديد.",
    voidReason: "سبب الإبطال", voidConfirm: "إبطال الزيارة", voided: "تم إبطال الزيارة.", voidedTag: "مُبطلة",
    previous: "السابق", next: "التالي", pageOf: "صفحة", total: "عضواً",
    notice: "الإصدار الأول يمنح زيارات مشمولة فقط. الخصومات النسبية ليست جزءاً من العضويات بعد. التجديد يبدأه العميل بنفسه ولا يوجد خصم تلقائي من البطاقة.",
    ownerOnly: "مالك النشاط فقط يغيّر الخطط.",
    lowPrice: "أدخل سعراً أكبر من صفر.", lowPeriod: "أدخل مدة بين 1 و3660 يوماً.", lowVisits: "أدخل عدداً بين 1 و1000 زيارة.", lowNames: "أدخل اسم الخطة باللغتين.",
  },
};
type Copy = (typeof copy)["en"];

type PlanForm = { nameEn: string; nameAr: string; descEn: string; descAr: string; price: string; periodDays: string; visits: string; coverage: "" | "all" | "selected"; serviceIds: string[] };
const emptyForm: PlanForm = { nameEn: "", nameAr: "", descEn: "", descAr: "", price: "", periodDays: "", visits: "", coverage: "", serviceIds: [] };

function PlanDialog({ locale, t, initial, services, onSubmit, onClose }: {
  locale: OperationsLocale; t: Copy; initial: PlanForm; services: ServiceOption[];
  onSubmit: (form: PlanForm) => Promise<string | null>; onClose: () => void;
}) {
  const titleId = useId();
  const [form, setForm] = useState<PlanForm>(initial);
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [failure, setFailure] = useState("");
  const price = Number(form.price);
  const period = Number(form.periodDays);
  const visits = Number(form.visits);
  const problems: Partial<Record<keyof PlanForm, string>> = {};
  if (!form.nameEn.trim() || !form.nameAr.trim()) problems.nameEn = t.lowNames;
  if (!(price > 0) || Math.round(price * 100) / 100 !== price) problems.price = t.lowPrice;
  if (!Number.isInteger(period) || period < 1 || period > 3660) problems.periodDays = t.lowPeriod;
  if (!Number.isInteger(visits) || visits < 1 || visits > 1000) problems.visits = t.lowVisits;
  if (!form.coverage) problems.coverage = t.coverageRequired;
  else if (form.coverage === "selected" && form.serviceIds.length === 0) problems.coverage = t.servicesRequired;
  const set = <K extends keyof PlanForm>(key: K, value: PlanForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const show = (key: keyof PlanForm) => (attempted && problems[key] ? <span role="alert" className="text-xs font-semibold text-red-700">{problems[key]}</span> : null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (busy || Object.keys(problems).length > 0) return;
    setBusy(true);
    setFailure("");
    const message = await onSubmit(form).catch((error: unknown) => membershipError(error, locale));
    setBusy(false);
    if (message) setFailure(message);
    else onClose();
  };

  const field = "flex flex-col gap-1.5 text-xs font-semibold text-[#667085]";
  return (
    <ModalPortal>
      <ModalOverlay onClose={onClose} canClose={!busy} className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#101828]/55 px-4 py-8 backdrop-blur-sm">
        <form role="dialog" aria-modal="true" aria-labelledby={titleId} dir={locale === "ar" ? "rtl" : "ltr"} tabIndex={-1} onSubmit={(e) => void submit(e)} noValidate
          className="max-h-full w-full max-w-xl space-y-4 overflow-y-auto rounded-[28px] border border-[#D1AF47]/40 bg-white p-6 text-start shadow-2xl">
          <h2 id={titleId} className="font-serif text-xl font-black text-[#101828]">{initial.nameEn || initial.nameAr ? t.editPlan : t.newPlan}</h2>
          <p className="text-xs leading-5 text-[#475467]">{t.termsNote}</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className={field}><span>{t.nameEn}</span><input className={operationsInput} value={form.nameEn} maxLength={120} dir="ltr" onChange={(e) => set("nameEn", e.target.value)} />{show("nameEn")}</label>
            <label className={field}><span>{t.nameAr}</span><input className={operationsInput} value={form.nameAr} maxLength={120} dir="rtl" onChange={(e) => set("nameAr", e.target.value)} /></label>
            <label className={field}><span>{t.descEn}</span><textarea className={operationsInput} rows={2} maxLength={1000} dir="ltr" value={form.descEn} onChange={(e) => set("descEn", e.target.value)} /></label>
            <label className={field}><span>{t.descAr}</span><textarea className={operationsInput} rows={2} maxLength={1000} dir="rtl" value={form.descAr} onChange={(e) => set("descAr", e.target.value)} /></label>
            <label className={field}><span>{t.price}</span><input className={operationsInput} inputMode="decimal" dir="ltr" value={form.price} onChange={(e) => set("price", e.target.value)} />{show("price")}</label>
            <label className={field}><span>{t.periodDays}</span><input className={operationsInput} inputMode="numeric" dir="ltr" value={form.periodDays} onChange={(e) => set("periodDays", e.target.value)} />{show("periodDays")}</label>
            <label className={field}><span>{t.visits}</span><input className={operationsInput} inputMode="numeric" dir="ltr" value={form.visits} onChange={(e) => set("visits", e.target.value)} />{show("visits")}</label>
            <label className={field}>
              <span>{t.coverage}</span>
              <select className={operationsInput} value={form.coverage} onChange={(e) => set("coverage", e.target.value as PlanForm["coverage"])}>
                <option value="">{t.coverageChoose}</option>
                <option value="all">{t.coverageAll}</option>
                <option value="selected">{t.coverageSelected}</option>
              </select>
              {show("coverage")}
            </label>
          </div>
          {form.coverage === "selected" && (
            services.length === 0 ? <p className="text-xs text-[#667085]">{t.noServices}</p> : (
              <fieldset className="space-y-2 rounded-xl border border-[#D8D2C5] p-3">
                <legend className="px-1 text-xs font-semibold text-[#667085]">{t.coverage}</legend>
                {services.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm text-[#101828]">
                    <input type="checkbox" checked={form.serviceIds.includes(s.id)}
                      onChange={(e) => set("serviceIds", e.target.checked ? [...form.serviceIds, s.id] : form.serviceIds.filter((id) => id !== s.id))} />
                    <span>{locale === "ar" ? s.name_ar || s.name_en : s.name_en || s.name_ar}</span>
                  </label>
                ))}
              </fieldset>
            )
          )}
          {failure && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{failure}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onClose} disabled={busy} className="rounded-xl border border-[#D8D2C5] px-4 py-2 text-sm font-semibold text-[#344054] focus-visible:outline-2 focus-visible:outline-[#9B7928]">{t.cancel}</button>
            <button type="submit" disabled={busy} className={operationsButton}>{busy ? t.saving : t.save}</button>
          </div>
        </form>
      </ModalOverlay>
    </ModalPortal>
  );
}

function RedeemDialog({ locale, t, member, onClose, onDone }: {
  locale: OperationsLocale; t: Copy; member: MemberRow; onClose: () => void; onDone: (message: string) => void;
}) {
  const titleId = useId();
  const [bookings, setBookings] = useState<EligibleBooking[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [bookingId, setBookingId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");

  useEffect(() => {
    let cancelled = false;
    void supabase.rpc("list_membership_redeemable_bookings", { p_membership_id: member.membership_id }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) setLoadError(membershipError(error, locale));
      else setBookings((data ?? []) as EligibleBooking[]);
    });
    return () => { cancelled = true; };
  }, [member.membership_id, locale]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !bookingId) return;
    setBusy(true);
    setFailure("");
    const { error } = await supabase.rpc("redeem_membership_visit", { p_membership_id: member.membership_id, p_booking_id: bookingId, p_notes: notes.trim() || null });
    setBusy(false);
    if (error) { setFailure(membershipError(error, locale)); return; }
    onDone(t.redeemed);
    onClose();
  };

  return (
    <ModalPortal>
      <ModalOverlay onClose={onClose} canClose={!busy} className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#101828]/55 px-4 py-8 backdrop-blur-sm">
        <form role="dialog" aria-modal="true" aria-labelledby={titleId} dir={locale === "ar" ? "rtl" : "ltr"} tabIndex={-1} onSubmit={(e) => void submit(e)}
          className="max-h-full w-full max-w-lg space-y-4 overflow-y-auto rounded-[28px] border border-[#D1AF47]/40 bg-white p-6 text-start shadow-2xl">
          <h2 id={titleId} className="font-serif text-xl font-black text-[#101828]">{t.redeemTitle}</h2>
          <p className="text-sm leading-6 text-[#475467]">{t.redeemIntro}</p>
          <dl className="grid grid-cols-2 gap-2 rounded-xl bg-[#F8F6EF] p-3 text-xs">
            <dt className="font-semibold text-[#667085]">{t.customer}</dt><dd className="font-bold text-[#101828]">{member.customer_name ?? "—"}</dd>
            <dt className="font-semibold text-[#667085]">{t.plan}</dt><dd className="font-bold text-[#101828]">{locale === "ar" ? member.plan_name_ar : member.plan_name_en}</dd>
            <dt className="font-semibold text-[#667085]">{t.balance}</dt><dd className="font-bold text-[#101828]">{member.visits_remaining} / {member.visits_per_period}</dd>
          </dl>
          {bookings === null && !loadError && <p role="status" className="text-sm text-[#667085]">{t.loadingBookings}</p>}
          {loadError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{loadError}</p>}
          {bookings && bookings.length === 0 && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{t.noEligible}</p>}
          {bookings && bookings.length > 0 && (
            <>
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#667085]">
                <span>{t.booking}</span>
                <select className={operationsInput} value={bookingId} onChange={(e) => setBookingId(e.target.value)}>
                  <option value="">{t.pickBooking}</option>
                  {bookings.map((b) => <option key={b.booking_id} value={b.booking_id}>{operationsDate(b.scheduled_at, locale)}{b.service_names ? ` · ${b.service_names}` : ""}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#667085]">
                <span>{t.notes}</span>
                <textarea className={operationsInput} rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
            </>
          )}
          {failure && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{failure}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onClose} disabled={busy} className="rounded-xl border border-[#D8D2C5] px-4 py-2 text-sm font-semibold text-[#344054] focus-visible:outline-2 focus-visible:outline-[#9B7928]">{t.cancel}</button>
            <button type="submit" disabled={busy || !bookingId} className={operationsButton}>{busy ? t.saving : t.redeemConfirm}</button>
          </div>
        </form>
      </ModalOverlay>
    </ModalPortal>
  );
}

export default function ProviderMembershipsPage() {
  const locale = useOperationsLocale();
  const t = copy[locale];
  const dir = locale === "ar" ? "rtl" : "ltr";
  const [confirmNode, askConfirm] = useConfirm(locale);
  const [tab, setTab] = useState<Tab>(() => (typeof window === "undefined" ? "plans" : oneOf(new URLSearchParams(window.location.search).get("tab"), TABS, "plans")));
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>(() => (typeof window === "undefined" ? "" : oneOf(new URLSearchParams(window.location.search).get("status"), STATUS_FILTERS, "")));
  const [page, setPage] = useState(0);
  const [providerId, setProviderId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [history, setHistory] = useState<Redemption[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [planDialog, setPlanDialog] = useState<{ id: string | null; form: PlanForm } | null>(null);
  const [redeemFor, setRedeemFor] = useState<MemberRow | null>(null);
  const [cancelFor, setCancelFor] = useState<MemberRow | null>(null);
  const [voidFor, setVoidFor] = useState<Redemption | null>(null);

  useEffect(() => { writeUrlState({ tab: tab === "plans" ? "" : tab, status: statusFilter }); }, [tab, statusFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) { setProviderId(""); return; }
      const { data: provider, error: providerError } = await supabase.from("providers").select("id").eq("owner_id", user.id).maybeSingle();
      if (providerError) throw providerError;
      if (!provider) { setProviderId(""); return; }
      setProviderId(provider.id);

      if (tab === "plans") {
        const [planRows, serviceRows] = await Promise.all([
          supabase.from("membership_plans").select("id, name_en, name_ar, description_en, description_ar, price, period_days, visits_per_period, covers_all_services, is_active, membership_plan_services(service_id)")
            .eq("provider_id", provider.id).order("created_at", { ascending: false }).limit(200),
          supabase.from("services").select("id, name_en, name_ar").eq("provider_id", provider.id).eq("is_active", true).order("name_en").limit(500),
        ]);
        if (planRows.error) throw planRows.error;
        if (serviceRows.error) throw serviceRows.error;
        setPlans((planRows.data ?? []) as unknown as Plan[]);
        setServices((serviceRows.data ?? []) as ServiceOption[]);
      } else if (tab === "members") {
        const { data, error: listError } = await supabase.rpc("list_provider_memberships", {
          p_provider_id: provider.id, p_status: statusFilter || null, p_limit: PAGE_SIZE, p_offset: page * PAGE_SIZE,
        });
        if (listError) throw listError;
        setMembers((data ?? []) as MemberRow[]);
      } else {
        const { data, count, error: historyError } = await supabase.from("membership_redemptions")
          .select("id, redeemed_at, notes, voided_at, void_reason, booking_id, memberships(plan_name_en, plan_name_ar)", { count: "exact" })
          .eq("provider_id", provider.id).order("redeemed_at", { ascending: false }).range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
        if (historyError) throw historyError;
        setHistory((data ?? []) as unknown as Redemption[]);
        setHistoryTotal(count ?? 0);
      }
    } catch (failure) {
      setLoadError(`${t.loadFailed} ${membershipError(failure, locale)}`);
    } finally {
      setLoading(false);
    }
  }, [tab, statusFilter, page, locale, t.loadFailed]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const savePlan = async (id: string | null, form: PlanForm): Promise<string | null> => {
    const args = {
      p_name_en: form.nameEn.trim(), p_name_ar: form.nameAr.trim(),
      p_description_en: form.descEn.trim() || null, p_description_ar: form.descAr.trim() || null,
      p_price: Number(form.price), p_period_days: Number(form.periodDays), p_visits_per_period: Number(form.visits),
      p_covers_all_services: form.coverage === "all", p_service_ids: form.coverage === "all" ? [] : form.serviceIds,
    };
    const { error: rpcError } = id
      ? await supabase.rpc("provider_update_membership_plan", { p_plan_id: id, ...args })
      : await supabase.rpc("provider_create_membership_plan", { p_provider_id: providerId, ...args });
    if (rpcError) return membershipError(rpcError, locale);
    setSuccess(t.planSaved);
    await load();
    return null;
  };

  const togglePlan = async (plan: Plan) => {
    const turningOn = !plan.is_active;
    const ok = await askConfirm({
      title: turningOn ? t.turnOnTitle : t.turnOffTitle, intro: turningOn ? t.turnOnIntro : t.turnOffIntro,
      facts: [{ label: t.plan, value: locale === "ar" ? plan.name_ar : plan.name_en }, { label: t.price, value: sar(plan.price, locale) }],
      confirmLabel: turningOn ? t.turnOn : t.turnOff, tone: turningOn ? "default" : "danger",
    });
    if (!ok) return;
    const { error: rpcError } = await supabase.rpc("provider_set_membership_plan_active", { p_plan_id: plan.id, p_active: turningOn });
    if (rpcError) { setError(membershipError(rpcError, locale)); return; }
    setSuccess(turningOn ? t.planOn : t.planOff);
    await load();
  };

  const openEdit = (plan: Plan) => setPlanDialog({
    id: plan.id,
    form: {
      nameEn: plan.name_en, nameAr: plan.name_ar, descEn: plan.description_en ?? "", descAr: plan.description_ar ?? "",
      price: String(plan.price), periodDays: String(plan.period_days), visits: String(plan.visits_per_period),
      coverage: plan.covers_all_services ? "all" : "selected", serviceIds: plan.membership_plan_services.map((s) => s.service_id),
    },
  });

  const changeTab = (next: Tab) => { setTab(next); setPage(0); };
  const pages = tab === "members" ? Math.max(1, Math.ceil((members[0]?.total_count ?? 0) / PAGE_SIZE)) : Math.max(1, Math.ceil(historyTotal / PAGE_SIZE));
  const totalRows = tab === "members" ? members[0]?.total_count ?? 0 : historyTotal;

  return (
    <div dir={dir} className="space-y-6 text-start">
      <CommandResult error={error} success={success} locale={locale} onDismiss={() => { setError(""); setSuccess(""); }} />
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-serif text-2xl font-black tracking-tight text-[#101828]">{t.title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-[#667085]">{t.subtitle}</p>
        </div>
        {tab === "plans" && providerId && <button type="button" className={operationsButton} onClick={() => setPlanDialog({ id: null, form: emptyForm })}>{t.newPlan}</button>}
      </header>
      <p className="text-xs text-[#667085]">{t.notice}</p>

      <div role="tablist" aria-label={t.title} className="flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1 self-start w-fit">
        {TABS.map((id) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => changeTab(id)}
            className={`rounded-lg px-4 py-2 text-xs font-bold focus-visible:outline-2 focus-visible:outline-[#9B7928] ${tab === id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"}`}>
            {t[id]}
          </button>
        ))}
      </div>

      {loading && <p role="status" className="py-10 text-center text-sm font-semibold text-gray-400">{t.loading}</p>}
      {!loading && loadError && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p>{loadError}</p>
          <button type="button" className={`${operationsButton} mt-3`} onClick={() => void load()}>{t.retry}</button>
        </div>
      )}
      {!loading && !loadError && !providerId && <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{t.noProvider}</p>}

      {!loading && !loadError && providerId && tab === "plans" && (
        plans.length === 0 ? <p className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-600">{t.emptyPlans}</p> : (
          <ul className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {plans.map((p) => (
              <li key={p.id} className="flex flex-col justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-base font-bold text-[#101828]">{locale === "ar" ? p.name_ar : p.name_en}</h2>
                    <span className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-black ${p.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>{p.is_active ? t.onSale : t.draft}</span>
                  </div>
                  {(locale === "ar" ? p.description_ar || p.description_en : p.description_en || p.description_ar) && (
                    <p className="text-xs text-[#667085]">{locale === "ar" ? p.description_ar || p.description_en : p.description_en || p.description_ar}</p>
                  )}
                  <p className="font-serif text-xl font-black text-[#101828]">{sar(p.price, locale)} <span className="text-xs font-semibold text-[#667085]">{t.each}</span></p>
                  <p className="text-xs text-[#475467]">{p.visits_per_period} {t.incl} · {p.period_days} {t.days}</p>
                  <p className="text-xs text-[#475467]">{p.covers_all_services ? t.allServices : `${p.membership_plan_services.length} ${t.someServices}`}</p>
                </div>
                <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                  <button type="button" className={operationsButton} onClick={() => openEdit(p)}>{t.edit}</button>
                  <button type="button" className={operationsButton} onClick={() => void togglePlan(p)}>{p.is_active ? t.turnOff : t.turnOn}</button>
                </div>
              </li>
            ))}
          </ul>
        )
      )}

      {!loading && !loadError && providerId && tab === "members" && (
        <>
          <label className="flex w-fit flex-col gap-1.5 text-xs font-semibold text-[#667085]">
            <span>{t.statusFilter}</span>
            <select className={operationsInput} value={statusFilter} onChange={(e) => { setStatusFilter(oneOf(e.target.value, STATUS_FILTERS, "")); setPage(0); }}>
              {STATUS_FILTERS.map((s) => <option key={s || "all"} value={s}>{s ? membershipStatusLabel[locale][s as MembershipStatus] : t.allStatuses}</option>)}
            </select>
          </label>
          {members.length === 0 ? <p className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-600">{t.emptyMembers}</p> : (
            <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
              <table className="w-full min-w-[720px] text-sm">
                <caption className="sr-only">{t.members}</caption>
                <thead className="bg-[#F8F6EF] text-xs text-[#667085]">
                  <tr>{[t.customer, t.plan, t.status, t.balance, t.ends, t.actions].map((h) => <th key={h} scope="col" className="px-4 py-3 text-start font-semibold">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.membership_id} className="border-t border-gray-100">
                      <td className="px-4 py-3 font-semibold text-[#101828]">{m.customer_name ?? "—"}</td>
                      <td className="px-4 py-3">{locale === "ar" ? m.plan_name_ar : m.plan_name_en}</td>
                      <td className="px-4 py-3">{membershipStatusLabel[locale][m.status]}</td>
                      <td className="px-4 py-3 tabular-nums">{m.status === "active" ? `${m.visits_remaining} / ${m.visits_per_period}` : "—"}</td>
                      <td className="px-4 py-3">{m.period_end ? operationsDate(m.period_end, locale) : "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {m.status === "active" && <button type="button" className={operationsButton} onClick={() => setRedeemFor(m)} aria-label={`${t.redeem}: ${m.customer_name ?? ""}`}>{t.redeem}</button>}
                          {(m.status === "active" || m.status === "pending_payment") && <button type="button" className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-[#9B7928]" onClick={() => setCancelFor(m)} aria-label={`${t.cancelMembership}: ${m.customer_name ?? ""}`}>{t.cancelMembership}</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {!loading && !loadError && providerId && tab === "history" && (
        history.length === 0 ? <p className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-600">{t.emptyHistory}</p> : (
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">{t.history}</caption>
              <thead className="bg-[#F8F6EF] text-xs text-[#667085]">
                <tr>{[t.plan, t.recorded, t.notes, t.status, t.actions].map((h) => <th key={h} scope="col" className="px-4 py-3 text-start font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="px-4 py-3">{r.memberships ? (locale === "ar" ? r.memberships.plan_name_ar : r.memberships.plan_name_en) : "—"}</td>
                    <td className="px-4 py-3">{operationsDate(r.redeemed_at, locale)}</td>
                    <td className="px-4 py-3 text-[#475467]">{r.notes ?? "—"}</td>
                    <td className="px-4 py-3">{r.voided_at ? `${t.voidedTag}${r.void_reason ? `: ${r.void_reason}` : ""}` : "—"}</td>
                    <td className="px-4 py-3">{!r.voided_at && <button type="button" className={operationsButton} onClick={() => setVoidFor(r)} aria-label={`${t.voidVisit}: ${operationsDate(r.redeemed_at, locale)}`}>{t.voidVisit}</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {!loading && !loadError && providerId && tab !== "plans" && totalRows > PAGE_SIZE && (
        <nav aria-label={t.pageOf} className="flex items-center justify-between gap-3 text-sm">
          <button type="button" className={operationsButton} disabled={page === 0} onClick={() => setPage(page - 1)}>{t.previous}</button>
          <span className="text-[#667085]">{t.pageOf} {page + 1} / {pages} · {totalRows} {t.total}</span>
          <button type="button" className={operationsButton} disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>{t.next}</button>
        </nav>
      )}

      {confirmNode}
      {planDialog && <PlanDialog locale={locale} t={t} initial={planDialog.form} services={services} onSubmit={(form) => savePlan(planDialog.id, form)} onClose={() => setPlanDialog(null)} />}
      {redeemFor && <RedeemDialog locale={locale} t={t} member={redeemFor} onClose={() => setRedeemFor(null)} onDone={(message) => { setSuccess(message); void load(); }} />}
      {cancelFor && (
        <CommandDialog locale={locale} tone="danger" title={t.cancelTitle} intro={t.cancelIntro}
          facts={[{ label: t.customer, value: cancelFor.customer_name ?? "—" }, { label: t.plan, value: locale === "ar" ? cancelFor.plan_name_ar : cancelFor.plan_name_en }]}
          reasonLabel={t.cancelReason} confirmLabel={t.cancelConfirm}
          onConfirm={async (reason) => {
            const { error: rpcError } = await supabase.rpc("cancel_membership", { p_membership_id: cancelFor.membership_id, p_reason: reason });
            if (rpcError) return membershipError(rpcError, locale);
            setSuccess(t.cancelled);
            await load();
            return null;
          }}
          onClose={() => setCancelFor(null)} />
      )}
      {voidFor && (
        <CommandDialog locale={locale} tone="danger" title={t.voidTitle} intro={t.voidIntro}
          facts={[{ label: t.recorded, value: operationsDate(voidFor.redeemed_at, locale) }]}
          reasonLabel={t.voidReason} confirmLabel={t.voidConfirm}
          onConfirm={async (reason) => {
            const { error: rpcError } = await supabase.rpc("void_membership_redemption", { p_redemption_id: voidFor.id, p_reason: reason });
            if (rpcError) return membershipError(rpcError, locale);
            setSuccess(t.voided);
            await load();
            return null;
          }}
          onClose={() => setVoidFor(null)} />
      )}
    </div>
  );
}
