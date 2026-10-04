"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

const translations = {
  en: {
    promoText: "Book Premier Home Service & Salon Appointments in Riyadh",
    promoSub: "Get 15% off your first booking - Use code:",
    home: "Home",
    discover: "Services",
    serviceBoard: "Service Board",
    becomeProvider: "Become a Provider",
    aboutUs: "About Us",
    login: "Log in",
    signup: "Sign up",
    title: "Join Riyadh's Finest Beauty & Grooming Collective",
    subtitle: "List your salon, barbershop, or spa, and instantly accept secure bookings.",
    ctaRegister: "Register as Provider Now",
    value1Title: "Automated Split Payouts",
    value1Desc: "Customers pay deposits by card through Tap, and your earnings are paid out to your verified bank account after each visit.",
    value2Title: "Riyadh Geofencing",
    value2Desc: "Efficient logistics dispatch controls for premium in-home or in-salon booking coordinates.",
    value3Title: "Staff & Availability Engine",
    value3Desc: "Customize specialist calendars, shifts, services, and block slots automatically during Riyadh prayer-time intervals.",
    planTitle: "SaaS Platform Tiers",
    planBasicName: "Primora Basic",
    planBasicPrice: "Free",
    planBasicDesc: "Core calendar management and basic bookings processing with a 15% platform commission split.",
    planProName: "Primora Growth & Pro",
    planProPrice: "299 SAR / month",
    planProDesc: "Advanced staff rosters, physical room resources allocation, geofenced travel limits, and client notes CRM.",
    appTitle: "Provider Onboarding Application",
    appSubtitle: "Submit your commercial establishment credentials to begin accepting verified bookings in Riyadh.",
    loginToApply: "Please sign in or create an account to submit your provider application.",
    loginButton: "Sign in with Phone OTP",
    businessNameEnLabel: "Business Name (English)",
    businessNameArLabel: "Business Name (Arabic)",
    businessTypeLabel: "Business Type",
    salon: "Salon",
    barbershop: "Barbershop",
    spa: "Spa & Wellness",
    freelancer: "Specialist / Freelancer",
    crLabel: "Commercial Registration (CR) Number",
    taxLabel: "Tax / VAT Registration Number",
    contactEmailLabel: "Business Email",
    contactPhoneLabel: "Business Phone (+966)",
    cityLabel: "City",
    districtLabel: "District in Riyadh",
    addressLabel: "Street Address",
    tradeLicenseLabel: "Trade License Document Reference / URL",
    agreeTerms: "I confirm I am an authorized representative and agree to the Provider Agreement and Customer Terms.",
    submitApp: "Submit Provider Application",
    submitting: "Submitting Application...",
    underReviewTitle: "Your Application is Under Review",
    underReviewMsg: "Our onboarding operations team is currently reviewing your registration credentials. We will notify you once approved.",
    approvedTitle: "Application Approved!",
    approvedMsg: "Your provider merchant account is active. Complete your guided setup on your salon dashboard.",
    goToDashboard: "Go to Salon Dashboard",
    rejectedTitle: "Application Not Approved",
    reapply: "Submit New Application",
    footerDesc: "Luxury Beauty, Grooming & Wellness Marketplace. Connecting premier Riyadh artists with selective clients.",
    footerDiscover: "Discover",
    footerPartners: "For Partners",
    footerLegal: "Legal",
    allRightsReserved: "All rights reserved. Built for Riyadh, Saudi Arabia.",
    popular: "Popular",
    standardComm: "Standard Commission"
  },
  ar: {
    promoText: "احجز أفضل خدمات التجميل والعناية المنزلية والصالونات بالرياض",
    promoSub: "احصل على خصم 15% على حجزك الأول - استخدم الرمز:",
    home: "الرئيسية",
    discover: "الخدمات",
    serviceBoard: "لوحة الخدمات",
    becomeProvider: "انضم كمزود خدمة",
    aboutUs: "من نحن",
    login: "تسجيل الدخول",
    signup: "تسجيل جديد",
    title: "انضم إلى نخبة صالونات ومحترفي التجميل بالرياض",
    subtitle: "قم بإدراج صالونك، أو محل الحلاقة، أو السبا الخاص بك وابدأ في استقبال حجوزات آمنة فوراً.",
    ctaRegister: "سجل كمزود خدمة الآن",
    value1Title: "تسوية المدفوعات المقسمة آلياً",
    value1Desc: "تكامل آمن مع بوابة Tap لمعالجة وتقسيم المدفوعات آلياً وإيداعها مباشرة في حسابك البنكي المعتمد.",
    value2Title: "نطاق الخدمة الجغرافي بالرياض",
    value2Desc: "تحكم مرن وبسيط في الخدمات اللوجستية وتعيين إحداثيات الخدمة المنزلية أو الحضور للصالون.",
    value3Title: "محرك جدولة الموظفين والأوقات",
    value3Desc: "خصص جداول موظفيك، نوبات العمل، والخدمات، مع قفل تلقائي للمواعيد خلال فترات الصلاة بالرياض.",
    planTitle: "باقات اشتراك المنصة (SaaS)",
    planBasicName: "بريمورا الأساسية",
    planBasicPrice: "مجانًا",
    planBasicDesc: "إدارة التقويم الأساسية ومعالجة الحجوزات مع اقتطاع عمولة المنصة القياسية بنسبة 15%.",
    planProName: "بريمورا للمحترفين والنمو",
    planProPrice: "299 ريال / شهريًا",
    planProDesc: "جداول نوبات الموظفين المتقدمة، توزيع موارد الغرف الفيزيائية، تحديد نطاقات السفر الجغرافية، ونظام CRM لملاحظات تفضيلات العملاء.",
    appTitle: "طلب انضمام مزود خدمة جديد",
    appSubtitle: "قدم بيانات منشأتك وسجلك التجاري لبدء استقبال الحجوزات المعتمدة في الرياض.",
    loginToApply: "يرجى تسجيل الدخول أو إنشاء حساب لتقديم طلب اعتماد المنشأة.",
    loginButton: "تسجيل الدخول عبر رمز الجوال (OTP)",
    businessNameEnLabel: "اسم المنشأة بالإنجليزية",
    businessNameArLabel: "اسم المنشأة بالعربية",
    businessTypeLabel: "نوع النشاط",
    salon: "صالون تجميل",
    barbershop: "صالون حلاقة رجالي",
    spa: "سبا وعافية",
    freelancer: "أخصائي / عمل حر",
    crLabel: "رقم السجل التجاري",
    taxLabel: "الرقم الضريبي (15 رقماً)",
    contactEmailLabel: "البريد الإلكتروني للنشاط",
    contactPhoneLabel: "رقم جوال التواصل (+966)",
    cityLabel: "المدينة",
    districtLabel: "الحي بالرياض",
    addressLabel: "العنوان والشارع",
    tradeLicenseLabel: "رابط أو مرجع وثيقة السجل التجاري",
    agreeTerms: "أقر بأنني مفوض عن المنشأة وأوافق على اتفاقية مزودي الخدمة وشروط المنصة.",
    submitApp: "إرسال طلب الانضمام",
    submitting: "جاري تقديم الطلب...",
    underReviewTitle: "طلبك قيد المراجعة والتدقيق",
    underReviewMsg: "يعمل فريق العمليات والتحقق على مراجعة وثائق السجل التجاري. سيتم إشعارك فور الاعتماد.",
    approvedTitle: "تم اعتماد طلبك بنجاح!",
    approvedMsg: "حسابك التجاري نشط. يمكنك الآن استكمال الإعداد الإرشادي في لوحة تحكم المزود.",
    goToDashboard: "الانتقال إلى لوحة تحكم المزود",
    rejectedTitle: "لم تتم الموافقة على الطلب",
    reapply: "تقديم طلب جديد",
    footerDesc: "منصة الجمال الفاخرة، والعناية والعافية. نصل بين أفضل فناني الرياض والعملاء المميزين.",
    footerDiscover: "استكشف",
    footerPartners: "للشركاء",
    footerLegal: "قانوني",
    allRightsReserved: "جميع الحقوق محفوظة. صمم خصيصاً للرياض، المملكة العربية السعودية.",
    popular: "شائع",
    standardComm: "عمولة قياسية"
  }
};

export default function BecomeProviderRootPage() {
  const [locale, setLocale] = useState<"en" | "ar">("en");
  const t = translations[locale];

  const toggleLanguage = () => {
    setLocale((prev) => (prev === "en" ? "ar" : "en"));
  };

  useEffect(() => {
    const savedLang = localStorage.getItem("primora_lang") as "en" | "ar";
    if (savedLang === "en" || savedLang === "ar") {
      setLocale(savedLang);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("primora_lang", locale);
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = locale;
  }, [locale]);

  const isRTL = locale === "ar";

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [existingApp, setExistingApp] = useState<any>(null);
  const [checkingApp, setCheckingApp] = useState(true);
  const [appForm, setAppForm] = useState({
    businessNameEn: "",
    businessNameAr: "",
    businessType: "salon" as "salon" | "barbershop" | "spa" | "freelancer",
    crNumber: "",
    taxNumber: "",
    contactEmail: "",
    contactPhone: "",
    district: "",
    addressText: "",
    tradeLicenseUrl: "",
    agreed: false
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);

  useEffect(() => {
    async function checkUserApp() {
      try {
        setCheckingApp(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setCurrentUser(user);
          setAppForm((prev) => ({
            ...prev,
            contactEmail: user.email || prev.contactEmail,
            contactPhone: user.phone || prev.contactPhone
          }));
          const { data: appData, error: appError } = await supabase
            .from("provider_applications")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!appError && appData) {
            setExistingApp(appData);
          }
        }
      } catch (err) {
        console.warn("Could not check provider application status:", err);
      } finally {
        setCheckingApp(false);
      }
    }
    void checkUserApp();
  }, []);

  const handleSubmitApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!appForm.businessNameEn.trim() || !appForm.businessNameAr.trim()) {
      setSubmitError(isRTL ? "يرجى إدخال اسم المنشأة بالعربية والإنجليزية." : "Please enter the business name in both Arabic and English.");
      return;
    }
    if (!appForm.contactPhone.trim() || !appForm.district.trim() || !appForm.addressText.trim()) {
      setSubmitError(isRTL ? "يرجى تعبئة بيانات الاتصال والحي والعنوان." : "Please complete contact phone, district, and address details.");
      return;
    }
    if (!appForm.agreed) {
      setSubmitError(isRTL ? "يرجى الموافقة على اتفاقية مزودي الخدمة." : "Please agree to the Provider Agreement and Terms.");
      return;
    }

    setSubmitting(true);
    setSubmitError("");
    try {
      const { data, error } = await supabase.from("provider_applications").insert({
        user_id: currentUser.id,
        business_name_en: appForm.businessNameEn.trim(),
        business_name_ar: appForm.businessNameAr.trim(),
        business_type: appForm.businessType,
        cr_number: appForm.crNumber.trim() || null,
        tax_number: appForm.taxNumber.trim() || null,
        contact_email: appForm.contactEmail.trim() || currentUser.email,
        contact_phone: appForm.contactPhone.trim(),
        city: "Riyadh",
        district: appForm.district.trim(),
        address_text: appForm.addressText.trim(),
        trade_license_url: appForm.tradeLicenseUrl.trim() || null,
        status: "pending"
      }).select().single();

      if (error) throw error;

      // Acceptance is recorded only against a published (legally reviewed) agreement version.
      const { data: publishedAgreement } = await supabase
        .from("legal_agreements")
        .select("version")
        .eq("agreement_key", "provider_agreement")
        .eq("status", "published")
        .maybeSingle();
      if (publishedAgreement?.version) {
        const { error: acceptanceError } = await supabase.rpc("record_agreement_acceptance", {
          p_agreement_key: "provider_agreement",
          p_version: publishedAgreement.version,
          p_method: "become_provider_form"
        });
        if (acceptanceError) throw acceptanceError;
      }

      setExistingApp(data);
      setSubmitSuccess(true);
    } catch (err: any) {
      console.error("Failed to submit provider application:", err);
      setSubmitError(err?.message || (isRTL ? "فشل إرسال الطلب، يرجى المحاولة لاحقاً." : "Failed to submit application. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div 
      className="min-h-screen bg-stone-50 text-stone-900 flex flex-col font-sans antialiased"
      dir={isRTL ? "rtl" : "ltr"}
    >
      {/* 1. TOP PROMO BAR */}
      <div className="w-full bg-stone-100 border-b border-stone-200 py-2.5 px-4 text-center text-[10px] sm:text-xs font-semibold tracking-wider text-stone-600 uppercase flex items-center justify-center gap-4">
        <span>{t.promoText}</span>
      </div>

      {/* 2. HEADER */}
      <header className="bg-white border-b border-stone-200/80 py-5 px-6 sm:px-12 flex items-center justify-between sticky top-0 z-50 shadow-sm backdrop-blur-md bg-white/95">
        <Link href="/" className="text-2xl font-serif font-black tracking-widest text-stone-900 hover:opacity-80 transition flex-shrink-0">
          PRIMORA
        </Link>
        <nav className="hidden lg:flex items-center justify-center gap-8 text-xs font-bold uppercase tracking-wider text-stone-500 flex-1 mx-8">
          <Link href="/" className="hover:text-stone-950 transition-colors">{t.home}</Link>
          <Link href="/services" className="hover:text-stone-950 transition-colors">{t.discover}</Link>
          <Link href="/service-board" className="hover:text-stone-950 transition-colors">{t.serviceBoard}</Link>
          <Link href="/become-provider" className="text-stone-900 hover:text-stone-900 transition-colors">{t.becomeProvider}</Link>
          <Link href="/about" className="hover:text-stone-950 transition-colors">{t.aboutUs}</Link>
        </nav>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
            <Link href="/services" className="text-stone-700 hover:text-stone-950 transition">
              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </Link>
            <Link href="/login" className="text-stone-700 hover:text-stone-950 transition">
              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </Link>
          </div>
          <div className="h-4 w-px bg-stone-200"></div>
          <button
            onClick={toggleLanguage}
            className="px-3.5 py-1.5 rounded-lg border border-stone-200 bg-stone-50 text-[10px] font-extrabold hover:border-black transition"
          >
            {locale === "en" ? "العربية" : "English"}
          </button>
        </div>
      </header>

      {/* 3. MAIN CONTENT */}
      <main className="max-w-4xl mx-auto py-16 px-6 sm:px-8 space-y-16 flex-grow">
        {/* Title Section */}
        <div className="text-center space-y-4">
          <span className="text-[10px] tracking-widest uppercase font-extrabold text-stone-400">{t.becomeProvider}</span>
          <h1 className="text-4xl sm:text-5xl font-serif text-stone-950 tracking-tight leading-tight max-w-3xl mx-auto">{t.title}</h1>
          <p className="text-sm sm:text-base text-stone-500 font-light max-w-xl mx-auto leading-relaxed">
            {t.subtitle}
          </p>
          <div className="pt-4">
            <a href="#application-form" className="px-8 py-3.5 bg-stone-900 text-stone-50 font-bold text-xs uppercase tracking-widest rounded-full hover:bg-stone-800 transition shadow-md inline-block">
              {t.ctaRegister}
            </a>
          </div>
        </div>

        {/* Hero visual */}
        <div className="w-full aspect-[21/9] rounded-3xl overflow-hidden border border-stone-200 shadow-lg relative bg-stone-100">
          <img 
            src="https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?q=80&w=1200&auto=format&fit=crop" 
            alt="Luxury unisex salon and workspace" 
            className="w-full h-full object-cover" 
          />
          <div className="absolute inset-0 bg-stone-950/10" />
        </div>

        <hr className="border-stone-200" />

        {/* Value Prop */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center font-bold text-stone-800">
              SAR
            </div>
            <h3 className="font-bold text-xs text-stone-900 uppercase tracking-wide">{t.value1Title}</h3>
            <p className="text-xs text-stone-500 leading-relaxed font-light">{t.value1Desc}</p>
          </div>

          <div className="space-y-3">
            <div className="w-10 h-10 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center font-bold text-stone-800">
              G
            </div>
            <h3 className="font-bold text-xs text-stone-900 uppercase tracking-wide">{t.value2Title}</h3>
            <p className="text-xs text-stone-500 leading-relaxed font-light">{t.value2Desc}</p>
          </div>

          <div className="space-y-3">
            <div className="w-10 h-10 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center font-bold text-stone-800">
              E
            </div>
            <h3 className="font-bold text-xs text-stone-900 uppercase tracking-wide">{t.value3Title}</h3>
            <p className="text-xs text-stone-500 leading-relaxed font-light">{t.value3Desc}</p>
          </div>
        </div>

        <hr className="border-stone-200" />

        {/* Pricing Plan Grid */}
        <div className="space-y-8">
          <h2 className="text-xl font-serif font-bold text-stone-950 text-center">{t.planTitle}</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {/* Plan 1 */}
            <div className="bg-white border border-stone-200 p-8 rounded-2xl space-y-4 shadow-sm flex flex-col justify-between hover:border-black transition">
              <div className="space-y-3">
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">{t.standardComm}</span>
                <h3 className="font-bold text-base text-stone-950">{t.planBasicName}</h3>
                <h4 className="text-2xl font-black text-stone-900">{t.planBasicPrice}</h4>
                <p className="text-xs text-stone-500 leading-relaxed font-light">{t.planBasicDesc}</p>
              </div>
              <div className="pt-4">
                <Link href="/login" className="w-full text-center py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-900 rounded-lg text-xs font-bold uppercase tracking-wider block transition">
                  {t.signup}
                </Link>
              </div>
            </div>

            {/* Plan 2 */}
            <div className="bg-white border-2 border-stone-950 p-8 rounded-2xl space-y-4 shadow-md flex flex-col justify-between relative">
              <span className="absolute -top-3 right-6 bg-stone-900 text-stone-50 text-[8px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded">
                {t.popular}
              </span>
              <div className="space-y-3">
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">SaaS Subscription</span>
                <h3 className="font-bold text-base text-stone-950">{t.planProName}</h3>
                <h4 className="text-2xl font-black text-stone-900">{t.planProPrice}</h4>
                <p className="text-xs text-stone-500 leading-relaxed font-light">{t.planProDesc}</p>
              </div>
              <div className="pt-4">
                <Link href="/login" className="w-full text-center py-2.5 bg-stone-900 hover:bg-stone-850 text-stone-50 rounded-lg text-xs font-bold uppercase tracking-wider block transition shadow-sm">
                  {locale === "ar" ? "اشترك الآن" : "Subscribe Now"}
                </Link>
              </div>
            </div>
          </div>
        </div>

        <hr className="border-stone-200" />

        {/* 5. ONBOARDING APPLICATION SECTION */}
        <section id="application-form" className="space-y-8 scroll-mt-24">
          <div className="text-center space-y-3">
            <span className="text-[10px] tracking-widest uppercase font-extrabold text-[#D1AF47]">
              {isRTL ? "بوابة الانضمام الرسمية" : "Official Onboarding Gateway"}
            </span>
            <h2 className="text-3xl font-serif font-black text-stone-950">{t.appTitle}</h2>
            <p className="text-sm text-stone-500 max-w-xl mx-auto leading-relaxed">{t.appSubtitle}</p>
          </div>

          {checkingApp ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-12 text-center text-sm font-semibold text-stone-500">
              {isRTL ? "جاري التحقق من بيانات الحساب..." : "Checking account credentials..."}
            </div>
          ) : !currentUser ? (
            <div className="rounded-3xl border border-stone-200 bg-white p-8 sm:p-12 text-center space-y-6 shadow-sm">
              <div className="w-16 h-16 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center mx-auto text-2xl font-serif font-black text-stone-900">
                P
              </div>
              <div className="space-y-2 max-w-md mx-auto">
                <h3 className="font-serif text-xl font-bold text-stone-950">{t.loginToApply}</h3>
                <p className="text-xs text-stone-500 leading-relaxed">
                  {isRTL
                    ? "يتطلب تقديم الطلب تسجيل حساب وتوثيق رقم الجوال لربط المنشأة بحساب المالك بصورة نظامية آمنة."
                    : "Submitting an application requires an authenticated account to securely link your commercial entity with owner credentials."}
                </p>
              </div>
              <div>
                <Link
                  href="/login?returnUrl=/become-provider"
                  className="px-8 py-3.5 bg-stone-900 text-stone-50 font-bold text-xs uppercase tracking-widest rounded-full hover:bg-stone-850 transition shadow-md inline-block"
                >
                  {t.loginButton}
                </Link>
              </div>
            </div>
          ) : existingApp && existingApp.status === "pending" ? (
            <div className="rounded-3xl border border-[#FEDF89] bg-[#FFFAEB] p-8 sm:p-12 text-center space-y-4">
              <span className="rounded-full bg-[#D1AF47] px-3 py-1 text-[10px] font-black uppercase text-[#101828]">
                {isRTL ? "قيد المراجعة" : "Under Review"}
              </span>
              <h3 className="font-serif text-2xl font-black text-stone-900">{t.underReviewTitle}</h3>
              <p className="text-sm text-stone-600 max-w-lg mx-auto leading-relaxed">{t.underReviewMsg}</p>
              <div className="pt-4 border-t border-[#FEDF89]/50 max-w-md mx-auto grid grid-cols-2 gap-4 text-xs font-bold text-stone-700">
                <div>
                  <span className="block text-[10px] text-stone-400 uppercase font-extrabold">{isRTL ? "المنشأة" : "Business"}</span>
                  <span>{isRTL ? existingApp.business_name_ar : existingApp.business_name_en}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-stone-400 uppercase font-extrabold">{isRTL ? "تاريخ التقديم" : "Submitted"}</span>
                  <span>{new Date(existingApp.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          ) : existingApp && existingApp.status === "approved" ? (
            <div className="rounded-3xl border border-[#ABEFC6] bg-[#ECFDF3] p-8 sm:p-12 text-center space-y-4">
              <span className="rounded-full bg-[#12B76A] px-3 py-1 text-[10px] font-black uppercase text-white">
                {isRTL ? "معتمد ومفعل" : "Approved & Active"}
              </span>
              <h3 className="font-serif text-2xl font-black text-[#027A48]">{t.approvedTitle}</h3>
              <p className="text-sm text-stone-700 max-w-lg mx-auto leading-relaxed">{t.approvedMsg}</p>
              <div className="pt-4">
                <Link
                  href="/provider/dashboard"
                  className="px-8 py-3.5 bg-[#027A48] text-white font-bold text-xs uppercase tracking-widest rounded-full hover:bg-[#05603A] transition shadow-md inline-block"
                >
                  {t.goToDashboard}
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmitApplication} className="rounded-3xl border border-stone-200 bg-white p-6 sm:p-10 shadow-sm space-y-6">
              {existingApp && existingApp.status === "rejected" && (
                <div className="rounded-2xl border border-[#FECDCA] bg-[#FEF3F2] p-4 text-xs text-[#B42318] space-y-1">
                  <strong className="block font-bold">{t.rejectedTitle}</strong>
                  <p>{existingApp.rejection_reason || (isRTL ? "يرجى تعديل المستندات وإعادة التقديم." : "Please correct documents and re-apply.")}</p>
                </div>
              )}

              {submitError && (
                <div className="rounded-2xl border border-[#FECDCA] bg-[#FEF3F2] p-4 text-xs font-bold text-[#B42318]">
                  {submitError}
                </div>
              )}

              {submitSuccess && (
                <div className="rounded-2xl border border-[#ABEFC6] bg-[#ECFDF3] p-4 text-xs font-bold text-[#027A48]">
                  {isRTL ? "تم استلام طلبك بنجاح! سيتم التواصل معك عبر رقم الجوال المسجل." : "Application received successfully! Our team will contact you shortly."}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1.5">{t.businessNameEnLabel} *</label>
                  <input
                    type="text"
                    required
                    value={appForm.businessNameEn}
                    onChange={(e) => setAppForm((prev) => ({ ...prev, businessNameEn: e.target.value }))}
                    placeholder="e.g. Al-Olaya Luxury Salon"
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-xs text-stone-900 outline-none focus:border-stone-900 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1.5">{t.businessNameArLabel} *</label>
                  <input
                    type="text"
                    required
                    value={appForm.businessNameAr}
                    onChange={(e) => setAppForm((prev) => ({ ...prev, businessNameAr: e.target.value }))}
                    placeholder="مثال: صالون العليا الفاخر"
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-xs text-stone-900 outline-none focus:border-stone-900 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1.5">{t.businessTypeLabel}</label>
                  <select
                    value={appForm.businessType}
                    onChange={(e) => setAppForm((prev) => ({ ...prev, businessType: e.target.value as any }))}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-xs text-stone-900 outline-none focus:border-stone-900 focus:bg-white"
                  >
                    <option value="salon">{t.salon}</option>
                    <option value="barbershop">{t.barbershop}</option>
                    <option value="spa">{t.spa}</option>
                    <option value="freelancer">{t.freelancer}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1.5">{t.crLabel}</label>
                  <input
                    type="text"
                    value={appForm.crNumber}
                    onChange={(e) => setAppForm((prev) => ({ ...prev, crNumber: e.target.value }))}
                    placeholder="1010XXXXXX"
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-xs text-stone-900 outline-none focus:border-stone-900 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1.5">{t.taxLabel}</label>
                  <input
                    type="text"
                    value={appForm.taxNumber}
                    onChange={(e) => setAppForm((prev) => ({ ...prev, taxNumber: e.target.value }))}
                    placeholder="3000XXXXXXXXXXX"
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-xs text-stone-900 outline-none focus:border-stone-900 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1.5">{t.contactEmailLabel} *</label>
                  <input
                    type="email"
                    required
                    value={appForm.contactEmail}
                    onChange={(e) => setAppForm((prev) => ({ ...prev, contactEmail: e.target.value }))}
                    placeholder="owner@salon.sa"
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-xs text-stone-900 outline-none focus:border-stone-900 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1.5">{t.contactPhoneLabel} *</label>
                  <input
                    type="tel"
                    required
                    value={appForm.contactPhone}
                    onChange={(e) => setAppForm((prev) => ({ ...prev, contactPhone: e.target.value }))}
                    placeholder="+9665XXXXXXXX"
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-xs text-stone-900 outline-none focus:border-stone-900 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1.5">{t.districtLabel} *</label>
                  <input
                    type="text"
                    required
                    value={appForm.district}
                    onChange={(e) => setAppForm((prev) => ({ ...prev, district: e.target.value }))}
                    placeholder="e.g. Al-Olaya / حي العليا"
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-xs text-stone-900 outline-none focus:border-stone-900 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1.5">{t.addressLabel} *</label>
                  <input
                    type="text"
                    required
                    value={appForm.addressText}
                    onChange={(e) => setAppForm((prev) => ({ ...prev, addressText: e.target.value }))}
                    placeholder="Building, street, landmarks"
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-xs text-stone-900 outline-none focus:border-stone-900 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1.5">{t.tradeLicenseLabel}</label>
                <input
                  type="text"
                  value={appForm.tradeLicenseUrl}
                  onChange={(e) => setAppForm((prev) => ({ ...prev, tradeLicenseUrl: e.target.value }))}
                  placeholder="https://... or CR Reference Number"
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-xs text-stone-900 outline-none focus:border-stone-900 focus:bg-white"
                />
              </div>

              <div className="pt-2">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={appForm.agreed}
                    onChange={(e) => setAppForm((prev) => ({ ...prev, agreed: e.target.checked }))}
                    className="mt-0.5 rounded border-stone-300 text-stone-900 focus:ring-stone-900"
                  />
                  <span className="text-xs text-stone-600 leading-relaxed font-medium">
                    {t.agreeTerms}{" "}
                    <Link href="/terms" target="_blank" className="underline font-bold text-stone-900">
                      ({locale === "ar" ? "عرض الاتفاقية" : "View Terms"})
                    </Link>
                  </span>
                </label>
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3.5 bg-stone-950 text-stone-50 font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-stone-850 transition shadow-md disabled:opacity-50"
                >
                  {submitting ? t.submitting : t.submitApp}
                </button>
              </div>
            </form>
          )}
        </section>
      </main>

      {/* 4. FOOTER */}
      <footer className="bg-stone-950 text-stone-400 py-12 px-6 sm:px-12 border-t border-stone-900 mt-auto">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          <div className="space-y-4">
            <h4 className="text-white font-serif font-black tracking-widest text-lg">PRIMORA</h4>
            <p className="text-xs text-stone-500 font-light leading-relaxed">
              {t.footerDesc}
            </p>
          </div>
          <div>
            <h5 className="text-white text-xs uppercase tracking-widest font-extrabold mb-4">{t.footerDiscover}</h5>
            <ul className="space-y-2 text-xs">
              <li><Link href="/categories/barber" className="hover:text-white transition">{locale === "ar" ? "قص الشعر والحلاقة" : "Haircuts & Barbering"}</Link></li>
              <li><Link href="/categories/hair" className="hover:text-white transition">{locale === "ar" ? "تصفيف وتلوين الشعر" : "Hair Styling & Color"}</Link></li>
              <li><Link href="/categories/spa" className="hover:text-white transition">{locale === "ar" ? "غرف السبا والعافية" : "Wellness & Spa Rooms"}</Link></li>
              <li><Link href="/categories/makeup" className="hover:text-white transition">{locale === "ar" ? "المكياج ومستحضرات التجميل" : "Makeup & Cosmetics"}</Link></li>
            </ul>
          </div>
          <div>
            <h5 className="text-white text-xs uppercase tracking-widest font-extrabold mb-4">{t.footerPartners}</h5>
            <ul className="space-y-2 text-xs">
              <li><Link href="/become-provider" className="hover:text-white transition">{t.becomeProvider}</Link></li>
              <li><Link href="/provider/staff-management" className="hover:text-white transition">{locale === "ar" ? "إدارة شؤون الموظفين" : "Staff Management"}</Link></li>
              <li><Link href="/provider/pricing" className="hover:text-white transition">{locale === "ar" ? "التسعير المشترك" : "Split Ledger Pricing"}</Link></li>
            </ul>
          </div>
          <div>
            <h5 className="text-white text-xs uppercase tracking-widest font-extrabold mb-4">{t.footerLegal}</h5>
            <ul className="space-y-2 text-xs">
              <li><Link href="/privacy" className="hover:text-white transition">{locale === "ar" ? "سياسة الخصوصية" : "Privacy Policy"}</Link></li>
              <li><Link href="/terms" className="hover:text-white transition">{locale === "ar" ? "شروط الخدمة" : "Terms of Service"}</Link></li>
              <li><Link href="/security" className="hover:text-white transition">{locale === "ar" ? "المدفوعات والأمان" : "Payments & Security"}</Link></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto pt-8 border-t border-stone-900 text-center text-xs text-stone-600 font-medium">
          <p>© {new Date().getFullYear()} PRIMORA. {t.allRightsReserved}</p>
        </div>
      </footer>
    </div>
  );
}
