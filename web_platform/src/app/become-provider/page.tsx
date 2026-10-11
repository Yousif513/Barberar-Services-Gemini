"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { trackEvent } from "@/lib/analytics";
import { errorMessage } from "@/lib/error-message";
import { lookupPublishedAgreement, type AgreementLookup } from "@/lib/published-agreement";
import { sar } from "@/components/operations-ui";
import { usePageLocale } from "@/lib/use-page-locale";

const translations = {
  en: {
    promoText: "Book home service and salon appointments in Saudi Arabia",
    home: "Home",
    discover: "Services",
    serviceBoard: "Service Board",
    becomeProvider: "Become a Provider",
    aboutUs: "About Us",
    login: "Log in",
    signup: "Sign up",
    title: "Bring Your Salon, Barbershop or Spa to Primora",
    subtitle: "List your business, set your services and hours, and accept bookings with deposits paid on Tap's hosted payment page.",
    ctaRegister: "Register as Provider Now",
    value1Title: "Tap Deposits, Payouts on Request",
    value1Desc: "Customers pay the deposit on Tap's hosted payment page. Your earnings are recorded in your provider ledger and you request payouts to your registered bank account.",
    value2Title: "Salon and Home Service",
    value2Desc: "Offer services at your branch, and at the customer's address where you enable home service.",
    value3Title: "Staff and Availability",
    value3Desc: "Customize specialist calendars, shifts, services, and block slots automatically during Riyadh prayer-time intervals.",
    planTitle: "Provider Plans",
    plansLoading: "Loading plans...",
    plansEmpty: "No plans are published at the moment.",
    plansError: "The plans could not be loaded:",
    planFree: "Free",
    planPerMonth: "/ month",
    planBranches: "Up to {n} branches",
    planStaff: "Up to {n} staff members",
    planSms: "{n} SMS per month included",
    feesNote: "Platform fees depend on how a booking reaches you and are stated in the Provider Agreement and in your provider dashboard. Read them before you accept.",
    appTitle: "Provider Onboarding Application",
    appSubtitle: "Submit your commercial establishment details. Our team reviews every application before a provider account is activated.",
    gateway: "Provider application",
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
    taxLabel: "VAT registration number (15 digits, starts and ends with 3)",
    vatStatusLabel: "VAT registration *",
    vatRegistered: "My business is registered for VAT",
    vatNotRegistered: "My business is not registered for VAT",
    vatStatusRequired: "Say whether your business is registered for VAT.",
    vatNumberInvalid: "A VAT number has 15 digits and starts and ends with 3.",
    vatStatusHint: "This decides how invoices are issued for your bookings. PRIMORA verifies the number with ZATCA.",
    contactEmailLabel: "Business Email",
    contactPhoneLabel: "Business Phone (+966)",
    cityLabel: "City",
    cityPlaceholder: "e.g. Riyadh",
    districtLabel: "District",
    districtPlaceholder: "e.g. Al-Olaya",
    addressPlaceholder: "Building, street, landmarks",
    locationLegend: "Branch location",
    latitudeLabel: "Latitude (optional)",
    longitudeLabel: "Longitude (optional)",
    locationHelp: "Add the coordinates of your branch, or leave both empty and our team will confirm the location with you before approval.",
    useMyLocation: "Use my current location",
    locating: "Locating...",
    locationDenied: "Your browser did not share the location:",
    coordsPair: "Enter both latitude and longitude, or leave both empty.",
    coordsRange: "Latitude must be between -90 and 90 and longitude between -180 and 180.",
    cityRequired: "Please enter the city of the branch.",
    tradeLicenseHint: "An https:// link to the document, or leave empty.",
    tradeLicenseInvalid: "The trade license link must start with https://",
    addressLabel: "Street Address",
    tradeLicenseLabel: "Trade License Document Link",
    agreeTerms: "I confirm I am an authorized representative of this business and I agree to the Provider Agreement",
    agreementVersion: "version",
    agreementRead: "Read the agreement",
    agreementLoading: "Checking the published Provider Agreement...",
    agreementUnpublishedTitle: "Applications are closed for now",
    agreementUnpublished: "The Provider Agreement has not been published yet, so applications cannot be submitted. Please check back soon.",
    agreementError: "The Provider Agreement could not be loaded, so applications cannot be submitted right now:",
    agreementRequired: "Please agree to the Provider Agreement.",
    openApplication: "You already have an open application. Wait for the review before applying again.",
    appLoadFailed: "Your existing application could not be loaded:",
    submitFailed: "The application could not be submitted:",
    submitApp: "Submit Provider Application",
    submitting: "Submitting Application...",
    underReviewTitle: "Your Application is Under Review",
    underReviewMsg: "Our onboarding operations team is currently reviewing your registration credentials. We will notify you once approved.",
    approvedTitle: "Application Approved!",
    approvedMsg: "Your provider merchant account is active. Complete your guided setup on your salon dashboard.",
    goToDashboard: "Go to Salon Dashboard",
    rejectedTitle: "Application Not Approved",
    reapply: "Submit New Application",
    footerDesc: "A marketplace for beauty, grooming and wellness bookings in Saudi Arabia.",
    footerDiscover: "Discover",
    footerPartners: "For Partners",
    footerLegal: "Legal",
    allRightsReserved: "All rights reserved. Built for Riyadh, Saudi Arabia."
  },
  ar: {
    promoText: "احجز خدمات التجميل المنزلية ومواعيد الصالونات في المملكة العربية السعودية",
    home: "الرئيسية",
    discover: "الخدمات",
    serviceBoard: "لوحة الخدمات",
    becomeProvider: "انضم كمزود خدمة",
    aboutUs: "من نحن",
    login: "تسجيل الدخول",
    signup: "تسجيل جديد",
    title: "أضف صالونك أو محل الحلاقة أو السبا إلى بريمورا",
    subtitle: "أدرج منشأتك وحدّد خدماتك وأوقات عملك واستقبل الحجوزات مع عربون يُدفع في صفحة الدفع المستضافة لدى Tap.",
    ctaRegister: "سجل كمزود خدمة الآن",
    value1Title: "عربون عبر Tap وتحويل عند الطلب",
    value1Desc: "يدفع العملاء العربون في صفحة الدفع المستضافة لدى Tap. تُسجَّل أرباحك في سجل حسابك كمزود خدمة وتطلب تحويلها إلى حسابك البنكي المسجّل.",
    value2Title: "في الصالون وفي المنزل",
    value2Desc: "قدّم خدماتك في فرعك، وفي عنوان العميل حيث تفعّل الخدمة المنزلية.",
    value3Title: "الموظفون والأوقات",
    value3Desc: "خصص جداول موظفيك، نوبات العمل، والخدمات، مع قفل تلقائي للمواعيد خلال فترات الصلاة بالرياض.",
    planTitle: "باقات مقدمي الخدمة",
    plansLoading: "جارٍ تحميل الباقات...",
    plansEmpty: "لا توجد باقات منشورة حالياً.",
    plansError: "تعذر تحميل الباقات:",
    planFree: "مجانية",
    planPerMonth: "/ شهرياً",
    planBranches: "حتى {n} فروع",
    planStaff: "حتى {n} موظفين",
    planSms: "{n} رسالة نصية شهرياً مشمولة",
    feesNote: "تعتمد رسوم المنصة على طريقة وصول الحجز إليك وتُذكر في اتفاقية مقدم الخدمة وفي لوحة تحكمك. اقرأها قبل الموافقة.",
    appTitle: "طلب انضمام مزود خدمة جديد",
    appSubtitle: "قدّم بيانات منشأتك التجارية. يراجع فريقنا كل طلب قبل تفعيل حساب مقدم الخدمة.",
    gateway: "طلب انضمام مقدم خدمة",
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
    taxLabel: "الرقم الضريبي (15 رقماً يبدأ وينتهي بالرقم 3)",
    vatStatusLabel: "التسجيل في ضريبة القيمة المضافة *",
    vatRegistered: "منشأتي مسجلة في ضريبة القيمة المضافة",
    vatNotRegistered: "منشأتي غير مسجلة في ضريبة القيمة المضافة",
    vatStatusRequired: "حدد ما إذا كانت منشأتك مسجلة في ضريبة القيمة المضافة.",
    vatNumberInvalid: "الرقم الضريبي 15 رقماً يبدأ وينتهي بالرقم 3.",
    vatStatusHint: "يحدد هذا طريقة إصدار الفواتير لحجوزاتك. تتحقق بريمورا من الرقم لدى هيئة الزكاة والضريبة والجمارك.",
    contactEmailLabel: "البريد الإلكتروني للنشاط",
    contactPhoneLabel: "رقم جوال التواصل (+966)",
    cityLabel: "المدينة",
    cityPlaceholder: "مثال: الرياض",
    districtLabel: "الحي",
    districtPlaceholder: "مثال: العليا",
    addressPlaceholder: "المبنى والشارع وأقرب معلم",
    locationLegend: "موقع الفرع",
    latitudeLabel: "خط العرض (اختياري)",
    longitudeLabel: "خط الطول (اختياري)",
    locationHelp: "أضف إحداثيات فرعك، أو اترك الحقلين فارغين وسيؤكد فريقنا الموقع معك قبل الاعتماد.",
    useMyLocation: "استخدام موقعي الحالي",
    locating: "جارٍ تحديد الموقع...",
    locationDenied: "لم يشارك المتصفح الموقع:",
    coordsPair: "أدخل خط العرض وخط الطول معاً، أو اترك الحقلين فارغين.",
    coordsRange: "يجب أن يكون خط العرض بين -90 و90 وخط الطول بين -180 و180.",
    cityRequired: "يرجى إدخال مدينة الفرع.",
    tradeLicenseHint: "رابط يبدأ بـ https:// للوثيقة، أو اتركه فارغاً.",
    tradeLicenseInvalid: "يجب أن يبدأ رابط الرخصة التجارية بـ https://",
    addressLabel: "العنوان والشارع",
    tradeLicenseLabel: "رابط وثيقة الرخصة التجارية",
    agreeTerms: "أقر بأنني مفوض عن هذه المنشأة وأوافق على اتفاقية مقدم الخدمة",
    agreementVersion: "الإصدار",
    agreementRead: "قراءة الاتفاقية",
    agreementLoading: "جارٍ التحقق من اتفاقية مقدم الخدمة المنشورة...",
    agreementUnpublishedTitle: "باب التقديم مغلق حالياً",
    agreementUnpublished: "لم تُنشر اتفاقية مقدم الخدمة بعد، لذلك لا يمكن تقديم الطلبات. يرجى المحاولة قريباً.",
    agreementError: "تعذر تحميل اتفاقية مقدم الخدمة، لذلك لا يمكن تقديم الطلبات الآن:",
    agreementRequired: "يرجى الموافقة على اتفاقية مقدم الخدمة.",
    openApplication: "لديك طلب مفتوح بالفعل. انتظر نتيجة المراجعة قبل التقديم مرة أخرى.",
    appLoadFailed: "تعذر تحميل طلبك الحالي:",
    submitFailed: "تعذر تقديم الطلب:",
    submitApp: "إرسال طلب الانضمام",
    submitting: "جاري تقديم الطلب...",
    underReviewTitle: "طلبك قيد المراجعة والتدقيق",
    underReviewMsg: "يعمل فريق العمليات والتحقق على مراجعة وثائق السجل التجاري. سيتم إشعارك فور الاعتماد.",
    approvedTitle: "تم اعتماد طلبك بنجاح!",
    approvedMsg: "حسابك التجاري نشط. يمكنك الآن استكمال الإعداد الإرشادي في لوحة تحكم المزود.",
    goToDashboard: "الانتقال إلى لوحة تحكم المزود",
    rejectedTitle: "لم تتم الموافقة على الطلب",
    reapply: "تقديم طلب جديد",
    footerDesc: "منصة لحجوزات الجمال والعناية والعافية في المملكة العربية السعودية.",
    footerDiscover: "استكشف",
    footerPartners: "للشركاء",
    footerLegal: "قانوني",
    allRightsReserved: "جميع الحقوق محفوظة. صمم خصيصاً للرياض، المملكة العربية السعودية."
  }
};

type ApplicationRow = {
  status: string;
  business_type?: string;
  business_name_en: string;
  business_name_ar: string;
  created_at: string;
  rejection_reason?: string | null;
};

type PlanRow = {
  id: string;
  name_en: string;
  name_ar: string;
  price_monthly_sar: number | string;
  max_branches: number;
  max_employees: number;
  included_monthly_sms: number;
};

export default function BecomeProviderRootPage() {
  const [locale, setLocale] = usePageLocale();
  const t = translations[locale];

  const toggleLanguage = () => {
    setLocale(locale === "en" ? "ar" : "en");
  };

  const isRTL = locale === "ar";

  const [currentUser, setCurrentUser] = useState<{ id: string; email?: string; phone?: string } | null>(null);
  const [existingApp, setExistingApp] = useState<ApplicationRow | null>(null);
  const [checkingApp, setCheckingApp] = useState(true);
  const [appForm, setAppForm] = useState({
    businessNameEn: "",
    businessNameAr: "",
    businessType: "salon" as "salon" | "barbershop" | "spa" | "freelancer",
    crNumber: "",
    taxNumber: "",
    vatStatus: "" as "" | "registered" | "not_registered",
    contactEmail: "",
    contactPhone: "",
    city: "",
    district: "",
    addressText: "",
    latitude: "",
    longitude: "",
    tradeLicenseUrl: "",
    agreed: false
  });
  const [agreement, setAgreement] = useState<AgreementLookup>({ state: "loading" });
  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [plansError, setPlansError] = useState("");
  const [appLoadError, setAppLoadError] = useState("");
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);

  useEffect(() => {
    async function checkUserApp() {
      try {
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
          if (appError) throw appError;
          if (appData) setExistingApp(appData);
        }
      } catch (err) {
        setAppLoadError(errorMessage(err));
      } finally {
        setCheckingApp(false);
      }
    }
    void checkUserApp();
  }, []);

  // The published Provider Agreement decides whether applications are open at all: the server refuses an application while none
  // is published, and the acceptance is recorded against the version shown here.
  useEffect(() => {
    let active = true;
    lookupPublishedAgreement("provider_agreement", errorMessage, true).then((result) => {
      if (active) setAgreement(result);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    supabase
      .from("subscription_plans")
      .select("id, name_en, name_ar, price_monthly_sar, max_branches, max_employees, included_monthly_sms")
      .eq("is_active", true)
      .order("price_monthly_sar", { ascending: true })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setPlansError(errorMessage(error));
        else setPlans((data ?? []) as PlanRow[]);
      });
    return () => {
      active = false;
    };
  }, []);

  const fillMyLocation = () => {
    setLocationError("");
    if (!navigator.geolocation) {
      setLocationError(`${t.locationDenied} -`);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setAppForm((prev) => ({ ...prev, latitude: position.coords.latitude.toFixed(6), longitude: position.coords.longitude.toFixed(6) }));
        setLocating(false);
      },
      (positionError) => {
        setLocationError(`${t.locationDenied} ${positionError.message}`);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const handleSubmitApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (agreement.state !== "ready") {
      setSubmitError(agreement.state === "error" ? `${t.agreementError} ${agreement.message}` : agreement.state === "unpublished" ? t.agreementUnpublished : t.agreementLoading);
      return;
    }
    if (!appForm.businessNameEn.trim() || !appForm.businessNameAr.trim()) {
      setSubmitError(isRTL ? "يرجى إدخال اسم المنشأة بالعربية والإنجليزية." : "Please enter the business name in both Arabic and English.");
      return;
    }
    if (!appForm.contactPhone.trim() || !appForm.district.trim() || !appForm.addressText.trim()) {
      setSubmitError(isRTL ? "يرجى تعبئة بيانات الاتصال والحي والعنوان." : "Please complete contact phone, district, and address details.");
      return;
    }
    if (!appForm.city.trim()) {
      setSubmitError(t.cityRequired);
      return;
    }
    const latText = appForm.latitude.trim();
    const lngText = appForm.longitude.trim();
    if ((latText === "") !== (lngText === "")) {
      setSubmitError(t.coordsPair);
      return;
    }
    const latitude = latText === "" ? null : Number(latText);
    const longitude = lngText === "" ? null : Number(lngText);
    if (latitude !== null && longitude !== null) {
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        setSubmitError(t.coordsRange);
        return;
      }
    }
    const tradeLicense = appForm.tradeLicenseUrl.trim();
    if (tradeLicense && !/^https:\/\/\S+$/i.test(tradeLicense)) {
      setSubmitError(t.tradeLicenseInvalid);
      return;
    }
    // D-D3: the VAT status is captured at onboarding; a registered business gives a well-formed number.
    if (!appForm.vatStatus) {
      setSubmitError(t.vatStatusRequired);
      return;
    }
    if (appForm.vatStatus === "registered" && !/^3\d{13}3$/.test(appForm.taxNumber.replace(/\s+/g, ""))) {
      setSubmitError(t.vatNumberInvalid);
      return;
    }
    if (!appForm.agreed) {
      setSubmitError(t.agreementRequired);
      return;
    }

    setSubmitting(true);
    setSubmitError("");
    try {
      // The acceptance is evidence of the version that was shown, so it is stored first (and is safe to repeat); the application
      // is then stamped by the server with that agreement and the acceptance time.
      const { error: acceptanceError } = await supabase.rpc("record_agreement_acceptance", {
        p_agreement_key: "provider_agreement",
        p_version: agreement.agreement.version,
        p_method: "become_provider_form"
      });
      if (acceptanceError) throw acceptanceError;

      const { data, error } = await supabase.from("provider_applications").insert({
        user_id: currentUser.id,
        business_name_en: appForm.businessNameEn.trim(),
        business_name_ar: appForm.businessNameAr.trim(),
        business_type: appForm.businessType,
        cr_number: appForm.crNumber.trim() || null,
        tax_number: appForm.vatStatus === "registered" ? appForm.taxNumber.replace(/\s+/g, "") : null,
        vat_registration_status: appForm.vatStatus,
        contact_email: appForm.contactEmail.trim() || currentUser.email,
        contact_phone: appForm.contactPhone.trim(),
        city: appForm.city.trim(),
        district: appForm.district.trim(),
        address_text: appForm.addressText.trim(),
        latitude,
        longitude,
        trade_license_url: tradeLicense || null
      }).select().single();

      if (error) throw error;

      setExistingApp(data);
      setSubmitSuccess(true);
      trackEvent("provider_applied", { channel: "web_form", segment: data?.business_type || "unknown" });
    } catch (err: unknown) {
      const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
      setSubmitError(code === "23505" ? t.openApplication : `${t.submitFailed} ${errorMessage(err)}`);
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
            <Link href="/services" aria-label={t.discover} className="text-stone-700 hover:text-stone-950 transition">
              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </Link>
            <Link href="/login" aria-label={t.login} className="text-stone-700 hover:text-stone-950 transition">
              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </Link>
          </div>
          <div className="h-4 w-px bg-stone-200"></div>
          <button
            type="button"
            onClick={toggleLanguage}
            aria-label={locale === "en" ? "Switch the language to Arabic" : "تغيير اللغة إلى الإنجليزية"}
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

        {/* Plans: read from subscription_plans; nothing about price or limits is written into this page. */}
        <div className="space-y-8">
          <h2 className="text-xl font-serif font-bold text-stone-950 text-center">{t.planTitle}</h2>

          {plansError ? (
            <div role="alert" className="mx-auto max-w-3xl rounded-2xl border border-[#FECDCA] bg-[#FEF3F2] p-4 text-xs font-bold text-[#B42318]">
              {t.plansError} {plansError}
            </div>
          ) : plans === null ? (
            <p role="status" className="text-center text-xs font-semibold text-stone-500">{t.plansLoading}</p>
          ) : plans.length === 0 ? (
            <p className="text-center text-xs font-semibold text-stone-500">{t.plansEmpty}</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {plans.map((plan) => {
                const price = Number(plan.price_monthly_sar);
                return (
                  <div key={plan.id} className="bg-white border border-stone-200 p-8 rounded-2xl space-y-4 shadow-sm">
                    <h3 className="font-bold text-base text-stone-950">{isRTL ? plan.name_ar : plan.name_en}</h3>
                    <p className="text-2xl font-black text-stone-900">
                      {price === 0 ? t.planFree : sar(price, locale)}
                      {price === 0 ? null : <span className="text-xs font-semibold text-stone-500"> {t.planPerMonth}</span>}
                    </p>
                    <ul className="space-y-1.5 text-xs text-stone-600 font-light">
                      <li>{t.planBranches.replace("{n}", String(plan.max_branches))}</li>
                      <li>{t.planStaff.replace("{n}", String(plan.max_employees))}</li>
                      <li>{t.planSms.replace("{n}", String(plan.included_monthly_sms))}</li>
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
          <p className="mx-auto max-w-2xl text-center text-xs leading-relaxed text-stone-500">{t.feesNote}</p>
        </div>

        <hr className="border-stone-200" />

        {/* 5. ONBOARDING APPLICATION SECTION */}
        <section id="application-form" className="space-y-8 scroll-mt-24">
          <div className="text-center space-y-3">
            <span className="text-[10px] tracking-widest uppercase font-extrabold text-[#D1AF47]">
              {t.gateway}
            </span>
            <h2 className="text-3xl font-serif font-black text-stone-950">{t.appTitle}</h2>
            <p className="text-sm text-stone-500 max-w-xl mx-auto leading-relaxed">{t.appSubtitle}</p>
          </div>

          {appLoadError && (
            <div role="alert" className="rounded-2xl border border-[#FECDCA] bg-[#FEF3F2] p-4 text-xs font-bold text-[#B42318]">
              {t.appLoadFailed} {appLoadError}
            </div>
          )}

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
          ) : existingApp && (existingApp.status === "pending" || existingApp.status === "under_review") ? (
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
                  <span>{new Intl.DateTimeFormat(isRTL ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "medium", timeZone: "Asia/Riyadh" }).format(new Date(existingApp.created_at))}</span>
                </div>
              </div>
            </div>
          ) : existingApp && existingApp.status === "approved" ? (
            <div className="rounded-3xl border border-[#ABEFC6] bg-[#ECFDF3] p-8 sm:p-12 text-center space-y-4">
              <span className="rounded-full bg-[#12B76A] px-3 py-1 text-[10px] font-black uppercase text-white">
                {isRTL ? "تمت الموافقة والتفعيل" : "Approved & Active"}
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

              {agreement.state === "loading" && (
                <p role="status" className="text-xs font-semibold text-stone-500">{t.agreementLoading}</p>
              )}
              {agreement.state === "unpublished" && (
                <div role="alert" className="rounded-2xl border border-[#FEDF89] bg-[#FFFAEB] p-4 text-xs text-[#93370D] space-y-1">
                  <strong className="block font-bold">{t.agreementUnpublishedTitle}</strong>
                  <p>{t.agreementUnpublished}</p>
                </div>
              )}
              {agreement.state === "error" && (
                <div role="alert" className="rounded-2xl border border-[#FECDCA] bg-[#FEF3F2] p-4 text-xs font-bold text-[#B42318]">
                  {t.agreementError} {agreement.message}
                </div>
              )}

              {submitError && (
                <div role="alert" className="rounded-2xl border border-[#FECDCA] bg-[#FEF3F2] p-4 text-xs font-bold text-[#B42318]">
                  {submitError}
                </div>
              )}

              {submitSuccess && (
                <div role="status" className="rounded-2xl border border-[#ABEFC6] bg-[#ECFDF3] p-4 text-xs font-bold text-[#027A48]">
                  {isRTL ? "تم استلام طلبك. سيراجعه فريقنا ويتواصل معك عبر رقم الجوال المسجل." : "Application received. Our team will review it and contact you on your registered phone."}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="bp-businessNameEnLabel" className="block text-xs font-bold text-stone-700 mb-1.5">{t.businessNameEnLabel} *</label>
                  <input id="bp-businessNameEnLabel"
                    type="text"
                    required
                    value={appForm.businessNameEn}
                    onChange={(e) => setAppForm((prev) => ({ ...prev, businessNameEn: e.target.value }))}
                    placeholder="e.g. Al-Olaya Luxury Salon"
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-xs text-stone-900 outline-none focus:border-stone-900 focus:bg-white"
                  />
                </div>
                <div>
                  <label htmlFor="bp-businessNameArLabel" className="block text-xs font-bold text-stone-700 mb-1.5">{t.businessNameArLabel} *</label>
                  <input id="bp-businessNameArLabel"
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
                  <label htmlFor="bp-businessTypeLabel" className="block text-xs font-bold text-stone-700 mb-1.5">{t.businessTypeLabel}</label>
                  <select id="bp-businessTypeLabel"
                    value={appForm.businessType}
                    onChange={(e) => setAppForm((prev) => ({ ...prev, businessType: e.target.value as typeof appForm.businessType }))}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-xs text-stone-900 outline-none focus:border-stone-900 focus:bg-white"
                  >
                    <option value="salon">{t.salon}</option>
                    <option value="barbershop">{t.barbershop}</option>
                    <option value="spa">{t.spa}</option>
                    <option value="freelancer">{t.freelancer}</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="bp-crLabel" className="block text-xs font-bold text-stone-700 mb-1.5">{t.crLabel}</label>
                  <input id="bp-crLabel"
                    type="text"
                    value={appForm.crNumber}
                    onChange={(e) => setAppForm((prev) => ({ ...prev, crNumber: e.target.value }))}
                    placeholder="1010XXXXXX"
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-xs text-stone-900 outline-none focus:border-stone-900 focus:bg-white"
                  />
                </div>
                <div className="space-y-3">
                  <fieldset className="space-y-1.5">
                    <legend className="block text-xs font-bold text-stone-700 mb-1.5">{t.vatStatusLabel}</legend>
                    <label className="flex items-center gap-2 text-xs text-stone-800">
                      <input type="radio" name="bp-vat-status" checked={appForm.vatStatus === "registered"} onChange={() => setAppForm((prev) => ({ ...prev, vatStatus: "registered" }))} />
                      {t.vatRegistered}
                    </label>
                    <label className="flex items-center gap-2 text-xs text-stone-800">
                      <input type="radio" name="bp-vat-status" checked={appForm.vatStatus === "not_registered"} onChange={() => setAppForm((prev) => ({ ...prev, vatStatus: "not_registered", taxNumber: "" }))} />
                      {t.vatNotRegistered}
                    </label>
                    <p className="text-[11px] text-stone-500">{t.vatStatusHint}</p>
                  </fieldset>
                  {appForm.vatStatus === "registered" ? (
                    <div>
                      <label htmlFor="bp-taxLabel" className="block text-xs font-bold text-stone-700 mb-1.5">{t.taxLabel} *</label>
                      <input id="bp-taxLabel"
                        type="text"
                        dir="ltr"
                        inputMode="numeric"
                        value={appForm.taxNumber}
                        onChange={(e) => setAppForm((prev) => ({ ...prev, taxNumber: e.target.value }))}
                        placeholder="3000XXXXXXXXXXX"
                        className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-xs text-stone-900 outline-none focus:border-stone-900 focus:bg-white"
                      />
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="bp-contactEmailLabel" className="block text-xs font-bold text-stone-700 mb-1.5">{t.contactEmailLabel} *</label>
                  <input id="bp-contactEmailLabel"
                    type="email"
                    required
                    value={appForm.contactEmail}
                    onChange={(e) => setAppForm((prev) => ({ ...prev, contactEmail: e.target.value }))}
                    placeholder="owner@salon.sa"
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-xs text-stone-900 outline-none focus:border-stone-900 focus:bg-white"
                  />
                </div>
                <div>
                  <label htmlFor="bp-contactPhoneLabel" className="block text-xs font-bold text-stone-700 mb-1.5">{t.contactPhoneLabel} *</label>
                  <input id="bp-contactPhoneLabel"
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
                  <label htmlFor="bp-cityLabel" className="block text-xs font-bold text-stone-700 mb-1.5">{t.cityLabel} *</label>
                  <input id="bp-cityLabel"
                    type="text"
                    required
                    value={appForm.city}
                    onChange={(e) => setAppForm((prev) => ({ ...prev, city: e.target.value }))}
                    placeholder={t.cityPlaceholder}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-xs text-stone-900 outline-none focus:border-stone-900 focus:bg-white"
                  />
                </div>
                <div>
                  <label htmlFor="bp-districtLabel" className="block text-xs font-bold text-stone-700 mb-1.5">{t.districtLabel} *</label>
                  <input id="bp-districtLabel"
                    type="text"
                    required
                    value={appForm.district}
                    onChange={(e) => setAppForm((prev) => ({ ...prev, district: e.target.value }))}
                    placeholder={t.districtPlaceholder}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-xs text-stone-900 outline-none focus:border-stone-900 focus:bg-white"
                  />
                </div>
                <div>
                  <label htmlFor="bp-addressLabel" className="block text-xs font-bold text-stone-700 mb-1.5">{t.addressLabel} *</label>
                  <input id="bp-addressLabel"
                    type="text"
                    required
                    value={appForm.addressText}
                    onChange={(e) => setAppForm((prev) => ({ ...prev, addressText: e.target.value }))}
                    placeholder={t.addressPlaceholder}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-xs text-stone-900 outline-none focus:border-stone-900 focus:bg-white"
                  />
                </div>
              </div>

              <fieldset className="space-y-3 rounded-2xl border border-stone-200 p-4">
                <legend className="px-2 text-xs font-bold text-stone-700">{t.locationLegend}</legend>
                <p className="text-xs leading-relaxed text-stone-500">{t.locationHelp}</p>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label htmlFor="bp-latitude" className="block text-xs font-bold text-stone-700 mb-1.5">{t.latitudeLabel}</label>
                    <input id="bp-latitude"
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min={-90}
                      max={90}
                      dir="ltr"
                      value={appForm.latitude}
                      onChange={(e) => setAppForm((prev) => ({ ...prev, latitude: e.target.value }))}
                      className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-xs text-stone-900 outline-none focus:border-stone-900 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="bp-longitude" className="block text-xs font-bold text-stone-700 mb-1.5">{t.longitudeLabel}</label>
                    <input id="bp-longitude"
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min={-180}
                      max={180}
                      dir="ltr"
                      value={appForm.longitude}
                      onChange={(e) => setAppForm((prev) => ({ ...prev, longitude: e.target.value }))}
                      className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-xs text-stone-900 outline-none focus:border-stone-900 focus:bg-white"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={fillMyLocation}
                  disabled={locating}
                  className="rounded-xl border border-stone-300 px-4 py-2 text-xs font-bold text-stone-800 transition hover:border-stone-900 focus-visible:outline-2 focus-visible:outline-stone-900 disabled:opacity-50"
                >
                  {locating ? t.locating : t.useMyLocation}
                </button>
                {locationError && <p role="alert" className="text-xs font-semibold text-[#B42318]">{locationError}</p>}
              </fieldset>

              <div>
                <label htmlFor="bp-tradeLicenseLabel" className="block text-xs font-bold text-stone-700 mb-1.5">{t.tradeLicenseLabel}</label>
                <input id="bp-tradeLicenseLabel"
                  type="url"
                  dir="ltr"
                  value={appForm.tradeLicenseUrl}
                  onChange={(e) => setAppForm((prev) => ({ ...prev, tradeLicenseUrl: e.target.value }))}
                  placeholder="https://..."
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-xs text-stone-900 outline-none focus:border-stone-900 focus:bg-white"
                />
              </div>

              <div className="pt-2">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={appForm.agreed}
                    onChange={(e) => setAppForm((prev) => ({ ...prev, agreed: e.target.checked }))}
                    required
                    className="mt-0.5 rounded border-stone-300 text-stone-900 focus:ring-stone-900 focus-visible:outline-2 focus-visible:outline-stone-900"
                  />
                  <span className="text-xs text-stone-600 leading-relaxed font-medium">
                    {t.agreeTerms}
                    {agreement.state === "ready" ? ` (${t.agreementVersion} ${agreement.agreement.version})` : ""}.
                  </span>
                </label>
                {agreement.state === "ready" && (
                  <details className="mt-3 rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs text-stone-700">
                    <summary className="cursor-pointer font-bold text-stone-900">{t.agreementRead}</summary>
                    <h4 className="mt-3 font-bold">{isRTL ? agreement.agreement.title_ar : agreement.agreement.title_en}</h4>
                    <p className="mt-2 whitespace-pre-line leading-relaxed">{isRTL ? agreement.agreement.content_ar : agreement.agreement.content_en}</p>
                  </details>
                )}
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={submitting || agreement.state !== "ready"}
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
