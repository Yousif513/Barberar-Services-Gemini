"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { CommandResult, operationsButton, operationsDate, sar, useOperationsLocale } from "@/components/operations-ui";
import { CommandDialog } from "@/components/modal";
import { membershipError, membershipStatusLabel, newRequestKey, type MembershipStatus } from "@/lib/membership-copy";

type ProviderName = { business_name_en: string | null; business_name_ar: string | null } | null;

type Membership = {
  id: string;
  status: MembershipStatus;
  plan_id: string | null;
  plan_name_en: string;
  plan_name_ar: string;
  amount_due: number;
  period_days: number;
  visits_per_period: number;
  visits_remaining: number;
  covers_all_services: boolean;
  covered_service_ids: string[];
  period_start: string | null;
  period_end: string | null;
  renewal_of: string | null;
  providers: ProviderName;
};

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
  providers: ProviderName;
  membership_plan_services: Array<{ services: { name_en: string; name_ar: string } | null }>;
};

const copy = {
  en: {
    title: "My Memberships",
    subtitle: "Memberships give you a set number of included visits for a period. Your visits are counted when the salon records them against a booking.",
    mine: "My memberships",
    browse: "Browse memberships",
    loading: "Loading your memberships...",
    loadFailed: "We could not load your memberships. Check your connection and try again.",
    retry: "Try again",
    emptyMine: "You do not have a membership yet.",
    emptyBrowse: "No membership plans are on sale right now.",
    visitsLeft: "Visits left",
    validUntil: "Valid until",
    startsOn: "Starts on",
    allServices: "Covers every service",
    selectedServices: "Covers",
    period: "Period",
    days: "days",
    visits: "included visits",
    renew: "Renew",
    renewHint: "Renewing opens a new payment for the next period. It starts when this period ends, and unused visits do not carry over.",
    cancel: "Cancel membership",
    cancelling: "Cancel this membership?",
    cancelIntro: "Your remaining visits will be forfeited. Cancelling does not refund a payment; ask the salon for a refund if you need one.",
    cancelIntroPending: "This purchase has not been paid. Cancelling closes it and no payment is taken.",
    cancelReason: "Why are you cancelling?",
    cancelConfirm: "Cancel membership",
    cancelled: "Membership cancelled.",
    buy: "Buy membership",
    pay: "Complete payment",
    working: "Working...",
    book: "Book a visit",
    paymentReturn: "We are confirming your payment. Your membership becomes active as soon as the payment is confirmed; this can take a moment.",
    checkoutFailed: "The payment page could not be opened, so nothing was charged and the membership is not active yet.",
    signIn: "Sign in to buy a membership.",
    expiresSoon: "Ends soon",
    plan: "Plan",
    total: "Price",
    notice: "Percentage discounts are not part of memberships yet; a membership gives included visits only.",
  },
  ar: {
    title: "عضوياتي",
    subtitle: "تمنحك العضوية عدداً من الزيارات المشمولة خلال فترة محددة. تُحتسب زياراتك عندما يسجلها الصالون على حجز.",
    mine: "عضوياتي",
    browse: "استعرض العضويات",
    loading: "جارٍ تحميل عضوياتك...",
    loadFailed: "تعذر تحميل عضوياتك. تحقق من الاتصال وحاول مجدداً.",
    retry: "إعادة المحاولة",
    emptyMine: "ليس لديك عضوية حتى الآن.",
    emptyBrowse: "لا توجد خطط عضوية معروضة للبيع حالياً.",
    visitsLeft: "الزيارات المتبقية",
    validUntil: "صالحة حتى",
    startsOn: "تبدأ في",
    allServices: "تشمل كل الخدمات",
    selectedServices: "تشمل",
    period: "المدة",
    days: "يوم",
    visits: "زيارات مشمولة",
    renew: "تجديد",
    renewHint: "التجديد يفتح دفعة جديدة للفترة التالية. تبدأ عند انتهاء الفترة الحالية، ولا تُرحَّل الزيارات غير المستخدمة.",
    cancel: "إلغاء العضوية",
    cancelling: "إلغاء هذه العضوية؟",
    cancelIntro: "ستسقط زياراتك المتبقية. الإلغاء لا يعيد أي مبلغ مدفوع؛ اطلب الاسترداد من الصالون إذا احتجت.",
    cancelIntroPending: "لم يتم دفع هذا الطلب. الإلغاء يغلقه دون أي خصم.",
    cancelReason: "ما سبب الإلغاء؟",
    cancelConfirm: "إلغاء العضوية",
    cancelled: "تم إلغاء العضوية.",
    buy: "شراء العضوية",
    pay: "إكمال الدفع",
    working: "جارٍ التنفيذ...",
    book: "احجز زيارة",
    paymentReturn: "نتحقق من دفعتك. تُفعَّل العضوية فور تأكيد الدفع وقد يستغرق ذلك لحظات.",
    checkoutFailed: "تعذر فتح صفحة الدفع، لذلك لم يتم أي خصم ولم تُفعَّل العضوية بعد.",
    signIn: "سجّل الدخول لشراء عضوية.",
    expiresSoon: "تنتهي قريباً",
    plan: "الخطة",
    total: "السعر",
    notice: "الخصومات النسبية ليست جزءاً من العضويات بعد؛ العضوية تمنح زيارات مشمولة فقط.",
  },
};

const MEMBERSHIP_COLUMNS =
  "id, status, plan_id, plan_name_en, plan_name_ar, amount_due, period_days, visits_per_period, visits_remaining, covers_all_services, covered_service_ids, period_start, period_end, renewal_of, providers(business_name_en, business_name_ar)";
const PLAN_COLUMNS =
  "id, name_en, name_ar, description_en, description_ar, price, period_days, visits_per_period, covers_all_services, providers(business_name_en, business_name_ar), membership_plan_services(services(name_en, name_ar))";

export default function CustomerMembershipsPage() {
  const locale = useOperationsLocale();
  const t = copy[locale];
  const dir = locale === "ar" ? "rtl" : "ltr";
  const [tab, setTab] = useState<"mine" | "browse">("mine");
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [signedIn, setSignedIn] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [returning, setReturning] = useState(false);
  const [now] = useState(() => Date.now());
  const [cancelFor, setCancelFor] = useState<Membership | null>(null);
  // One request key per intended purchase or renewal, kept until the command succeeds so a double tap cannot buy twice.
  const keys = useRef<Map<string, string>>(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      setSignedIn(Boolean(user));
      const planQuery = supabase.from("membership_plans").select(PLAN_COLUMNS).eq("is_active", true).order("price", { ascending: true }).limit(100);
      if (user) {
        const [mine, available] = await Promise.all([
          supabase.from("memberships").select(MEMBERSHIP_COLUMNS).eq("customer_id", user.id).order("created_at", { ascending: false }).limit(100),
          planQuery,
        ]);
        if (mine.error) throw mine.error;
        if (available.error) throw available.error;
        setMemberships((mine.data ?? []) as unknown as Membership[]);
        setPlans((available.data ?? []) as unknown as Plan[]);
      } else {
        setMemberships([]);
        setPlans([]);
      }
    } catch (failure) {
      setLoadError(`${t.loadFailed} ${membershipError(failure, locale)}`);
    } finally {
      setLoading(false);
    }
  }, [locale, t.loadFailed]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  // Back from the hosted payment page: the membership turns active when the payment webhook confirms, so look again for a short while.
  useEffect(() => {
    const purchase = new URLSearchParams(window.location.search).get("purchase");
    if (!purchase) return;
    const shown = window.setTimeout(() => setReturning(true), 0);
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      void load();
      if (attempts >= 6) {
        window.clearInterval(timer);
        setReturning(false);
      }
    }, 5000);
    return () => { window.clearTimeout(shown); window.clearInterval(timer); };
  }, [load]);

  const openCheckout = async (membershipId: string) => {
    const { data, error: checkoutError } = await supabase.functions.invoke("payment-checkout", {
      body: { purchaseType: "membership", purchaseId: membershipId },
    });
    if (checkoutError || !data?.checkoutUrl) throw new Error(t.checkoutFailed);
    window.location.assign(data.checkoutUrl as string);
  };

  const keyFor = (scope: string) => {
    const existing = keys.current.get(scope);
    if (existing) return existing;
    const created = newRequestKey("membership");
    keys.current.set(scope, created);
    return created;
  };

  const run = async (busyKey: string, work: () => Promise<void>) => {
    setBusyId(busyKey);
    setError("");
    setSuccess("");
    try {
      await work();
    } catch (failure) {
      setError(failure instanceof Error && failure.message === t.checkoutFailed ? t.checkoutFailed : membershipError(failure, locale));
    } finally {
      setBusyId(null);
    }
  };

  const buy = (plan: Plan) => run(`plan:${plan.id}`, async () => {
    const { data, error: rpcError } = await supabase.rpc("purchase_membership", { p_plan_id: plan.id, p_idempotency_key: keyFor(`buy:${plan.id}`) });
    if (rpcError) throw rpcError;
    keys.current.delete(`buy:${plan.id}`);
    await openCheckout((data as { membership_id: string }).membership_id);
  });

  const renew = (membership: Membership) => run(`renew:${membership.id}`, async () => {
    const { data, error: rpcError } = await supabase.rpc("renew_membership", { p_membership_id: membership.id, p_idempotency_key: keyFor(`renew:${membership.id}`) });
    if (rpcError) throw rpcError;
    keys.current.delete(`renew:${membership.id}`);
    await openCheckout((data as { membership_id: string }).membership_id);
  });

  const pay = (membership: Membership) => run(`pay:${membership.id}`, () => openCheckout(membership.id));

  const cancelMembership = async (membership: Membership, reason: string): Promise<string | null> => {
    const { error: rpcError } = await supabase.rpc("cancel_membership", { p_membership_id: membership.id, p_reason: reason });
    if (rpcError) return membershipError(rpcError, locale);
    setSuccess(t.cancelled);
    await load();
    return null;
  };

  const providerName = (p: ProviderName) => (locale === "ar" ? p?.business_name_ar || p?.business_name_en : p?.business_name_en || p?.business_name_ar) ?? "";
  const coverage = (all: boolean, names: string[]) => (all ? t.allServices : `${t.selectedServices}: ${names.join(", ")}`);
  const hasOpenRenewal = (m: Membership) => memberships.some((other) => other.renewal_of === m.id && other.status === "pending_payment");

  return (
    <div dir={dir} className="space-y-6 text-start">
      <CommandResult error={error} success={success} locale={locale} onDismiss={() => { setError(""); setSuccess(""); }} />
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-2xl font-black tracking-tight text-gray-900">{t.title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">{t.subtitle}</p>
        </div>
        <div role="tablist" aria-label={t.title} className="flex self-start rounded-xl bg-gray-100 p-1">
          {(["mine", "browse"] as const).map((id) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={`rounded-lg px-4 py-2 text-xs font-bold focus-visible:outline-2 focus-visible:outline-[#9B7928] ${tab === id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"}`}>
              {id === "mine" ? `${t.mine} (${memberships.length})` : `${t.browse} (${plans.length})`}
            </button>
          ))}
        </div>
      </header>

      {returning && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{t.paymentReturn}</p>}
      <p className="text-xs text-gray-500">{t.notice}</p>

      {loading && <p role="status" className="py-12 text-center text-sm font-semibold text-gray-400">{t.loading}</p>}
      {!loading && loadError && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p>{loadError}</p>
          <button type="button" onClick={() => void load()} className={`${operationsButton} mt-3`}>{t.retry}</button>
        </div>
      )}
      {!loading && !loadError && !signedIn && <p className="rounded-xl border border-gray-200 bg-white p-4 text-sm">{t.signIn} <Link href="/login?returnUrl=/customer/memberships" className="font-bold underline">{locale === "ar" ? "تسجيل الدخول" : "Sign in"}</Link></p>}

      {!loading && !loadError && signedIn && tab === "mine" && (
        memberships.length === 0 ? (
          <div className="mx-auto max-w-xl space-y-3 rounded-3xl border border-gray-200 bg-white p-10 text-center shadow-sm">
            <h2 className="text-base font-bold text-gray-900">{t.emptyMine}</h2>
            <button type="button" onClick={() => setTab("browse")} className={operationsButton}>{t.browse}</button>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {memberships.map((m) => {
              const used = m.visits_per_period - m.visits_remaining;
              const pct = m.visits_per_period > 0 ? Math.round((m.visits_remaining / m.visits_per_period) * 100) : 0;
              const endsSoon = m.status === "active" && m.period_end !== null && new Date(m.period_end).getTime() - now < 7 * 86400000;
              const busy = busyId !== null;
              return (
                <li key={m.id} className="flex flex-col justify-between gap-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="block text-[11px] font-extrabold uppercase tracking-wider text-[#9B7928]">{providerName(m.providers)}</span>
                        <h2 className="mt-1 text-base font-bold text-gray-900">{locale === "ar" ? m.plan_name_ar : m.plan_name_en}</h2>
                      </div>
                      <span className="shrink-0 rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-black text-gray-700">{membershipStatusLabel[locale][m.status]}</span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {m.visits_per_period} {t.visits} · {m.period_days} {t.days} · {sar(m.amount_due, locale)}
                    </p>
                    <p className="text-xs text-gray-500">{m.covers_all_services ? t.allServices : `${t.selectedServices}: ${m.covered_service_ids.length}`}</p>
                    {m.status === "active" && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs font-bold text-gray-700">
                          <span>{t.visitsLeft}</span>
                          <span className="font-black text-[#725517]">{m.visits_remaining} / {m.visits_per_period}</span>
                        </div>
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuemin={0} aria-valuemax={m.visits_per_period} aria-valuenow={m.visits_remaining} aria-label={t.visitsLeft}>
                          <div className="h-full bg-black transition-all" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
                        </div>
                        <p className="text-[11px] text-gray-500">{used} / {m.visits_per_period}</p>
                      </div>
                    )}
                    {m.period_end && (
                      <p className={`text-xs font-bold ${endsSoon ? "text-red-600" : "text-gray-700"}`}>
                        {m.period_start && new Date(m.period_start).getTime() > now ? `${t.startsOn} ${operationsDate(m.period_start, locale)}` : `${t.validUntil} ${operationsDate(m.period_end, locale)}`}
                        {endsSoon && ` · ${t.expiresSoon}`}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
                    {m.status === "active" && <Link href="/customer/book" className={operationsButton}>{t.book}</Link>}
                    {m.status === "pending_payment" && (
                      <button type="button" disabled={busy} onClick={() => void pay(m)} className={operationsButton}>{busyId === `pay:${m.id}` ? t.working : t.pay}</button>
                    )}
                    {(m.status === "active" || m.status === "expired") && m.plan_id && !hasOpenRenewal(m) && (
                      <button type="button" disabled={busy} onClick={() => void renew(m)} aria-describedby={`renew-hint-${m.id}`} className={operationsButton}>{busyId === `renew:${m.id}` ? t.working : t.renew}</button>
                    )}
                    {(m.status === "active" || m.status === "pending_payment") && (
                      <button type="button" disabled={busy} onClick={() => setCancelFor(m)} className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-[#9B7928] disabled:opacity-50">{t.cancel}</button>
                    )}
                    {(m.status === "active" || m.status === "expired") && <span id={`renew-hint-${m.id}`} className="basis-full text-[11px] text-gray-500">{t.renewHint}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )
      )}

      {!loading && !loadError && signedIn && tab === "browse" && (
        plans.length === 0 ? (
          <p className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-600">{t.emptyBrowse}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {plans.map((p) => {
              const names = p.membership_plan_services.map((s) => (locale === "ar" ? s.services?.name_ar : s.services?.name_en)).filter((n): n is string => Boolean(n));
              const description = locale === "ar" ? p.description_ar || p.description_en : p.description_en || p.description_ar;
              return (
                <li key={p.id} className="flex flex-col justify-between gap-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                  <div className="space-y-3">
                    <span className="block text-[11px] font-extrabold uppercase tracking-wider text-[#9B7928]">{providerName(p.providers)}</span>
                    <h2 className="text-base font-bold text-gray-900">{locale === "ar" ? p.name_ar : p.name_en}</h2>
                    {description && <p className="text-xs text-gray-500">{description}</p>}
                    <div className="flex items-center justify-between rounded-xl border border-amber-100 bg-amber-50/60 p-3 text-xs">
                      <span className="font-bold text-gray-700">{p.visits_per_period} {t.visits}</span>
                      <span className="text-gray-500">{t.period}: {p.period_days} {t.days}</span>
                    </div>
                    <p className="text-xs text-gray-500">{coverage(p.covers_all_services, names)}</p>
                  </div>
                  <div className="flex items-center justify-between border-t border-gray-100 pt-4">
                    <div>
                      <span className="block text-[11px] font-bold uppercase text-gray-400">{t.total}</span>
                      <strong className="font-serif text-xl font-black text-gray-900">{sar(p.price, locale)}</strong>
                    </div>
                    <button type="button" disabled={busyId !== null} onClick={() => void buy(p)} className={operationsButton}>{busyId === `plan:${p.id}` ? t.working : t.buy}</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )
      )}

      {cancelFor && (
        <CommandDialog
          locale={locale}
          tone="danger"
          title={t.cancelling}
          intro={cancelFor.status === "pending_payment" ? t.cancelIntroPending : t.cancelIntro}
          facts={[{ label: t.plan, value: locale === "ar" ? cancelFor.plan_name_ar : cancelFor.plan_name_en }, { label: t.visitsLeft, value: String(cancelFor.visits_remaining) }]}
          reasonLabel={t.cancelReason}
          confirmLabel={t.cancelConfirm}
          onConfirm={(reason) => cancelMembership(cancelFor, reason)}
          onClose={() => setCancelFor(null)}
        />
      )}
    </div>
  );
}
