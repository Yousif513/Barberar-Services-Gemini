"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ToastContainer } from "@/components/toast";

export const dynamic = "force-dynamic";

const translations = {
  en: {
    promoText: "Book Premier Home Service & Salon Appointments in Riyadh & Jeddah",
    home: "Home",
    discover: "Discover",
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
    depositLabel: "Escrow Deposit (15%)",
    venueBalanceLabel: "Pay at Venue (85%)",
    dueNowLabel: "Due Now",
    payButton: "Confirm & Pay Escrow",
    successRedirecting: "Payment successful! Redirecting to customer dashboard...",
    errorTitle: "Booking Error",
    errorSelectDetails: "Please select a service, a specialist, a date, and a time slot.",
    reviewsCount: "reviews",
    startingFrom: "Starting from",
    mins: "mins",
    platformFeeSplit: "15% Escrow splits secured via Tap Connect",
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
    successPackageRedirecting: "Package purchased successfully! Redirecting to your memberships..."
  },
  ar: {
    promoText: "احجز أفضل خدمات التجميل والعناية المنزلية والصالونات في الرياض وجدة",
    home: "الرئيسية",
    discover: "اكتشف",
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
    depositLabel: "مبلغ الضمان (15%)",
    venueBalanceLabel: "الدفع في المركز (85%)",
    dueNowLabel: "المستحق الآن",
    payButton: "تأكيد ودفع الضمان",
    successRedirecting: "تم الدفع بنجاح! جاري تحويلك إلى لوحة التحكم للعميل...",
    errorTitle: "خطأ في الحجز",
    errorSelectDetails: "يرجى اختيار الخدمة، الأخصائي، التاريخ، والوقت المحدد.",
    reviewsCount: "تقييم",
    startingFrom: "تبدأ من",
    mins: "دقيقة",
    platformFeeSplit: "تقسيمات ضمان بنسبة 15% مؤمنة عبر Tap Connect",
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
    successPackageRedirecting: "تم شراء الباقة بنجاح! جاري تحويلك إلى صفحة العضويات..."
  }
};

interface SpecialistItem {
  id: string;
  name: { en: string; ar: string };
  role: { en: string; ar: string };
  rating: number;
  avatar: string;
}

interface ShopItem {
  id: string;
  name: { en: string; ar: string };
  city: "riyadh" | "jeddah";
  neighborhood: string;
  neighborhoodKey: string;
  address: { en: string; ar: string };
  rating: number;
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

interface PackageItem {
  id: string;
  shopId: string;
  name: { en: string; ar: string };
  description: { en: string; ar: string };
  price: number;
  sessionCount: number;
  expiresInDays: number;
}

const mockPackages: PackageItem[] = [
  {
    id: "p1",
    shopId: "3",
    name: { en: "Moroccan Hammam Spa package", ar: "باقة الحمام المغربي الاسترخائي" },
    description: { en: "Buy 5 Moroccan sessions and get 1 free session. Valid for 1 year.", ar: "اشترِ 5 جلسات حمام مغربي واحصل على جلسة إضافية مجانية. صالحة لمدة عام كامل." },
    price: 990,
    sessionCount: 6,
    expiresInDays: 365
  },
  {
    id: "p2",
    shopId: "1",
    name: { en: "Elite Hair & Beard Grooming Multi-Pass", ar: "بطاقة قص الشعر واللحية الممتازة" },
    description: { en: "10 hair grooming sessions with premium hair styling products.", ar: "باقة 10 جلسات قص شعر ولحية مع مصفف الشعر المميز." },
    price: 1000,
    sessionCount: 10,
    expiresInDays: 180
  },
  {
    id: "p3",
    shopId: "3",
    name: { en: "Stress Relief Swedish Massage Bundle", ar: "باقة المساج السويدي لتخفيف التوتر" },
    description: { en: "5 Swedish full body massage sessions of 60 minutes each.", ar: "باقة 5 جلسات مساج سويدي للجسم بالكامل لمدة 60 دقيقة لكل جلسة." },
    price: 1200,
    sessionCount: 5,
    expiresInDays: 365
  },
  {
    id: "p4",
    shopId: "2",
    name: { en: "French Gel Manicure 5-Session Pass", ar: "بطاقة مانيكير الجل الفرنسي 5 جلسات" },
    description: { en: "Prepay 5 premium gel manicures with custom nail art designs.", ar: "ادفع مسبقاً مقابل 5 جلسات مانيكير جل مع تصاميم فنية مميزة للأظافر." },
    price: 800,
    sessionCount: 5,
    expiresInDays: 180
  },
  {
    id: "p5",
    shopId: "5",
    name: { en: "Coastal Spa Indulgence Membership", ar: "عضوية دلال السبا الساحلي" },
    description: { en: "6 custom organic deep skin facials with sea mineral clays.", ar: "6 جلسات تنظيف بشرة عضوي مخصص مع طين المعادن البحرية." },
    price: 2000,
    sessionCount: 6,
    expiresInDays: 365
  }
];

const isValidLuhn = (numStr: string) => {
  let sum = 0;
  let shouldDouble = false;
  for (let i = numStr.length - 1; i >= 0; i--) {
    let digit = parseInt(numStr.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
};

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

  const [locale, setLocale] = useState<"en" | "ar">("en");
  const t = translations[locale];

  const [selectedService, setSelectedService] = useState<ServiceItem | null>(null);
  const [selectedSpecialist, setSelectedSpecialist] = useState<SpecialistItem | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [isHomeService, setIsHomeService] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  const [activeTab, setActiveTab] = useState<"services" | "packages">("services");

  const [paymentMethod, setPaymentMethod] = useState<"applepay" | "card">("applepay");
  const [cardNumber, setCardNumber] = useState("");
  const [cardHolder, setCardHolder] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");

  const [clientProfiles, setClientProfiles] = useState<any[]>([]);
  const [selectedClientProfileId, setSelectedClientProfileId] = useState("");

  // Synchronize direction with locale
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

  useEffect(() => {
    async function loadClientProfiles() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data, error } = await supabase
          .from("client_profiles")
          .select("id, name, type")
          .eq("client_id", user.id);
        if (data && data.length > 0) {
          setClientProfiles(data);
        } else {
          setClientProfiles([
            { id: "cp-mock-1", name: locale === "ar" ? "فيصل آل سعود" : "Faisal Al-Saud", type: "dependent" },
            { id: "cp-mock-2", name: locale === "ar" ? "ركس (كلب أليف)" : "Rex (Golden Retriever)", type: "pet" }
          ]);
        }
      } catch (err) {
        setClientProfiles([
          { id: "cp-mock-1", name: locale === "ar" ? "فيصل آل سعود" : "Faisal Al-Saud", type: "dependent" },
          { id: "cp-mock-2", name: locale === "ar" ? "ركس (كلب أليف)" : "Rex (Golden Retriever)", type: "pet" }
        ]);
      }
    }
    loadClientProfiles();
  }, [locale]);

  const handlePurchasePackage = async (pkg: PackageItem) => {
    setIsLoading(true);
    setMessage("");
    setIsSuccess(false);

    try {
      throw new Error(`Secure checkout for ${pkg.name[locale]} packages is not available yet.`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Package purchase could not be completed.";
      setMessage(errorMessage);
      addToast(errorMessage, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleLanguage = () => {
    setLocale((prev) => (prev === "en" ? "ar" : "en"));
  };

  // Mock Specialists
  const mockSpecialists: Record<string, SpecialistItem[]> = {
    "1": [
      { id: "sp1", name: { en: "Ali Al-Harbi", ar: "علي الحربي" }, role: { en: "Master Barber", ar: "حلاق رئيسي" }, rating: 4.9, avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=150&auto=format&fit=crop" },
      { id: "sp2", name: { en: "Tariq Mahmood", ar: "طارق محمود" }, role: { en: "Beard Specialist", ar: "أخصائي ذقن" }, rating: 4.8, avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=150&auto=format&fit=crop" }
    ],
    "2": [
      { id: "sp3", name: { en: "Elena Rostova", ar: "إيلينا روستوفا" }, role: { en: "Lead Hairstylist", ar: "مصففة شعر رئيسية" }, rating: 4.9, avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=150&auto=format&fit=crop" },
      { id: "sp4", name: { en: "Sara Al-Mansoori", ar: "سارة المنصوري" }, role: { en: "Makeup Artist", ar: "أخصائية مكياج" }, rating: 4.8, avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=150&auto=format&fit=crop" }
    ],
    "3": [
      { id: "sp5", name: { en: "Elena Rostova", ar: "إيلينا روستوفا" }, role: { en: "Esthetician", ar: "أخصائية بشرة" }, rating: 4.9, avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=150&auto=format&fit=crop" },
      { id: "sp1", name: { en: "Ali Al-Harbi", ar: "علي الحربي" }, role: { en: "Therapist", ar: "معالج مساج" }, rating: 4.9, avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=150&auto=format&fit=crop" }
    ],
    "4": [
      { id: "sp2", name: { en: "Tariq Mahmood", ar: "طارق محمود" }, role: { en: "Senior Therapist", ar: "معالج أول" }, rating: 4.7, avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=150&auto=format&fit=crop" },
      { id: "sp1", name: { en: "Ali Al-Harbi", ar: "علي الحربي" }, role: { en: "Master Barber", ar: "حلاق رئيسي" }, rating: 4.9, avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=150&auto=format&fit=crop" }
    ],
    "5": [
      { id: "sp4", name: { en: "Sara Al-Mansoori", ar: "سارة المنصوري" }, role: { en: "Hairstylist", ar: "مصففة شعر" }, rating: 4.9, avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=150&auto=format&fit=crop" },
      { id: "sp3", name: { en: "Elena Rostova", ar: "إيلينا روستوفا" }, role: { en: "Spa Director", ar: "مديرة السبا" }, rating: 4.9, avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=150&auto=format&fit=crop" }
    ]
  };

  // Mock Shops
  const shops: ShopItem[] = [
    {
      id: "1",
      name: { en: "Elite Grooming Lounge", ar: "صالون إيليت الرجالي" },
      city: "riyadh",
      neighborhood: locale === "ar" ? "الملقا" : "Al-Malqa",
      neighborhoodKey: "malqa",
      address: { en: "Anas Bin Malik Road, Al-Malqa, Riyadh", ar: "طريق أنس بن مالك، حي الملقا، الرياض" },
      rating: 4.9,
      reviewsCount: 1520,
      image: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=1200&auto=format&fit=crop",
      description: {
        en: "Premier luxury grooming salon for modern gentlemen in Riyadh. Master cuts, beard sculpting, and wellness face therapies.",
        ar: "صالون الحلاقة الفاخر الأول للرجال العصريين بالرياض. قصات شعر إحترافية، تهذيب اللحية، وجلسات العناية بالبشرة."
      },
      specialists: mockSpecialists["1"] || []
    },
    {
      id: "2",
      name: { en: "Sara Beauty Salon & Spa", ar: "صالون وسبا سارة للتجميل" },
      city: "riyadh",
      neighborhood: locale === "ar" ? "العليا" : "Olaya",
      neighborhoodKey: "olaya",
      address: { en: "Tahlia Street, Olaya, Riyadh", ar: "شارع التحلية، حي العليا، الرياض" },
      rating: 4.8,
      reviewsCount: 980,
      image: "https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=1200&auto=format&fit=crop",
      description: {
        en: "Exclusive women-only luxury salon offering signature event makeup, hair styling, color treatments, and custom manicures.",
        ar: "صالون تجميل فاخر وحصري للسيدات يقدم أرقى تسريحات الشعر، المكياج السينمائي، العناية بالأظافر والسبا الاستشفائي."
      },
      specialists: mockSpecialists["2"] || []
    },
    {
      id: "3",
      name: { en: "Riyadh Premium Spa & Wellness", ar: "سبا الرياض الفاخر للعناية" },
      city: "riyadh",
      neighborhood: locale === "ar" ? "الياسمين" : "Al-Yasmin",
      neighborhoodKey: "yasmin",
      address: { en: "King Abdulaziz Road, Al-Yasmin, Riyadh", ar: "طريق الملك عبدالعزيز، حي الياسمين، الرياض" },
      rating: 4.9,
      reviewsCount: 1120,
      image: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?q=80&w=1200&auto=format&fit=crop",
      description: {
        en: "A tranquil sanctuary offering deep sports therapies, Moroccan baths, and advanced skincare in Al-Yasmin.",
        ar: "ملاذ هادئ يقدم جلسات المساج السويدية والرياضية الفاخرة، الحمامات المغربية الملكية، والعناية المتطورة بالبشرة."
      },
      specialists: mockSpecialists["3"] || []
    },
    {
      id: "4",
      name: { en: "Jeddah Royal Wellness Center", ar: "مركز النخبة الملكي بجدة" },
      city: "jeddah",
      neighborhood: locale === "ar" ? "الحمراء" : "Al-Hamra",
      neighborhoodKey: "hamra",
      address: { en: "Corniche Road, Al-Hamra, Jeddah", ar: "طريق الكورنيش، حي الحمراء، جدة" },
      rating: 4.7,
      reviewsCount: 650,
      image: "https://images.unsplash.com/photo-1512290923902-8a9f81dc236c?q=80&w=1200&auto=format&fit=crop",
      description: {
        en: "Luxury wellness and grooming center on the Jeddah Corniche. Specialized therapists and master barbers.",
        ar: "مركز صحي وحلاقة راقي على كورنيش جدة. معالجون متخصصون وحلاقو نخبة يقدمون أفضل الخدمات المنزلية وفي الفرع."
      },
      specialists: mockSpecialists["4"] || []
    },
    {
      id: "5",
      name: { en: "Ash-Shati Luxury Ladies Spa", ar: "صالون الشاطئ النسائي الفاخر" },
      city: "jeddah",
      neighborhood: locale === "ar" ? "الشاطئ" : "Ash-Shati",
      neighborhoodKey: "shatei",
      address: { en: "Prince Faisal Bin Fahd Road, Ash-Shati, Jeddah", ar: "طريق الأمير فيصل بن فهد، حي الشاطئ، جدة" },
      rating: 4.9,
      reviewsCount: 430,
      image: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=80&w=1200&auto=format&fit=crop",
      description: {
        en: "Premium coastal spa retreat providing Thalassotherapy, organic facials, nail care, and hair restoration styling.",
        ar: "منتجع وسبا ساحلي فاخر يقدم جلسات العلاج بالبحر، تنظيف البشرة العضوي، صبغ وتصفيف الشعر، وتجميل العرائس."
      },
      specialists: mockSpecialists["5"] || []
    }
  ];

  // Get active shop details
  const shop = shops.find((sh) => sh.id === shopId) || shops[0];

  // Mock Services mapped to Shop IDs
  const services: ServiceItem[] = [
    // Shop 1
    {
      id: "s1",
      shopId: "1",
      name: { en: "Luxury Beard Grooming & Hot Towel Shave", ar: "حلاقة اللحية الفاخرة والمنشفة الساخنة" },
      category: "haircuts",
      gender: "men",
      price: 150,
      duration: 45,
      rating: 4.9,
      reviewsCount: 340,
      serviceType: "salon",
      image: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=400&auto=format&fit=crop"
    },
    {
      id: "s2",
      shopId: "1",
      name: { en: "Master Haircut & Organic Scalp Wash", ar: "قص الشعر الإحترافي وغسيل فروة الرأس العضوي" },
      category: "haircuts",
      gender: "men",
      price: 120,
      duration: 45,
      rating: 4.8,
      reviewsCount: 210,
      serviceType: "salon",
      image: "https://images.unsplash.com/photo-1621605815971-fbc98d665033?q=80&w=400&auto=format&fit=crop"
    },
    {
      id: "s1_3",
      shopId: "1",
      name: { en: "Royal Charcoal Face Therapy & Scrub", ar: "جلسة الفحم الملكية لتقشير وترطيب الوجه" },
      category: "skincare",
      gender: "men",
      price: 180,
      duration: 35,
      rating: 4.9,
      reviewsCount: 88,
      serviceType: "salon",
      image: "https://images.unsplash.com/photo-1590439471364-192aa70c0b53?q=80&w=400&auto=format&fit=crop"
    },
    // Shop 2
    {
      id: "s4",
      shopId: "2",
      name: { en: "Balayage Hand-Painted Color & Silk Blowdry", ar: "تلوين بالياج يدوي واستشوار الحرير الفاخر" },
      category: "haircolor",
      gender: "women",
      price: 650,
      duration: 150,
      rating: 4.9,
      reviewsCount: 412,
      serviceType: "salon",
      image: "https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=400&auto=format&fit=crop"
    },
    {
      id: "s5",
      shopId: "2",
      name: { en: "Silk Keratin Smoothing Therapy", ar: "علاج بروتين الكيراتين الحريري لتنعيم الشعر" },
      category: "haircolor",
      gender: "women",
      price: 800,
      duration: 120,
      rating: 4.8,
      reviewsCount: 185,
      serviceType: "salon",
      image: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=80&w=400&auto=format&fit=crop"
    },
    {
      id: "s2_3",
      shopId: "2",
      name: { en: "French Gel Manicure & Custom Nail Art", ar: "جلسة المانيكير الفرنسي وتجميل الأظافر" },
      category: "nails",
      gender: "women",
      price: 200,
      duration: 50,
      rating: 4.7,
      reviewsCount: 110,
      serviceType: "salon",
      image: "https://images.unsplash.com/photo-1604654894610-df63bc536371?q=80&w=400&auto=format&fit=crop"
    },
    // Shop 3
    {
      id: "s3",
      shopId: "3",
      name: { en: "Deep Tissue Sports Therapy & Massage", ar: "علاج الأنسجة العميقة وتدليك المفاصل للرياضيين" },
      category: "massage",
      gender: "unisex",
      price: 350,
      duration: 60,
      rating: 4.9,
      reviewsCount: 142,
      serviceType: "salon",
      image: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?q=80&w=400&auto=format&fit=crop"
    },
    {
      id: "s6",
      shopId: "3",
      name: { en: "Charcoal Face Mask Skin Extraction & Hydration", ar: "قناع الفحم لتنقية البشرة وترطيب عميق للوجه" },
      category: "skincare",
      gender: "unisex",
      price: 220,
      duration: 50,
      rating: 4.7,
      reviewsCount: 96,
      serviceType: "salon",
      image: "https://images.unsplash.com/photo-1590439471364-192aa70c0b53?q=80&w=400&auto=format&fit=crop"
    },
    {
      id: "s7",
      shopId: "3",
      name: { en: "Royal Moroccan Bath Hammam", ar: "الحمام المغربي الملكي الفاخر" },
      category: "massage",
      gender: "women",
      price: 500,
      duration: 90,
      rating: 4.9,
      reviewsCount: 322,
      serviceType: "salon",
      image: "https://images.unsplash.com/photo-1512290923902-8a9f81dc236c?q=80&w=400&auto=format&fit=crop"
    },
    // Shop 4
    {
      id: "s8",
      shopId: "4",
      name: { en: "Premium Haircut & Hot Towel Combo", ar: "حزمة قص الشعر وتنعيم الذقن بالمنشفة الساخنة" },
      category: "haircuts",
      gender: "men",
      price: 200,
      duration: 60,
      rating: 4.6,
      reviewsCount: 148,
      serviceType: "salon",
      image: "https://images.unsplash.com/photo-1512290923902-8a9f81dc236c?q=80&w=400&auto=format&fit=crop"
    },
    {
      id: "s4_2",
      shopId: "4",
      name: { en: "Deep Cleansing Beard Therapy & Steam", ar: "جلسة البخار لتنظيف وتنعيم شعر اللحية" },
      category: "haircuts",
      gender: "men",
      price: 110,
      duration: 40,
      rating: 4.8,
      reviewsCount: 74,
      serviceType: "salon",
      image: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=400&auto=format&fit=crop"
    },
    {
      id: "s4_3",
      shopId: "4",
      name: { en: "Swedish Massage Wellness Session", ar: "جلسة المساج السويدي للاسترخاء وإزالة الإرهاق" },
      category: "massage",
      gender: "men",
      price: 300,
      duration: 60,
      rating: 4.7,
      reviewsCount: 95,
      serviceType: "salon",
      image: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?q=80&w=400&auto=format&fit=crop"
    },
    // Shop 5
    {
      id: "s9",
      shopId: "5",
      name: { en: "Organic Deep Facial Therapy", ar: "علاج تنظيف البشرة العضوي العميق" },
      category: "skincare",
      gender: "women",
      price: 400,
      duration: 60,
      rating: 4.9,
      reviewsCount: 110,
      serviceType: "mobile",
      image: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=80&w=400&auto=format&fit=crop"
    },
    {
      id: "s5_2",
      shopId: "5",
      name: { en: "Classic Pedicure & Soft Paraffin Polish", ar: "جلسة العناية بالقدمين والبارافين المغذي" },
      category: "nails",
      gender: "women",
      price: 180,
      duration: 45,
      rating: 4.8,
      reviewsCount: 62,
      serviceType: "salon",
      image: "https://images.unsplash.com/photo-1604654894610-df63bc536371?q=80&w=400&auto=format&fit=crop"
    },
    {
      id: "s5_3",
      shopId: "5",
      name: { en: "Bridal Hair Styling & Veil Setup", ar: "تصفيف شعر العروس وتركيب الطرحة" },
      category: "haircolor",
      gender: "women",
      price: 900,
      duration: 180,
      rating: 5.0,
      reviewsCount: 43,
      serviceType: "salon",
      image: "https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=400&auto=format&fit=crop"
    }
  ];

  const filteredServices = services.filter((srv) => srv.shopId === shop.id);

  // Generate Available Slots excluding prayer buffers
  const getAvailableSlots = () => {
    return [
      "09:00 AM",
      "09:30 AM",
      "10:00 AM",
      "10:30 AM",
      "11:00 AM",
      "11:30 AM",
      "01:00 PM",
      "01:30 PM",
      "02:00 PM",
      "02:30 PM",
      "03:00 PM",
      "04:00 PM",
      "04:30 PM",
      "05:00 PM",
      "07:30 PM",
      "08:00 PM"
    ];
  };

  const calculateEscrowSplit = () => {
    if (!selectedService) return { total: 0, deposit: 0, balance: 0 };
    const total = selectedService.price;
    const deposit = Math.round(total * 0.15); // 15% platform split
    const balance = total - deposit;
    return { total, deposit, balance };
  };

  const splits = calculateEscrowSplit();

  const toRiyadhTimestamp = (date: string, slot: string) => {
    const match = slot.match(/^(\d{1,2}):(\d{2})\s(AM|PM)$/);
    if (!match) throw new Error("Invalid booking time.");
    const [, rawHour, minute, meridiem] = match;
    let hour = Number(rawHour) % 12;
    if (meridiem === "PM") hour += 12;
    return `${date}T${hour.toString().padStart(2, "0")}:${minute}:00+03:00`;
  };

  const handleBook = async () => {
    if (!selectedService || !selectedSpecialist || !selectedDate || !selectedSlot) {
      setMessage(t.errorSelectDetails);
      return;
    }

    if (paymentMethod === "card") {
      const cleanNum = cardNumber.replace(/\s/g, "");
      if (cleanNum.length !== 16 || isNaN(Number(cleanNum)) || !isValidLuhn(cleanNum)) {
        setMessage(locale === "ar" ? "رقم بطاقة مدى أو الائتمان غير صحيح (يجب أن يتكون من 16 رقماً ويجتاز فحص luhn)." : "Invalid Mada/Credit Card number. Must be 16 digits and pass luhn validation.");
        return;
      }
      if (!cardHolder.trim()) {
        setMessage(locale === "ar" ? "يرجى كتابة اسم حامل البطاقة كما هو مطبوع." : "Please enter the cardholder name exactly as printed.");
        return;
      }
      if (!cardExpiry.match(/^\d{2}\/\d{2}$/)) {
        setMessage(locale === "ar" ? "تاريخ انتهاء البطاقة غير صحيح (MM/YY)." : "Invalid expiry date format. Use MM/YY.");
        return;
      }
      const [month, year] = cardExpiry.split("/").map(Number);
      if (month < 1 || month > 12) {
        setMessage(locale === "ar" ? "شهر الانتهاء غير صحيح." : "Invalid expiry month.");
        return;
      }
      if (cardCvv.length !== 3 || isNaN(Number(cardCvv))) {
        setMessage(locale === "ar" ? "رمز الأمان CVV غير صحيح (3 أرقام)." : "Invalid CVV. Must be 3 digits.");
        return;
      }
    }

    setIsLoading(true);
    setMessage("");

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      if (isHomeService) {
        throw new Error("Home-service address confirmation is required before payment.");
      }

      const { data: booking, error: bookingError } = await supabase.rpc("create_booking", {
        target_employee_id: selectedSpecialist.id,
        target_service_id: selectedService.id,
        target_scheduled_at: toRiyadhTimestamp(selectedDate, selectedSlot),
        request_home_service: false,
        request_client_profile_id: selectedClientProfileId || null,
      });

      if (bookingError || !booking?.id) {
        throw bookingError ?? new Error("Unable to reserve the selected time.");
      }

      const { data: checkout, error: checkoutError } = await supabase.functions.invoke("payment-checkout", {
        body: { bookingId: booking.id },
      });

      if (checkoutError || !checkout?.checkoutUrl) {
        throw checkoutError ?? new Error("Unable to initialize secure payment.");
      }

      window.location.assign(checkout.checkoutUrl);
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
          <Link href="/store" className="hover:text-stone-950 transition-colors">{t.discover}</Link>
          <Link href="/service-board" className="hover:text-stone-950 transition-colors">{t.serviceBoard}</Link>
          <Link href="/become-provider" className="hover:text-stone-950 transition-colors">{t.becomeProvider}</Link>
          <Link href="/about" className="hover:text-stone-950 transition-colors">{t.aboutUs}</Link>
        </nav>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
            <Link href="/store" className="text-stone-700 hover:text-stone-950 transition">
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

      {/* 3. HERO / SHOP PROFILE BANNER */}
      <section className="relative h-[280px] sm:h-[380px] w-full overflow-hidden bg-stone-900">
        <img
          src={shop.image}
          alt={shop.name[locale]}
          className="w-full h-full object-cover opacity-65"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-stone-950/90 via-stone-950/40 to-transparent"></div>
        <div className="absolute bottom-0 left-0 right-0 max-w-7xl mx-auto px-6 sm:px-8 py-8 flex flex-col justify-end text-white">
          <div className={`space-y-3 ${isRTL ? "text-right" : "text-left"}`}>
            <div className="flex items-center gap-2.5">
              <span className="text-[9px] font-extrabold uppercase tracking-widest bg-[hsl(45,60%,50%)] text-stone-950 px-2.5 py-0.5 rounded-full">
                ★ {shop.rating}
              </span>
              <span className="text-[10px] text-stone-300 font-medium tracking-wide">
                ({shop.reviewsCount} {t.reviewsCount})
              </span>
              <span className="h-3 w-px bg-stone-700"></span>
              <span className="text-[10px] text-stone-300 font-bold uppercase tracking-wider">
                {shop.city.toUpperCase()} • {shop.neighborhood}
              </span>
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
          <Link href="/store" className="text-xs font-bold text-stone-500 hover:text-stone-950 transition uppercase tracking-wider">
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
                  <h2 className={`text-lg font-serif font-bold tracking-tight text-stone-900 border-b border-stone-200 pb-3 ${isRTL ? "text-right" : "text-left"}`}>
                    {t.servicesTitle}
                  </h2>
                  <div className="grid grid-cols-1 gap-4">
                    {filteredServices.map((srv) => (
                      <div
                        key={srv.id}
                        onClick={() => {
                          setSelectedService(srv);
                          // Reset details that depend on service
                          setSelectedSpecialist(null);
                          setSelectedSlot("");
                        }}
                        className={`bg-white border rounded-2xl p-5 cursor-pointer transition duration-150 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                          selectedService?.id === srv.id
                            ? "border-stone-950 shadow-sm"
                            : "border-stone-200 hover:border-stone-400"
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          <div className="w-16 h-16 rounded-xl overflow-hidden bg-stone-100 flex-shrink-0 border border-stone-100">
                            <img src={srv.image} alt={srv.name[locale]} className="w-full h-full object-cover" />
                          </div>
                          <div className={`space-y-1 ${isRTL ? "text-right" : "text-left"}`}>
                            <h3 className="font-bold text-stone-900 text-sm">{srv.name[locale]}</h3>
                            <p className="text-[10px] text-stone-400 font-semibold">
                              {srv.duration} {t.mins} • <span className="uppercase">{srv.category}</span>
                            </p>
                            <span className={`inline-block text-[8px] font-extrabold uppercase px-2 py-0.5 rounded ${
                              srv.serviceType === "mobile" ? "bg-stone-100 text-stone-600" : "bg-stone-900 text-stone-50"
                            }`}>
                              {srv.serviceType === "mobile" ? (locale === "ar" ? "خدمة منزلية" : "Home Service") : (locale === "ar" ? "في الصالون" : "At Venue")}
                            </span>
                          </div>
                        </div>
                        <div className={`flex flex-col items-end flex-shrink-0 ${isRTL ? "sm:items-start" : "sm:items-end"}`}>
                          <span className="text-base font-black text-stone-950">{srv.price} SAR</span>
                          <span className="text-[8px] text-[hsl(45,60%,50%)] font-bold uppercase tracking-wider mt-1">
                            ★ {srv.rating} ({srv.reviewsCount})
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Specialist Selector (visible once service is selected) */}
                {selectedService && (
                  <div className="space-y-4">
                    <h2 className={`text-lg font-serif font-bold tracking-tight text-stone-900 border-b border-stone-200 pb-3 ${isRTL ? "text-right" : "text-left"}`}>
                      {t.specialistsTitle}
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {shop.specialists.map((spec) => (
                        <div
                          key={spec.id}
                          onClick={() => {
                            setSelectedSpecialist(spec);
                            setSelectedSlot("");
                          }}
                          className={`bg-white border rounded-2xl p-4 cursor-pointer transition duration-150 flex items-center gap-4 ${
                            selectedSpecialist?.id === spec.id
                              ? "border-stone-950 shadow-sm"
                              : "border-stone-200 hover:border-stone-400"
                          }`}
                        >
                          <div className="w-12 h-12 rounded-full overflow-hidden bg-stone-155 flex-shrink-0 border border-stone-100">
                            <img src={spec.avatar} alt={spec.name[locale]} className="w-full h-full object-cover" />
                          </div>
                          <div className={`space-y-0.5 ${isRTL ? "text-right" : "text-left"}`}>
                            <h4 className="font-bold text-stone-900 text-xs">{spec.name[locale]}</h4>
                            <p className="text-[10px] text-stone-400 font-semibold">{spec.role[locale]}</p>
                            <span className="text-[9px] text-[hsl(45,60%,50%)] font-extrabold">★ {spec.rating}</span>
                          </div>
                        </div>
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
                  {mockPackages.filter(p => p.shopId === shop.id).map((pkg) => (
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
                            {pkg.expiresInDays} {t.expiresInText}
                          </span>
                        </div>
                      </div>
                      <div className={`flex flex-col items-end flex-shrink-0 ${isRTL ? "sm:items-start" : "sm:items-end"}`}>
                        <span className="text-lg font-black text-stone-950">{pkg.price} SAR</span>
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
                  {mockPackages.filter(p => p.shopId === shop.id).length === 0 && (
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

              {/* Gold highlights tags */}
              <div className={`flex flex-wrap gap-2.5 ${isRTL ? "justify-start" : "justify-start"}`}>
                {[
                  { tag: locale === "ar" ? "معقم وآمن" : "Clean & Sanitized", pct: "98%" },
                  { tag: locale === "ar" ? "طاقم عمل محترف" : "Professional Staff", pct: "95%" },
                  { tag: locale === "ar" ? "دقة في المواعيد" : "Punctual Slots", pct: "92%" },
                  { tag: locale === "ar" ? "أجواء فاخرة" : "Premium Ambience", pct: "96%" }
                ].map((hl, idx) => (
                  <span key={idx} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold bg-stone-100 border border-stone-200/50 text-stone-850">
                    <span className="text-[hsl(45,60%,45%)] font-bold">★</span>
                    {hl.tag} <span className="text-stone-400 font-normal">({hl.pct})</span>
                  </span>
                ))}
              </div>

              {/* Reviews Feed */}
              <div className="space-y-4 mt-6">
                {[
                  {
                    name: locale === "ar" ? "فهد العتيبي" : "Fahad Al-Otaibi",
                    date: "2026-06-12",
                    rating: 5,
                    text: {
                      en: "Outstanding unisex luxury service. The specialist was highly professional, and the prayer buffer block works seamlessly.",
                      ar: "خدمة ممتازة وفاخرة للغاية. الأخصائي كان محترفاً جداً والالتزام التام بوقف الحجوزات وقت الصلاة مريح للغاية."
                    }
                  },
                  {
                    name: locale === "ar" ? "سارة خالد" : "Sarah Khalid",
                    date: "2026-06-10",
                    rating: 5,
                    text: {
                      en: "The salon is very clean and adheres to premium guidelines. The face skin cleansing session was relaxing.",
                      ar: "المركز نظيف جداً ويتبع أعلى معايير النظافة والتعقيم الفاخرة. جلسة تنظيف البشرة كانت مريحة وممتازة."
                    }
                  },
                  {
                    name: locale === "ar" ? "ليلى محمد" : "Layla Mohammad",
                    date: "2026-06-08",
                    rating: 4,
                    text: {
                      en: "Highly recommend for anyone looking for premium service. Friendly receptionist and great manicure work.",
                      ar: "أوصي به بشدة لكل من يبحث عن خدمة راقية. الاستقبال ودود للغاية وشغل الأظافر رائع."
                    }
                  }
                ].map((rev, rIdx) => (
                  <div key={rIdx} className="bg-stone-50 border border-stone-200/40 rounded-2xl p-5 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-extrabold text-stone-900">{rev.name}</span>
                      <span className="text-stone-400 font-semibold">{rev.date}</span>
                    </div>
                    <div className="flex gap-0.5 text-xs text-[hsl(45,60%,50%)]">
                      {Array.from({ length: rev.rating }).map((_, i) => (
                        <span key={i}>★</span>
                      ))}
                    </div>
                    <p className={`text-xs text-stone-600 leading-relaxed font-light ${isRTL ? "text-right" : "text-left"}`}>
                      {rev.text[locale]}
                    </p>
                  </div>
                ))}
              </div>
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
              {selectedService ? (
                <div className={`space-y-4 ${isRTL ? "text-right" : "text-left"}`}>
                  <div className="bg-stone-50 border border-stone-150 rounded-xl p-3">
                    <span className="text-[8px] text-stone-400 font-bold uppercase tracking-wider block">{selectedService.category.toUpperCase()}</span>
                    <h4 className="font-bold text-xs text-stone-900 mt-0.5">{selectedService.name[locale]}</h4>
                    <p className="text-[10px] text-stone-500 mt-1 font-semibold">
                      {selectedService.duration} {t.mins} • {selectedService.price} SAR
                    </p>
                    {selectedSpecialist && (
                      <p className="text-[10px] text-[hsl(45,60%,45%)] font-extrabold mt-1">
                        {selectedSpecialist.name[locale]} ({selectedSpecialist.role[locale]})
                      </p>
                    )}
                  </div>

                  {/* Home Service Option (if eligible) */}
                  {selectedService.serviceType === "mobile" ? (
                    <div className="flex items-center justify-between border-t border-stone-100 pt-3">
                      <span className="text-xs text-stone-600 font-semibold">{t.isHomeServiceLabel}</span>
                      <input
                        type="checkbox"
                        checked={isHomeService}
                        onChange={(e) => setIsHomeService(e.target.checked)}
                        className="w-4 h-4 accent-stone-900 rounded cursor-pointer"
                      />
                    </div>
                  ) : null}

                  {/* Date selection input */}
                  <div className="space-y-2">
                    <h3 className="font-bold text-xs text-stone-850">{t.selectDateTitle}</h3>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => {
                        setSelectedDate(e.target.value);
                        setSelectedSlot("");
                      }}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs text-stone-700 outline-none focus:border-stone-950"
                    />
                  </div>

                  {/* Time Slots selector */}
                  {selectedDate && selectedSpecialist && (
                    <div className="space-y-3">
                      <div className="flex flex-col gap-1">
                        <h3 className="font-bold text-xs text-stone-850">{t.selectTimeTitle}</h3>
                        <p className="text-[8px] text-red-500 font-bold leading-normal">
                          {t.prayerBufferWarning}
                        </p>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {getAvailableSlots().map((slot) => (
                          <button
                            key={slot}
                            onClick={() => setSelectedSlot(slot)}
                            className={`py-2 text-[10px] font-extrabold rounded-lg border text-center transition duration-150 ${
                              selectedSlot === slot
                                ? "bg-stone-950 border-stone-950 text-white"
                                : "bg-stone-50 border-stone-200 text-stone-600 hover:border-stone-950"
                            }`}
                          >
                            {slot}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Dependents / Pets Selector */}
                  <div className="space-y-1.5 border-t border-stone-150 pt-4">
                    <label className={`text-[10px] uppercase font-bold text-stone-400 block ${isRTL ? "text-right" : "text-left"}`}>
                      {locale === "ar" ? "تعيين تابع / حيوان أليف (اختياري)" : "Assign Dependent / Pet (Optional)"}
                    </label>
                    <select
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

                  {/* Pricing escrow splits */}
                  <div className="border-t border-stone-150 pt-4 space-y-2.5 text-xs text-stone-500 font-semibold">
                    <div className="flex justify-between">
                      <span>{t.priceLabel}</span>
                      <span className="text-stone-900 font-bold">{splits.total} SAR</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-stone-400">
                      <span>{t.depositLabel}</span>
                      <span>{splits.deposit} SAR</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-stone-400">
                      <span>{t.venueBalanceLabel}</span>
                      <span>{splits.balance} SAR</span>
                    </div>
                    <div className="border-t border-stone-100 pt-3 flex justify-between text-sm font-black text-stone-950">
                      <span>{t.dueNowLabel}</span>
                      <span className="text-[hsl(45,60%,45%)]">{splits.deposit} SAR</span>
                    </div>
                  </div>

                  {/* Payment Method Selector */}
                  <div className="space-y-2 border-t border-stone-150 pt-4">
                    <h3 className="font-bold text-xs text-stone-850">
                      {locale === "ar" ? "طريقة الدفع" : "Payment Method"}
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPaymentMethod("applepay")}
                        className={`py-2 px-3 border rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition duration-150 ${
                          paymentMethod === "applepay"
                            ? "border-stone-950 bg-stone-50 text-stone-950"
                            : "border-stone-200 hover:border-stone-400 text-stone-500"
                        }`}
                      >
                        <span className="text-sm"></span> Pay
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMethod("card")}
                        className={`py-2 px-3 border rounded-xl flex items-center justify-center gap-2 text-[10px] font-bold uppercase transition duration-150 ${
                          paymentMethod === "card"
                            ? "border-stone-950 bg-stone-50 text-stone-950"
                            : "border-stone-200 hover:border-stone-400 text-stone-500"
                        }`}
                      >
                        {locale === "ar" ? "مدى / بطاقة ائتمان" : "Mada / Card"}
                      </button>
                    </div>
                  </div>

                  {/* Credit Card Details Form */}
                  {paymentMethod === "card" && (
                    <div className="space-y-3 pt-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block">
                          {locale === "ar" ? "اسم حامل البطاقة" : "Cardholder Name"}
                        </label>
                        <input
                          type="text"
                          value={cardHolder}
                          onChange={(e) => setCardHolder(e.target.value)}
                          placeholder="FAIZ AL-MUTAIRI"
                          className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2 text-xs text-stone-700 outline-none focus:border-stone-950"
                        />
                      </div>
                      
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block">
                          {locale === "ar" ? "رقم البطاقة" : "Card Number"}
                        </label>
                        <input
                          type="text"
                          value={cardNumber}
                          maxLength={19}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/\D/g, "");
                            const formatted = raw.match(/.{1,4}/g)?.join(" ") || "";
                            setCardNumber(formatted);
                          }}
                          placeholder="4000 1234 5678 9010"
                          className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2 text-xs text-stone-700 outline-none focus:border-stone-950 tracking-widest text-left"
                          dir="ltr"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block">
                            {locale === "ar" ? "تاريخ الانتهاء" : "Expiry (MM/YY)"}
                          </label>
                          <input
                            type="text"
                            value={cardExpiry}
                            maxLength={5}
                            onChange={(e) => {
                              let val = e.target.value.replace(/\D/g, "");
                              if (val.length > 2) {
                                val = val.substring(0, 2) + "/" + val.substring(2, 4);
                              }
                              setCardExpiry(val);
                            }}
                            placeholder="MM/YY"
                            className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2 text-xs text-stone-700 outline-none focus:border-stone-950 text-center"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block">
                            {locale === "ar" ? "رمز الأمان CVV" : "CVV"}
                          </label>
                          <input
                            type="password"
                            value={cardCvv}
                            maxLength={3}
                            onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, ""))}
                            placeholder="***"
                            className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2 text-xs text-stone-700 outline-none focus:border-stone-950 text-center tracking-widest"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Errors / Success notifications */}
                  {message && (
                    <p className={`text-[10px] font-bold text-center leading-relaxed p-3 rounded-xl border ${
                      isSuccess
                        ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                        : "text-red-700 bg-red-50 border-red-200"
                    }`}>
                      {message}
                    </p>
                  )}

                  {/* Checkout Confirm Button */}
                  <button
                    onClick={handleBook}
                    disabled={isLoading || !selectedDate || !selectedSlot || !selectedSpecialist}
                    className="w-full py-3 bg-stone-900 hover:bg-stone-850 text-stone-50 font-bold uppercase tracking-wider text-xs rounded-xl transition shadow-sm disabled:opacity-45"
                  >
                    {isLoading ? "..." : `${t.payButton} (${splits.deposit} SAR)`}
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
              <li><Link href="/security" className="hover:text-white transition">{locale === "ar" ? "هيئة الزكاة والمدفوعات" : "ZATCA & Payments"}</Link></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto pt-8 border-t border-stone-900 text-center text-xs text-stone-600 font-medium">
          <p>© {new Date().getFullYear()} PRIMORA. {t.allRightsReserved}</p>
        </div>
      </footer>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
