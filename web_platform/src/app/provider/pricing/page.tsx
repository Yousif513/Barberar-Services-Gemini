"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { EffectiveFeeTerms } from "@/components/effective-fee-terms";
import { sar, useOperationsLocale } from "@/components/operations-ui";

const translations = {
  en: {
    backHome: "Back to Home",
    eyebrow: "For partners",
    title: "Plans and platform fees",
    subtitle: "Plan prices and the platform fee below are read from PRIMORA's records for your account.",
    pricingModel: "How the platform fee is worked out",
    pricingModelIntro: "Every booking is recorded in the ledger, and your share is paid out after the visit is completed.",
    platformFee: "Platform fee",
    partnerPayout: "Your payout",
    feeDesc: "Bookings from your own clients (your link, QR code or imported contacts) carry no platform fee. Marketplace bookings carry the platform fee shown in your fee terms above, computed from the fee rules in force on your account, plus VAT on that fee where applicable. A fee increase is announced at least 30 days before it applies.",
    payoutDesc: "What remains after the platform fee and the VAT on it is paid to your approved bank account once the visit is completed, according to the payout schedule.",
    planFeeNote: "Same platform fee terms on every plan",
    noUpfront: "No setup fee",
    noUpfrontDesc: "Registering, listing your services and setting up staff calendars cost nothing.",
    noCard: "No card needed to register",
    footerText: "Built for Riyadh, Saudi Arabia. All rights reserved.",
    billingMonthly: "Monthly billing",
    billingAnnual: "Annual billing",
    billingSwitch: "Bill annually",
    selectPlan: "Select plan",
    currentPlan: "Your current plan",
    selected: "Selected",
    billingCycleLabel: "Billing cycle",
    plansLoading: "Loading plans…",
    plansFailed: "The plans could not be loaded: {reason}",
    plansEmpty: "No plan is offered at the moment.",
    retry: "Try again",
    descriptions: {
      starter: "For independent professionals and newly opened salons",
      growth: "For growing salons that need analytics and marketing tools",
      elite: "For salon chains that need a dedicated account manager",
    } as Record<string, string>,
    free: "Free",
    perMonth: "a month",
    billedYearly: "Billed {total} a year",
    billedMonthly: "Billed monthly",
    saving: "Saves {amount} a year compared with monthly billing",
    upToBranches: "Up to {n} branches",
    upToStaff: "Up to {n} staff",
    smsIncluded: "{n} text messages a month included",
    featuresTitle: "Compare plans",
    feature: "Feature",
    featOnlineBooking: "Online booking and scheduling",
    featZatca: "VAT tax invoices",
    featSms: "Appointment alerts and notifications",
    featEscrow: "Ledger and payouts",
    featAnalytics: "Business analytics",
    featMarketing: "Marketing tools and coupons",
    featSupport: "Dedicated account manager",
    featBranches: "Branches",
    featStaff: "Staff",
    featSmsCount: "Text messages a month",
    included: "Included",
    notIncluded: "Not included",
    splitTitle: "Card payments",
    splitSubtitle: "Card payments are processed by Tap Payments.",
    payoutTimeline: "Payout transfer schedule",
    payoutTimelineDesc: "Completed appointments are paid out to your registered Saudi IBAN in scheduled bank transfers.",
    checkoutTitle: "Subscribe to a plan",
    checkoutSubtitle: "Payment is taken on Tap's secure page (mada, Apple Pay, Visa or Mastercard).",
    paymentMethod: "Payment methods",
    methods: { mada: "Saudi debit card", applePay: "Apple Pay", card: "Visa or Mastercard" } as Record<string, string>,
    summary: "Order summary",
    subtotal: "Subtotal",
    quoteUnavailable: "Price unavailable",
    total: "Total due",
    payNow: "Continue to secure payment",
    activateFree: "Activate the free plan",
    freeTitle: "This plan is free",
    freeBody: "No card details are needed. Your account uses the platform fee terms shown above.",
    tapTitle: "Payments by Tap",
    acceptedMethods: "Accepted methods:",
    processing: "Opening Tap's secure payment page…",
    successMsg: "Your plan is active.",
    successBody: "Your account now uses the {plan} plan.",
    activePlan: "Active plan:",
    billingCycle: "Billing cycle:",
    amountPaid: "Amount paid:",
    manage: "Manage subscription",
    selectedPlanLabel: "Selected plan",
    secureGatewayNotice: "All card details and payments are handled by Tap Payments. PRIMORA never stores or processes card numbers.",
    hostedTitle: "Card payments on Tap's hosted page",
    hostedBody: "Card details are entered on the payment provider's page, never on PRIMORA",
    assurance: ["No card details stored on PRIMORA servers", "Payouts to your bank in Saudi Arabia", "Every booking recorded in the ledger"],
    signInFirst: "Please sign in as a salon partner to subscribe",
    noProvider: "No salon partner account is linked to this login",
    checkoutFailed: "Could not open the payment page; your plan was not changed.",
    subscribeFailed: "The subscription could not be processed",
  },
  ar: {
    backHome: "العودة للرئيسية",
    eyebrow: "للشركاء",
    title: "الخطط ورسوم المنصة",
    subtitle: "أسعار الخطط ورسوم المنصة أدناه مقروءة من سجلات بريمورا لحسابك.",
    pricingModel: "كيف تُحسب رسوم المنصة",
    pricingModelIntro: "تُسجل كل عملية حجز في دفتر الأستاذ، وتُصرف حصتك بعد اكتمال الزيارة.",
    platformFee: "رسوم المنصة",
    partnerPayout: "مستحقاتك",
    feeDesc: "لا رسوم منصة على حجوزات عملائك (رابطك أو رمز QR أو جهات الاتصال المستوردة). حجوزات السوق عليها رسوم المنصة الموضحة في شروط الرسوم أعلاه، محسوبة من قواعد الرسوم السارية على حسابك، مع ضريبة القيمة المضافة على هذه الرسوم حيثما تنطبق. أي زيادة في الرسوم يُعلن عنها قبل ٣٠ يوماً على الأقل من تطبيقها.",
    payoutDesc: "يُحوَّل ما يتبقى بعد رسوم المنصة والضريبة عليها إلى حسابك البنكي المعتمد بعد اكتمال الزيارة، وفق جدول التحويلات.",
    planFeeNote: "شروط رسوم المنصة نفسها في كل الخطط",
    noUpfront: "بدون رسوم تأسيس",
    noUpfrontDesc: "التسجيل وإدراج خدماتك وإعداد تقويم موظفيك بلا تكلفة.",
    noCard: "لا حاجة لبطاقة للتسجيل",
    footerText: "صمم خصيصاً للرياض، المملكة العربية السعودية. جميع الحقوق محفوظة.",
    billingMonthly: "دفع شهري",
    billingAnnual: "دفع سنوي",
    billingSwitch: "الدفع سنوياً",
    selectPlan: "اختر الخطة",
    currentPlan: "خطتك الحالية",
    selected: "مختارة",
    billingCycleLabel: "دورة الفوترة",
    plansLoading: "جارٍ تحميل الخطط…",
    plansFailed: "تعذّر تحميل الخطط: {reason}",
    plansEmpty: "لا توجد خطة معروضة حالياً.",
    retry: "إعادة المحاولة",
    descriptions: {
      starter: "للمحترفين المستقلين والصالونات الجديدة",
      growth: "للصالونات النامية التي تحتاج التحليلات وأدوات التسويق",
      elite: "لسلاسل الصالونات التي تحتاج مدير حساب مخصصاً",
    } as Record<string, string>,
    free: "مجانية",
    perMonth: "شهرياً",
    billedYearly: "تُفوتر {total} سنوياً",
    billedMonthly: "تُفوتر شهرياً",
    saving: "توفر {amount} سنوياً مقارنة بالدفع الشهري",
    upToBranches: "حتى {n} من الفروع",
    upToStaff: "حتى {n} من الموظفين",
    smsIncluded: "{n} رسالة نصية شهرياً مشمولة",
    featuresTitle: "قارن بين الخطط",
    feature: "الميزة",
    featOnlineBooking: "الحجز والجدولة عبر الإنترنت",
    featZatca: "فواتير ضريبة القيمة المضافة",
    featSms: "تنبيهات وتذكيرات المواعيد",
    featEscrow: "دفتر الأستاذ وصرف المستحقات",
    featAnalytics: "تحليلات الأعمال",
    featMarketing: "أدوات التسويق والكوبونات",
    featSupport: "مدير حساب مخصص",
    featBranches: "الفروع",
    featStaff: "الموظفون",
    featSmsCount: "الرسائل النصية شهرياً",
    included: "مشمولة",
    notIncluded: "غير مشمولة",
    splitTitle: "مدفوعات البطاقات",
    splitSubtitle: "تتم معالجة مدفوعات البطاقات عبر Tap Payments.",
    payoutTimeline: "جدول تحويل المستحقات",
    payoutTimelineDesc: "تُحوَّل مستحقات المواعيد المكتملة إلى رقم الآيبان السعودي المسجل لديك في تحويلات بنكية مجدولة.",
    checkoutTitle: "الاشتراك في خطة",
    checkoutSubtitle: "يتم الدفع عبر صفحة Tap الآمنة (مدى وApple Pay وفيزا وماستركارد).",
    paymentMethod: "طرق الدفع",
    methods: { mada: "بطاقة مدى", applePay: "Apple Pay", card: "فيزا أو ماستركارد" } as Record<string, string>,
    summary: "ملخص الطلب",
    subtotal: "المجموع الفرعي",
    quoteUnavailable: "السعر غير متاح",
    total: "المبلغ المستحق",
    payNow: "المتابعة إلى الدفع الآمن",
    activateFree: "تفعيل الخطة المجانية",
    freeTitle: "هذه الخطة مجانية",
    freeBody: "لا حاجة لبيانات بطاقة. يعمل حسابك بشروط رسوم المنصة الموضحة أعلاه.",
    tapTitle: "المدفوعات عبر Tap",
    acceptedMethods: "طرق الدفع المدعومة:",
    processing: "جارٍ فتح صفحة الدفع الآمنة من Tap…",
    successMsg: "خطتك مفعّلة.",
    successBody: "يعمل حسابك الآن بخطة {plan}.",
    activePlan: "الخطة النشطة:",
    billingCycle: "دورة الدفع:",
    amountPaid: "المبلغ المدفوع:",
    manage: "إدارة الاشتراك",
    selectedPlanLabel: "الخطة المختارة",
    secureGatewayNotice: "تتم معالجة جميع بيانات البطاقات والمدفوعات عبر Tap Payments. لا تخزّن بريمورا أرقام البطاقات ولا تعالجها.",
    hostedTitle: "الدفع بالبطاقة عبر صفحة Tap المستضافة",
    hostedBody: "تُدخل بيانات البطاقة في صفحة مزود الدفع وليس في بريمورا",
    assurance: ["لا تُخزَّن بيانات البطاقات على خوادم بريمورا", "تحويل المستحقات إلى بنكك في السعودية", "كل حجز مسجل في دفتر الأستاذ"],
    signInFirst: "يرجى تسجيل الدخول كشريك صالون للاشتراك",
    noProvider: "لا يوجد حساب شريك مرتبط بهذا الدخول",
    checkoutFailed: "تعذر فتح صفحة الدفع، لم تتغير خطتك.",
    subscribeFailed: "تعذرت معالجة الاشتراك",
  }
};

// A plan as subscription_plans holds it (prices, limits and included features); nothing about a plan is written on this screen.
type Plan = {
  id: string; name_en: string; name_ar: string; price_monthly_sar: number | string; price_yearly_sar: number | string;
  max_branches: number | null; max_employees: number | null; included_monthly_sms: number | null;
  features: { analytics?: boolean; marketing?: boolean; dedicated_support?: boolean } | null;
};
const fill = (text: string, values: Record<string, string>) => Object.entries(values).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(v), text);

export default function PricingPage() {
  const locale = useOperationsLocale();
  const t = translations[locale];
  const money = (value: number | string) => sar(Number(value), locale);
  const count = (value: number) => new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US").format(value);

  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [plansError, setPlansError] = useState("");
  const [plansReload, setPlansReload] = useState(0);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  
  // Checkout State & Provider Subscription
  const [checkoutStep, setCheckoutStep] = useState<"idle" | "processing" | "success">("idle");
  const [providerId, setProviderId] = useState<string | null>(null);
  const [currentSubscription, setCurrentSubscription] = useState<any | null>(null);
  const [checkoutError, setCheckoutError] = useState("");
  // The price comes from the database (quote_provider_plan), the same function that sets the amount charged.
  const [quote, setQuote] = useState<{ total_sar: number; monthly_rate_sar: number; months: number } | null>(null);
  const [quoteError, setQuoteError] = useState(false);

  const checkoutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("subscription_plans")
      .select("id, name_en, name_ar, price_monthly_sar, price_yearly_sar, max_branches, max_employees, included_monthly_sms, features")
      .eq("is_active", true)
      .order("price_monthly_sar", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { setPlans(null); setPlansError(error.message); return; }
        setPlansError("");
        setPlans((data ?? []) as Plan[]);
      });
    return () => { cancelled = true; };
  }, [plansReload]);
  // Until the operator picks, the plan in force (or the first plan offered) is selected.
  const activePlanId = selectedPlan ?? currentSubscription?.plan_id ?? plans?.[0]?.id ?? null;
  const planName = (plan: Plan | undefined) => (plan ? (locale === "ar" ? plan.name_ar || plan.name_en : plan.name_en || plan.name_ar) : "");

  useEffect(() => {
    async function loadCurrentSubscription() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: prov } = await supabase
          .from("providers")
          .select("id")
          .eq("owner_id", user.id)
          .maybeSingle();

        if (prov) {
          setProviderId(prov.id);
          const { data: sub } = await supabase
            .from("provider_subscriptions")
            .select("*")
            .eq("provider_id", prov.id)
            .maybeSingle();

          if (sub) setCurrentSubscription(sub);
        }
      } catch (err) {
        console.warn("Subscription fetch warning:", err);
      }
    }
    loadCurrentSubscription();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const planId = activePlanId;
    if (!planId) return;
    setQuote(null);
    setQuoteError(false);
    supabase
      .rpc("quote_provider_plan", { p_plan_id: planId, p_billing_interval: billingCycle === "annual" ? "yearly" : "monthly" })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) { setQuoteError(true); return; }
        setQuote({ total_sar: Number(data.total_sar), monthly_rate_sar: Number(data.monthly_rate_sar), months: Number(data.months) });
      });
    return () => { cancelled = true; };
  }, [activePlanId, billingCycle]);

  const handleSelectPlan = (plan: string) => {
    setSelectedPlan(plan);
    setCheckoutStep("idle");
    setCheckoutError("");
    setTimeout(() => {
      checkoutRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCheckoutStep("processing");
    setCheckoutError("");

    const targetPlanId = activePlanId;
    if (!targetPlanId) return;
    const targetInterval = billingCycle === "annual" ? "yearly" : "monthly";

    try {
      let activeProviderId = providerId;
      if (!activeProviderId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setCheckoutError(t.signInFirst);
          setCheckoutStep("idle");
          return;
        }
        const { data: prov } = await supabase
          .from("providers")
          .select("id")
          .eq("owner_id", user.id)
          .maybeSingle();
        if (!prov) {
          setCheckoutError(t.noProvider);
          setCheckoutStep("idle");
          return;
        }
        activeProviderId = prov.id;
        setProviderId(prov.id);
      }

      const { data, error: rpcErr } = await supabase.rpc("subscribe_provider_plan", {
        p_provider_id: activeProviderId,
        p_plan_id: targetPlanId,
        p_billing_interval: targetInterval
      });

      if (rpcErr) throw rpcErr;

      // Free plans activate immediately; paid plans activate only after Tap confirms the payment.
      if (data?.status === "paid") {
        setCurrentSubscription({ plan_id: targetPlanId, billing_interval: targetInterval, status: "active" });
        setCheckoutStep("success");
        return;
      }
      const { data: checkout, error: checkoutError } = await supabase.functions.invoke("payment-checkout", {
        body: { purchaseType: "subscription", purchaseId: data.purchase_id }
      });
      if (checkoutError || !checkout?.checkoutUrl) {
        throw new Error(t.checkoutFailed);
      }
      window.location.assign(checkout.checkoutUrl);
    } catch (err: any) {
      console.error("Subscription error:", err);
      setCheckoutError(err?.message || t.subscribeFailed);
      setCheckoutStep("idle");
    }
  };

  const selected = plans?.find((plan) => plan.id === activePlanId);
  const selectedIsFree = selected ? Number(selected.price_monthly_sar) === 0 && Number(selected.price_yearly_sar) === 0 : false;
  const getPricingDetails = () => {
    const isAnnual = billingCycle === "annual";
    const title = planName(selected);
    // The amount charged is the server quote (annual billing = 12 x the monthly rate for annual billing); nothing is added on the screen.
    const total = quote ? quote.total_sar : null;
    return {
      title,
      subtotal: total,
      total,
      isAnnual
    };
  };

  const pricingDetails = getPricingDetails();

  // What each plan includes, from the plan record: the shared basics, the plan's feature switches and its limits.
  type Cell = boolean | string;
  const included = (value: boolean | undefined) => Boolean(value);
  const featureRows: { name: string; cell: (plan: Plan) => Cell }[] = [
    { name: t.featOnlineBooking, cell: () => true },
    { name: t.featZatca, cell: () => true },
    { name: t.featSms, cell: () => true },
    { name: t.featEscrow, cell: () => true },
    { name: t.featAnalytics, cell: (plan) => included(plan.features?.analytics) },
    { name: t.featMarketing, cell: (plan) => included(plan.features?.marketing) },
    { name: t.featSupport, cell: (plan) => included(plan.features?.dedicated_support) },
    { name: t.featBranches, cell: (plan) => (plan.max_branches === null ? "—" : count(plan.max_branches)) },
    { name: t.featStaff, cell: (plan) => (plan.max_employees === null ? "—" : count(plan.max_employees)) },
    { name: t.featSmsCount, cell: (plan) => (plan.included_monthly_sms === null ? "—" : count(plan.included_monthly_sms)) },
  ];

  return (
    <div 
      className="min-h-full bg-transparent text-[#344054] font-sans antialiased flex flex-col justify-between relative overflow-x-hidden"
      dir={locale === "ar" ? "rtl" : "ltr"}
    >
      {/* Aurora Ambient Gold/Onyx Lights */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-[#D1AF47]/5 blur-[120px] rounded-full pointer-events-none z-0" />
      <div className="absolute top-[40%] right-[-10%] w-[45%] h-[45%] bg-blue-500/5 blur-[150px] rounded-full pointer-events-none z-0" />
      <div className="absolute bottom-[-10%] left-[20%] w-[50%] h-[50%] bg-[#D1AF47]/5 blur-[120px] rounded-full pointer-events-none z-0" />

      {/* Mini Luxury Header */}
      <header className="border-b border-[#ECECEC] bg-transparent/80 backdrop-blur-md py-5 px-6 sm:px-12 flex items-center justify-between sticky top-0 z-50 transition-all duration-300">
        <Link 
          href="/" 
          className="text-xl font-serif font-black tracking-[0.2em] text-[#D1AF47] hover:opacity-95 transition-opacity"
        >
          PRIMORA
        </Link>
        <Link 
          href="/" 
          className="text-xs font-semibold uppercase tracking-wider text-[#344054] hover:text-[#101828] hover:border-[#D1AF47]/50 border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] px-4 py-2 rounded-full transition-all duration-300"
        >
          {t.backHome}
        </Link>
      </header>

      {/* Main Content Container */}
      <main className="max-w-6xl mx-auto py-16 px-4 sm:px-8 space-y-16 flex-1 z-10 w-full">
        
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <span className="text-[10px] tracking-[0.25em] uppercase font-bold text-[#9B7928] bg-[#D1AF47]/10 px-3 py-1 rounded-full border border-[#D1AF47]/20 inline-block">
            {t.eyebrow}
          </span>
          <h1 className="text-3xl sm:text-5xl font-serif text-[#101828] tracking-tight leading-tight">
            {t.title}
          </h1>
          <p className="text-xs sm:text-sm text-[#667085] leading-relaxed max-w-2xl mx-auto">
            {t.subtitle}
          </p>
        </div>

        {/* Billing cycle */}
        <div className="flex justify-center items-center gap-4 py-2">
          <span className={`text-xs sm:text-sm ${billingCycle === "monthly" ? "text-[#101828] font-medium" : "text-[#667085]"}`}>{t.billingMonthly}</span>
          <button
            type="button"
            role="switch"
            aria-checked={billingCycle === "annual"}
            aria-label={t.billingSwitch}
            onClick={() => setBillingCycle(billingCycle === "monthly" ? "annual" : "monthly")}
            className="w-14 h-8 bg-white border border-[#D0D5DD] rounded-full p-1 relative cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B7928]"
          >
            <span
              aria-hidden="true"
              className={`block w-6 h-6 rounded-full bg-[#D1AF47] transition-transform duration-300 ${
                billingCycle === "annual" ? (locale === "ar" ? "-translate-x-6" : "translate-x-6") : "translate-x-0"
              }`}
            />
          </button>
          <span className={`text-xs sm:text-sm ${billingCycle === "annual" ? "text-[#9B7928] font-medium" : "text-[#667085]"}`}>{t.billingAnnual}</span>
        </div>

        {/* Plans, from subscription_plans */}
        {plansError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <span>{fill(t.plansFailed, { reason: plansError })}</span>
            <button type="button" onClick={() => setPlansReload((k) => k + 1)} className="rounded-xl border border-red-300 bg-white px-3 py-1.5 text-xs font-black focus-visible:outline-2 focus-visible:outline-[#9B7928]">{t.retry}</button>
          </div>
        ) : !plans ? (
          <p role="status" className="text-center text-sm text-[#667085]">{t.plansLoading}</p>
        ) : plans.length === 0 ? (
          <p className="text-center text-sm text-[#667085]">{t.plansEmpty}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {plans.map((plan) => {
              const monthly = Number(plan.price_monthly_sar);
              const yearlyRate = Number(plan.price_yearly_sar);
              const rate = billingCycle === "annual" ? yearlyRate : monthly;
              const free = monthly === 0 && yearlyRate === 0;
              const saving = Math.round((monthly - yearlyRate) * 12 * 100) / 100;
              const isSelected = plan.id === activePlanId;
              const isCurrent = currentSubscription?.plan_id === plan.id;
              return (
                <section
                  key={plan.id}
                  aria-labelledby={`plan-${plan.id}`}
                  className={`rounded-[24px] p-6 relative overflow-hidden flex flex-col justify-between bg-white border shadow-[0_8px_30px_rgb(0,0,0,0.015)] ${isSelected ? "border-2 border-[#D1AF47]" : "border-[#ECECEC]"}`}
                >
                  <div className="space-y-4">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <h3 id={`plan-${plan.id}`} className="text-lg font-bold text-[#101828] tracking-wide">{planName(plan)}</h3>
                        {t.descriptions[plan.id] && <p className="text-xs text-[#667085] mt-1">{t.descriptions[plan.id]}</p>}
                      </div>
                      {isSelected && (
                        <span className="shrink-0 bg-[#D1AF47]/10 text-[#7A5B12] text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border border-[#D1AF47]/20">{t.selected}</span>
                      )}
                    </div>
                    <div className="pt-2">
                      <span className="text-3xl font-black text-[#101828]">{free ? t.free : money(rate)}</span>
                      {!free && <span className="text-xs text-[#667085] ms-1">{t.perMonth}</span>}
                      {!free && (
                        <div className="text-[11px] text-[#667085] font-semibold mt-1">
                          {billingCycle === "annual" ? fill(t.billedYearly, { total: money(Math.round(yearlyRate * 12 * 100) / 100) }) : t.billedMonthly}
                        </div>
                      )}
                      {!free && billingCycle === "annual" && saving > 0 && (
                        <div className="text-[11px] text-[#067647] font-semibold mt-1">{fill(t.saving, { amount: money(saving) })}</div>
                      )}
                    </div>
                    <ul className="border-t border-[#ECECEC] pt-4 space-y-2 text-xs text-[#344054]">
                      <li className="flex items-center gap-2"><span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-[#D1AF47]" />{t.planFeeNote}</li>
                      {plan.max_branches !== null && <li className="flex items-center gap-2"><span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-[#3DDC84]" />{fill(t.upToBranches, { n: count(plan.max_branches) })}</li>}
                      {plan.max_employees !== null && <li className="flex items-center gap-2"><span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-[#3DDC84]" />{fill(t.upToStaff, { n: count(plan.max_employees) })}</li>}
                      {plan.included_monthly_sms !== null && <li className="flex items-center gap-2"><span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-[#3DDC84]" />{fill(t.smsIncluded, { n: count(plan.included_monthly_sms) })}</li>}
                    </ul>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSelectPlan(plan.id)}
                    aria-pressed={isSelected}
                    className={`w-full py-2.5 mt-8 rounded-xl text-xs font-bold tracking-wider focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B7928] ${isSelected ? "bg-[#D1AF47] text-[#070B12]" : "bg-[#FBFAF7] text-[#344054] border border-[#ECECEC] hover:border-[#D1AF47]/40"}`}
                  >
                    {isCurrent ? t.currentPlan : isSelected ? t.selected : t.selectPlan}
                  </button>
                </section>
              );
            })}
          </div>
        )}

        {/* Plan comparison, from the plan records */}
        {plans && plans.length > 0 && (
          <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] rounded-[24px] p-6 md:p-8 space-y-6">
            <h2 className="text-lg font-bold text-[#101828] tracking-wide">{t.featuresTitle}</h2>
            <div className="overflow-x-auto" role="region" aria-label={t.featuresTitle} tabIndex={0}>
              <table className="w-full border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-[#ECECEC] text-[#667085]">
                    <th scope="col" className="py-4 font-semibold text-start w-1/2">{t.feature}</th>
                    {plans.map((plan) => <th key={plan.id} scope="col" className="py-4 font-semibold text-center">{planName(plan)}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F2F4F7]">
                  {featureRows.map((row) => (
                    <tr key={row.name}>
                      <th scope="row" className="py-4 font-medium text-[#101828] text-start">{row.name}</th>
                      {plans.map((plan) => {
                        const value = row.cell(plan);
                        return (
                          <td key={plan.id} className="py-4 text-center">
                            {typeof value === "string" ? <span className="font-semibold text-[#101828]">{value}</span>
                              : value ? <><span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-full bg-[#3DDC84]" /><span className="sr-only">{t.included}</span></>
                              : <><span aria-hidden="true" className="text-[#667085]">—</span><span className="sr-only">{t.notIncluded}</span></>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Transaction Split Calculator & Commission Breakdown */}
        <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] border border-[rgba(255,255,255,0.06)] rounded-[28px] p-6 sm:p-10 space-y-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#D1AF47]/5 blur-2xl rounded-full" />
          
          <div className="text-center space-y-2">
            <h2 className="text-xl font-bold text-[#101828] uppercase tracking-wide">
              {t.pricingModel}
            </h2>
            <p className="text-xs text-[#667085] max-w-xl mx-auto">{t.pricingModelIntro}</p>
          </div>
          
          {/* D-D3: the effective platform fee from the fee rules in force, VAT on the fee and a worked example (no fixed split). */}
          <EffectiveFeeTerms locale={locale} mode="provider" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
            <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] p-6 rounded-2xl border border-[rgba(255,255,255,0.04)] space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#D1AF47]" />
                <h4 className="font-bold text-xs text-[#101828] uppercase tracking-wider">{t.platformFee}</h4>
              </div>
              <p className="text-xs text-[#667085] leading-relaxed">
                {t.feeDesc}
              </p>
            </div>

            <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] p-6 rounded-2xl border border-[rgba(255,255,255,0.04)] space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#3DDC84]" />
                <h4 className="font-bold text-xs text-[#101828] uppercase tracking-wider">{t.partnerPayout}</h4>
              </div>
              <p className="text-xs text-[#667085] leading-relaxed">
                {t.payoutDesc}
              </p>
            </div>
          </div>

          {/* Zero setup callout */}
          <div className="bg-[rgba(209,175,71,0.03)] border border-[#D1AF47]/20 p-6 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="space-y-1">
              <h4 className="font-bold text-xs text-[#101828] uppercase tracking-wider">{t.noUpfront}</h4>
              <p className="text-xs text-[#667085] max-w-xl">{t.noUpfrontDesc}</p>
            </div>
            <span className="text-xs font-bold text-[#7A5B12] bg-[#D1AF47]/10 px-3 py-1.5 rounded-lg border border-[#D1AF47]/20 whitespace-nowrap">{t.noCard}</span>
          </div>

          {/* Localized Saudi Fintech details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-[rgba(255,255,255,0.04)] text-xs text-[#667085]">
            <div className="space-y-1">
              <h5 className="font-bold text-[#101828]">{t.splitTitle}</h5>
              <p>{t.splitSubtitle}</p>
            </div>
            <div className="space-y-1">
              <h5 className="font-bold text-[#101828]">{t.payoutTimeline}</h5>
              <p>{t.payoutTimelineDesc}</p>
            </div>
          </div>

        </div>

        {/* Subscription checkout: the amount is the server quote; payment happens on Tap's page */}
        <div 
          ref={checkoutRef} 
          className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] border border-[rgba(255,255,255,0.06)] rounded-[28px] p-6 sm:p-10 space-y-8 relative overflow-hidden"
        >
          {/* Top light */}
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#D1AF47]/50 to-transparent" />
          
          <div className="space-y-2">
            <h3 className="text-lg sm:text-xl font-bold text-[#101828] tracking-wide flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#3DDC84] animate-pulse" />
              {t.checkoutTitle}
            </h3>
            <p className="text-xs text-[#667085]">
              {t.checkoutSubtitle}
            </p>
          </div>

          {checkoutStep === "success" ? (
            <div className="text-center py-12 px-4 space-y-6 max-w-md mx-auto">
              <div className="w-16 h-16 bg-[#3DDC84]/10 border border-[#3DDC84]/30 rounded-full flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(61,220,132,0.15)]">
                <svg className="w-8 h-8 text-[#22C55E]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="space-y-2">
                <h4 className="text-xl font-bold text-[#101828]">{t.successMsg}</h4>
                <p className="text-xs text-[#667085]">{fill(t.successBody, { plan: pricingDetails.title })}</p>
              </div>
              <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] p-4 rounded-xl text-xs space-y-2 border border-[rgba(255,255,255,0.04)] text-start">
                <div className="flex justify-between text-[#101828] font-medium">
                  <span>{t.activePlan}</span>
                  <span className="text-[#D1AF47]">{pricingDetails.title}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t.billingCycle}</span>
                  <span>{pricingDetails.isAnnual ? t.billingAnnual : t.billingMonthly}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t.amountPaid}</span>
                  <span className="text-[#101828] font-bold">{pricingDetails.total !== null ? money(pricingDetails.total) : t.quoteUnavailable}</span>
                </div>
              </div>
              <button 
                onClick={() => setCheckoutStep("idle")}
                className="px-6 py-2.5 rounded-full text-xs font-bold bg-[#D1AF47] text-[#070B12] hover:bg-[#E0C46A] transition-all duration-300"
              >
                {t.manage}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              
              {/* Form Input fields */}
              <form onSubmit={handleCheckoutSubmit} className="lg:col-span-7 space-y-6">
                {checkoutError && (
                  <div role="alert" className="bg-[#FEF3F2] border border-[#EF4444]/20 text-[#B42318] text-xs rounded-xl p-4 font-semibold">
                    {checkoutError}
                  </div>
                )}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-[#101828] uppercase tracking-wider">{t.paymentMethod}</h4>
                  
                  {/* Select Payment Type Header */}
                  <ul className="grid grid-cols-3 gap-3">
                    {(["mada", "applePay", "card"] as const).map((method) => (
                      <li key={method} className="border border-[#ECECEC] bg-white p-3 rounded-xl text-center text-[11px] font-bold text-[#101828]">{t.methods[method]}</li>
                    ))}
                  </ul>
                </div>

                {selectedIsFree ? (
                  <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] rounded-xl p-6 text-center space-y-2 text-xs">
                    <p className="text-[#101828] font-medium">{t.freeTitle}</p>
                    <p className="text-[#667085]">{t.freeBody}</p>
                  </div>
                ) : (
                  <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] rounded-xl p-6 space-y-4 text-xs">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#D1AF47]/10 flex items-center justify-center shrink-0 mt-0.5">
                        <svg className="w-4 h-4 text-[#D1AF47]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </div>
                      <div className="space-y-1">
                        <h5 className="font-bold text-[#101828]">{t.tapTitle}</h5>
                        <p className="text-[#667085] leading-relaxed">
                          {t.secureGatewayNotice}
                        </p>
                      </div>
                    </div>
                    <div className="border-t border-[#ECECEC] pt-3 text-[11px] text-[#667085] flex flex-wrap gap-2 items-center">
                      <span className="font-semibold text-[#101828]">{t.acceptedMethods}</span>
                      {(["mada", "applePay", "card"] as const).map((method) => <span key={method} className="bg-gray-100 text-[#344054] px-2 py-0.5 rounded">{t.methods[method]}</span>)}
                    </div>
                  </div>
                )}

                <button 
                  type="submit"
                  disabled={checkoutStep === "processing" || !selected}
                  className="w-full bg-[#D1AF47] hover:bg-[#E0C46A] disabled:opacity-50 text-[#070B12] py-3.5 rounded-xl text-xs font-bold tracking-wider transition-all duration-300 flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(209,175,71,0.2)]"
                >
                  {checkoutStep === "processing" ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-[#070B12]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>{t.processing}</span>
                    </>
                  ) : (
                    <span>{selectedIsFree ? t.activateFree : t.payNow}</span>
                  )}
                </button>
              </form>

              {/* Order Summary & Security Assurance */}
              <div className="lg:col-span-5 space-y-8">
                
                {/* Security Assurance Card */}
                <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] rounded-[20px] p-6 space-y-4">
                  <div className="flex items-center gap-3 border-b border-[#ECECEC] pb-3">
                    <div className="w-9 h-9 rounded-full bg-[#3DDC84]/10 border border-[#3DDC84]/20 flex items-center justify-center text-[#22C55E]">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[#101828]">{t.hostedTitle}</h4>
                      <p className="text-[10px] text-[#667085]">{t.hostedBody}</p>
                    </div>
                  </div>
                  <ul className="text-xs space-y-2 text-[#667085]">
                    {t.assurance.map((line) => (
                      <li key={line} className="flex items-center gap-2"><span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-[#3DDC84]" /><span>{line}</span></li>
                    ))}
                  </ul>
                </div>

                {/* Billing Summary List */}
                <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] rounded-[20px] p-6 space-y-4">
                  <h4 className="text-xs font-bold text-[#101828] uppercase tracking-wider border-b border-[#ECECEC] pb-3">
                    {t.summary}
                  </h4>
                  
                  <div className="space-y-3 text-xs">
                    <div className="flex justify-between text-[#667085]">
                      <span>{t.selectedPlanLabel}</span>
                      <span className="text-[#101828] font-medium">{pricingDetails.title}</span>
                    </div>
                    <div className="flex justify-between text-[#667085]">
                      <span>{t.billingCycleLabel}</span>
                      <span className="text-[#101828] font-medium">
                        {pricingDetails.isAnnual ? t.billingAnnual : t.billingMonthly}
                      </span>
                    </div>
                    
                    <div className="border-t border-[rgba(255,255,255,0.04)] my-2" />
                    
                    <div className="flex justify-between text-[#667085]">
                      <span>{t.subtotal}</span>
                      <span className="text-[#101828] font-medium">{pricingDetails.subtotal !== null ? money(pricingDetails.subtotal) : (quoteError ? t.quoteUnavailable : "…")}</span>
                    </div>

                    <div className="border-t border-[#D1AF47]/20 pt-3 flex justify-between text-sm">
                      <span className="text-[#101828] font-bold">{t.total}</span>
                      <span className="text-[#D1AF47] font-black">{pricingDetails.total !== null ? money(pricingDetails.total) : (quoteError ? t.quoteUnavailable : "…")}</span>
                    </div>
                  </div>
                </div>

              </div>

            </div>
          )}
        </div>

      </main>

      {/* Footer */}
      <footer className="bg-transparent/80 border-t border-[#ECECEC] py-8 text-center text-xs text-[#667085] font-medium z-10 relative">
        <p>© {new Date().getFullYear()} PRIMORA. {t.footerText}</p>
      </footer>

    </div>
  );
}

