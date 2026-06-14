export interface SpecialistItem {
  id: string;
  name: { en: string; ar: string };
  role: { en: string; ar: string };
  rating: number;
  avatar: string;
}

export interface ShopItem {
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

export interface ServiceItem {
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

// Mock Specialists
export const mockSpecialists: Record<string, SpecialistItem[]> = {
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
export const mockShops: ShopItem[] = [
  {
    id: "1",
    name: { en: "Elite Grooming Lounge", ar: "صالون إيليت الرجالي" },
    city: "riyadh",
    neighborhood: "Al-Malqa",
    neighborhoodKey: "malqa",
    address: { en: "Anas Bin Malik Road, Al-Malqa, Riyadh", ar: "طريق أنس بن مالك، حي الملقا، الرياض" },
    rating: 4.9,
    reviewsCount: 1520,
    image: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=600&auto=format&fit=crop",
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
    neighborhood: "Olaya",
    neighborhoodKey: "olaya",
    address: { en: "Tahlia Street, Olaya, Riyadh", ar: "شارع التحلية، حي العليا، الرياض" },
    rating: 4.8,
    reviewsCount: 980,
    image: "https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=600&auto=format&fit=crop",
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
    neighborhood: "Al-Yasmin",
    neighborhoodKey: "yasmin",
    address: { en: "King Abdulaziz Road, Al-Yasmin, Riyadh", ar: "طريق الملك عبدالعزيز، حي الياسمين، الرياض" },
    rating: 4.9,
    reviewsCount: 1120,
    image: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?q=80&w=600&auto=format&fit=crop",
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
    neighborhood: "Al-Hamra",
    neighborhoodKey: "hamra",
    address: { en: "Corniche Road, Al-Hamra, Jeddah", ar: "طريق الكورنيش، حي الحمراء، جدة" },
    rating: 4.7,
    reviewsCount: 650,
    image: "https://images.unsplash.com/photo-1512290923902-8a9f81dc236c?q=80&w=600&auto=format&fit=crop",
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
    neighborhood: "Ash-Shati",
    neighborhoodKey: "shatei",
    address: { en: "Prince Faisal Bin Fahd Road, Ash-Shati, Jeddah", ar: "طريق الأمير فيصل بن فهد، حي الشاطئ، جدة" },
    rating: 4.9,
    reviewsCount: 430,
    image: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=80&w=600&auto=format&fit=crop",
    description: {
      en: "Premium coastal spa retreat providing Thalassotherapy, organic facials, nail care, and hair restoration styling.",
      ar: "منتجع وسبا ساحلي فاخر يقدم جلسات العلاج بالبحر، تنظيف البشرة العضوي، صبغ وتصفيف الشعر، وتجميل العرائس."
    },
    specialists: mockSpecialists["5"] || []
  }
];

// Mock Services
export const mockServices: ServiceItem[] = [
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
  },
  {
    id: "s2_4",
    shopId: "2",
    name: { en: "Bridal Couture Makeup & False Lashes Glam", ar: "مكياج عروس ملكي وتركيب رموش كثيفة" },
    category: "makeup",
    gender: "women",
    price: 1200,
    duration: 120,
    rating: 5.0,
    reviewsCount: 94,
    serviceType: "salon",
    image: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?q=80&w=400&auto=format&fit=crop"
  },
  {
    id: "s5_4",
    shopId: "5",
    name: { en: "Event Glam Makeup & Glowing Dewy Finish", ar: "مكياج المناسبات الساحر وإضاءة الوجه الندية" },
    category: "makeup",
    gender: "women",
    price: 450,
    duration: 60,
    rating: 4.9,
    reviewsCount: 52,
    serviceType: "mobile",
    image: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=80&w=400&auto=format&fit=crop"
  }
];

export interface PackageItem {
  id: string;
  shopId: string;
  name: { en: string; ar: string };
  description: { en: string; ar: string };
  price: number;
  sessionCount: number;
  expiresInDays: number;
}

export const mockPackages: PackageItem[] = [
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

