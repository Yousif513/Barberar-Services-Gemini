"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { trackEvent } from "@/lib/analytics";
import { ToastContainer } from "@/components/toast";
import { Coordinates, CalculationMethod, PrayerTimes, Madhab } from "adhan";
import { errorMessage } from "@/lib/error-message";
import { sar } from "@/components/operations-ui";
import { PublicDialog } from "@/components/public-dialog";
import { formatBookingDate, formatBookingTime, riyadhDateKey } from "@/lib/booking-display.mjs";
import { lookupPublishedAgreement, type AgreementLookup } from "@/lib/published-agreement";
import { usePageLocale } from "@/lib/use-page-locale";

export const dynamic = "force-dynamic";

const translations = {
  en: {
    promoText: "Book salon and barber appointments with verified providers",
    home: "Home",
    discover: "Services",
    serviceBoard: "Service Board",
    becomeProvider: "Become a Provider",
    aboutUs: "About Us",
    login: "Log in",
    signup: "Sign up",
    servicesTitle: "Select Services",
    specialistsTitle: "Choose a Specialist",
    noSpecialistSelected: "Select a specialist to proceed",
    anySpecialist: "Any Specialist (First Available)",
    selectDateTitle: "Select Date",
    selectTimeTitle: "Available Time Slots",
    prayerBufferWarning: "Riyadh prayer time slots are automatically buffered (20-minute gap).",
    summaryTitle: "Booking Summary",
    isHomeServiceLabel: "Request Home Service",
    priceLabel: "Service Price",
    depositLabel: "Deposit paid online",
    venueBalanceLabel: "Pay at the venue",
    dueNowLabel: "Due Now",
    payButton: "Confirm & pay deposit",
    successRedirecting: "Payment successful! Redirecting to customer dashboard...",
    errorTitle: "Booking Error",
    errorSelectDetails: "Please select a service, a specialist, a date, and a time slot.",
    reviewsCount: "reviews",
    startingFrom: "Starting from",
    mins: "mins",
    platformFeeSplit: "Payments are processed by Tap. Card details never touch PRIMORA.",
    footerDesc: "Luxury Beauty, Grooming & Wellness Marketplace. Connecting premier Riyadh & Jeddah artists with selective clients.",
    footerDiscover: "Discover",
    footerPartners: "For Partners",
    footerLegal: "Legal",
    allRightsReserved: "All rights reserved. Built for Saudi Arabia.",
    venueInfoTitle: "Venue Details",
    addressLabel: "Address",
    ratingLabel: "Rating",
    backToStore: "← Back to Store",
    tabServices: "Browse Services",
    tabPackages: "Memberships & Packages",
    packagesTitle: "Spa Packages & Multi-Session Passes",
    purchasePass: "Purchase Pass",
    sessionCountText: "sessions",
    expiresInText: "days validity",
    successPackageRedirecting: "Package purchased successfully! Redirecting to your memberships...",
    multiServiceCart: "Services in Cart",
    addService: "Add Service",
    removeService: "Remove",
    combinedDuration: "Total Duration",
    combinedTotal: "Total Amount",
    joinWaitlistBtn: "Join Waitlist",
    closeDialog: "Close",
    authTermsBefore: "I agree to the",
    authTermsLink: "Terms of Service",
    authTermsMid: "and the",
    authPrivacyLink: "Privacy Notice",
    authTermsVersion: "version",
    authTermsRequired: "Please accept the Terms of Service and the Privacy Notice to continue.",
    authTermsLoading: "Checking the published terms...",
    authTermsUnpublished: "The customer terms have not been published yet, so a new account cannot be verified here. Please try again later.",
    authTermsError: "The published terms could not be loaded:",
    authConsentFailed: "Your number is verified, but your consent choices could not be saved:",
    authRetryConsent: "Retry saving consent",
    bookAgainMissing: "The service from your previous booking is no longer offered. Pick a service below.",
    waitlistModalTitle: "Join Waitlist",
    waitlistModalDesc: "If a cancellation occurs, you will receive an automated WhatsApp notification with an exclusive 15-minute priority claim window.",
    preferredTimeStart: "Preferred Start Time",
    preferredTimeEnd: "Preferred End Time",
    confirmJoinWaitlist: "Confirm Waitlist Entry",
    waitlistSuccess: "Successfully added to waitlist! Queue position: #",
    blockedWarning: "Booking Restricted: Your account has been blocked by this provider.",
    strikePrepaymentWarning: "Policy Notice: Due to 3 or more previous no-shows, 100% upfront prepayment is required for this appointment.",
    prayerPauseNotice: "Riyadh Prayer Breaks (25-min congregational prayer pauses)",
    favoriteBtn: "Save to Favorites",
    messageBtn: "Message",
    favoritedBtn: "Favorited",
  },
  ar: {
    promoText: "احجز أفضل خدمات التجميل والعناية المنزلية والصالونات في الرياض وجدة",
    home: "الرئيسية",
    discover: "الخدمات",
    serviceBoard: "لوحة الخدمات",
    becomeProvider: "انضم كمزود خدمة",
    aboutUs: "من نحن",
    login: "تسجيل الدخول",
    signup: "تسجيل جديد",
    servicesTitle: "اختر الخدمات",
    specialistsTitle: "اختر الأخصائي",
    noSpecialistSelected: "يرجى اختيار أخصائي للمتابعة",
    anySpecialist: "أي أخصائي (المتاح أولاً)",
    selectDateTitle: "اختر التاريخ",
    selectTimeTitle: "الأوقات المتاحة",
    prayerBufferWarning: "يتم حجب أوقات الصلاة بالرياض تلقائياً (فارق 20 دقيقة).",
    summaryTitle: "ملخص الحجز",
    isHomeServiceLabel: "طلب خدمة منزلية",
    priceLabel: "سعر الخدمة",
    depositLabel: "العربون المدفوع إلكترونياً",
    venueBalanceLabel: "المتبقي يُدفع في المركز",
    dueNowLabel: "المستحق الآن",
    payButton: "تأكيد ودفع العربون",
    successRedirecting: "تم الدفع بنجاح! جاري تحويلك إلى لوحة التحكم للعميل...",
    errorTitle: "خطأ في الحجز",
    errorSelectDetails: "يرجى اختيار الخدمة، الأخصائي، التاريخ، والوقت المحدد.",
    reviewsCount: "تقييم",
    startingFrom: "تبدأ من",
    mins: "دقيقة",
    platformFeeSplit: "تتم معالجة المدفوعات عبر Tap ولا تمر بيانات البطاقة عبر بريمورا.",
    footerDesc: "منصة الجمال الفاخرة، والعناية والعافية. نصل بين أفضل فناني الرياض وجدة والعملاء المميزين.",
    footerDiscover: "استكشف",
    footerPartners: "للشركاء",
    footerLegal: "قانوني",
    allRightsReserved: "جميع الحقوق محفوظة. صمم خصيصاً للمملكة العربية السعودية.",
    venueInfoTitle: "تفاصيل المركز",
    addressLabel: "العنوان",
    ratingLabel: "التقييم",
    backToStore: "← العودة إلى المتجر",
    tabServices: "تصفح الخدمات",
    tabPackages: "العضويات والباقات",
    packagesTitle: "باقات وعضويات السبا الاستشفائية المتاحة",
    purchasePass: "شراء العضوية",
    sessionCountText: "جلسة",
    expiresInText: "يوم صلاحية",
    successPackageRedirecting: "تم شراء الباقة بنجاح! جاري تحويلك إلى صفحة العضويات...",
    multiServiceCart: "الخدمات المختارة في السلة",
    addService: "إضافة للحجز",
    removeService: "إزالة",
    combinedDuration: "إجمالي المدة",
    combinedTotal: "إجمالي المبلغ",
    joinWaitlistBtn: "انضم لقائمة الانتظار",
    closeDialog: "إغلاق",
    authTermsBefore: "أوافق على",
    authTermsLink: "شروط الخدمة",
    authTermsMid: "و",
    authPrivacyLink: "إشعار الخصوصية",
    authTermsVersion: "الإصدار",
    authTermsRequired: "يرجى الموافقة على شروط الخدمة وإشعار الخصوصية للمتابعة.",
    authTermsLoading: "جارٍ التحقق من الشروط المنشورة...",
    authTermsUnpublished: "لم تُنشر شروط العملاء بعد، لذلك لا يمكن توثيق حساب جديد هنا. يرجى المحاولة لاحقاً.",
    authTermsError: "تعذر تحميل الشروط المنشورة:",
    authConsentFailed: "تم التحقق من رقمك، لكن تعذر حفظ خيارات الموافقة:",
    authRetryConsent: "إعادة محاولة حفظ الموافقة",
    bookAgainMissing: "الخدمة من حجزك السابق لم تعد متاحة. اختر خدمة من القائمة.",
    waitlistModalTitle: "الانضمام لقائمة الانتظار التلقائية",
    waitlistModalDesc: "في حال حدوث أي إلغاء، ستصلك رسالة واتساب فورية مع رابط حجز مخصص بنافذة حصرية مدتها 15 دقيقة.",
    preferredTimeStart: "بداية الفترة المفضلة",
    preferredTimeEnd: "نهاية الفترة المفضلة",
    confirmJoinWaitlist: "تأكيد الانضمام لقائمة الانتظار",
    waitlistSuccess: "تمت إضافتك لقائمة الانتظار بنجاح! موقعك في الطابور: #",
    blockedWarning: "الحجز مقيد: حسابك محظور من قبل مزود الخدمة هذا.",
    strikePrepaymentWarning: "تنبيه السياسة: نظراً لتسجيل 3 حالات عدم حضور سابقة، يلزم دفع كامل المبلغ (100%) مقدماً لتأكيد الحجز.",
    prayerPauseNotice: "أوقات الصلاة بالرياض (توقف مؤقت 25 دقيقة أثناء أداء صلاة الجماعة)",
    favoriteBtn: "حفظ في المفضلة",
    messageBtn: "مراسلة",
    favoritedBtn: "محفوظ في المفضلة",
  }
};

interface SpecialistItem {
  id: string;
  name: { en: string; ar: string };
  role: { en: string; ar: string };
  rating: number | null;
  avatar: string;
  bio?: { en: string; ar: string };
  experienceYears?: number;
  specialties?: string[];
  instagramHandle?: string;
}

interface ShopItem {
  id: string;
  branchId: string;
  crVerified: boolean;
  depositPercentage: number;
  freeCancellationHours: number;
  lateCancellationFeePercent: number;
  noShowFeePercent: number;
  name: { en: string; ar: string };
  city: string;
  neighborhood: string;
  neighborhoodKey: string;
  address: { en: string; ar: string };
  rating: number | null;
  reviewsCount: number;
  image: string;
  description: { en: string; ar: string };
  specialists: SpecialistItem[];
}

interface ServiceItem {
  id: string;
  shopId: string;
  name: { en: string; ar: string };
  category: string;
  gender: "men" | "women" | "unisex";
  price: number;
  duration: number;
  rating: number;
  reviewsCount: number;
  serviceType: "mobile" | "salon";
  image: string;
}

interface ReviewItem {
  id: string;
  name: string;
  date: string;
  rating: number;
  comment: string;
  reply: string | null;
}

type LoyaltySettings = { enabled: boolean; sarPerPoint: number; minRedeemPoints: number };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const formatSlotLabel = (iso: string, locale: "en" | "ar") => formatBookingTime(iso, locale);

interface PackageItem {
  id: string;
  shopId: string;
  name: { en: string; ar: string };
  description: { en: string; ar: string };
  price: number;
  sessionCount: number;
  expiresInDays: number;
}


export default function ShopDetailsPage() {
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: "success" | "info" | "error" }>>([]);
  const addToast = (message: string, type: "success" | "info" | "error") => {
    const id = Math.random().toString(36).substring(7);
    setToasts(prev => [...prev, { id, message, type }]);
  };
  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const params = useParams();
  const router = useRouter();
  const shopId = (params?.id as string) || "1";

  const [locale, setLocale] = usePageLocale();
  const t = translations[locale];
  const money = (value: number) => sar(value, locale);
  // The first bookable day shown in Riyadh, read once (a date picker cannot go before it).
  const [todayKey] = useState(() => riyadhDateKey(new Date()));

  const [selectedServices, setSelectedServices] = useState<ServiceItem[]>([]);
  const selectedService = selectedServices[0] || null;
  const setSelectedService = (srv: ServiceItem | null) => {
    if (!srv) {
      setSelectedServices([]);
    } else {
      setSelectedServices([srv]);
    }
  };

  const handleToggleService = (srv: ServiceItem) => {
    setSelectedServices(prev => {
      const exists = prev.some(s => s.id === srv.id);
      if (exists) {
        const next = prev.filter(s => s.id !== srv.id);
        if (next.length === 0) {
          setSelectedSlot("");
        }
        return next;
      } else {
        return [...prev, srv];
      }
    });
  };

  const totalCombinedDuration = selectedServices.reduce((sum, s) => sum + s.duration, 0);
  const totalCombinedPrice = selectedServices.reduce((sum, s) => sum + s.price, 0);

  const [selectedSpecialist, setSelectedSpecialist] = useState<SpecialistItem | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const searchParams = useSearchParams();
  const serviceId = searchParams.get("service");
  const [coordinates, setCoordinates] = useState({ lat: 24.7136, lng: 46.6753 });
  const [dbSlots, setDbSlots] = useState<string[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isHomeService, setIsHomeService] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  // G44 Waitlist Modal states
  const [showWaitlistModal, setShowWaitlistModal] = useState(false);
  const [waitlistStartTime, setWaitlistStartTime] = useState("10:00");
  const [waitlistEndTime, setWaitlistEndTime] = useState("18:00");
  const [isSubmittingWaitlist, setIsSubmittingWaitlist] = useState(false);

  // G57 Customer Eligibility states
  const [customerEligibility, setCustomerEligibility] = useState<{
    isBlocked: boolean;
    blockReason: string;
    strikes: number;
    requiresPrepayment: boolean;
  } | null>(null);

  const [activeTab, setActiveTab] = useState<"services" | "packages">("services");

  const [isFavorited, setIsFavorited] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);

  // G46 Coupons & G48 Gift Cards & G50 Loyalty States
  const [couponCodeInput, setCouponCodeInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number; fundingSource: string } | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponMessage, setCouponMessage] = useState("");

  const [giftCardInput, setGiftCardInput] = useState("");
  const [appliedGiftCard, setAppliedGiftCard] = useState<{ code: string; amount: number } | null>(null);
  const [giftCardLoading, setGiftCardLoading] = useState(false);
  const [giftCardMessage, setGiftCardMessage] = useState("");

  const [loyaltyPoints, setLoyaltyPoints] = useState<number>(0);
  const [redeemLoyalty, setRedeemLoyalty] = useState(false);
  const [loyaltyDiscount, setLoyaltyDiscount] = useState<number>(0);

  const [clientProfiles, setClientProfiles] = useState<any[]>([]);
  const [selectedClientProfileId, setSelectedClientProfileId] = useState("");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authPhone, setAuthPhone] = useState("");
  const [authOtpCode, setAuthOtpCode] = useState("");
  const [authOtpSent, setAuthOtpSent] = useState(false);
  const [authConsentTerms, setAuthConsentTerms] = useState(false);
  const [authTerms, setAuthTerms] = useState<AgreementLookup>({ state: "loading" });
  const [authVerifiedUserId, setAuthVerifiedUserId] = useState<string | null>(null);
  const [authConsentWhatsapp, setAuthConsentWhatsapp] = useState(false);
  const [authConsentMarketing, setAuthConsentMarketing] = useState(false);
  const [authModalError, setAuthModalError] = useState("");
  const [authModalLoading, setAuthModalLoading] = useState(false);

  // Provider data loaded from the database (no mock fallbacks)
  const [loadedShop, setLoadedShop] = useState<ShopItem | null>(null);
  const [loadedServices, setLoadedServices] = useState<ServiceItem[]>([]);
  const [providerPackages, setProviderPackages] = useState<PackageItem[]>([]);
  const [providerReviews, setProviderReviews] = useState<ReviewItem[]>([]);
  const [shopLoadState, setShopLoadState] = useState<"loading" | "ready" | "not_found" | "error">("loading");
  const [shopLoadError, setShopLoadError] = useState("");
  const [loyaltySettings, setLoyaltySettings] = useState<LoyaltySettings>({ enabled: false, sarPerPoint: 0, minRedeemPoints: 100 });
  const [redeemPoints, setRedeemPoints] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function loadProvider() {
      setShopLoadState("loading");
      if (!UUID_RE.test(shopId)) {
        setShopLoadState("not_found");
        return;
      }
      try {
        const { data: provider, error: providerError } = await supabase
          .from("providers")
          .select("id, business_name_en, business_name_ar, description_en, description_ar, cover_image_url, logo_url, is_verified, cr_verification_status, deposit_percentage, free_cancellation_hours, late_cancellation_fee_percent, no_show_fee_percent")
          .eq("id", shopId)
          .maybeSingle();
        if (providerError) throw providerError;
        if (!provider || !provider.is_verified) {
          if (!cancelled) setShopLoadState("not_found");
          return;
        }

        const [branchRes, serviceRes, packageRes, reviewRes, settingRes] = await Promise.all([
          supabase.from("branches").select("id, city, district, address_text_en, address_text_ar, latitude, longitude, is_active")
            .eq("provider_id", shopId).order("created_at", { ascending: true }),
          supabase.from("services").select("id, name_en, name_ar, base_price, base_duration_minutes, is_home_service_eligible, images, tags, categories(name_en, name_ar, slug)")
            .eq("provider_id", shopId).eq("is_active", true).order("sort_order", { ascending: true }),
          supabase.from("packages").select("id, name_en, name_ar, description_en, description_ar, price, session_count, expires_in_days")
            .eq("provider_id", shopId).eq("is_active", true),
          supabase.from("reviews").select("id, rating, comment, created_at, reply_comment, moderation_status, employee_id, profiles(first_name, last_name)")
            .eq("provider_id", shopId).order("created_at", { ascending: false }).limit(50),
          supabase.from("platform_settings").select("value").eq("key", "loyalty_program").maybeSingle(),
        ]);
        for (const res of [branchRes, serviceRes, packageRes, reviewRes]) {
          if (res.error) throw res.error;
        }

        const branches = (branchRes.data || []).filter((b: any) => b.is_active !== false);
        const branch = branches[0];
        if (!branch) {
          if (!cancelled) setShopLoadState("not_found");
          return;
        }

        const { data: employees, error: employeeError } = await supabase
          .from("employees")
          .select("id, name_en, name_ar, title_en, title_ar, photo_url, years_of_experience, specialties, instagram_handle, bio_en, bio_ar, is_active")
          .eq("branch_id", branch.id)
          .eq("is_active", true);
        if (employeeError) throw employeeError;

        const published = (reviewRes.data || []).filter((r: any) => (r.moderation_status || "published") === "published");
        const avg = (rows: any[]) => (rows.length ? Math.round((rows.reduce((sum, r) => sum + Number(r.rating), 0) / rows.length) * 10) / 10 : null);

        const shopData: ShopItem = {
          id: provider.id,
          branchId: branch.id,
          crVerified: provider.cr_verification_status === "verified",
          depositPercentage: Number(provider.deposit_percentage ?? 20),
          freeCancellationHours: Number(provider.free_cancellation_hours ?? 24),
          lateCancellationFeePercent: Number(provider.late_cancellation_fee_percent ?? 0),
          noShowFeePercent: Number(provider.no_show_fee_percent ?? 0),
          name: { en: provider.business_name_en || provider.business_name_ar, ar: provider.business_name_ar || provider.business_name_en },
          city: branch.city || "",
          neighborhood: branch.district || "",
          neighborhoodKey: (branch.district || "").toLowerCase(),
          address: { en: branch.address_text_en || "", ar: branch.address_text_ar || branch.address_text_en || "" },
          rating: avg(published),
          reviewsCount: published.length,
          image: provider.cover_image_url || provider.logo_url || "",
          description: { en: provider.description_en || "", ar: provider.description_ar || provider.description_en || "" },
          specialists: (employees || []).map((e: any) => ({
            id: e.id,
            name: { en: e.name_en, ar: e.name_ar || e.name_en },
            role: { en: e.title_en || "", ar: e.title_ar || e.title_en || "" },
            rating: avg(published.filter((r: any) => r.employee_id === e.id)),
            avatar: e.photo_url || "",
            bio: e.bio_en || e.bio_ar ? { en: e.bio_en || "", ar: e.bio_ar || e.bio_en || "" } : undefined,
            experienceYears: e.years_of_experience || undefined,
            specialties: Array.isArray(e.specialties) ? e.specialties : undefined,
            instagramHandle: e.instagram_handle || undefined,
          })),
        };

        const servicesData: ServiceItem[] = (serviceRes.data || []).map((srv: any) => {
          const tags: string[] = Array.isArray(srv.tags) ? srv.tags : [];
          const gender = tags.includes("women") ? "women" : tags.includes("men") ? "men" : "unisex";
          return {
            id: srv.id,
            shopId: provider.id,
            name: { en: srv.name_en, ar: srv.name_ar || srv.name_en },
            category: locale === "ar" ? srv.categories?.name_ar || "" : srv.categories?.name_en || "",
            gender,
            price: Number(srv.base_price),
            duration: Number(srv.base_duration_minutes),
            rating: 0,
            reviewsCount: 0,
            serviceType: srv.is_home_service_eligible ? "mobile" : "salon",
            image: Array.isArray(srv.images) && srv.images[0] ? srv.images[0] : "",
          } as ServiceItem;
        });

        const packagesData: PackageItem[] = (packageRes.data || []).map((pkg: any) => ({
          id: pkg.id,
          shopId: provider.id,
          name: { en: pkg.name_en, ar: pkg.name_ar || pkg.name_en },
          description: { en: pkg.description_en || "", ar: pkg.description_ar || pkg.description_en || "" },
          price: Number(pkg.price),
          sessionCount: Number(pkg.session_count),
          expiresInDays: Number(pkg.expires_in_days || 0),
        }));

        const reviewsData: ReviewItem[] = published.map((r: any) => {
          const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
          const first = profile?.first_name || "";
          const lastInitial = profile?.last_name ? ` ${String(profile.last_name).charAt(0)}.` : "";
          return {
            id: r.id,
            name: `${first}${lastInitial}`.trim(),
            date: String(r.created_at).slice(0, 10),
            rating: Number(r.rating),
            comment: r.comment || "",
            reply: r.reply_comment || null,
          };
        });

        const loyalty = settingRes.data?.value as any;
        if (!cancelled) {
          setLoadedShop(shopData);
          setLoadedServices(servicesData);
          setProviderPackages(packagesData);
          setProviderReviews(reviewsData);
          if (branch.latitude && branch.longitude) setCoordinates({ lat: Number(branch.latitude), lng: Number(branch.longitude) });
          setLoyaltySettings({
            enabled: !!loyalty?.enabled,
            sarPerPoint: Number(loyalty?.sar_per_point || 0),
            minRedeemPoints: Number(loyalty?.min_redeem_points || 100),
          });
          setShopLoadState("ready");
          const src = searchParams?.get("source");
          trackEvent("provider_viewed", {
            provider_id: provider.id,
            source: src === "link" || src === "qr" || src === "whatsapp" ? src : src === "instagram" ? "ad" : "search",
          });
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setShopLoadError(errorMessage(err));
          setShopLoadState("error");
        }
      }
    }
    loadProvider();
    return () => {
      cancelled = true;
    };
  }, [shopId, locale]);


  useEffect(() => {
    async function loadClientProfiles() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data, error } = await supabase
          .from("client_profiles")
          .select("id, name, type")
          .eq("client_id", user.id);
        if (!error && data) {
          setClientProfiles(data);
        }
      } catch (err) {
        console.warn("Could not load dependents:", err);
      }
    }
    loadClientProfiles();
  }, [locale]);

  useEffect(() => {
    async function checkEligibility() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        if (!UUID_RE.test(shopId)) return;

        const { data, error } = await supabase.rpc("check_customer_booking_eligibility", {
          p_provider_id: shopId,
          p_customer_id: user.id
        });
        if (!error && data) {
          setCustomerEligibility({
            isBlocked: !!data.is_blocked,
            blockReason: data.block_reason || "",
            strikes: Number(data.no_show_strikes) || 0,
            requiresPrepayment: !!data.requires_full_prepayment
          });
        }

        // Fetch loyalty points for this provider (G50)
        const { data: loyaltyData } = await supabase
          .from("customer_loyalty")
          .select("points_balance")
          .eq("provider_id", shopId)
          .eq("customer_id", user.id)
          .maybeSingle();

        if (loyaltyData?.points_balance) {
          setLoyaltyPoints(loyaltyData.points_balance);
        }
      } catch (err) {
        console.warn("Eligibility & loyalty check notice:", err);
      }
    }
    checkEligibility();

    async function checkFavorite() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        if (!UUID_RE.test(shopId)) return;
        const { data: fav } = await supabase
          .from("customer_favorites")
          .select("id")
          .eq("customer_id", user.id)
          .eq("provider_id", shopId)
          .maybeSingle();
        if (fav) setIsFavorited(true);
      } catch (e) {
        console.warn("Favorite check notice:", e);
      }
    }
    checkFavorite();
  }, [shopId]);

  const handleToggleFavorite = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setShowAuthModal(true);
        return;
      }
      setFavoriteLoading(true);
      const nextFav = !isFavorited;
      setIsFavorited(nextFav);

      const { error } = await supabase.rpc("toggle_customer_favorite", {
        p_provider_id: shopId,
      });

      if (error) {
        setIsFavorited(!nextFav);
        addToast(error.message, "error");
      } else {
        addToast(
          nextFav
            ? (locale === "ar" ? "تمت إضافة الصالون إلى المفضلة" : "Added to favorites")
            : (locale === "ar" ? "تمت إزالة الصالون من المفضلة" : "Removed from favorites"),
          "success"
        );
      }
    } catch (err: any) {
      console.warn("Toggle favorite error:", err);
    } finally {
      setFavoriteLoading(false);
    }
  };

  // Opens (or reuses) this customer's single conversation with the provider, then goes to the inbox.
  const handleMessageShop = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setShowAuthModal(true);
        return;
      }
      const { data: existing, error: findError } = await supabase
        .from("conversations").select("id").eq("customer_id", user.id).eq("provider_id", shopId).maybeSingle();
      if (findError) throw findError;
      if (!existing) {
        const { error } = await supabase.from("conversations").insert({
          customer_id: user.id,
          provider_id: shopId,
          subject: shop?.name[locale] || null,
        });
        if (error) throw error;
      }
      router.push("/customer/messages");
    } catch (err: unknown) {
      addToast(errorMessage(err), "error");
    }
  };

  const handleApplyCoupon = async () => {
    if (!couponCodeInput.trim()) return;
    setCouponLoading(true);
    setCouponMessage("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setShowAuthModal(true);
        return;
      }
      const { data, error } = await supabase.rpc("validate_and_apply_coupon", {
        p_code: couponCodeInput.trim(),
        p_provider_id: shopId,
        p_order_amount: totalCombinedPrice
      });

      if (error) throw error;
      if (data && data.valid) {
        setAppliedCoupon({
          code: data.code,
          discount: Number(data.discount_amount),
          fundingSource: data.funding_source
        });
        setCouponMessage(locale === "ar" ? `تم تطبيق الكوبون! وفرت ${money(data.discount_amount)}` : `Coupon applied! Saved ${money(data.discount_amount)}`);
        addToast(locale === "ar" ? "تم تطبيق الكوبون بنجاح" : "Coupon applied successfully", "success");
      } else {
        const reason = locale === "ar" ? "هذا الكوبون غير صالح لهذا الحجز" : "This promo code is not valid for this booking";
        setCouponMessage(reason);
        addToast(reason, "error");
      }
    } catch (err: any) {
      console.error("Coupon validation error:", err);
      const msg = err.message || "Failed to validate coupon";
      setCouponMessage(msg);
      addToast(msg, "error");
    } finally {
      setCouponLoading(false);
    }
  };

  const handleApplyGiftCard = async () => {
    if (!giftCardInput.trim()) return;
    setGiftCardLoading(true);
    setGiftCardMessage("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setShowAuthModal(true);
        return;
      }
      const { data, error } = await supabase.rpc("preview_gift_card", { p_code: giftCardInput.trim() });
      if (error) throw error;
      if (!data?.valid) {
        throw new Error(locale === "ar" ? "بطاقة الهدية غير صالحة أو منتهية أو مستخدمة بالكامل" : "Gift card is invalid, expired or fully used");
      }
      const balance = Number(data.remaining_balance || 0);
      setAppliedGiftCard({ code: data.code, amount: balance });
      setGiftCardMessage(locale === "ar" ? `رصيد البطاقة ${money(balance)}، يُخصم عند تأكيد الحجز` : `Card balance ${money(balance)}, applied when the booking is created`);
    } catch (err: any) {
      const msg = err.message || "Failed to apply gift card";
      setGiftCardMessage(msg);
      addToast(msg, "error");
    } finally {
      setGiftCardLoading(false);
    }
  };

  const maxRedeemablePoints = loyaltySettings.enabled && loyaltySettings.sarPerPoint > 0
    ? Math.min(loyaltyPoints, Math.floor(totalCombinedPrice / loyaltySettings.sarPerPoint))
    : 0;

  const handleToggleLoyalty = () => {
    if (redeemLoyalty) {
      setRedeemLoyalty(false);
      setRedeemPoints(0);
      setLoyaltyDiscount(0);
      return;
    }
    if (maxRedeemablePoints < loyaltySettings.minRedeemPoints) {
      addToast(locale === "ar" ? `تحتاج إلى ${loyaltySettings.minRedeemPoints} نقطة على الأقل` : `You need at least ${loyaltySettings.minRedeemPoints} points`, "info");
      return;
    }
    setRedeemPoints(maxRedeemablePoints);
    setLoyaltyDiscount(Math.round(maxRedeemablePoints * loyaltySettings.sarPerPoint * 100) / 100);
    setRedeemLoyalty(true);
  };

  const handlePurchasePackage = async (pkg: PackageItem) => {
    setIsLoading(true);
    setMessage("");
    setIsSuccess(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setShowAuthModal(true);
        return;
      }
      const { data, error } = await supabase.rpc("purchase_service_package", { p_package_id: pkg.id, p_payment_method: "card" });
      if (error) throw error;
      const { data: checkout, error: checkoutError } = await supabase.functions.invoke("payment-checkout", {
        body: { purchaseType: "package", purchaseId: data.purchase_id },
      });
      if (checkoutError || !checkout?.checkoutUrl) {
        throw new Error(locale === "ar"
          ? "تعذر فتح صفحة الدفع. لم يتم تفعيل الباقة ولم يُخصم أي مبلغ."
          : "Could not open the payment page. The package was not activated and nothing was charged.");
      }
      window.location.assign(checkout.checkoutUrl);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Package purchase could not be completed.";
      setMessage(errorMessage);
      addToast(errorMessage, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinWaitlist = async () => {
    if (!selectedService || !selectedDate) {
      addToast(locale === "ar" ? "يرجى تحديد الخدمة والتاريخ أولاً" : "Please select service and date first", "error");
      return;
    }
    setIsSubmittingWaitlist(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setShowAuthModal(true);
        return;
      }
      const preferredStaffId = selectedSpecialist?.id && selectedSpecialist.id !== "any" ? selectedSpecialist.id : null;
      const { data, error } = await supabase.rpc("join_waitlist", {
        p_branch_id: shop.branchId,
        p_service_id: selectedService.id,
        p_employee_id: preferredStaffId,
        p_preferred_date: selectedDate,
        p_preferred_time_start: waitlistStartTime || null,
        p_preferred_time_end: waitlistEndTime || null
      });
      if (error) throw error;
      addToast(
        locale === "ar"
          ? `تم انضمامك لقائمة الانتظار بنجاح! ترتيبك في القائمة: #${data?.position ?? 1}`
          : `Joined waitlist successfully! Your queue position: #${data?.position ?? 1}`,
        "success"
      );
      setShowWaitlistModal(false);
    } catch (err: any) {
      console.warn("Waitlist join error:", err);
      addToast(err.message || "Failed to join waitlist", "error");
    } finally {
      setIsSubmittingWaitlist(false);
    }
  };

  const toggleLanguage = () => {
    setLocale(locale === "en" ? "ar" : "en");
  };

  const shop: ShopItem = loadedShop ?? {
    id: shopId, branchId: "", crVerified: false, depositPercentage: 20, freeCancellationHours: 24,
    lateCancellationFeePercent: 0, noShowFeePercent: 0, name: { en: "", ar: "" }, city: "", neighborhood: "",
    neighborhoodKey: "", address: { en: "", ar: "" }, rating: null, reviewsCount: 0, image: "",
    description: { en: "", ar: "" }, specialists: [],
  };
  const filteredServices = loadedServices;

  // Preselect the service named in the link (?service=<id>, "Book again" in the customer portal) once the provider has loaded.
  // It runs once per link, so changing the language (which reloads the provider) does not undo the visitor's own choices; a
  // service that is no longer offered says so instead of silently showing nothing selected.
  useEffect(() => {
    let active = true;
    lookupPublishedAgreement("customer_terms", errorMessage).then((result) => {
      if (active) setAuthTerms(result);
    });
    return () => {
      active = false;
    };
  }, []);

  const preselectedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!serviceId || shopLoadState !== "ready" || preselectedFor.current === serviceId) return;
    preselectedFor.current = serviceId;
    const match = filteredServices.find((s) => s.id === serviceId);
    if (match) setSelectedService(match);
    else addToast(t.bookAgainMissing, "info");
  }, [serviceId, shopLoadState, filteredServices, t.bookAgainMissing]);

  // Hook to restore pending booking selection from sessionStorage (G16)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("primora_pending_booking");
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.providerId === shop.id && Date.now() - (saved.savedAt || 0) < 7200000) {
        if (saved.serviceId && filteredServices.length > 0) {
          const matchedService = filteredServices.find(s => s.id === saved.serviceId);
          if (matchedService) setSelectedService(matchedService);
        }
        if (saved.specialistId && shop.specialists && shop.specialists.length > 0) {
          const matchedSpecialist = shop.specialists.find(sp => sp.id === saved.specialistId);
          if (matchedSpecialist) setSelectedSpecialist(matchedSpecialist);
        }
        if (saved.date) setSelectedDate(saved.date);
        if (saved.slot) setSelectedSlot(saved.slot);
        if (typeof saved.isHomeService === "boolean") setIsHomeService(saved.isHomeService);
        addToast(locale === "ar" ? "تم استرجاع تفاصيل حجزك المختار" : "Your selected booking details were restored.", "info");
      }
    } catch (e) {
      console.warn("Failed to restore booking context:", e);
    }
  }, [shop.id, shop.specialists, filteredServices, locale]);

  const defaultBuffers = {
    fajr: { before: 10, after: 30 },
    dhuhr: { before: 10, after: 30 },
    asr: { before: 10, after: 30 },
    maghrib: { before: 10, after: 30 },
    isha: { before: 10, after: 30 }
  };

  const getPrayerWindowsForDate = (dateString: string) => {
    if (!dateString) return { starts: [], ends: [], list: [] };
    const dateObj = new Date(dateString);
    const coordsObj = new Coordinates(coordinates.lat, coordinates.lng);
    const params = CalculationMethod.UmmAlQura();
    params.madhab = Madhab.Shafi;
    
    const dayPrayers = new PrayerTimes(coordsObj, dateObj, params);
    const nextDay = new Date(dateObj);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDayPrayers = new PrayerTimes(coordsObj, nextDay, params);

    const prayerChecks = [
      { time: dayPrayers.fajr, key: "fajr", nameEn: "Fajr", nameAr: "الفجر" },
      { time: dayPrayers.dhuhr, key: "dhuhr", nameEn: "Dhuhr", nameAr: "الظهر" },
      { time: dayPrayers.asr, key: "asr", nameEn: "Asr", nameAr: "العصر" },
      { time: dayPrayers.maghrib, key: "maghrib", nameEn: "Maghrib", nameAr: "المغرب" },
      { time: dayPrayers.isha, key: "isha", nameEn: "Isha", nameAr: "العشاء" },
      { time: nextDayPrayers.fajr, key: "fajr", nameEn: "Fajr", nameAr: "الفجر" }
    ];

    const starts: string[] = [];
    const ends: string[] = [];
    const list = prayerChecks.map((p) => {
      const buffer = defaultBuffers[p.key as keyof typeof defaultBuffers] || { before: 10, after: 30 };
      const start = new Date(p.time.getTime() - buffer.before * 60 * 1000);
      const end = new Date(p.time.getTime() + buffer.after * 60 * 1000);
      starts.push(start.toISOString());
      ends.push(end.toISOString());
      return { key: p.key, nameEn: p.nameEn, nameAr: p.nameAr, start, end };
    });

    return { starts, ends, list };
  };


  // Fetch available slots from the database (prayer windows computed with Umm al-Qura are excluded server-side)
  const [slotError, setSlotError] = useState("");
  useEffect(() => {
    async function fetchSlots() {
      setSlotError("");
      if (!selectedSpecialist || !selectedDate || !selectedService || !shop.branchId) {
        setDbSlots([]);
        return;
      }
      setIsLoadingSlots(true);
      try {
        const { starts, ends } = getPrayerWindowsForDate(selectedDate);
        const duration = totalCombinedDuration || selectedService.duration;
        if (selectedSpecialist.id === "any") {
          const { data, error } = await supabase.rpc("get_branch_available_slots", {
            target_branch_id: shop.branchId,
            target_service_id: selectedService.id,
            target_date: selectedDate,
            prayer_window_starts: starts,
            prayer_window_ends: ends,
          });
          if (error) throw error;
          setDbSlots((data || []).map((s: any) => s.slot_start));
        } else {
          const { data, error } = await supabase.rpc("get_available_slots", {
            target_employee_id: selectedSpecialist.id,
            target_date: selectedDate,
            service_duration_minutes: duration,
            prayer_window_starts: starts,
            prayer_window_ends: ends,
          });
          if (error) throw error;
          setDbSlots((data || []).map((s: any) => s.slot_start));
        }
      } catch (err: any) {
        setDbSlots([]);
        setSlotError(locale === "ar" ? `تعذر تحميل المواعيد: ${err?.message || ""}` : `Could not load available times: ${err?.message || ""}`);
      } finally {
        setIsLoadingSlots(false);
      }
    }
    fetchSlots();
  }, [selectedSpecialist, selectedDate, selectedService, coordinates, totalCombinedDuration, shop.branchId]);

  // Prayer windows for the selected date, shown so customers understand the gaps in the schedule.
  const prayerWindowsForDay = selectedDate ? getPrayerWindowsForDate(selectedDate).list : [];

  const getAvailableSlots = () =>
    dbSlots.map((iso) => ({ slot: iso, label: formatSlotLabel(iso, locale), available: true, prayerLocked: false, prayerName: "" }));

  // Estimate only; the server prices the booking (fee rules, discounts, VAT, deposit policy).
  const calculateEscrowSplit = () => {
    if (selectedServices.length === 0) return { total: 0, deposit: 0, balance: 0, discount: 0, grossTotal: 0, vat: 0, gift: 0 };
    const grossTotal = totalCombinedPrice;
    const discount = Math.min(grossTotal, (appliedCoupon?.discount || 0) + (redeemLoyalty ? loyaltyDiscount : 0));
    const taxable = Math.max(0, grossTotal - discount);
    const vat = Math.round(taxable * 15) / 100;
    const gift = Math.min(appliedGiftCard?.amount || 0, taxable + vat);
    const total = Math.round((taxable + vat - gift) * 100) / 100;
    const deposit = customerEligibility?.requiresPrepayment
      ? total
      : Math.min(Math.round(taxable * shop.depositPercentage) / 100, total);
    return { total, deposit, balance: Math.round((total - deposit) * 100) / 100, discount, grossTotal, vat, gift };
  };

  const splits = calculateEscrowSplit();

  const handleModalSendOtp = async () => {
    let digits = authPhone.replace(/[^\d+]/g, "");
    if (digits.startsWith("05")) digits = "+966" + digits.slice(1);
    else if (digits.startsWith("5")) digits = "+966" + digits;
    else if (!digits.startsWith("+966")) digits = "+966" + digits;

    if (!digits.startsWith("+9665") || digits.length !== 13) {
      setAuthModalError(locale === "ar" ? "يرجى إدخال رقم جوال سعودي صالح (05xxxxxxxx)" : "Please enter a valid Saudi mobile number (05XXXXXXXX)");
      return;
    }
    if (!authConsentTerms || authTerms.state !== "ready") {
      setAuthModalError(t.authTermsRequired);
      return;
    }
    setAuthModalLoading(true);
    setAuthModalError("");
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        phone: digits,
        options: { channel: "sms" },
      });
      if (otpError) throw otpError;
      setAuthOtpSent(true);
    } catch (err: unknown) {
      setAuthModalError(errorMessage(err));
    } finally {
      setAuthModalLoading(false);
    }
  };

  const handleModalVerifyOtp = async () => {
    let digits = authPhone.replace(/[^\d+]/g, "");
    if (digits.startsWith("05")) digits = "+966" + digits.slice(1);
    else if (digits.startsWith("5")) digits = "+966" + digits;
    else if (!digits.startsWith("+966")) digits = "+966" + digits;

    if (!authOtpCode || authOtpCode.trim().length !== 6) {
      setAuthModalError(locale === "ar" ? "أدخل رمز التحقق المكون من 6 أرقام" : "Enter the 6-digit code");
      return;
    }
    if (!authConsentTerms || authTerms.state !== "ready") {
      setAuthModalError(t.authTermsRequired);
      return;
    }
    setAuthModalLoading(true);
    setAuthModalError("");
    try {
      // A number that was already verified (the consent write failed on the last try) is not verified again: the one-time code is spent.
      let verifiedUserId = authVerifiedUserId;
      if (!verifiedUserId) {
        const { data, error: verifyError } = await supabase.auth.verifyOtp({
          phone: digits,
          token: authOtpCode.trim(),
          type: "sms",
        });
        if (verifyError || !data.user) {
          throw verifyError ?? new Error("Invalid verification code.");
        }
        verifiedUserId = data.user.id;
        setAuthVerifiedUserId(verifiedUserId);
      }
      // The consent tables refuse direct writes; record_consents stores the choices against the terms version that was shown.
      // A failure stays in the dialog with a retry: the booking does not continue and no "accepted" state is claimed.
      const purposes = ["terms_privacy"];
      if (authConsentWhatsapp) purposes.push("whatsapp");
      if (authConsentMarketing) purposes.push("marketing");
      const { error: consentError } = await supabase.rpc("record_consents", {
        p_purposes: purposes,
        p_status: "granted",
        p_document_version: authTerms.agreement.version,
        p_method: "inline_booking_modal",
      });
      if (consentError) {
        setAuthModalError(`${t.authConsentFailed} ${errorMessage(consentError)}`);
        return;
      }
      setAuthVerifiedUserId(null);
      setShowAuthModal(false);
      addToast(locale === "ar" ? "تم التحقق بنجاح! جاري إكمال الحجز..." : "Verified successfully! Completing your booking...", "success");
      setTimeout(() => {
        handleBook();
      }, 300);
    } catch (err: unknown) {
      setAuthModalError(errorMessage(err));
    } finally {
      setAuthModalLoading(false);
    }
  };

  const handleBook = async () => {
    if (!selectedService || !selectedSpecialist || !selectedDate || !selectedSlot) {
      setMessage(t.errorSelectDetails);
      return;
    }

    setIsLoading(true);
    setMessage("");

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const rawSource = searchParams?.get("source") || "marketplace";
      const validSources = ["marketplace", "link", "qr", "whatsapp", "instagram", "import"];
      const bookingSource = validSources.includes(rawSource) ? rawSource : "marketplace";

      if (!user) {
        // Save booking selection to sessionStorage (G16)
        sessionStorage.setItem("primora_pending_booking", JSON.stringify({
          providerId: shop.id,
          serviceId: selectedService.id,
          specialistId: selectedSpecialist.id,
          date: selectedDate,
          slot: selectedSlot,
          isHomeService,
          source: bookingSource,
          savedAt: Date.now()
        }));
        setShowAuthModal(true);
        return;
      }


      if (customerEligibility?.isBlocked) {
        throw new Error(
          locale === "ar"
            ? "لا يمكن الحجز مع هذا المزود. يرجى التواصل معه مباشرة."
            : "You cannot book with this provider. Please contact them directly."
        );
      }

      let bookedBookingId: string;
      let bookedStatus = "pending_payment";

      if (selectedServices.length > 1) {
        // G51 Multi-service sequential cart booking
        const { data: multiRes, error: multiError } = await supabase.rpc("create_multi_service_booking", {
          target_branch_id: shop.branchId,
          target_employee_id: selectedSpecialist.id === "any" ? null : selectedSpecialist.id,
          target_scheduled_at: selectedSlot,
          services_payload: selectedServices.map((s) => ({ service_id: s.id })),
          request_source: bookingSource,
          request_coupon_code: appliedCoupon?.code || null,
          request_gift_card_code: appliedGiftCard?.code || null,
          request_loyalty_points: redeemLoyalty ? redeemPoints : 0,
          request_client_profile_id: selectedClientProfileId || null,
        });

        if (multiError || !multiRes?.booking_id) {
          throw multiError ?? new Error("Unable to reserve the selected multi-service booking.");
        }
        bookedBookingId = multiRes.booking_id;
        bookedStatus = multiRes.status;
      } else {
        const { data: booking, error: bookingError } = await supabase.rpc("create_booking", {
          target_employee_id: selectedSpecialist.id === "any" ? null : selectedSpecialist.id,
          target_service_id: selectedServices[0].id,
          target_scheduled_at: selectedSlot,
          request_branch_id: shop.branchId,
          request_client_profile_id: selectedClientProfileId || null,
          request_source: bookingSource,
          request_coupon_code: appliedCoupon?.code || null,
          request_gift_card_code: appliedGiftCard?.code || null,
          request_loyalty_points: redeemLoyalty ? redeemPoints : 0,
        });

        if (bookingError || !booking?.id) {
          throw bookingError ?? new Error("Unable to reserve the selected time.");
        }
        bookedBookingId = booking.id;
        bookedStatus = booking.status;
      }

      sessionStorage.removeItem("primora_pending_booking");

      // Nothing to collect online (0% deposit or a gift card covers it): the booking is already confirmed.
      if (bookedStatus === "confirmed") {
        trackEvent("booking_confirmed", { booking_id: bookedBookingId, provider_id: shop.id, source: bookingSource, total_price: 0 });
        router.push(`/customer/bookings/${bookedBookingId}/confirmation?status=confirmed`);
        return;
      }

      let redirectUrl = `/customer/bookings/${bookedBookingId}/confirmation?status=pending_payment`;
      trackEvent("payment_started", { method: "card", amount: calculateEscrowSplit().deposit, booking_id: bookedBookingId });
      const { data: checkout, error: checkoutError } = await supabase.functions.invoke("payment-checkout", {
        body: { bookingId: bookedBookingId },
      });
      if (!checkoutError && checkout?.checkoutUrl) {
        redirectUrl = checkout.checkoutUrl;
      }

      if (redirectUrl.startsWith("/")) {
        router.push(redirectUrl);
      } else {
        window.location.assign(redirectUrl);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Booking could not be completed.";
      setIsSuccess(false);
      setMessage(errorMessage);
      addToast(errorMessage, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const isRTL = locale === "ar";

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 flex flex-col font-sans antialiased">
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
          <Link href="/become-provider" className="hover:text-stone-950 transition-colors">{t.becomeProvider}</Link>
          <Link href="/about" className="hover:text-stone-950 transition-colors">{t.aboutUs}</Link>
        </nav>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
            <Link href="/services" aria-label={t.discover} className="text-stone-700 hover:text-stone-950 transition">
              <svg aria-hidden="true" className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </Link>
            <Link href="/login" aria-label={locale === "ar" ? "تسجيل الدخول" : "Log in"} className="text-stone-700 hover:text-stone-950 transition">
              <svg aria-hidden="true" className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

      {shopLoadState !== "ready" && (
        <main className="max-w-3xl mx-auto py-24 px-6 text-center flex-grow w-full">
          {shopLoadState === "loading" && (
            <p className="text-sm text-stone-500">{locale === "ar" ? "جاري تحميل بيانات المزود..." : "Loading provider..."}</p>
          )}
          {shopLoadState === "not_found" && (
            <div className="space-y-4">
              <h1 className="text-2xl font-serif font-black text-stone-900">{locale === "ar" ? "المزود غير متاح" : "Provider not available"}</h1>
              <p className="text-sm text-stone-500">{locale === "ar" ? "هذا المزود غير موجود أو لا يستقبل حجوزات حالياً." : "This provider does not exist or is not accepting bookings."}</p>
              <Link href="/services" className="inline-block text-xs font-bold uppercase tracking-wider underline">{t.backToStore}</Link>
            </div>
          )}
          {shopLoadState === "error" && (
            <div className="space-y-4">
              <h1 className="text-2xl font-serif font-black text-stone-900">{locale === "ar" ? "تعذر تحميل المزود" : "Could not load this provider"}</h1>
              <p className="text-sm text-red-600">{shopLoadError}</p>
              <button onClick={() => window.location.reload()} className="text-xs font-bold uppercase tracking-wider underline">
                {locale === "ar" ? "إعادة المحاولة" : "Try again"}
              </button>
            </div>
          )}
        </main>
      )}

      {shopLoadState === "ready" && (<>
      {/* 3. HERO / SHOP PROFILE BANNER */}
      <section className="relative h-[280px] sm:h-[380px] w-full overflow-hidden bg-stone-900">
        {shop.image ? (
          <img
            src={shop.image}
            alt={shop.name[locale]}
            className="w-full h-full object-cover opacity-65"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-stone-800 to-stone-950" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-stone-950/90 via-stone-950/40 to-transparent"></div>
        <div className="absolute bottom-0 left-0 right-0 max-w-7xl mx-auto px-6 sm:px-8 py-8 flex flex-col justify-end text-white">
          <div className={`space-y-3 ${isRTL ? "text-right" : "text-left"}`}>
            <div className="flex items-center gap-2.5">
              {shop.rating !== null ? (
                <>
                  <span className="text-[9px] font-extrabold uppercase tracking-widest bg-[hsl(45,60%,50%)] text-stone-950 px-2.5 py-0.5 rounded-full">
                    ★ {shop.rating}
                  </span>
                  <span className="text-[10px] text-stone-300 font-medium tracking-wide">
                    ({shop.reviewsCount} {t.reviewsCount})
                  </span>
                </>
              ) : (
                <span className="text-[10px] text-stone-300 font-medium tracking-wide">
                  {locale === "ar" ? "جديد على بريمورا" : "New on PRIMORA"}
                </span>
              )}
              <span className="h-3 w-px bg-stone-700"></span>
              <span className="text-[10px] text-stone-300 font-bold uppercase tracking-wider">
                {[shop.city, shop.neighborhood].filter(Boolean).join(" • ")}
              </span>
              <span className="h-3 w-px bg-stone-700"></span>
              {shop.crVerified && (
              <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider bg-amber-400/20 text-[#F4E7B6] border border-[#D1AF47]/40 px-2.5 py-0.5 rounded-full">
                {locale === "ar" ? "سجل تجاري موثق عبر واثق" : "CR verified via Wathq"}
              </span>
              )}
              <span className="h-3 w-px bg-stone-700"></span>
              <button
                type="button"
                onClick={handleToggleFavorite}
                disabled={favoriteLoading}
                className={`inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider px-3 py-1 rounded-full border transition backdrop-blur-md ${
                  isFavorited
                    ? "bg-red-500/20 text-red-300 border-red-500/50"
                    : "bg-white/10 text-stone-200 border-white/20 hover:bg-white/20"
                }`}
              >
                <svg
                  className={`w-3.5 h-3.5 ${isFavorited ? "fill-red-500 text-red-500" : "fill-none text-current"}`}
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
                  />
                </svg>
                <span>{isFavorited ? t.favoritedBtn : t.favoriteBtn}</span>
              </button>
              <button
                type="button"
                onClick={handleMessageShop}
                className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider px-3 py-1 rounded-full border transition backdrop-blur-md bg-white/10 text-stone-200 border-white/20 hover:bg-white/20"
              >
                {t.messageBtn}
              </button>
            </div>
            <h1 className="text-3xl sm:text-5xl font-serif font-black tracking-tight leading-tight">
              {shop.name[locale]}
            </h1>
            <p className="text-xs sm:text-sm text-stone-300 font-light leading-relaxed max-w-2xl">
              {shop.description[locale]}
            </p>
          </div>
        </div>
      </section>

      {/* 4. MAIN CONTENT GRID */}
      <main className="max-w-7xl mx-auto py-12 px-6 sm:px-8 flex-grow w-full">
        {/* Back Link */}
        <div className={`mb-8 ${isRTL ? "text-right" : "text-left"}`}>
          <Link href="/services" className="text-xs font-bold text-stone-500 hover:text-stone-950 transition uppercase tracking-wider">
            {t.backToStore}
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 items-start">
          {/* LEFT COLUMN: SERVICES & SPECIALISTS */}
          <div className="lg:col-span-2 space-y-10">
            {/* TAB SWITCHER */}
            <div className="flex border-b border-stone-200 mb-6">
              <button
                onClick={() => {
                  setActiveTab("services");
                  setSelectedService(null);
                  setSelectedSpecialist(null);
                  setSelectedSlot("");
                  setMessage("");
                }}
                className={`py-3 px-6 text-xs font-bold uppercase tracking-wider border-b-2 transition ${
                  activeTab === "services"
                    ? "border-stone-900 text-stone-900 font-extrabold"
                    : "border-transparent text-stone-400 hover:text-stone-700"
                }`}
              >
                {t.tabServices}
              </button>
              <button
                onClick={() => {
                  setActiveTab("packages");
                  setSelectedService(null);
                  setSelectedSpecialist(null);
                  setSelectedSlot("");
                  setMessage("");
                }}
                className={`py-3 px-6 text-xs font-bold uppercase tracking-wider border-b-2 transition ${
                  activeTab === "packages"
                    ? "border-stone-900 text-stone-900 font-extrabold"
                    : "border-transparent text-stone-400 hover:text-stone-700"
                }`}
              >
                {t.tabPackages}
              </button>
            </div>

            {activeTab === "services" ? (
              <>
                {/* Services List */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-stone-200 pb-3">
                    <h2 className={`text-lg font-serif font-bold tracking-tight text-stone-900 ${isRTL ? "text-right" : "text-left"}`}>
                      {t.servicesTitle}
                    </h2>
                    {selectedServices.length > 0 && (
                      <span className="text-[10px] font-black uppercase px-2.5 py-1 bg-stone-900 text-stone-50 rounded-full">
                        {selectedServices.length} {t.multiServiceCart} ({totalCombinedDuration} {t.mins} • {money(totalCombinedPrice)})
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    {filteredServices.length === 0 && (
                      <p className="text-xs text-stone-400 font-medium py-6 text-center">
                        {locale === "ar" ? "لا توجد خدمات منشورة لهذا المزود بعد." : "This provider has not published any services yet."}
                      </p>
                    )}
                    {filteredServices.map((srv) => {
                      const isSelected = selectedServices.some((s) => s.id === srv.id);
                      return (
                        <button
                          type="button"
                          key={srv.id}
                          aria-pressed={isSelected}
                          onClick={() => handleToggleService(srv)}
                          className={`w-full text-start bg-white border rounded-2xl p-5 cursor-pointer transition duration-150 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950 ${
                            isSelected
                              ? "border-stone-950 shadow-sm ring-1 ring-stone-950"
                              : "border-stone-200 hover:border-stone-400"
                          }`}
                        >
                          <span className="flex items-start gap-4">
                            <span className="block w-16 h-16 rounded-xl overflow-hidden bg-stone-100 flex-shrink-0 border border-stone-100">
                              {srv.image ? (
                                <img src={srv.image} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span aria-hidden="true" className="w-full h-full flex items-center justify-center text-lg font-serif font-black text-stone-400">
                                  {srv.name[locale].charAt(0)}
                                </span>
                              )}
                            </span>
                            <span className="block space-y-1 text-start">
                              <span className="flex items-center gap-2">
                                <span className="font-bold text-stone-900 text-sm">{srv.name[locale]}</span>
                                {isSelected && (
                                  <span aria-hidden="true" className="inline-flex items-center text-[9px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                                    ✓
                                  </span>
                                )}
                              </span>
                              <span className="block text-[10px] text-stone-400 font-semibold">
                                {srv.duration} {t.mins} • <span className="uppercase">{srv.category}</span>
                              </span>
                              <span className={`inline-block text-[8px] font-extrabold uppercase px-2 py-0.5 rounded ${
                                srv.serviceType === "mobile" ? "bg-stone-100 text-stone-600" : "bg-stone-900 text-stone-50"
                              }`}>
                                {srv.serviceType === "mobile" ? (locale === "ar" ? "خدمة منزلية" : "Home Service") : (locale === "ar" ? "في الصالون" : "At Venue")}
                              </span>
                            </span>
                          </span>
                          <span className="flex flex-col items-start sm:items-end flex-shrink-0">
                            <span className="block text-base font-black text-stone-950">{money(srv.price)}</span>
                            <span
                              className={`mt-2 text-[9px] font-bold px-2.5 py-1 rounded-lg border transition ${
                                isSelected
                                  ? "bg-stone-950 text-white border-stone-950"
                                  : "bg-stone-50 text-stone-700 border-stone-200"
                              }`}
                            >
                              {isSelected ? t.removeService : t.addService}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Specialist Selector (visible once service is selected) */}
                {selectedService && (
                  <div className="space-y-4">
                    <h2 className={`text-lg font-serif font-bold tracking-tight text-stone-900 border-b border-stone-200 pb-3 ${isRTL ? "text-right" : "text-left"}`}>
                      {t.specialistsTitle}
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Any Available Professional (G20) */}
                      <button
                        type="button"
                        aria-pressed={selectedSpecialist?.id === "any"}
                        onClick={() => {
                          setSelectedSpecialist({
                            id: "any",
                            name: { en: "Any Available Professional", ar: "أي أخصائي متاح" },
                            role: { en: "First Available Staff", ar: "الأسرع توفراً من الفريق" },
                            rating: null,
                            avatar: ""
                          });
                          setSelectedSlot("");
                        }}
                        className={`w-full text-start bg-white border rounded-2xl p-4 cursor-pointer transition duration-150 flex items-center gap-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950 ${
                          selectedSpecialist?.id === "any"
                            ? "border-stone-950 shadow-sm ring-2 ring-[#D1AF47]"
                            : "border-stone-200 hover:border-stone-400"
                        }`}
                      >
                        <span className="w-12 h-12 rounded-full overflow-hidden bg-[#D1AF47]/15 flex items-center justify-center flex-shrink-0 border border-[#D1AF47]/40 text-[#D1AF47]">
                          <svg aria-hidden="true" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2m-10 0a4 4 0 11-8 0 4 4 0 018 0zm13-3h-6a3 3 0 00-3 3v2h12v-2a3 3 0 00-3-3z" />
                          </svg>
                        </span>
                        <span className="block space-y-0.5 text-start">
                          <span className="block font-bold text-stone-900 text-xs">
                            {locale === "ar" ? "أي أخصائي متاح" : "Any Available Professional"}
                          </span>
                          <span className="block text-[10px] text-stone-400 font-semibold">
                            {locale === "ar" ? "الأسرع توفراً من الفريق" : "First available specialist"}
                          </span>
                          <span className="text-[9px] text-[#D1AF47] font-black uppercase tracking-wider block">
                            {locale === "ar" ? "موصى به" : "Recommended"}
                          </span>
                        </span>
                      </button>

                      {shop.specialists.map((spec) => (
                        <button
                          type="button"
                          key={spec.id}
                          aria-pressed={selectedSpecialist?.id === spec.id}
                          onClick={() => {
                            setSelectedSpecialist(spec);
                            setSelectedSlot("");
                          }}
                          className={`w-full text-start bg-white border rounded-2xl p-4 cursor-pointer transition duration-150 flex items-start gap-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950 ${
                            selectedSpecialist?.id === spec.id
                              ? "border-stone-950 shadow-sm ring-1 ring-stone-950"
                              : "border-stone-200 hover:border-stone-400"
                          }`}
                        >
                          <span className="block w-12 h-12 rounded-full overflow-hidden bg-stone-100 flex-shrink-0 border border-stone-200">
                            {spec.avatar ? (
                              <img src={spec.avatar} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span aria-hidden="true" className="w-full h-full flex items-center justify-center text-sm font-black text-stone-500">
                                {spec.name[locale].charAt(0)}
                              </span>
                            )}
                          </span>
                          <span className="block space-y-1 flex-1 text-start">
                            <span className="flex items-center justify-between">
                              <span className="font-bold text-stone-900 text-xs">{spec.name[locale]}</span>
                              {spec.rating !== null && (
                                <span className="text-[9px] text-[hsl(45,60%,50%)] font-extrabold">★ {spec.rating}</span>
                              )}
                            </span>
                            <span className="block text-[10px] text-stone-500 font-semibold">{spec.role[locale]}</span>
                            {spec.experienceYears && (
                              <span className="block text-[9px] text-[#9A741F] font-bold">
                                {locale === "ar" ? `خبرة ${spec.experienceYears} سنوات` : `${spec.experienceYears} yrs exp`}
                              </span>
                            )}
                            {spec.specialties && spec.specialties.length > 0 && (
                              <span className="flex flex-wrap gap-1 pt-0.5">
                                {spec.specialties.map((tag, sIdx) => (
                                  <span key={sIdx} className="text-[8px] bg-stone-100 text-stone-700 font-medium px-1.5 py-0.5 rounded">
                                    {tag}
                                  </span>
                                ))}
                              </span>
                            )}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-4">
                <h2 className={`text-lg font-serif font-bold tracking-tight text-stone-900 border-b border-stone-200 pb-3 ${isRTL ? "text-right" : "text-left"}`}>
                  {t.packagesTitle}
                </h2>
                
                {/* Error/Success message inside list for packages */}
                {message && activeTab === "packages" && (
                  <p className={`text-[10px] font-bold text-center leading-relaxed p-3 rounded-xl border ${
                    isSuccess
                      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                      : "text-red-700 bg-red-50 border-red-200"
                  }`}>
                    {message}
                  </p>
                )}

                <div className="grid grid-cols-1 gap-6">
                  {providerPackages.map((pkg) => (
                    <div
                      key={pkg.id}
                      className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 hover:border-stone-400 transition"
                    >
                      <div className={`space-y-1.5 ${isRTL ? "text-right" : "text-left"}`}>
                        <h3 className="font-bold text-stone-900 text-base">{pkg.name[locale]}</h3>
                        <p className="text-xs text-stone-500 leading-relaxed font-light">{pkg.description[locale]}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded bg-stone-100 text-stone-700">
                            {pkg.sessionCount} {t.sessionCountText}
                          </span>
                          <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded bg-stone-900 text-stone-50">
                            {pkg.expiresInDays > 0 ? `${pkg.expiresInDays} ${t.expiresInText}` : (locale === "ar" ? "بدون انتهاء" : "No expiry")}
                          </span>
                        </div>
                      </div>
                      <div className={`flex flex-col items-end flex-shrink-0 ${isRTL ? "sm:items-start" : "sm:items-end"}`}>
                        <span className="text-lg font-black text-stone-950">{money(pkg.price)}</span>
                        <button
                          onClick={() => handlePurchasePackage(pkg)}
                          disabled={isLoading}
                          className="mt-3 px-5 py-2.5 bg-stone-900 hover:bg-stone-850 text-stone-50 text-[10px] font-bold uppercase tracking-wider rounded-lg transition shadow-sm disabled:opacity-45"
                        >
                          {isLoading ? "..." : t.purchasePass}
                        </button>
                      </div>
                    </div>
                  ))}
                  {providerPackages.length === 0 && (
                    <p className="text-xs text-stone-400 font-medium py-6 text-center">
                      {locale === "ar" ? "لا توجد باقات متاحة حالياً لهذا المركز" : "No packages currently available for this shop."}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* CUSTOMER REVIEWS & ATTRIBUTE HIGHLIGHTS */}
            <div className="space-y-6 mt-12 border-t border-stone-200 pt-10">
              <h2 className={`text-xl font-serif font-bold tracking-tight text-stone-900 ${isRTL ? "text-right" : "text-left"}`}>
                {locale === "ar" ? "تقييمات وآراء العملاء" : "Customer Reviews & Highlights"}
              </h2>

              {providerReviews.length === 0 ? (
                <p className="text-xs text-stone-400 font-medium py-4">
                  {locale === "ar" ? "لا توجد تقييمات بعد. التقييمات تُكتب فقط بعد زيارة مكتملة." : "No reviews yet. Reviews can only be written after a completed visit."}
                </p>
              ) : (
                <div className="space-y-4 mt-6">
                  {providerReviews.map((rev) => (
                    <div key={rev.id} className="bg-stone-50 border border-stone-200/40 rounded-2xl p-5 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-extrabold text-stone-900">{rev.name || (locale === "ar" ? "عميل موثّق" : "Verified customer")}</span>
                        <span className="text-stone-400 font-semibold">{rev.date}</span>
                      </div>
                      <div className="flex gap-0.5 text-xs text-[hsl(45,60%,50%)]">
                        {Array.from({ length: rev.rating }).map((_, i) => (
                          <span key={i}>★</span>
                        ))}
                      </div>
                      {rev.comment && (
                        <p className={`text-xs text-stone-600 leading-relaxed font-light ${isRTL ? "text-right" : "text-left"}`}>{rev.comment}</p>
                      )}
                      {rev.reply && (
                        <p className={`text-[11px] text-stone-500 border-s-2 border-stone-300 ps-3 ${isRTL ? "text-right" : "text-left"}`}>
                          <span className="font-bold">{locale === "ar" ? "رد المزود: " : "Provider reply: "}</span>{rev.reply}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: BOOKING CONTROLS & CHECKOUT */}
          <aside className="space-y-6 lg:sticky lg:top-24">
            {/* Booking Sheet Card */}
            <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm space-y-6">
              <h2 className={`text-base font-serif font-bold tracking-tight text-stone-900 border-b border-stone-100 pb-3 ${isRTL ? "text-right" : "text-left"}`}>
                {t.summaryTitle}
              </h2>

              {/* Service Selection details */}
              {selectedServices.length > 0 ? (
                <div className={`space-y-4 ${isRTL ? "text-right" : "text-left"}`}>
                  <div className="bg-stone-50 border border-stone-150 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between text-[8px] text-stone-400 font-bold uppercase tracking-wider">
                      <span>{t.multiServiceCart} ({selectedServices.length})</span>
                      <span>{totalCombinedDuration} {t.mins}</span>
                    </div>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {selectedServices.map((srv) => (
                        <div key={srv.id} className="bg-white border border-stone-200/80 rounded-lg p-2 flex items-center justify-between gap-2">
                          <div>
                            <h4 className="font-bold text-xs text-stone-900">{srv.name[locale]}</h4>
                            <p className="text-[10px] text-stone-400">{srv.duration} {t.mins} • {money(srv.price)}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleToggleService(srv)}
                            className="text-stone-400 hover:text-red-600 text-xs px-1 font-bold"
                            title={t.removeService}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                    {selectedSpecialist && (
                      <p className="text-[10px] text-[hsl(45,60%,45%)] font-extrabold mt-1 border-t border-stone-100 pt-1.5">
                        {selectedSpecialist.name[locale]} ({selectedSpecialist.role[locale]})
                      </p>
                    )}
                  </div>

                  {/* Customer Block or Prepayment Warnings (G57) */}
                  {customerEligibility?.isBlocked && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-[10px] font-bold space-y-1">
                      <p>{t.blockedWarning}</p>
                      {customerEligibility.blockReason && (
                        <p className="font-normal">{customerEligibility.blockReason}</p>
                      )}
                    </div>
                  )}
                  {customerEligibility?.requiresPrepayment && !customerEligibility?.isBlocked && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-[10px] font-bold">
                      {t.strikePrepaymentWarning}
                    </div>
                  )}

                  {selectedServices.some(s => s.serviceType === "mobile") && (
                    <p className="text-[10px] text-stone-500 border-t border-stone-100 pt-3">
                      {locale === "ar"
                        ? "الحجز المنزلي عبر الموقع غير متاح بعد؛ هذا الحجز في مقر المزود."
                        : "Online home-visit booking is not available yet; this booking is at the provider's venue."}
                    </p>
                  )}

                  {/* Date selection input */}
                  <div className="space-y-2">
                    <label htmlFor="shop-date" className="block font-bold text-xs text-stone-850">{t.selectDateTitle}</label>
                    <input
                      id="shop-date"
                      type="date"
                      min={todayKey}
                      value={selectedDate}
                      onChange={(e) => {
                        setSelectedDate(e.target.value);
                        setSelectedSlot("");
                      }}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs text-stone-700 outline-none focus:border-stone-950"
                    />
                  </div>

                  {/* Time Slots selector & Waitlist (G44, G58) */}
                  {selectedDate && selectedSpecialist && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-xs text-stone-850">{t.selectTimeTitle}</h3>
                        <button
                          type="button"
                          onClick={() => setShowWaitlistModal(true)}
                          className="text-[9px] font-bold uppercase tracking-wider text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 px-2 py-1 rounded-lg transition"
                        >
                          + {t.joinWaitlistBtn}
                        </button>
                      </div>

                      {/* Prayer pauses for this date (Umm al-Qura, computed for the branch location) */}
                      {prayerWindowsForDay.length > 0 && (
                        <div className="bg-stone-50 border border-stone-200/80 rounded-xl p-2.5 space-y-1 text-[9px]">
                          <div className="flex items-center gap-1.5 font-bold text-stone-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                            <span>{locale === "ar" ? "توقف أوقات الصلاة لهذا اليوم" : "Prayer pauses on this day"}</span>
                          </div>
                          <p className="text-[9px] text-stone-600 leading-normal">
                            {prayerWindowsForDay
                              .map((w: any) => `${locale === "ar" ? w.nameAr : w.nameEn} ${formatSlotLabel(w.start.toISOString(), locale)}–${formatSlotLabel(w.end.toISOString(), locale)}`)
                              .join(" · ")}
                          </p>
                        </div>
                      )}
                      {isLoadingSlots && (
                        <p className="text-[10px] text-stone-400">{locale === "ar" ? "جاري تحميل المواعيد..." : "Loading available times..."}</p>
                      )}
                      {slotError && <p className="text-[10px] text-red-600 font-bold">{slotError}</p>}
                      {!isLoadingSlots && !slotError && dbSlots.length === 0 && (
                        <p className="text-[10px] text-stone-500">
                          {locale === "ar" ? "لا توجد مواعيد متاحة في هذا اليوم. جرّب يوماً آخر أو انضم لقائمة الانتظار." : "No times are available on this day. Try another day or join the waitlist."}
                        </p>
                      )}

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {getAvailableSlots().map(({ slot, label, available, prayerLocked, prayerName }) => {
                          const isSelected = selectedSlot === slot;
                          const isDisabled = !available || prayerLocked;
                          return (
                            <button
                              key={slot}
                              type="button"
                              aria-pressed={isSelected}
                              disabled={isDisabled}
                              onClick={() => {
                                setSelectedSlot(slot);
                                if (selectedService) {
                                  trackEvent("slot_selected", {
                                    provider_id: shop.id,
                                    professional_id: selectedSpecialist?.id || "any",
                                    service_id: selectedService.id,
                                    date_offset: Math.round((new Date(slot).getTime() - Date.now()) / 86400000),
                                    hour: Number(new Date(slot).toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Riyadh" })),
                                  });
                                }
                              }}
                              className={`py-2 px-1 text-[10px] font-extrabold rounded-lg border text-center transition duration-150 flex flex-col items-center justify-center min-h-[48px] ${
                                isSelected
                                  ? "bg-stone-950 border-stone-950 text-white"
                                  : prayerLocked
                                  ? "bg-red-50 border-red-200 text-red-700 cursor-not-allowed"
                                  : isDisabled
                                  ? "bg-stone-100 border-stone-200 text-stone-400 cursor-not-allowed"
                                  : "bg-stone-50 border-stone-200 text-stone-600 hover:border-stone-950"
                              }`}
                            >
                              <span>{label}</span>
                              {prayerLocked && (
                                <span className="text-[7.5px] font-bold text-red-600 uppercase mt-0.5 leading-none">
                                  {prayerName} • {locale === "ar" ? "مغلق" : "locked"}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Dependents / Pets Selector */}
                  <div className="space-y-1.5 border-t border-stone-150 pt-4">
                    <label htmlFor="shop-client-profile" className={`text-[10px] uppercase font-bold text-stone-400 block ${isRTL ? "text-right" : "text-left"}`}>
                      {locale === "ar" ? "تعيين تابع / حيوان أليف (اختياري)" : "Assign Dependent / Pet (Optional)"}
                    </label>
                    <select
                      id="shop-client-profile"
                      value={selectedClientProfileId}
                      onChange={(e) => setSelectedClientProfileId(e.target.value)}
                      className={`w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-700 outline-none focus:border-stone-950 font-bold ${isRTL ? "text-right" : "text-left"}`}
                    >
                      <option value="">
                        {locale === "ar" ? "-- الحجز لنفسي --" : "-- Book for Myself --"}
                      </option>
                      {clientProfiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.type === "pet" ? (locale === "ar" ? "أليف" : "Pet") : p.type === "patient" ? (locale === "ar" ? "مريض" : "Patient") : (locale === "ar" ? "تابع عائلي" : "Dependent")})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Commercials & Monetization Controls (G46, G48, G50) */}
                  <div className="border-t border-stone-150 pt-4 space-y-3">
                    {/* Promo / Coupon Code (G46) */}
                    <div>
                      <label className="text-[10px] uppercase font-bold text-stone-500 block mb-1">
                        {locale === "ar" ? "كوبون الخصم" : "Promo Code"}
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder={locale === "ar" ? "أدخل الرمز الترويجي" : "Enter promo code"}
                          value={couponCodeInput}
                          onChange={(e) => setCouponCodeInput(e.target.value.toUpperCase())}
                          disabled={!!appliedCoupon || couponLoading}
                          className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-3 py-1.5 text-xs text-stone-900 outline-none uppercase font-mono tracking-wider focus:border-stone-900"
                        />
                        {appliedCoupon ? (
                          <button
                            type="button"
                            onClick={() => {
                              setAppliedCoupon(null);
                              setCouponCodeInput("");
                              setCouponMessage("");
                            }}
                            className="px-3 py-1.5 text-[10px] font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition"
                          >
                            {locale === "ar" ? "إلغاء" : "Remove"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleApplyCoupon}
                            disabled={couponLoading || !couponCodeInput.trim()}
                            className="px-3 py-1.5 text-[10px] font-bold text-white bg-stone-900 hover:bg-stone-800 disabled:opacity-50 rounded-xl transition"
                          >
                            {couponLoading ? "..." : (locale === "ar" ? "تطبيق" : "Apply")}
                          </button>
                        )}
                      </div>
                      {couponMessage && (
                        <p className={`text-[9px] mt-1 font-semibold ${appliedCoupon ? "text-emerald-600" : "text-stone-500"}`}>
                          {couponMessage}
                        </p>
                      )}
                    </div>

                    {/* Gift Card Redemption (G48) */}
                    <div>
                      <label className="text-[10px] uppercase font-bold text-stone-500 block mb-1">
                        {locale === "ar" ? "بطاقة الإهداء / الهدية" : "Gift Card"}
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder={locale === "ar" ? "رمز بطاقة الهدية" : "Gift card code"}
                          value={giftCardInput}
                          onChange={(e) => setGiftCardInput(e.target.value.toUpperCase())}
                          disabled={!!appliedGiftCard || giftCardLoading}
                          className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-3 py-1.5 text-xs text-stone-900 outline-none uppercase font-mono tracking-wider focus:border-stone-900"
                        />
                        {appliedGiftCard ? (
                          <button
                            type="button"
                            onClick={() => {
                              setAppliedGiftCard(null);
                              setGiftCardInput("");
                              setGiftCardMessage("");
                            }}
                            className="px-3 py-1.5 text-[10px] font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition"
                          >
                            {locale === "ar" ? "إلغاء" : "Remove"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleApplyGiftCard}
                            disabled={giftCardLoading || !giftCardInput.trim()}
                            className="px-3 py-1.5 text-[10px] font-bold text-white bg-stone-900 hover:bg-stone-800 disabled:opacity-50 rounded-xl transition"
                          >
                            {giftCardLoading ? "..." : (locale === "ar" ? "تطبيق" : "Apply")}
                          </button>
                        )}
                      </div>
                      {giftCardMessage && (
                        <p className={`text-[9px] mt-1 font-semibold ${appliedGiftCard ? "text-emerald-600" : "text-stone-500"}`}>
                          {giftCardMessage}
                        </p>
                      )}
                    </div>

                    {/* Loyalty Points Redemption (G50) */}
                    {loyaltySettings.enabled && maxRedeemablePoints >= loyaltySettings.minRedeemPoints && (
                      <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-2.5 flex items-center justify-between">
                        <div>
                          <div className="text-[10px] font-bold text-amber-950 flex items-center gap-1.5">
                            <span>⭐</span>
                            <span>{locale === "ar" ? `نقاط الولاء (${loyaltyPoints} نقطة)` : `Loyalty Points (${loyaltyPoints} pts)`}</span>
                          </div>
                          <p className="text-[9px] text-amber-800">
                            {locale === "ar"
                              ? `خصم حتى ${money(Math.round(maxRedeemablePoints * loyaltySettings.sarPerPoint * 100) / 100)}`
                              : `Redeem for up to ${money(Math.round(maxRedeemablePoints * loyaltySettings.sarPerPoint * 100) / 100)} off`}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleToggleLoyalty}
                          className={`px-2.5 py-1 text-[10px] font-extrabold rounded-lg transition ${
                            redeemLoyalty
                              ? "bg-amber-700 text-white"
                              : "bg-white border border-amber-300 text-amber-900 hover:bg-amber-100"
                          }`}
                        >
                          {redeemLoyalty ? (locale === "ar" ? "مفعّل" : "Applied") : (locale === "ar" ? "استبدال" : "Redeem")}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Pricing escrow splits */}
                  <div className="border-t border-stone-150 pt-4 space-y-2.5 text-xs text-stone-500 font-semibold">
                    <div className="flex justify-between">
                      <span>{t.priceLabel}</span>
                      <span className="text-stone-900 font-bold">{money(splits.grossTotal)}</span>
                    </div>
                    {splits.discount > 0 && (
                      <div className="flex justify-between text-[11px] text-emerald-600 font-bold">
                        <span>{locale === "ar" ? "الخصم (كوبون / نقاط)" : "Discount (promo / points)"}</span>
                        <span>-{money(splits.discount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-[10px] text-stone-400">
                      <span>{locale === "ar" ? "ضريبة القيمة المضافة 15%" : "VAT 15%"}</span>
                      <span>{money(splits.vat)}</span>
                    </div>
                    {splits.gift > 0 && (
                      <div className="flex justify-between text-[11px] text-emerald-600 font-bold">
                        <span>{locale === "ar" ? "بطاقة الهدية" : "Gift card"}</span>
                        <span>-{money(splits.gift)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-[10px] text-stone-400">
                      <span>{t.depositLabel}{customerEligibility?.requiresPrepayment ? "" : ` (${shop.depositPercentage}%)`}</span>
                      <span>{money(splits.deposit)}</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-stone-400">
                      <span>{t.venueBalanceLabel}</span>
                      <span>{money(splits.balance)}</span>
                    </div>
                    <div className="border-t border-stone-100 pt-3 flex justify-between text-sm font-black text-stone-950">
                      <span>{t.dueNowLabel}</span>
                      <span className="text-[hsl(45,60%,45%)]">{money(splits.deposit)}</span>
                    </div>
                    <p className="text-[9px] text-stone-400 font-normal">
                      {locale === "ar" ? "تقدير؛ السعر النهائي يُحسب عند إنشاء الحجز." : "Estimate; the final price is calculated when the booking is created."}
                    </p>
                  </div>

                  <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3.5 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-[11px] font-bold text-stone-800">
                        {locale === "ar" ? "الدفع عبر Tap" : "Payment via Tap"}
                      </span>
                    </div>
                    <p className="text-[10px] text-stone-500 leading-relaxed font-medium">
                      {locale === "ar"
                        ? "ستنتقل إلى صفحة الدفع الآمنة لدى Tap لاختيار طريقة الدفع المتاحة (مدى، Apple Pay، بطاقة). لا تُحفظ بيانات البطاقة لدى بريمورا."
                        : "You will continue to Tap's secure payment page to choose an available method (mada, Apple Pay, card). Card details are never stored by PRIMORA."}
                    </p>
                  </div>

                  {/* Secure Payment Gateway Notice */}                  {/* Errors / Success notifications */}
                  {message && (
                    <p className={`text-[10px] font-bold text-center leading-relaxed p-3 rounded-xl border ${
                      isSuccess
                        ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                        : "text-red-700 bg-red-50 border-red-200"
                    }`}>
                      {message}
                    </p>
                  )}

                  {/* Cancellation & No-Show Policy Disclosure (G10) */}
                  <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-3 space-y-1.5 text-[10px]">
                    <div className="flex items-center gap-1.5 font-bold text-amber-900">
                      <svg className="w-3.5 h-3.5 flex-shrink-0 text-amber-700" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                      <span>{locale === "ar" ? "سياسة الإلغاء وعدم الحضور" : "Cancellation & No-Show Policy"}</span>
                    </div>
                    <ul className="text-amber-800/90 space-y-1 ps-4 list-disc font-medium">
                      <li>
                        {locale === "ar"
                          ? `إلغاء مجاني حتى ${shop.freeCancellationHours} ساعة قبل الموعد مع استرداد كامل العربون.`
                          : `Free cancellation up to ${shop.freeCancellationHours} hours before the appointment, with a full deposit refund.`}
                      </li>
                      <li>
                        {locale === "ar"
                          ? `الإلغاء بعد ذلك: يُخصم ${shop.lateCancellationFeePercent}% من العربون.`
                          : `Later cancellations: ${shop.lateCancellationFeePercent}% of the deposit is kept.`}
                      </li>
                      <li>
                        {locale === "ar"
                          ? `عدم الحضور: يُخصم ${shop.noShowFeePercent}% من العربون.`
                          : `No-show: ${shop.noShowFeePercent}% of the deposit is kept.`}
                      </li>
                      <li>
                        {locale === "ar"
                          ? "إذا ألغى المزود الموعد يُسترد العربون كاملاً."
                          : "If the provider cancels, the deposit is refunded in full."}
                      </li>
                    </ul>
                  </div>

                  {/* Checkout Confirm Button */}
                  <button
                    onClick={handleBook}
                    disabled={isLoading || !selectedDate || !selectedSlot || !selectedSpecialist || !!customerEligibility?.isBlocked}
                    className="w-full py-3 bg-stone-900 hover:bg-stone-850 text-stone-50 font-bold uppercase tracking-wider text-xs rounded-xl transition shadow-sm disabled:opacity-45"
                  >
                    {isLoading ? "..." : `${t.payButton} (${money(splits.deposit)})`}
                  </button>
                </div>
              ) : (
                <p className="text-xs text-stone-400 font-medium text-center py-6">
                  {locale === "ar" ? "يرجى تحديد خدمة لبدء الحجز" : "Select a service to start booking"}
                </p>
              )}
            </div>

            {/* Split Fees Disclaimer Card */}
            <div className="bg-stone-100 border border-stone-200 rounded-2xl p-4 text-center">
              <p className="text-[10px] text-stone-500 font-bold uppercase tracking-wider">
                {t.platformFeeSplit}
              </p>
            </div>
          </aside>
        </div>
      </main>

      </>)}

      {/* 5. FOOTER */}
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

      {/* WAITLIST MODAL (G44) */}
      {showWaitlistModal && (
        <PublicDialog label={t.waitlistModalTitle} onClose={() => setShowWaitlistModal(false)} canClose={!isSubmittingWaitlist}>
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-stone-150 pb-4">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="p-2 rounded-xl bg-amber-50 text-amber-700 font-bold">
                  ⏱
                </span>
                <h3 className="font-serif font-black text-stone-900 text-lg">
                  {t.waitlistModalTitle}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowWaitlistModal(false)}
                aria-label={t.closeDialog}
                className="text-stone-400 hover:text-stone-700 p-1 rounded-lg focus-visible:outline-2 focus-visible:outline-stone-950"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>

            <p className="text-xs text-stone-500 leading-relaxed">
              {t.waitlistModalDesc}
            </p>

            <div className="space-y-4 text-xs font-semibold text-stone-700">
              <div className="bg-stone-50 p-3.5 rounded-2xl border border-stone-200/70 space-y-1">
                <span className="text-[10px] text-stone-400 uppercase font-bold block">{t.selectDateTitle}</span>
                <p className="font-bold text-stone-900">
                  {selectedDate ? formatBookingDate(`${selectedDate}T12:00:00+03:00`, locale) : (locale === "ar" ? "لم يتم تحديد تاريخ" : "No date selected")}
                </p>
                {selectedService && (
                  <p className="text-[10px] text-stone-500 pt-1">
                    {selectedService.name[locale]} ({totalCombinedDuration} {t.mins})
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="waitlist-start" className="text-[10px] uppercase font-bold text-stone-500 block">
                    {t.preferredTimeStart}
                  </label>
                  <input
                    id="waitlist-start"
                    type="time"
                    value={waitlistStartTime}
                    onChange={(e) => setWaitlistStartTime(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs font-bold text-stone-900 outline-none focus:border-stone-950"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="waitlist-end" className="text-[10px] uppercase font-bold text-stone-500 block">
                    {t.preferredTimeEnd}
                  </label>
                  <input
                    id="waitlist-end"
                    type="time"
                    value={waitlistEndTime}
                    onChange={(e) => setWaitlistEndTime(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs font-bold text-stone-900 outline-none focus:border-stone-950"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowWaitlistModal(false)}
                disabled={isSubmittingWaitlist}
                className="flex-1 py-3 border border-stone-200 rounded-xl text-xs font-bold text-stone-600 hover:bg-stone-50 transition disabled:opacity-50"
              >
                {locale === "ar" ? "إلغاء" : "Cancel"}
              </button>
              <button
                type="button"
                onClick={handleJoinWaitlist}
                disabled={isSubmittingWaitlist}
                className="flex-1 py-3 bg-stone-950 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-stone-850 transition disabled:opacity-50"
              >
                {isSubmittingWaitlist ? "..." : t.confirmJoinWaitlist}
              </button>
            </div>
          </div>
        </PublicDialog>
      )}

      {/* AUTH OTP MODAL */}
      {showAuthModal && (
        <PublicDialog
          label={locale === "ar" ? "التحقق من رقم الجوال" : "Verify Mobile Number"}
          onClose={() => setShowAuthModal(false)}
          canClose={!authModalLoading}
        >
          <div className="space-y-5">
            <div className="flex items-center justify-between border-b border-stone-150 pb-3">
              <h3 className="font-serif font-black text-stone-900 text-base">
                {locale === "ar" ? "التحقق من رقم الجوال" : "Verify Mobile Number"}
              </h3>
              <button
                type="button"
                onClick={() => setShowAuthModal(false)}
                aria-label={t.closeDialog}
                className="text-stone-400 hover:text-stone-700 p-1 rounded-lg focus-visible:outline-2 focus-visible:outline-stone-950"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
            {!authOtpSent ? (
              <div className="space-y-4">
                <p className="text-xs text-stone-500">
                  {locale === "ar" ? "أدخل رقم الجوال لتأكيد الحجز وتلقي تنبيهات الموعد عبر الواتساب:" : "Enter your Saudi phone number to complete booking and receive WhatsApp updates:"}
                </p>
                <div>
                  <label htmlFor="auth-phone" className="block text-[10px] uppercase font-bold text-stone-500 mb-1.5">
                    {locale === "ar" ? "رقم الجوال" : "Mobile number"}
                  </label>
                  <input
                    id="auth-phone"
                    type="tel"
                    dir="ltr"
                    autoComplete="tel"
                    placeholder="05XXXXXXXX"
                    value={authPhone}
                    onChange={(e) => setAuthPhone(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-stone-900 outline-none focus:border-stone-950"
                  />
                </div>
                {authTerms.state === "loading" && (
                  <p role="status" className="text-[11px] text-stone-500">{t.authTermsLoading}</p>
                )}
                {authTerms.state === "unpublished" && (
                  <p role="alert" className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">{t.authTermsUnpublished}</p>
                )}
                {authTerms.state === "error" && (
                  <p role="alert" className="text-[11px] font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{t.authTermsError} {authTerms.message}</p>
                )}
                <label className="flex items-start gap-2 text-[11px] text-stone-700">
                  <input
                    type="checkbox"
                    checked={authConsentTerms}
                    onChange={(e) => setAuthConsentTerms(e.target.checked)}
                    required
                    aria-required="true"
                    className="mt-0.5 accent-stone-900"
                  />
                  <span>
                    {t.authTermsBefore}{" "}
                    <Link href="/terms" target="_blank" className="font-bold underline text-stone-900">{t.authTermsLink}</Link>{" "}
                    {t.authTermsMid}{" "}
                    <Link href="/privacy" target="_blank" className="font-bold underline text-stone-900">{t.authPrivacyLink}</Link>
                    {authTerms.state === "ready" ? ` (${t.authTermsVersion} ${authTerms.agreement.version})` : ""}
                  </span>
                </label>
                <label className="flex items-start gap-2 text-[11px] text-stone-600">
                  <input type="checkbox" checked={authConsentWhatsapp} onChange={(e) => setAuthConsentWhatsapp(e.target.checked)} className="mt-0.5 accent-stone-900" />
                  <span>{locale === "ar" ? "أوافق على استلام تأكيد الحجز والتذكيرات عبر واتساب." : "Send my booking confirmation and reminders on WhatsApp."}</span>
                </label>
                <label className="flex items-start gap-2 text-[11px] text-stone-600">
                  <input type="checkbox" checked={authConsentMarketing} onChange={(e) => setAuthConsentMarketing(e.target.checked)} className="mt-0.5 accent-stone-900" />
                  <span>{locale === "ar" ? "أوافق على استلام العروض التسويقية (اختياري)." : "Send me offers and promotions (optional)."}</span>
                </label>
                {authModalError && <p role="alert" className="text-xs text-red-600 font-bold">{authModalError}</p>}
                <button
                  type="button"
                  onClick={handleModalSendOtp}
                  disabled={authModalLoading || authTerms.state !== "ready" || !authConsentTerms}
                  className="w-full py-3 bg-stone-950 text-white rounded-xl text-xs font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {authModalLoading ? "..." : (locale === "ar" ? "إرسال رمز التحقق" : "Send Verification Code")}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label htmlFor="auth-otp" className="block text-xs text-stone-500 mb-2">
                    {locale === "ar" ? "أدخل رمز التحقق (OTP) المرسل إلى جوالك:" : "Enter the 6-digit OTP sent to your phone:"}
                  </label>
                  <input
                    id="auth-otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    dir="ltr"
                    maxLength={6}
                    value={authOtpCode}
                    onChange={(e) => setAuthOtpCode(e.target.value)}
                    disabled={authVerifiedUserId !== null}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2.5 text-center text-lg font-mono font-bold tracking-widest text-stone-900 outline-none focus:border-stone-950 disabled:opacity-60"
                  />
                </div>
                {authModalError && <p role="alert" className="text-xs text-red-600 font-bold">{authModalError}</p>}
                <button
                  type="button"
                  onClick={handleModalVerifyOtp}
                  disabled={authModalLoading}
                  className="w-full py-3 bg-stone-950 text-white rounded-xl text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                >
                  {authModalLoading ? "..." : authVerifiedUserId ? t.authRetryConsent : (locale === "ar" ? "تأكيد ومتابعة الحجز" : "Confirm & Continue")}
                </button>
              </div>
            )}
          </div>
        </PublicDialog>
      )}

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
