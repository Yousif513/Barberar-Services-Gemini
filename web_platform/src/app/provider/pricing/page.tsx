"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";

const translations = {
  en: {
    backHome: "Back to Home",
    title: "Split Ledger & Commission Pricing",
    subtitle: "Transparent fee splits, escrow security holds, and zero upfront platform costs",
    pricingModel: "How We Calculate Transaction Splits",
    platformFee: "Platform Commission",
    partnerPayout: "Partner Payout Share",
    feeDesc: "Primora collects a flat 15% commission fee on every booking. This fee completely covers ZATCA e-invoicing compliance, Tap Connect transaction fees, SMS alerts, and secure escrow holds. No monthly subscription is required for basic accounts.",
    payoutDesc: "The remaining 85% is routed straight to your salon's local bank account. As soon as the customer's appointment is completed and marked off in your dashboard calendar, the ledger releases the funds instantly.",
    noUpfront: "Zero Setup or Upfront Fees",
    noUpfrontDesc: "Registering, listing your services catalog, and setting up staff availability calendars are 100% free. We only succeed when you acquire bookings.",
    footerText: "Built for Riyadh, Saudi Arabia. All rights reserved.",
    
    // Subscriptions & Features
    billingMonthly: "Monthly Billing",
    billingAnnual: "Annual Billing (Save 20%)",
    popular: "Most Popular",
    selectPlan: "Select Plan",
    currentPlan: "Current Plan",
    selected: "Selected",
    billingCycleLabel: "Billing Cycle",
    
    // Plan details
    basicName: "Lite Starter",
    basicPrice: "0",
    basicPriceAnnual: "0",
    basicDesc: "Perfect for independent artists & newly opened local salons",
    
    growthName: "Growth Pro",
    growthPrice: "299",
    growthPriceAnnual: "239",
    growthDesc: "For scaling salons needing advanced analytics and marketing integrations",
    
    eliteName: "Elite Salon",
    elitePrice: "799",
    elitePriceAnnual: "639",
    eliteDesc: "For luxury salon chains requiring dedicated managers & bespoke APIs",
    
    sar: "SAR",
    perMonth: "SAR / month",
    perYear: "SAR / year",
    billedAnnually: "Billed annually",
    billedMonthly: "Billed monthly",
    freeForever: "Free Forever",
    
    // Feature titles
    featuresTitle: "Compare Plan Features",
    featOnlineBooking: "Online Booking & Scheduling",
    featZatca: "ZATCA E-Invoicing Compliance",
    featSms: "SMS Alerts & Reminders",
    featEscrow: "Secure Escrow Hold & Split Ledger",
    featAnalytics: "Advanced Business Analytics",
    featMarketing: "Marketing Tools & Coupons",
    featStaff: "Staff Management (Unlimited)",
    featSupport: "24/7 Dedicated Account Manager",

    // Split Ledger Details
    splitTitle: "Saudi Fintech Compliant Ledger",
    splitSubtitle: "All payments are processed through Tap Payments API & secured under local SAMA regulations.",
    payoutTimeline: "Instant Payout Timeline",
    payoutTimelineDesc: "Completed appointments trigger automated payout transfers directly into your registered local IBAN (Riyad Bank, SNB, Al Rajhi, etc.) in under 5 minutes.",
    securedEscrow: "Escrow Protection",
    securedEscrowDesc: "Guards against customer no-shows and salon cancellations with automatic refund policies.",
    
    // Checkout Mock
    checkoutTitle: "Secure Account Activation",
    checkoutSubtitle: "Experience modern, frictionless onboarding tailored for Saudi fintech standards.",
    paymentMethod: "Payment Method",
    madaApplePay: "Mada / Apple Pay / Credit Card",
    cardNumber: "Card Number",
    expiry: "Expiry Date (MM/YY)",
    cvv: "CVV",
    cardholder: "Cardholder Name",
    summary: "Order Summary",
    subtotal: "Subtotal",
    vat: "VAT (15%)",
    total: "Total Due",
    payNow: "Activate & Secure Account",
    processing: "Processing secure escrow split configuration...",
    successMsg: "Plan activated successfully! Redirection configured.",
    mockCardWarning: "This is a simulated payment screen compliant with Tap integration guidelines.",
    inputPlaceholderCard: "4000 1234 5678 9010",
    inputPlaceholderExpiry: "12/28",
    inputPlaceholderCvv: "123",
    inputPlaceholderName: "LUXURY SALON OWNER",
  },
  ar: {
    backHome: "العودة للرئيسية",
    title: "خطط نمو الشركاء والأسعار",
    subtitle: "تقسيمات رسوم شفافة، وضمان حجز آمن، وبدون أي تكاليف تأسيس مسبقة",
    pricingModel: "كيف نحسب تقسيمات العمليات المالية",
    platformFee: "عمولة المنصة",
    partnerPayout: "حصة الشريك ومقدم الخدمة",
    feeDesc: "تقتطع بريمورا عمولة ثابتة بنسبة 15% على كل حجز. تغطي هذه الرسوم بالكامل امتثال هيئة الزكاة (الفاتورة الإلكترونية)، ورسوم معالجة المعاملات لمدفوعات مدى وفيزا، وتنبيهات الجوال، وإدارة الضمان الآمن. لا يتطلب الاشتراك في الحساب الأساسي أي رسوم شهرية.",
    payoutDesc: "يتم توجيه الـ 85% المتبقية مباشرة إلى الحساب البنكي لصالونك أو عملك. بمجرد اكتمال موعد العميل ووضع علامة اكتمال في تقويم لوحة التحكم الخاصة بك، يقوم نظام الدفع بتحرير الأموال فوراً.",
    noUpfront: "بدون أي رسوم إعداد أو تأسيس مسبقة",
    noUpfrontDesc: "التسجيل، وإدراج قائمة خدماتك، وإعداد تقويم توافر موظفيك مجاني 100%. نحن ننجح فقط عندما تستقبل حجوزات فعلية.",
    footerText: "صمم خصيصاً للرياض، المملكة العربية السعودية. جميع الحقوق محفوظة.",
    
    // Subscriptions & Features
    billingMonthly: "دفع شهري",
    billingAnnual: "دفع سنوي (وفر 20%)",
    popular: "الأكثر طلباً",
    selectPlan: "اختر الخطة",
    currentPlan: "الخطة الحالية",
    selected: "مختار",
    billingCycleLabel: "دورة الفوترة",
    
    // Plan details
    basicName: "لايت للمبتدئين",
    basicPrice: "0",
    basicPriceAnnual: "0",
    basicDesc: "مثالي للمحترفين المستقلين والصالونات المحلية الجديدة",
    
    growthName: "برو للنمو",
    growthPrice: "299",
    growthPriceAnnual: "239",
    growthDesc: "للصالونات الطموحة التي تحتاج تحليلات متقدمة وأدوات تسويق",
    
    eliteName: "النخبة الفاخرة",
    elitePrice: "799",
    elitePriceAnnual: "639",
    eliteDesc: "لسلاسل الصالونات الفاخرة التي تتطلب ميزات خاصة ومدير حساب مخصص",
    
    sar: "ريال",
    perMonth: "ريال / شهرياً",
    perYear: "ريال / سنوياً",
    billedAnnually: "فوترة سنوية",
    billedMonthly: "فوترة شهرية",
    freeForever: "مجاني للأبد",
    
    // Feature titles
    featuresTitle: "قارن بين ميزات الخطط",
    featOnlineBooking: "الحجز والجدولة عبر الإنترنت",
    featZatca: "الربط مع هيئة الزكاة والضريبة والجمارك",
    featSms: "رسائل التنبيهات والتذكير SMS",
    featEscrow: "نظام الضمان المالي والتقسيم الفوري",
    featAnalytics: "تحليلات وأداء الأعمال المتقدمة",
    featMarketing: "أدوات التسويق والكوبونات والخصومات",
    featStaff: "إدارة الموظفين (غير محدود)",
    featSupport: "مدير حساب مخصص متوفر 24/7",

    // Split Ledger Details
    splitTitle: "نظام تسوية مالي متوافق مع الفينتك السعودي",
    splitSubtitle: "تتم معالجة جميع المدفوعات من خلال بوابة Tap للمدفوعات وحمايتها بموجب لوائح البنك المركزي السعودي (SAMA).",
    payoutTimeline: "جدول التسوية الفورية للمستحقات",
    payoutTimelineDesc: "تؤدي المواعيد المكتملة إلى تحويلات تلقائية ومباشرة للمستحقات إلى حسابك المصرفي المحلي المسجل (بنك الرياض، الأهلي SNB، الراجحي، إلخ) خلال أقل من 5 دقائق.",
    securedEscrow: "حماية الضمان المالي والوديعة",
    securedEscrowDesc: "حماية كاملة ضد عدم حضور العملاء وإلغاء الصالون مع سياسات استرداد تلقائية وذكية.",
    
    // Checkout Mock
    checkoutTitle: "تفعيل الحساب الآمن",
    checkoutSubtitle: "استمتع بتجربة دفع وسداد آمنة وسهلة متوافقة مع معايير المدفوعات السعودية.",
    paymentMethod: "طريقة الدفع",
    madaApplePay: "مدى / أبل باي / بطاقة ائتمان",
    cardNumber: "رقم البطاقة",
    expiry: "تاريخ الانتهاء (MM/YY)",
    cvv: "الرمز السري (CVV)",
    cardholder: "اسم صاحب البطاقة",
    summary: "ملخص الطلب",
    subtotal: "المجموع الفرعي",
    vat: "ضريبة القيمة المضافة (15%)",
    total: "المبلغ الإجمالي",
    payNow: "تفعيل الخطة والاشتراك الآمن",
    processing: "جاري إعداد تهيئة تقسيم الضمان الآمن للشبكة...",
    successMsg: "تم تفعيل الخطة بنجاح! تم حفظ إعدادات الحساب.",
    mockCardWarning: "هذه شاشة دفع تجريبية متوافقة مع إرشادات دمج بوابة Tap للمدفوعات.",
    inputPlaceholderCard: "4000 1234 5678 9010",
    inputPlaceholderExpiry: "12/28",
    inputPlaceholderCvv: "123",
    inputPlaceholderName: "LUXURY SALON OWNER",
  }
};

export default function PricingPage() {
  const [locale, setLocale] = useState<"en" | "ar">("ar");
  const t = translations[locale];

  // Subscription Selection & Billing States
  const [selectedPlan, setSelectedPlan] = useState<"basic" | "growth" | "elite">("growth");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  
  // Interactive Checkout Mock States
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [cardholder, setCardholder] = useState("");
  const [checkoutStep, setCheckoutStep] = useState<"idle" | "processing" | "success">("idle");

  const checkoutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleLangSync = () => {
      const currentLang = document.documentElement.lang as "en" | "ar";
      if (currentLang === "en" || currentLang === "ar") {
        setLocale(currentLang);
      }
    };
    handleLangSync();
    const interval = setInterval(handleLangSync, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSelectPlan = (plan: "basic" | "growth" | "elite") => {
    setSelectedPlan(plan);
    setCheckoutStep("idle");
    setTimeout(() => {
      checkoutRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, "");
    if (value.length > 16) value = value.substring(0, 16);
    const formatted = value.replace(/(\d{4})(?=\d)/g, "$1 ");
    setCardNumber(formatted);
  };

  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, "");
    if (value.length > 4) value = value.substring(0, 4);
    if (value.length >= 3) {
      value = value.substring(0, 2) + "/" + value.substring(2);
    }
    setExpiry(value);
  };

  const handleCvvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, "");
    if (value.length > 3) value = value.substring(0, 3);
    setCvv(value);
  };

  const handleCardholderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCardholder(e.target.value);
  };

  const handleCheckoutSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedPlan === "basic") {
      setCheckoutStep("processing");
      setTimeout(() => {
        setCheckoutStep("success");
      }, 1800);
      return;
    }
    if (!cardNumber || !expiry || !cvv || !cardholder) {
      alert(locale === "en" ? "Please fill in all payment details." : "يرجى تعبئة جميع بيانات الدفع.");
      return;
    }
    setCheckoutStep("processing");
    setTimeout(() => {
      setCheckoutStep("success");
    }, 2500);
  };

  // Pricing calculations based on selections
  const getPricingDetails = () => {
    const isAnnual = billingCycle === "annual";
    let basePricePerMonth = 0;
    let title = "";
    
    if (selectedPlan === "basic") {
      basePricePerMonth = 0;
      title = t.basicName;
    } else if (selectedPlan === "growth") {
      basePricePerMonth = isAnnual ? 239 : 299;
      title = t.growthName;
    } else if (selectedPlan === "elite") {
      basePricePerMonth = isAnnual ? 639 : 799;
      title = t.eliteName;
    }

    const subtotal = isAnnual ? basePricePerMonth * 12 : basePricePerMonth;
    const vat = parseFloat((subtotal * 0.15).toFixed(2));
    const total = parseFloat((subtotal + vat).toFixed(2));

    return {
      title,
      basePricePerMonth,
      subtotal,
      vat,
      total,
      isAnnual
    };
  };

  const pricingDetails = getPricingDetails();

  // Comparison features matrix helper
  const features = [
    { name: t.featOnlineBooking, basic: true, growth: true, elite: true },
    { name: t.featZatca, basic: true, growth: true, elite: true },
    { name: t.featSms, basic: true, growth: true, elite: true },
    { name: t.featEscrow, basic: true, growth: true, elite: true },
    { name: t.featAnalytics, basic: false, growth: true, elite: true },
    { name: t.featMarketing, basic: false, growth: true, elite: true },
    { name: t.featStaff, basic: false, growth: true, elite: true },
    { name: t.featSupport, basic: false, growth: false, elite: true },
  ];

  return (
    <div 
      className="min-h-screen bg-transparent text-[#B8C0D4] font-sans antialiased flex flex-col justify-between relative overflow-x-hidden"
      dir={locale === "ar" ? "rtl" : "ltr"}
    >
      {/* Aurora Ambient Gold/Onyx Lights */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-[#D1AF47]/5 blur-[120px] rounded-full pointer-events-none z-0" />
      <div className="absolute top-[40%] right-[-10%] w-[45%] h-[45%] bg-blue-500/5 blur-[150px] rounded-full pointer-events-none z-0" />
      <div className="absolute bottom-[-10%] left-[20%] w-[50%] h-[50%] bg-[#D1AF47]/5 blur-[120px] rounded-full pointer-events-none z-0" />

      {/* Mini Luxury Header */}
      <header className="border-b border-white/[0.06] bg-[#070B12]/80 backdrop-blur-md py-5 px-6 sm:px-12 flex items-center justify-between sticky top-0 z-50 transition-all duration-300">
        <Link 
          href="/" 
          className="text-xl font-serif font-black tracking-[0.2em] text-[#D1AF47] hover:opacity-95 transition-opacity"
        >
          PRIMORA
        </Link>
        <Link 
          href="/" 
          className="text-xs font-semibold uppercase tracking-wider text-[#B8C0D4] hover:text-[#FFFFFF] hover:border-[#D1AF47]/50 border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] px-4 py-2 rounded-full transition-all duration-300"
        >
          {t.backHome}
        </Link>
      </header>

      {/* Main Content Container */}
      <main className="max-w-6xl mx-auto py-16 px-4 sm:px-8 space-y-16 flex-1 z-10 w-full">
        
        {/* Title Section */}
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <span className="text-[10px] tracking-[0.25em] uppercase font-bold text-[#D1AF47] bg-[#D1AF47]/10 px-3 py-1 rounded-full border border-[#D1AF47]/20 inline-block">
            {locale === "en" ? "For Premium Partners" : "شركاء الفخامة"}
          </span>
          <h1 className="text-3xl sm:text-5xl font-serif text-[#FFFFFF] tracking-tight leading-tight">
            {t.title}
          </h1>
          <p className="text-xs sm:text-sm text-[#7B859C] leading-relaxed max-w-2xl mx-auto">
            {t.subtitle}
          </p>
        </div>

        {/* Plan Activation Billing Cycle Toggle */}
        <div className="flex justify-center items-center gap-4 py-2">
          <span className={`text-xs sm:text-sm transition-colors duration-300 ${billingCycle === "monthly" ? "text-white font-medium" : "text-[#7B859C]"}`}>
            {t.billingMonthly}
          </span>
          <button
            onClick={() => setBillingCycle(billingCycle === "monthly" ? "annual" : "monthly")}
            className="w-14 h-8 bg-[#0D1422] rounded-full p-1 border border-[rgba(255,255,255,0.1)] transition-colors duration-300 relative focus:outline-none cursor-pointer"
            aria-label="Toggle Billing Cycle"
          >
            <div
              className={`w-6 h-6 rounded-full bg-[#D1AF47] shadow-[0_0_10px_rgba(209,175,71,0.5)] transition-all duration-300 transform ${
                billingCycle === "annual"
                  ? (locale === "ar" ? "translate-x-[-24px]" : "translate-x-[24px]")
                  : "translate-x-0"
              }`}
            />
          </button>
          <span className={`text-xs sm:text-sm transition-colors duration-300 ${billingCycle === "annual" ? "text-[#D1AF47] font-medium" : "text-[#7B859C]"}`}>
            {t.billingAnnual}
          </span>
        </div>

        {/* Subscription Plan Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* Card 1: Basic Lite */}
          <div 
            onClick={() => handleSelectPlan("basic")}
            className={`cursor-pointer rounded-[24px] p-6 relative overflow-hidden transition-all duration-300 hover:translate-y-[-4px] flex flex-col justify-between ${
              selectedPlan === "basic" 
                ? "bg-[#111827] border-2 border-[#D1AF47] shadow-[0_0_20px_rgba(209,175,71,0.1)]" 
                : "bg-[#0D1422] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.15)]"
            }`}
          >
            <div className="space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-bold text-white tracking-wide">{t.basicName}</h3>
                  <p className="text-xs text-[#7B859C] mt-1 line-clamp-2">{t.basicDesc}</p>
                </div>
                {selectedPlan === "basic" && (
                  <span className="bg-[#D1AF47]/10 text-[#D1AF47] text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border border-[#D1AF47]/20">
                    {t.selected}
                  </span>
                )}
              </div>
              <div className="pt-4">
                <span className="text-3xl font-black text-white">{t.basicPrice}</span>
                <span className="text-xs text-[#7B859C] ml-1 mr-1">
                  {billingCycle === "annual" ? t.perYear : t.perMonth}
                </span>
                <div className="text-[10px] text-[#D1AF47] font-semibold mt-1">
                  {t.freeForever}
                </div>
              </div>
              <div className="border-t border-[rgba(255,255,255,0.06)] pt-4 space-y-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#D1AF47]" />
                  <span>15% {t.platformFee}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-[#7B859C]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#7B859C]/40" />
                  <span>{t.featOnlineBooking}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-[#7B859C]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#7B859C]/40" />
                  <span>{t.featEscrow}</span>
                </div>
              </div>
            </div>
            <button 
              className={`w-full py-2.5 mt-8 rounded-xl text-xs font-bold tracking-wider transition-all duration-300 ${
                selectedPlan === "basic" 
                  ? "bg-[#D1AF47] text-[#070B12]" 
                  : "bg-white/5 hover:bg-white/10 text-white border border-[rgba(255,255,255,0.08)]"
              }`}
            >
              {selectedPlan === "basic" ? t.currentPlan : t.selectPlan}
            </button>
          </div>

          {/* Card 2: Growth Pro (Featured) */}
          <div 
            onClick={() => handleSelectPlan("growth")}
            className={`cursor-pointer rounded-[24px] p-6 relative overflow-hidden transition-all duration-300 hover:translate-y-[-4px] flex flex-col justify-between ${
              selectedPlan === "growth" 
                ? "bg-[#111827] border-2 border-[#D1AF47] shadow-[0_0_25px_rgba(209,175,71,0.2)]" 
                : "bg-gradient-to-b from-[#111827] to-[#0D1422] border border-[#D1AF47]/30 shadow-[0_0_20px_rgba(209,175,71,0.08)] hover:border-[#D1AF47]/60"
            }`}
          >
            {/* Glass shine & Popular tag */}
            <div className="absolute top-0 right-0 bg-gradient-to-l from-[#D1AF47] to-[#E0C46A] text-[#070B12] text-[9px] uppercase font-black tracking-widest px-4 py-1.5 rounded-bl-[12px] shadow-sm">
              {t.popular}
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-start pr-16">
                <div>
                  <h3 className="text-lg font-bold text-white tracking-wide">{t.growthName}</h3>
                  <p className="text-xs text-[#7B859C] mt-1 line-clamp-2">{t.growthDesc}</p>
                </div>
              </div>
              <div className="pt-4">
                <span className="text-3xl font-black text-white">
                  {billingCycle === "annual" ? t.growthPriceAnnual : t.growthPrice}
                </span>
                <span className="text-xs text-[#7B859C] ml-1 mr-1">
                  {t.sar} {billingCycle === "annual" ? t.perMonth : t.perMonth}
                </span>
                <div className="text-[10px] text-[#3DDC84] font-semibold mt-1">
                  {billingCycle === "annual" ? "Save 720 SAR / year" : "Standard Month Rate"}
                </div>
              </div>
              <div className="border-t border-[rgba(255,255,255,0.06)] pt-4 space-y-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#D1AF47] shadow-[0_0_6px_rgba(209,175,71,0.8)]" />
                  <span>10% {t.platformFee} (Discounted!)</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-[#B8C0D4]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#3DDC84]" />
                  <span>{t.featAnalytics}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-[#B8C0D4]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#3DDC84]" />
                  <span>{t.featMarketing}</span>
                </div>
              </div>
            </div>
            <button 
              className={`w-full py-2.5 mt-8 rounded-xl text-xs font-bold tracking-wider transition-all duration-300 ${
                selectedPlan === "growth" 
                  ? "bg-[#D1AF47] text-[#070B12] shadow-[0_0_15px_rgba(209,175,71,0.3)]" 
                  : "bg-[#D1AF47]/10 hover:bg-[#D1AF47]/20 text-[#D1AF47] border border-[#D1AF47]/20"
              }`}
            >
              {selectedPlan === "growth" ? t.currentPlan : t.selectPlan}
            </button>
          </div>

          {/* Card 3: Elite Salon */}
          <div 
            onClick={() => handleSelectPlan("elite")}
            className={`cursor-pointer rounded-[24px] p-6 relative overflow-hidden transition-all duration-300 hover:translate-y-[-4px] flex flex-col justify-between ${
              selectedPlan === "elite" 
                ? "bg-[#111827] border-2 border-[#D1AF47] shadow-[0_0_20px_rgba(209,175,71,0.1)]" 
                : "bg-[#0D1422] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.15)]"
            }`}
          >
            <div className="space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-bold text-white tracking-wide">{t.eliteName}</h3>
                  <p className="text-xs text-[#7B859C] mt-1 line-clamp-2">{t.eliteDesc}</p>
                </div>
                {selectedPlan === "elite" && (
                  <span className="bg-[#D1AF47]/10 text-[#D1AF47] text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border border-[#D1AF47]/20">
                    {t.selected}
                  </span>
                )}
              </div>
              <div className="pt-4">
                <span className="text-3xl font-black text-white">
                  {billingCycle === "annual" ? t.elitePriceAnnual : t.elitePrice}
                </span>
                <span className="text-xs text-[#7B859C] ml-1 mr-1">
                  {t.sar} {billingCycle === "annual" ? t.perMonth : t.perMonth}
                </span>
                <div className="text-[10px] text-[#3DDC84] font-semibold mt-1">
                  {billingCycle === "annual" ? "Save 1920 SAR / year" : "Standard Month Rate"}
                </div>
              </div>
              <div className="border-t border-[rgba(255,255,255,0.06)] pt-4 space-y-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#D1AF47]" />
                  <span>Custom Platform Commission</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-[#B8C0D4]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#3DDC84]" />
                  <span>{t.featSupport}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-[#B8C0D4]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#3DDC84]" />
                  <span>Unlimited Staff Calendars</span>
                </div>
              </div>
            </div>
            <button 
              className={`w-full py-2.5 mt-8 rounded-xl text-xs font-bold tracking-wider transition-all duration-300 ${
                selectedPlan === "elite" 
                  ? "bg-[#D1AF47] text-[#070B12]" 
                  : "bg-white/5 hover:bg-white/10 text-white border border-[rgba(255,255,255,0.08)]"
              }`}
            >
              {selectedPlan === "elite" ? t.currentPlan : t.selectPlan}
            </button>
          </div>

        </div>

        {/* Detailed Plan Comparison Table */}
        <div className="bg-[#111827] border border-[rgba(255,255,255,0.06)] rounded-[24px] p-6 md:p-8 space-y-6">
          <h3 className="text-lg font-bold text-white tracking-wide">
            {t.featuresTitle}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.06)] text-[#7B859C]">
                  <th className="py-4 font-semibold text-start w-1/2">{locale === "en" ? "Feature" : "الميزة"}</th>
                  <th className="py-4 font-semibold text-center">{t.basicName}</th>
                  <th className="py-4 font-semibold text-center text-[#D1AF47]">{t.growthName}</th>
                  <th className="py-4 font-semibold text-center">{t.eliteName}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(255,255,255,0.03)]">
                {features.map((feature, idx) => (
                  <tr key={idx} className="hover:bg-white/[0.01] transition-colors">
                    <td className="py-4 font-medium text-white text-start">{feature.name}</td>
                    <td className="py-4 text-center">
                      {feature.basic ? (
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#3DDC84]" />
                      ) : (
                        <span className="text-[#7B859C]">—</span>
                      )}
                    </td>
                    <td className="py-4 text-center">
                      {feature.growth ? (
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#D1AF47] shadow-[0_0_8px_rgba(209,175,71,0.6)]" />
                      ) : (
                        <span className="text-[#7B859C]">—</span>
                      )}
                    </td>
                    <td className="py-4 text-center">
                      {feature.elite ? (
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#3DDC84]" />
                      ) : (
                        <span className="text-[#7B859C]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Transaction Split Calculator & Commission Breakdown */}
        <div className="bg-[#0D1422] border border-[rgba(255,255,255,0.06)] rounded-[28px] p-6 sm:p-10 space-y-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#D1AF47]/5 blur-2xl rounded-full" />
          
          <div className="text-center space-y-2">
            <h2 className="text-xl font-bold text-white uppercase tracking-wide">
              {t.pricingModel}
            </h2>
            <p className="text-xs text-[#7B859C] max-w-xl mx-auto">
              {locale === "en" 
                ? "Every booking transaction is automatically split into secure escrows on completion." 
                : "يتم تقسيم مستحقات كل عملية حجز تلقائياً وحمايتها في حساب ضمان بنكي حتى انتهاء الموعد."}
            </p>
          </div>
          
          {/* Visual Dynamic Split Ledger Bar */}
          <div className="space-y-4 pt-4">
            <div className="h-6 w-full bg-[#1A2236] rounded-full overflow-hidden flex p-1 border border-[rgba(255,255,255,0.08)]">
              <div 
                className="bg-gradient-to-r from-[#D1AF47] to-[#B8952E] rounded-full h-full flex items-center justify-center text-[10px] font-black text-[#070B12] transition-all duration-500 shadow-[0_0_12px_rgba(209,175,71,0.4)]"
                style={{ width: "15%" }}
              >
                15%
              </div>
              <div 
                className="bg-gradient-to-r from-[#172033] to-[#25324D] rounded-full h-full flex items-center justify-end px-3 text-[10px] font-black text-white transition-all duration-500 flex-1"
              >
                85%
              </div>
            </div>
            
            <div className="flex justify-between items-center text-xs font-bold text-[#7B859C] px-2">
              <span className="text-[#D1AF47]">{t.platformFee} (15%)</span>
              <span className="text-white">{t.partnerPayout} (85%)</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
            <div className="bg-[#111827] p-6 rounded-2xl border border-[rgba(255,255,255,0.04)] space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#D1AF47]" />
                <h4 className="font-bold text-xs text-white uppercase tracking-wider">{t.platformFee}</h4>
              </div>
              <p className="text-xs text-[#7B859C] leading-relaxed">
                {t.feeDesc}
              </p>
            </div>

            <div className="bg-[#111827] p-6 rounded-2xl border border-[rgba(255,255,255,0.04)] space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#3DDC84]" />
                <h4 className="font-bold text-xs text-white uppercase tracking-wider">{t.partnerPayout}</h4>
              </div>
              <p className="text-xs text-[#7B859C] leading-relaxed">
                {t.payoutDesc}
              </p>
            </div>
          </div>

          {/* Zero setup callout */}
          <div className="bg-[rgba(209,175,71,0.03)] border border-[#D1AF47]/20 p-6 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="space-y-1">
              <h4 className="font-bold text-xs text-white uppercase tracking-wider">{t.noUpfront}</h4>
              <p className="text-xs text-[#7B859C] max-w-xl">{t.noUpfrontDesc}</p>
            </div>
            <span className="text-xs font-bold text-[#D1AF47] bg-[#D1AF47]/10 px-3 py-1.5 rounded-lg border border-[#D1AF47]/20 whitespace-nowrap">
              {locale === "en" ? "No Credit Card Needed to Register" : "لا حاجة لبطاقة ائتمان للتسجيل"}
            </span>
          </div>

          {/* Localized Saudi Fintech details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-[rgba(255,255,255,0.04)] text-xs text-[#7B859C]">
            <div className="space-y-1">
              <h5 className="font-bold text-white">{t.splitTitle}</h5>
              <p>{t.splitSubtitle}</p>
            </div>
            <div className="space-y-1">
              <h5 className="font-bold text-white">{t.payoutTimeline}</h5>
              <p>{t.payoutTimelineDesc}</p>
            </div>
          </div>

        </div>

        {/* Interactive Payment Checkout Mock Container */}
        <div 
          ref={checkoutRef} 
          className="bg-[#111827] border border-[rgba(255,255,255,0.06)] rounded-[28px] p-6 sm:p-10 space-y-8 relative overflow-hidden"
        >
          {/* Top light */}
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#D1AF47]/50 to-transparent" />
          
          <div className="space-y-2">
            <h3 className="text-lg sm:text-xl font-bold text-white tracking-wide flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#3DDC84] animate-pulse" />
              {t.checkoutTitle}
            </h3>
            <p className="text-xs text-[#7B859C]">
              {t.checkoutSubtitle}
            </p>
          </div>

          {checkoutStep === "success" ? (
            <div className="text-center py-12 px-4 space-y-6 max-w-md mx-auto">
              <div className="w-16 h-16 bg-[#3DDC84]/10 border border-[#3DDC84]/30 rounded-full flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(61,220,132,0.15)]">
                <svg className="w-8 h-8 text-[#3DDC84]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="space-y-2">
                <h4 className="text-xl font-bold text-white">{t.successMsg}</h4>
                <p className="text-xs text-[#7B859C]">
                  {locale === "en"
                    ? `Your account has been configured with the ${pricingDetails.title} package.`
                    : `تمت تهيئة حسابك بنجاح على باقة ${pricingDetails.title}.`}
                </p>
              </div>
              <div className="bg-[#0D1422] p-4 rounded-xl text-xs space-y-2 border border-[rgba(255,255,255,0.04)] text-start">
                <div className="flex justify-between text-white font-medium">
                  <span>{locale === "en" ? "Active Plan:" : "الباقة النشطة:"}</span>
                  <span className="text-[#D1AF47]">{pricingDetails.title}</span>
                </div>
                <div className="flex justify-between">
                  <span>{locale === "en" ? "Billing Cycle:" : "دورة الدفع:"}</span>
                  <span>{pricingDetails.isAnnual ? t.billingAnnual : t.billingMonthly}</span>
                </div>
                <div className="flex justify-between">
                  <span>{locale === "en" ? "Amount Paid:" : "المبلغ المدفوع:"}</span>
                  <span className="text-white font-bold">{pricingDetails.total} {t.sar}</span>
                </div>
              </div>
              <button 
                onClick={() => setCheckoutStep("idle")}
                className="px-6 py-2.5 rounded-full text-xs font-bold bg-[#D1AF47] text-[#070B12] hover:bg-[#E0C46A] transition-all duration-300"
              >
                {locale === "en" ? "Reset Demo" : "إعادة التجربة"}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              
              {/* Form Input fields */}
              <form onSubmit={handleCheckoutSubmit} className="lg:col-span-7 space-y-6">
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">{t.paymentMethod}</h4>
                  
                  {/* Select Payment Type Header */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="border border-[#D1AF47]/40 bg-[#D1AF47]/5 p-3 rounded-xl flex flex-col items-center justify-center text-center space-y-1 cursor-pointer">
                      <span className="text-[10px] font-bold text-[#D1AF47]">mada</span>
                      <span className="text-[8px] text-[#7B859C]">Saudi Debit</span>
                    </div>
                    <div className="border border-[rgba(255,255,255,0.06)] bg-[#0D1422] p-3 rounded-xl flex flex-col items-center justify-center text-center space-y-1 opacity-70 hover:opacity-100 transition-opacity">
                      <span className="text-[10px] font-bold text-white">Apple Pay</span>
                      <span className="text-[8px] text-[#7B859C]">One-click</span>
                    </div>
                    <div className="border border-[rgba(255,255,255,0.06)] bg-[#0D1422] p-3 rounded-xl flex flex-col items-center justify-center text-center space-y-1 opacity-70 hover:opacity-100 transition-opacity">
                      <span className="text-[10px] font-bold text-white">Credit Card</span>
                      <span className="text-[8px] text-[#7B859C]">Visa / MC</span>
                    </div>
                  </div>
                </div>

                {selectedPlan === "basic" ? (
                  <div className="bg-[#0D1422] border border-[rgba(255,255,255,0.04)] rounded-xl p-6 text-center space-y-2 text-xs">
                    <p className="text-white font-medium">
                      {locale === "en" ? "Lite Starter is 100% Free Upfront" : "باقة لايت للمبتدئين مجانية بالكامل مقدماً"}
                    </p>
                    <p className="text-[#7B859C]">
                      {locale === "en" 
                        ? "No card details are required. Your account will automatically activate under the 15% platform split agreement."
                        : "لا توجد تفاصيل دفع مطلوبة. سيتم تفعيل حسابك تلقائياً بناءً على اتفاقية عمولة المنصة البالغة 15%."}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-[#B8C0D4] block">{t.cardholder}</label>
                      <input 
                        type="text" 
                        required
                        value={cardholder}
                        onChange={handleCardholderChange}
                        placeholder={t.inputPlaceholderName}
                        className="w-full bg-[#0D1422] border border-[rgba(255,255,255,0.06)] focus:border-[#D1AF47] rounded-xl py-3 px-4 text-xs text-white placeholder-[#7B859C] outline-none transition-all duration-300"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-[#B8C0D4] block">{t.cardNumber}</label>
                      <input 
                        type="text" 
                        required
                        value={cardNumber}
                        onChange={handleCardNumberChange}
                        placeholder={t.inputPlaceholderCard}
                        className="w-full bg-[#0D1422] border border-[rgba(255,255,255,0.06)] focus:border-[#D1AF47] rounded-xl py-3 px-4 text-xs text-white placeholder-[#7B859C] outline-none transition-all duration-300"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-[#B8C0D4] block">{t.expiry}</label>
                        <input 
                          type="text" 
                          required
                          value={expiry}
                          onChange={handleExpiryChange}
                          placeholder={t.inputPlaceholderExpiry}
                          className="w-full bg-[#0D1422] border border-[rgba(255,255,255,0.06)] focus:border-[#D1AF47] rounded-xl py-3 px-4 text-xs text-white placeholder-[#7B859C] outline-none transition-all duration-300 text-center"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-[#B8C0D4] block">{t.cvv}</label>
                        <input 
                          type="password" 
                          required
                          value={cvv}
                          onChange={handleCvvChange}
                          placeholder={t.inputPlaceholderCvv}
                          className="w-full bg-[#0D1422] border border-[rgba(255,255,255,0.06)] focus:border-[#D1AF47] rounded-xl py-3 px-4 text-xs text-white placeholder-[#7B859C] outline-none transition-all duration-300 text-center"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-2 text-[10px] text-[#7B859C]">
                  {t.mockCardWarning}
                </div>

                <button 
                  type="submit"
                  disabled={checkoutStep === "processing"}
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
                    <span>{t.payNow}</span>
                  )}
                </button>
              </form>

              {/* Order Summary & Simulated Credit Card preview */}
              <div className="lg:col-span-5 space-y-8">
                
                {/* Credit Card Replica Graphic */}
                <div className="flex justify-center">
                  <div 
                    className={`w-full max-w-xs h-44 rounded-[20px] p-5 text-white relative overflow-hidden flex flex-col justify-between shadow-2xl transition-all duration-500 hover:scale-[1.03] ${
                      selectedPlan === "basic"
                        ? "bg-gradient-to-br from-[#1E293B] via-[#0F172A] to-[#020617] border border-[rgba(255,255,255,0.08)] shadow-[0_0_15px_rgba(30,41,59,0.2)]"
                        : selectedPlan === "growth"
                        ? "bg-gradient-to-br from-[#1E2235] via-[#111827] to-[#0A0D1A] border border-[#D1AF47]/40 shadow-[0_0_25px_rgba(209,175,71,0.15)]"
                        : "bg-gradient-to-br from-[#0D1422] via-[#070B12] to-[#030712] border border-white/20 shadow-[0_0_20px_rgba(255,255,255,0.08)]"
                    }`}
                  >
                    {/* Metallic glow pattern */}
                    <div className="absolute top-0 left-0 right-0 bottom-0 bg-[linear-gradient(225deg,rgba(255,255,255,0.03)_0%,transparent_50%)] pointer-events-none" />
                    
                    <div className="flex justify-between items-start z-10">
                      <div>
                        <span className="text-[8px] uppercase tracking-[0.2em] text-[#7B859C]">Primora Ledger ID</span>
                        <div className="text-xs font-bold text-[#D1AF47]">{pricingDetails.title}</div>
                      </div>
                      <span className="text-xs font-serif font-black tracking-widest text-white/50">PRIMORA</span>
                    </div>

                    {/* Sim Chip Icon */}
                    <div className="w-8 h-6 bg-[#D1AF47]/30 border border-[#D1AF47]/40 rounded-md flex p-1 items-center gap-0.5 z-10">
                      <div className="w-1.5 h-full border-r border-[#D1AF47]/40" />
                      <div className="w-1.5 h-full border-r border-[#D1AF47]/40" />
                      <div className="w-1.5 h-full" />
                    </div>

                    <div className="space-y-2 z-10">
                      <div className="text-sm font-mono tracking-widest text-white">
                        {cardNumber || "•••• •••• •••• ••••"}
                      </div>
                      <div className="flex justify-between items-center text-[10px]">
                        <div className="truncate max-w-[150px] font-mono uppercase text-[#B8C0D4]">
                          {cardholder || (locale === "en" ? "LUXURY SALON OWNER" : "مقدم خدمة فاخر")}
                        </div>
                        <div className="font-mono text-white">{expiry || "MM/YY"}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Billing Summary List */}
                <div className="bg-[#0D1422] rounded-[20px] p-6 border border-[rgba(255,255,255,0.04)] space-y-4">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider border-b border-[rgba(255,255,255,0.04)] pb-3">
                    {t.summary}
                  </h4>
                  
                  <div className="space-y-3 text-xs">
                    <div className="flex justify-between text-[#7B859C]">
                      <span>{locale === "en" ? "Selected Plan" : "الباقة المحددة"}</span>
                      <span className="text-white font-medium">{pricingDetails.title}</span>
                    </div>
                    <div className="flex justify-between text-[#7B859C]">
                      <span>{t.billingCycleLabel}</span>
                      <span className="text-white font-medium">
                        {pricingDetails.isAnnual ? t.billingAnnual : t.billingMonthly}
                      </span>
                    </div>
                    
                    <div className="border-t border-[rgba(255,255,255,0.04)] my-2" />
                    
                    <div className="flex justify-between text-[#7B859C]">
                      <span>{t.subtotal}</span>
                      <span className="text-white font-medium">{pricingDetails.subtotal} {t.sar}</span>
                    </div>
                    <div className="flex justify-between text-[#7B859C]">
                      <span>{t.vat}</span>
                      <span className="text-white font-medium">{pricingDetails.vat} {t.sar}</span>
                    </div>

                    <div className="border-t border-[#D1AF47]/20 pt-3 flex justify-between text-sm">
                      <span className="text-white font-bold">{t.total}</span>
                      <span className="text-[#D1AF47] font-black">{pricingDetails.total} {t.sar}</span>
                    </div>
                  </div>
                </div>

              </div>

            </div>
          )}
        </div>

      </main>

      {/* Footer */}
      <footer className="bg-[#070B12]/80 border-t border-white/[0.06] py-8 text-center text-xs text-[#7B859C] font-medium z-10 relative">
        <p>© {new Date().getFullYear()} PRIMORA. {t.footerText}</p>
      </footer>

    </div>
  );
}

