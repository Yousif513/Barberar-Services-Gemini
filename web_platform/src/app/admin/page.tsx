"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Booking = {
  id: string;
  customer: string;
  service: string;
  provider: string;
  time: string;
  status: "Confirmed" | "Pending" | "Completed" | "Cancelled";
};

const translations = {
  en: {
    searchPlaceholder: "Search for anything...",
    allBranches: "All Branches",
    branchLabel: "Branch",
    helpCenter: "Help Center",
    welcome: "Welcome back, Admin Root 👋",
    welcomeSub: "Here's what's happening with your platform today.",
    dateRange: "May 12 - May 18, 2025",
    totalRevenue: "Total Revenue",
    totalBookings: "Total Bookings",
    totalCustomers: "Total Customers",
    activeProviders: "Active Providers",
    completionRate: "Completion Rate",
    vsLastWeek: "vs last week",
    revenueOverview: "Revenue Overview",
    thisMonth: "This Month",
    lastMonth: "Last Month",
    liveStatus: "Live Platform Status",
    viewStatus: "View System Status",
    recentActivity: "Recent Activity",
    viewAll: "View All",
    topServices: "Top Services",
    topProviders: "Top Providers",
    bookingSource: "Booking Source",
    revenueCategory: "Revenue by Category",
    recentBookings: "Recent Bookings",
    quickActions: "Quick Actions",
    reports: "Reports",
    platformInsights: "Platform Insights",
    newCustomers: "New Customers",
    retention: "Customer Retention",
    aov: "Average Order Value",
    refundRate: "Refund Rate",
    confirmed: "Confirmed",
    pending: "Pending",
    completed: "Completed",
    cancelled: "Cancelled",
    addProvider: "Add Provider",
    addService: "Add Service",
    createOffer: "Create Offer",
    sendNotif: "Send Notification",
    salesReport: "Sales Report",
    bookingReport: "Booking Report",
    providerReport: "Provider Report",
    payoutReport: "Payout Report",
    webApp: "Web Application",
    mobileApp: "Mobile Application",
    payGateway: "Payment Gateway",
    emailService: "Email Service",
    smsService: "SMS Service",
    serverHealth: "Server Health",
    operational: "Operational",
    degraded: "Degraded",
    langToggle: "العربية"
  },
  ar: {
    searchPlaceholder: "البحث عن أي شيء...",
    allBranches: "جميع الفروع",
    branchLabel: "الفرع",
    helpCenter: "مركز المساعدة",
    welcome: "مرحباً بعودتك، مدير النظام 👋",
    welcomeSub: "إليك ما يحدث في منصتك اليوم.",
    dateRange: "١٢ مايو - ١٨ مايو ٢٠٢٥",
    totalRevenue: "إجمالي الإيرادات",
    totalBookings: "إجمالي الحجوزات",
    totalCustomers: "إجمالي العملاء",
    activeProviders: "المزودون النشطون",
    completionRate: "معدل الاكتمال",
    vsLastWeek: "مقارنة بالأسبوع الماضي",
    revenueOverview: "نظرة عامة على الإيرادات",
    thisMonth: "هذا الشهر",
    lastMonth: "الشهر الماضي",
    liveStatus: "حالة المنصة المباشرة",
    viewStatus: "عرض حالة النظام",
    recentActivity: "النشاط الأخير",
    viewAll: "عرض الكل",
    topServices: "أفضل الخدمات",
    topProviders: "أفضل المزودين",
    bookingSource: "مصدر الحجز",
    revenueCategory: "الإيرادات حسب الفئة",
    recentBookings: "الحجوزات الأخيرة",
    quickActions: "إجراءات سريعة",
    reports: "التقارير",
    platformInsights: "رؤى المنصة",
    newCustomers: "العملاء الجدد",
    retention: "الاحتفاظ بالعملاء",
    aov: "متوسط قيمة الطلب",
    refundRate: "معدل الاسترداد",
    confirmed: "مؤكد",
    pending: "معلق",
    completed: "مكتمل",
    cancelled: "ملغى",
    addProvider: "إضافة مزود",
    addService: "إضافة خدمة",
    createOffer: "إنشاء عرض",
    sendNotif: "إرسال إشعار",
    salesReport: "تقرير المبيعات",
    bookingReport: "تقرير الحجوزات",
    providerReport: "تقرير المزودين",
    payoutReport: "تقرير المدفوعات",
    webApp: "تطبيق الويب",
    mobileApp: "تطبيق الجوال",
    payGateway: "بوابة الدفع",
    emailService: "خدمة البريد",
    smsService: "خدمة الرسائل (SMS)",
    serverHealth: "صحة الخادم",
    operational: "يعمل بشكل طبيعي",
    degraded: "أداء متراجع",
    langToggle: "English"
  }
};

export default function AdminDashboardPage() {
  const [locale, setLocale] = useState<"en" | "ar">("en");
  const [activeIndex, setActiveIndex] = useState<number | null>(4); // Default to May 13/14 point

  const isRTL = locale === "ar";
  const t = translations[locale];
  const flip = isRTL ? "flex-row-reverse" : "flex-row";

  useEffect(() => {
    const syncLocale = () => setLocale(document.documentElement.lang === "ar" ? "ar" : "en");
    syncLocale();
    const observer = new MutationObserver(syncLocale);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, []);

  const toggleLanguage = () => {
    const target = locale === "en" ? "ar" : "en";
    document.documentElement.lang = target;
    document.documentElement.dir = target === "ar" ? "rtl" : "ltr";
    try { localStorage.setItem("primora_lang", target); } catch {}
    setLocale(target);
  };

  const localizedData = {
    en: {
      dateRange: "May 12 – May 18, 2025",
      thisMonthText: "This Month",
      lastMonthText: "Last Month",
      viewStatusText: "View System Status",
      viewAllText: "View All",
      operationalText: "Operational",
      degradedText: "Degraded",
      totalBookingsText: "Total Bookings",
      recentBookingsTitle: "Recent Bookings",
      quickActionsTitle: "Quick Actions",
      reportsTitle: "Reports",
      platformInsightsTitle: "Platform Insights",
      topServicesTitle: "Top Services",
      topProvidersTitle: "Top Providers",
      bookingSourceTitle: "Booking Source",
      revenueCategoryTitle: "Revenue by Category",
      revenueOverview: "Revenue Overview",
      liveStatus: "Live Platform Status",
      recentActivity: "Recent Activity",
      
      kpis: [
        { label: "Total Revenue", value: "$28,560", change: "12.5% vs last week", color: "text-[#16A34A]", sparkline: "M0,32 Q15,18 30,25 T60,15 T90,22 T120,8" },
        { label: "Total Bookings", value: "3,456", change: "8.2% vs last week", color: "text-[#16A34A]", sparkline: "M0,22 Q15,32 30,18 T60,25 T90,10 T120,12" },
        { label: "Total Customers", value: "2,145", change: "10.3% vs last week", color: "text-[#16A34A]", sparkline: "M0,28 Q15,12 30,22 T60,18 T90,8 T120,5" },
        { label: "Active Providers", value: "520", change: "6.7% vs last week", color: "text-[#16A34A]", sparkline: "M0,32 Q15,28 30,30 T60,22 T90,25 T120,15" },
        { label: "Completion Rate", value: "92.4%", change: "3.6% vs last week", color: "text-[#16A34A]", sparkline: "M0,18 Q15,20 30,12 T60,15 T90,8 T120,2" }
      ],

      platformStatus: [
        { name: "Web Application", status: "Operational", isDegraded: false },
        { name: "Mobile Application", status: "Operational", isDegraded: false },
        { name: "Payment Gateway", status: "Operational", isDegraded: false },
        { name: "Email Service", status: "Operational", isDegraded: false },
        { name: "SMS Service", status: "Degraded", isDegraded: true },
        { name: "Server Health", status: "Operational", isDegraded: false }
      ],

      activity: [
        { name: "Olivia Rhye", desc: "New booking created", time: "2m ago", initials: "OR" },
        { name: "Liam Johnson", desc: "Payment of $150", time: "5m ago", initials: "LJ" },
        { name: "Noah Williams", desc: "New provider registered", time: "15m ago", initials: "NW" },
        { name: "Emma Brown", desc: "Service updated", time: "25m ago", initials: "EB" },
        { name: "James Smith", desc: "Payout of $210", time: "45m ago", initials: "JS" }
      ],

      topServices: [
        { name: "Hair Styling", bookings: "220 bookings", amount: "$6,240" },
        { name: "Spa Therapy", bookings: "210 bookings", amount: "$5,210" },
        { name: "Moroccan Bath", bookings: "180 bookings", amount: "$4,320" },
        { name: "Hair Coloring", bookings: "150 bookings", amount: "$3,200" },
        { name: "Facial Treatment", bookings: "120 bookings", amount: "$2,400" }
      ],

      topProviders: [
        { name: "Emma Johnson", rating: "4.9", bookings: "320 bookings", amount: "$8,450", initials: "EJ" },
        { name: "Olivia Brown", rating: "4.8", bookings: "210 bookings", amount: "$6,120", initials: "OB" },
        { name: "Sophia Lee", rating: "4.9", bookings: "180 bookings", amount: "$5,230", initials: "SL" },
        { name: "Noah Williams", rating: "4.7", bookings: "150 bookings", amount: "$4,560", initials: "NW" },
        { name: "Liam Johnson", rating: "4.6", bookings: "120 bookings", amount: "$3,120", initials: "LJ" }
      ],

      sources: [
        { label: "Mobile App", pct: "40%", val: 40, color: "#D1AF47" },
        { label: "Website", pct: "30%", val: 30, color: "#101828" },
        { label: "Walk-in", pct: "20%", val: 20, color: "#667085" },
        { label: "Call Center", pct: "10%", val: 10, color: "#ECECEC" }
      ],

      categories: [
        { name: "Hair Services", amount: "$12,450", pct: 43 },
        { name: "Spa & Wellness", amount: "$8,560", pct: 29 },
        { name: "Beauty & Care", amount: "$4,950", pct: 17 },
        { name: "Packages", amount: "$2,570", pct: 9 },
        { name: "Others", amount: "$1,030", pct: 2 }
      ],

      bookings: [
        { id: "BK-1456", customer: "Olivia Rhye", service: "Hair Styling", provider: "Emma Johnson", time: "May 18, 11:00 AM", status: "Confirmed" },
        { id: "BK-1455", customer: "Liam Johnson", service: "Spa Therapy", provider: "Olivia Brown", time: "May 18, 10:30 AM", status: "Confirmed" },
        { id: "BK-1454", customer: "Noah Williams", service: "Moroccan Bath", provider: "Sophia Lee", time: "May 18, 09:00 AM", status: "Pending" },
        { id: "BK-1453", customer: "Emma Brown", service: "Facial Treatment", provider: "Noah Williams", time: "May 17, 04:00 PM", status: "Completed" }
      ],

      quickActions: [
        { label: "Add Provider", icon: "user-plus", href: "/admin/providers" },
        { label: "Add Service", icon: "shield", href: "/admin/services" },
        { label: "Create Offer", icon: "gift", href: "/admin/coupons" },
        { label: "Send Notification", icon: "bell-ring", href: "/admin/notifications" }
      ],

      reportsList: [
        { label: "Sales Report", icon: "file-chart", href: "/admin/reports" },
        { label: "Booking Report", icon: "file-calendar", href: "/admin/reports" },
        { label: "Provider Report", icon: "file-users", href: "/admin/reports" },
        { label: "Payout Report", icon: "file-wallet", href: "/admin/ledger" }
      ],

      insights: [
        { label: "New Customers", value: "+245", change: "12.5%", isPositive: true },
        { label: "Customer Retention", value: "68.5%", change: "8.2%", isPositive: true },
        { label: "Average Order Value", value: "$65.40", change: "6.3%", isPositive: true },
        { label: "Refund Rate", value: "2.45%", change: "1.2%", isPositive: false }
      ]
    },
    ar: {
      dateRange: "١٢ مايو – ١٨ مايو ٢٠٢٥",
      thisMonthText: "هذا الشهر",
      lastMonthText: "الشهر الماضي",
      viewStatusText: "عرض حالة النظام",
      viewAllText: "عرض الكل",
      operationalText: "يعمل بشكل طبيعي",
      degradedText: "أداء متراجع",
      totalBookingsText: "إجمالي الحجوزات",
      recentBookingsTitle: "الحجوزات الأخيرة",
      quickActionsTitle: "إجراءات سريعة",
      reportsTitle: "التقارير",
      platformInsightsTitle: "رؤى المنصة",
      topServicesTitle: "أفضل الخدمات",
      topProvidersTitle: "أفضل المزودين",
      bookingSourceTitle: "مصدر الحجز",
      revenueCategoryTitle: "الإيرادات حسب الفئة",
      revenueOverview: "نظرة عامة على الإيرادات",
      liveStatus: "حالة المنصة المباشرة",
      recentActivity: "النشاط الأخير",

      kpis: [
        { label: "إجمالي الإيرادات", value: "$٢٨,٥٦٠", change: "١٢.٥% الأسبوع الماضي", color: "text-[#16A34A]", sparkline: "M0,32 Q15,18 30,25 T60,15 T90,22 T120,8" },
        { label: "إجمالي الحجوزات", value: "٣,٤٥٦", change: "٨.٢% الأسبوع الماضي", color: "text-[#16A34A]", sparkline: "M0,22 Q15,32 30,18 T60,25 T90,10 T120,12" },
        { label: "إجمالي العملاء", value: "٢,١٤٥", change: "١٠.٣% الأسبوع الماضي", color: "text-[#16A34A]", sparkline: "M0,28 Q15,12 30,22 T60,18 T90,8 T120,5" },
        { label: "المزودون النشطون", value: "٥٢٠", change: "٦.٧% الأسبوع الماضي", color: "text-[#16A34A]", sparkline: "M0,32 Q15,28 30,30 T60,22 T90,25 T120,15" },
        { label: "معدل الاكتمال", value: "٩٢.٤%", change: "٣.٦% الأسبوع الماضي", color: "text-[#16A34A]", sparkline: "M0,18 Q15,20 30,12 T60,15 T90,8 T120,2" }
      ],

      platformStatus: [
        { name: "تطبيق الويب", status: "يعمل بشكل طبيعي", isDegraded: false },
        { name: "تطبيق الجوال", status: "يعمل بشكل طبيعي", isDegraded: false },
        { name: "بوابة الدفع", status: "يعمل بشكل طبيعي", isDegraded: false },
        { name: "خدمة البريد", status: "يعمل بشكل طبيعي", isDegraded: false },
        { name: "خدمة الرسائل (SMS)", status: "أداء متراجع", isDegraded: true },
        { name: "صحة الخادم", status: "يعمل بشكل طبيعي", isDegraded: false }
      ],

      activity: [
        { name: "أوليفيا راي", desc: "تم إنشاء حجز جديد", time: "منذ دقيقتين", initials: "OR" },
        { name: "ليام جونسون", desc: "عملية دفع بقيمة ١٥٠$", time: "منذ ٥ دقائق", initials: "LJ" },
        { name: "نوح ويليامز", desc: "تم تسجيل مزود جديد", time: "منذ ١٥ دقيقة", initials: "NW" },
        { name: "إيما براون", desc: "تم تحديث الخدمة", time: "منذ ٢٥ دقيقة", initials: "EB" },
        { name: "جيمس سميث", desc: "تحويل دفع بقيمة ٢١٠$", time: "منذ ٤٥ دقيقة", initials: "JS" }
      ],

      topServices: [
        { name: "تصفيف الشعر", bookings: "٢٢٠ حجز", amount: "$٦,٢٤٠" },
        { name: "علاج السبا", bookings: "٢١٠ حجز", amount: "$٥,٢١٠" },
        { name: "الحمام المغربي", bookings: "١٨٠ حجز", amount: "$٤,٣٢٠" },
        { name: "تلوين الشعر", bookings: "١٥٠ حجز", amount: "$٣,٢٠٠" },
        { name: "علاج الوجه", bookings: "١٢٠ حجز", amount: "$٢,٤٠٠" }
      ],

      topProviders: [
        { name: "إيما جونسون", rating: "٤.٩", bookings: "٣٢٠ حجز", amount: "$٨,٤٥٠", initials: "EJ" },
        { name: "أوليفيا براون", rating: "٤.٨", bookings: "٢١٠ حجز", amount: "$٦,١٢٠", initials: "OB" },
        { name: "صوفيا لي", rating: "٤.٩", bookings: "١٨٠ حجز", amount: "$٥,٢٣٠", initials: "SL" },
        { name: "نوح ويليامز", rating: "٤.٧", bookings: "١٥٠ حجز", amount: "$٤,٥٦٠", initials: "NW" },
        { name: "ليام جونسون", rating: "٤.٦", bookings: "١٢٠ حجز", amount: "$٣,١٢٠", initials: "LJ" }
      ],

      sources: [
        { label: "تطبيق الجوال", pct: "٤٠%", val: 40, color: "#D1AF47" },
        { label: "الموقع الإلكتروني", pct: "٣٠%", val: 30, color: "#101828" },
        { label: "حضور شخصي", pct: "٢٠%", val: 20, color: "#667085" },
        { label: "مركز الاتصال", pct: "١٠%", val: 10, color: "#ECECEC" }
      ],

      categories: [
        { name: "خدمات الشعر", amount: "$١٢,٤٥٠", pct: 43 },
        { name: "السبا والاستجمام", amount: "$٨,٥٦٠", pct: 29 },
        { name: "الجمال والعناية", amount: "$٤,٩٥٠", pct: 17 },
        { name: "الباقات", amount: "$٢,٥٧٠", pct: 9 },
        { name: "أخرى", amount: "$١,٠٣٠", pct: 2 }
      ],

      bookings: [
        { id: "BK-1456", customer: "أوليفيا راي", service: "تصفيف الشعر", provider: "إيما جونسون", time: "١٨ مايو، ١١:٠٠ ص", status: "Confirmed" },
        { id: "BK-1455", customer: "ليام جونسون", service: "علاج السبا", provider: "أوليفيا براون", time: "١٨ مايو، ١٠:٣٠ ص", status: "Confirmed" },
        { id: "BK-1454", customer: "نوح ويليامز", service: "الحمام المغربي", provider: "صوفيا لي", time: "١٨ مايو، ٠٩:٠٠ ص", status: "Pending" },
        { id: "BK-1453", customer: "إيما براون", service: "علاج الوجه", provider: "نوح ويليامز", time: "١٧ مايو، ٠٤:٠٠ م", status: "Completed" }
      ],

      quickActions: [
        { label: "إضافة مزود", icon: "user-plus", href: "/admin/providers" },
        { label: "إضافة خدمة", icon: "shield", href: "/admin/services" },
        { label: "إنشاء عرض", icon: "gift", href: "/admin/coupons" },
        { label: "إرسال إشعار", icon: "bell-ring", href: "/admin/notifications" }
      ],

      reportsList: [
        { label: "تقرير المبيعات", icon: "file-chart", href: "/admin/reports" },
        { label: "تقرير الحجوزات", icon: "file-calendar", href: "/admin/reports" },
        { label: "تقرير المزودين", icon: "file-users", href: "/admin/reports" },
        { label: "تقرير المدفوعات", icon: "file-wallet", href: "/admin/ledger" }
      ],

      insights: [
        { label: "العملاء الجدد", value: "+٢٤٥", change: "١٢.٥%", isPositive: true },
        { label: "الاحتفاظ بالعملاء", value: "٦٨.٥%", change: "٨.٢%", isPositive: true },
        { label: "متوسط قيمة الطلب", value: "$٦٥.٤٠", change: "٦.٣%", isPositive: true },
        { label: "معدل الاسترداد", value: "٢.٤٥%", change: "١.٢%", isPositive: false }
      ]
    }
  };

  const chartPoints = [
    { labelEn: "May 1", labelAr: "١ مايو", valueThis: 12000, valueLast: 10000, dateEn: "May 1, 2025", dateAr: "١ مايو ٢٠٢٥" },
    { labelEn: "May 4", labelAr: "٤ مايو", valueThis: 16000, valueLast: 13000, dateEn: "May 4, 2025", dateAr: "٤ مايو ٢٠٢٥" },
    { labelEn: "May 7", labelAr: "٧ مايو", valueThis: 14000, valueLast: 12000, dateEn: "May 7, 2025", dateAr: "٧ مايو ٢٠٢٥" },
    { labelEn: "May 10", labelAr: "١٠ مايو", valueThis: 22000, valueLast: 18000, dateEn: "May 10, 2025", dateAr: "١٠ مايو ٢٠٢٥" },
    { labelEn: "May 13", labelAr: "١٣ مايو", valueThis: 28560, valueLast: 24560, dateEn: "May 14, 2025", dateAr: "١٤ مايو ٢٠٢٥" },
    { labelEn: "May 16", labelAr: "١٦ مايو", valueThis: 20000, valueLast: 17000, dateEn: "May 16, 2025", dateAr: "١٦ مايو ٢٠٢٥" },
    { labelEn: "May 18", labelAr: "١٨ مايو", valueThis: 35000, valueLast: 26000, dateEn: "May 18, 2025", dateAr: "١٨ مايو ٢٠٢٥" }
  ];

  const currentData = localizedData[locale];

  // SVG dimensions for Revenue Overview
  const svgW = 600;
  const svgH = 220;
  const graphW = 500;
  const graphH = 160;
  const startX = 50;
  const startY = 190; // Y coordinate for $0

  const getCoordinates = (val: number, index: number) => {
    const x = startX + index * (graphW / 6);
    const y = startY - (val / 40000) * graphH;
    return { x, y };
  };

  const linePathThis = chartPoints.map((pt, i) => {
    const coords = getCoordinates(pt.valueThis, i);
    return `${i === 0 ? "M" : "L"} ${coords.x} ${coords.y}`;
  }).join(" ");

  const linePathLast = chartPoints.map((pt, i) => {
    const coords = getCoordinates(pt.valueLast, i);
    return `${i === 0 ? "M" : "L"} ${coords.x} ${coords.y}`;
  }).join(" ");

  // Custom UI headers for bookings table
  const tableHeaders = isRTL
    ? { id: "رقم الحجز", customer: "العميل", service: "الخدمة", provider: "المزود", time: "الوقت", status: "الحالة" }
    : { id: "Booking ID", customer: "Customer", service: "Service", provider: "Provider", time: "Time", status: "Status" };

  const getActionIcon = (iconName: string) => {
    const s = "w-5 h-5 text-[#D1AF47]";
    switch (iconName) {
      case "user-plus":
        return <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>;
      case "shield":
        return <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>;
      case "gift":
        return <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V6a2 2 0 10-2 2h2zm0 0H4v13a2 2 0 002 2h12a2 2 0 002-2V8H12z" /></svg>;
      case "bell-ring":
        return <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>;
      case "file-chart":
        return <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
      case "file-calendar":
        return <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;
      case "file-users":
        return <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2m-10 0a4 4 0 11-8 0 4 4 0 018 0zm13-3h-6a3 3 0 00-3 3v2h12v-2a3 3 0 00-3-3z" /></svg>;
      case "file-wallet":
        return <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>;
      default:
        return <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>;
    }
  };

  const cardBase = "rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)] transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.035)] hover:border-[#D1AF47]/20";
  const headerIconBg = "w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center border border-[#ECECEC]";

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-6 text-[#101828] font-sans pb-10 ${isRTL ? "text-right" : "text-left"}`}>
      
      {/* ═══════════════════════════════════════════════════════ */}
      {/* HEADER BAR                                              */}
      {/* ═══════════════════════════════════════════════════════ */}
      <header className={`flex flex-col gap-4 md:flex-row md:items-center md:justify-between ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
        {/* Global Search */}
        <div className={`flex items-center gap-3 bg-white border border-[#ECECEC] px-4 py-2.5 rounded-full w-full md:w-80 shadow-sm ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
          <svg className="w-4 h-4 text-[#667085]" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder={t.searchPlaceholder}
            className={`bg-transparent border-none outline-none text-xs w-full placeholder-[#667085]/60 ${isRTL ? "text-right" : "text-left"}`}
          />
        </div>

        {/* Action Controls */}
        <div className={`flex items-center gap-3 self-start md:self-auto ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
          
          {/* Branch Selector Pill */}
          <div className="relative">
            <div className={`flex items-center gap-2 border border-[#ECECEC] bg-white rounded-full px-4 py-2.5 text-xs font-semibold shadow-sm cursor-pointer hover:bg-gray-50 transition ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1" />
              </svg>
              <span className="text-gray-400 font-medium">{t.branchLabel}</span>
              <span className="text-gray-900 font-bold">{t.allBranches}</span>
              <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {/* Notification Bell */}
          <Link href="/admin/activity" aria-label="Notifications" className="relative rounded-full border border-[#ECECEC] bg-white p-2.5 text-[#667085] shadow-sm hover:bg-gray-50 transition">
            <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-[#D1AF47] ring-2 ring-white" />
            <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 8a6 6 0 10-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
            </svg>
          </Link>

          {/* Help Center */}
          <Link href="/admin/help" className={`flex items-center gap-1.5 border border-[#ECECEC] bg-white rounded-full px-4 py-2.5 text-xs font-bold text-gray-700 shadow-sm hover:bg-gray-50 transition ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5h.01" />
            </svg>
            <span>{t.helpCenter}</span>
          </Link>

          {/* Language Selector */}
          <button
            onClick={toggleLanguage}
            className="rounded-full border border-[#ECECEC] bg-white px-4 py-2.5 text-xs font-black text-gray-700 shadow-sm hover:border-[#D1AF47]/40 hover:text-[#D1AF47] transition"
          >
            {t.langToggle}
          </button>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* GREETING CARD & DATE SELECTOR                           */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className={`flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pt-2 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
        <div className={`min-w-0 ${isRTL ? "text-right" : "text-left"}`}>
          <h1 className="text-2xl font-serif font-black tracking-tight text-gray-900 leading-tight">
            {locale === "ar" ? "مرحباً بعودتك، مدير النظام 👋" : "Welcome back, Admin Root 👋"}
          </h1>
          <p className="text-xs text-gray-500 font-semibold mt-1">
            {t.welcomeSub}
          </p>
        </div>

        {/* Date Selector */}
        <div className={`flex items-center gap-2 border border-[#ECECEC] bg-white rounded-full px-4 py-2.5 text-xs font-bold text-gray-700 shadow-sm cursor-pointer hover:bg-gray-50 transition self-start sm:self-auto ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
          <span>{currentData.dateRange}</span>
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* ROW 1: EXECUTIVE KPI CARDS (5 cards)                   */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {currentData.kpis.map((k, index) => {
          let icon = null;
          const s = "w-4 h-4 text-[#D1AF47]";
          if (index === 0) icon = <span className="text-[#D1AF47] font-serif text-sm font-black">$</span>;
          else if (index === 1) icon = <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;
          else if (index === 2) icon = <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2m-10 0a4 4 0 11-8 0 4 4 0 018 0z" /></svg>;
          else if (index === 3) icon = <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>;
          else icon = <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;

          return (
            <div key={k.label} className={`${cardBase} flex flex-col p-4 relative overflow-hidden pb-1`}>
              <div className={`flex items-center justify-between ${flip}`}>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] truncate pr-2">{k.label}</span>
                <div className="w-7 h-7 rounded-full bg-gray-50 border border-[#ECECEC] flex items-center justify-center flex-shrink-0">
                  {icon}
                </div>
              </div>
              <div className={`mt-3 flex items-baseline gap-2 ${isRTL ? "flex-row-reverse text-right" : "flex-row text-left"}`}>
                <strong className="text-xl font-serif font-black text-[#101828] leading-none">{k.value}</strong>
              </div>
              <div className={`mt-1.5 flex items-center gap-1 text-[10px] font-bold ${isRTL ? "flex-row-reverse text-right" : "flex-row text-left"}`}>
                <span className="text-[#16A34A] flex items-center">
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                </span>
                <span className="text-[#16A34A]">{k.change.split(" ")[0]}</span>
                <span className="text-gray-400 font-semibold">{k.change.substring(k.change.indexOf(" "))}</span>
              </div>

              {/* Sparkline chart at bottom */}
              <div className="mt-auto pt-3 -mx-4 -mb-1">
                <svg viewBox="0 0 120 40" className="w-full h-8" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id={`sparkGrad-${index}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#D1AF47" stopOpacity="0.22" />
                      <stop offset="100%" stopColor="#D1AF47" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={`${k.sparkline} L120,40 L0,40 Z`} fill={`url(#sparkGrad-${index})`} />
                  <path d={k.sparkline} fill="none" stroke="#D1AF47" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="120" cy="5" r="2" fill="#D1AF47" />
                </svg>
              </div>
            </div>
          );
        })}
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* ROW 2: REVENUE, STATUS & ACTIVITY GRID                  */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Revenue Overview Line Chart (span-6) */}
        <section className={`${cardBase} flex flex-col lg:col-span-6 relative`}>
          <div className={`flex items-center justify-between mb-4 ${flip}`}>
            <div className={`flex items-center gap-3 ${flip}`}>
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#667085]">
                {currentData.revenueOverview}
              </h3>
              {/* Legend indicators */}
              <div className={`hidden sm:flex items-center gap-3 text-[10px] font-semibold text-gray-500 ${flip}`}>
                <div className={`flex items-center gap-1.5 ${flip}`}>
                  <span className="w-2.5 h-0.5 bg-[#D1AF47] rounded-full inline-block" />
                  <span>{currentData.thisMonthText} $28,560</span>
                </div>
                <div className={`flex items-center gap-1.5 ${flip}`}>
                  <span className="w-2.5 h-0.5 border-t border-dashed border-[#D1AF47] inline-block" />
                  <span>{currentData.lastMonthText} $24,560</span>
                </div>
              </div>
            </div>

            {/* Dropdown */}
            <div className={`flex items-center gap-1 border border-[#ECECEC] bg-white rounded-full px-3 py-1 text-[10px] font-bold text-gray-700 shadow-sm cursor-pointer hover:bg-gray-50 transition ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <span>{currentData.thisMonthText}</span>
              <svg className="w-2.5 h-2.5 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {/* Interactive Chart Container */}
          <div className="relative flex-grow min-h-[175px]">
            <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-full" preserveAspectRatio="none">
              
              {/* Gridlines */}
              {[0, 10000, 20000, 30000, 40000].map((val) => {
                const y = startY - (val / 40000) * graphH;
                return (
                  <line key={val} x1={startX} y1={y} x2={startX + graphW} y2={y} stroke="#ECECEC" strokeWidth="1" strokeDasharray="3 4" />
                );
              })}

              {/* Ticks on Y-axis */}
              {[
                { label: "$40K", val: 40000 },
                { label: "$30K", val: 30000 },
                { label: "$20K", val: 20000 },
                { label: "$10K", val: 10000 },
                { label: "$0", val: 0 }
              ].map((tick) => {
                const y = startY - (tick.val / 40000) * graphH;
                return (
                  <text key={tick.label} x={startX - 10} y={y + 3} textAnchor="end" className="text-[9px] font-extrabold fill-gray-400">
                    {tick.label}
                  </text>
                );
              })}

              {/* Ticks on X-axis */}
              {chartPoints.map((pt, i) => {
                const x = startX + i * (graphW / 6);
                return (
                  <text key={i} x={x} y={startY + 16} textAnchor="middle" className="text-[9px] font-extrabold fill-gray-400">
                    {isRTL ? pt.labelAr : pt.labelEn}
                  </text>
                );
              })}

              {/* Lines */}
              <path d={linePathLast} fill="none" stroke="#D1AF47" strokeWidth="1.5" strokeDasharray="4 4" strokeLinecap="round" strokeLinejoin="round" opacity="0.45" />
              <path d={linePathThis} fill="none" stroke="#D1AF47" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

              {/* Vertical line indicator on hover */}
              {activeIndex !== null && (
                <>
                  <line
                    x1={getCoordinates(chartPoints[activeIndex].valueThis, activeIndex).x}
                    y1={30}
                    x2={getCoordinates(chartPoints[activeIndex].valueThis, activeIndex).x}
                    y2={startY}
                    stroke="#D1AF47"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                  />
                  <circle
                    cx={getCoordinates(chartPoints[activeIndex].valueThis, activeIndex).x}
                    cy={getCoordinates(chartPoints[activeIndex].valueThis, activeIndex).y}
                    r="5"
                    fill="#D1AF47"
                    stroke="white"
                    strokeWidth="1.5"
                  />
                </>
              )}

              {/* Transparent Interactive Columns */}
              {chartPoints.map((pt, i) => {
                const x = startX + i * (graphW / 6);
                return (
                  <rect
                    key={i}
                    x={x - (graphW / 12)}
                    y={20}
                    width={graphW / 6}
                    height={startY - 20}
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={() => setActiveIndex(i)}
                  />
                );
              })}
            </svg>

            {/* Custom Interactive Tooltip Element */}
            {activeIndex !== null && (
              <div
                className="absolute bg-gray-950 text-white px-3 py-1.5 rounded-lg text-[10px] font-semibold shadow-xl border border-gray-800 transition-all duration-200 pointer-events-none transform -translate-y-full -translate-x-1/2"
                style={{
                  left: `${((getCoordinates(chartPoints[activeIndex].valueThis, activeIndex).x) / svgW) * 100}%`,
                  top: `${((getCoordinates(chartPoints[activeIndex].valueThis, activeIndex).y) / svgH) * 100 - 8}%`
                }}
              >
                <p className="text-gray-400 font-medium text-[8px] leading-tight mb-0.5">
                  {isRTL ? chartPoints[activeIndex].dateAr : chartPoints[activeIndex].dateEn}
                </p>
                <p className="text-white font-black text-xs">
                  ${chartPoints[activeIndex].valueThis.toLocaleString()}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Live Platform Status (span-3) */}
        <section className={`${cardBase} flex flex-col lg:col-span-3`}>
          <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#667085] mb-4">
            {currentData.liveStatus}
          </h3>
          <div className="flex-grow space-y-3">
            {currentData.platformStatus.map((item, index) => {
              let icon = null;
              const s = "w-4 h-4 text-gray-500";
              if (index === 0) icon = <svg className={s} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>;
              else if (index === 1) icon = <svg className={s} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>;
              else if (index === 2) icon = <svg className={s} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>;
              else if (index === 3) icon = <svg className={s} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>;
              else if (index === 4) icon = <svg className={s} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>;
              else icon = <svg className={s} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>;

              return (
                <div key={item.name} className={`flex items-center justify-between py-1 border-b border-[#ECECEC] last:border-0 ${flip}`}>
                  <div className={`flex items-center gap-2.5 ${flip}`}>
                    <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center border border-[#ECECEC] flex-shrink-0">
                      {icon}
                    </div>
                    <span className="text-xs font-bold text-gray-700">{item.name}</span>
                  </div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black ${
                    item.isDegraded
                      ? "bg-[#FFFAEB] text-[#F59E0B]"
                      : "bg-[#ECFDF3] text-[#16A34A]"
                  }`}>
                    {item.isDegraded ? currentData.degradedText : currentData.operationalText}
                  </span>
                </div>
              );
            })}
          </div>

          <Link href="/admin/system-logs" className="block w-full bg-[#F7F6F3] border border-[#ECECEC] text-gray-700 hover:bg-gray-100/60 rounded-xl py-2 mt-4 text-[10px] font-black uppercase tracking-wider transition text-center">
            {currentData.viewStatusText}
          </Link>
        </section>

        {/* Recent Activity (span-3) */}
        <section className={`${cardBase} flex flex-col lg:col-span-3`}>
          <div className={`flex items-center justify-between mb-4 ${flip}`}>
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#667085]">
              {currentData.recentActivity}
            </h3>
            <Link href="/admin/activity" className="text-[10px] font-black text-[#D1AF47] hover:underline">
              {currentData.viewAllText}
            </Link>
          </div>
          <div className="flex-grow space-y-4">
            {currentData.activity.map((act) => (
              <div key={act.name} className={`flex items-start gap-2.5 ${flip}`}>
                <div className="w-8 h-8 rounded-full bg-[#F7EBC3] border border-[#D1AF47]/30 text-[#B8952E] flex items-center justify-center text-xs font-extrabold flex-shrink-0">
                  {act.initials}
                </div>
                <div className={`min-w-0 flex-grow leading-tight ${isRTL ? "text-right" : "text-left"}`}>
                  <p className="text-xs font-extrabold text-[#101828]">{act.name}</p>
                  <p className="text-[10px] text-gray-500 font-semibold mt-0.5">{act.desc}</p>
                </div>
                <span className="text-[9px] text-gray-400 font-medium whitespace-nowrap">{act.time}</span>
              </div>
            ))}
          </div>
        </section>

      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* ROW 3: TOP SERVICES, TOP PROVIDERS, CHARTS GRID         */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        
        {/* Top Services (span-1) */}
        <section className={`${cardBase} flex flex-col`}>
          <div className={`flex items-center justify-between mb-4 ${flip}`}>
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#667085]">
              {currentData.topServicesTitle}
            </h3>
            <Link href="/admin/services" className="text-[10px] font-black text-[#D1AF47] hover:underline">
              {currentData.viewAllText}
            </Link>
          </div>
          <div className="flex-grow space-y-3.5">
            {currentData.topServices.map((srv, idx) => (
              <div key={srv.name} className={`flex items-center justify-between ${flip}`}>
                <div className={`flex items-center gap-2 min-w-0 ${flip}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#D1AF47] flex-shrink-0" />
                  <div className={`min-w-0 ${isRTL ? "text-right" : "text-left"}`}>
                    <p className="text-xs font-bold text-gray-900 truncate leading-tight">{srv.name}</p>
                    <p className="text-[9px] font-semibold text-gray-400 mt-0.5">{srv.bookings}</p>
                  </div>
                </div>
                <span className="text-xs font-extrabold text-gray-900">{srv.amount}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Top Providers (span-1) */}
        <section className={`${cardBase} flex flex-col`}>
          <div className={`flex items-center justify-between mb-4 ${flip}`}>
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#667085]">
              {currentData.topProvidersTitle}
            </h3>
            <Link href="/admin/providers" className="text-[10px] font-black text-[#D1AF47] hover:underline">
              {currentData.viewAllText}
            </Link>
          </div>
          <div className="flex-grow space-y-3">
            {currentData.topProviders.map((pvd) => (
              <div key={pvd.name} className={`flex items-center justify-between ${flip}`}>
                <div className={`flex items-center gap-2 min-w-0 ${flip}`}>
                  <div className="w-7 h-7 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center text-[10px] font-black text-gray-700 flex-shrink-0">
                    {pvd.initials}
                  </div>
                  <div className={`min-w-0 ${isRTL ? "text-right" : "text-left"}`}>
                    <p className="text-xs font-bold text-gray-900 truncate leading-tight">{pvd.name}</p>
                    <p className="text-[9px] font-bold text-[#D1AF47] mt-0.5 flex items-center gap-0.5 leading-none">
                      <span>★</span>
                      <span>{pvd.rating}</span>
                      <span className="text-gray-400 font-semibold text-[8px] ps-1">({pvd.bookings.split(" ")[0]})</span>
                    </p>
                  </div>
                </div>
                <span className="text-xs font-extrabold text-gray-900">{pvd.amount}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Booking Source Donut Chart (span-1) */}
        <section className={`${cardBase} flex flex-col`}>
          <div className={`flex items-center justify-between mb-2 ${flip}`}>
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#667085]">
              {currentData.bookingSourceTitle}
            </h3>
            {/* Dropdown */}
            <div className={`flex items-center gap-0.5 border border-[#ECECEC] bg-white rounded-full px-2 py-0.5 text-[9px] font-bold text-gray-700 shadow-sm cursor-pointer hover:bg-gray-50 transition ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <span>{currentData.thisMonthText}</span>
              <svg className="w-2 h-2 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          <div className="relative flex items-center justify-center py-2">
            <svg viewBox="0 0 120 120" className="w-[110px] h-[110px] transform rotate-[-90deg]">
              {/* Background circular track */}
              <circle cx="60" cy="60" r="46" fill="none" stroke="#F5F5F5" strokeWidth="9" />
              
              {/* Gold Ring Segment (Mobile App - 40%) */}
              <circle cx="60" cy="60" r="46" fill="none" stroke="#D1AF47" strokeWidth="9"
                strokeDasharray={`${(40 / 100) * 2 * Math.PI * 46} ${2 * Math.PI * 46}`}
                strokeDashoffset="0" strokeLinecap="round" />
              
              {/* Dark Obsidian Ring Segment (Website - 30%) */}
              <circle cx="60" cy="60" r="46" fill="none" stroke="#101828" strokeWidth="9"
                strokeDasharray={`${(30 / 100) * 2 * Math.PI * 46} ${2 * Math.PI * 46}`}
                strokeDashoffset={`-${(40 / 100) * 2 * Math.PI * 46}`} strokeLinecap="round" />
              
              {/* Soft Gray Ring Segment (Walk-in - 20%) */}
              <circle cx="60" cy="60" r="46" fill="none" stroke="#667085" strokeWidth="9"
                strokeDasharray={`${(20 / 100) * 2 * Math.PI * 46} ${2 * Math.PI * 46}`}
                strokeDashoffset={`-${(70 / 100) * 2 * Math.PI * 46}`} strokeLinecap="round" />
              
              {/* Light Gray Ring Segment (Call Center - 10%) */}
              <circle cx="60" cy="60" r="46" fill="none" stroke="#E8E8E8" strokeWidth="9"
                strokeDasharray={`${(10 / 100) * 2 * Math.PI * 46} ${2 * Math.PI * 46}`}
                strokeDashoffset={`-${(90 / 100) * 2 * Math.PI * 46}`} strokeLinecap="round" />
            </svg>

            {/* Inner Ring Text */}
            <div className="absolute text-center">
              <span className="block text-[14px] font-black text-gray-900 leading-none">3,456</span>
              <span className="block text-[8px] font-bold text-gray-400 uppercase tracking-widest mt-0.5 leading-none">
                {locale === "ar" ? "حجز" : "Bookings"}
              </span>
            </div>
          </div>

          {/* Sources legend list */}
          <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 mt-auto pt-2 border-t border-[#F5F5F5]">
            {currentData.sources.map((src) => (
              <div key={src.label} className={`flex items-center gap-1.5 text-[9px] font-semibold text-gray-500 ${flip}`}>
                <span className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: src.color }} />
                <span className="truncate flex-grow text-start">{src.label}</span>
                <span className="font-extrabold text-gray-900">{src.pct}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Revenue by Category Progress Bars (span-1) */}
        <section className={`${cardBase} flex flex-col`}>
          <div className={`flex items-center justify-between mb-4 ${flip}`}>
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#667085]">
              {currentData.revenueCategoryTitle}
            </h3>
            {/* Dropdown */}
            <div className={`flex items-center gap-0.5 border border-[#ECECEC] bg-white rounded-full px-2 py-0.5 text-[9px] font-bold text-gray-700 shadow-sm cursor-pointer hover:bg-gray-50 transition ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <span>{currentData.thisMonthText}</span>
              <svg className="w-2 h-2 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
          <div className="flex-grow space-y-3">
            {currentData.categories.map((cat) => (
              <div key={cat.name} className="space-y-1">
                <div className={`flex items-center justify-between text-[10px] font-bold ${flip}`}>
                  <span className="text-gray-700">{cat.name}</span>
                  <span className="text-gray-900 font-extrabold">{cat.amount} <span className="text-gray-400 font-semibold text-[8px]">({cat.pct}%)</span></span>
                </div>
                <div className="h-1.5 w-full bg-[#F5F5F5] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#D1AF47] to-[#E0C46A] rounded-full transition-all duration-500"
                    style={{ width: `${cat.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* ROW 4: RECENT BOOKINGS, ACTIONS & PLATFORM INSIGHTS    */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Recent Bookings Table (span-6) */}
        <section className={`${cardBase} flex flex-col lg:col-span-6 overflow-hidden`}>
          <div className={`flex items-center justify-between mb-4 flex-shrink-0 ${flip}`}>
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#667085]">
              {currentData.recentBookingsTitle}
            </h3>
            <Link href="/admin/bookings" className="text-[10px] font-black text-[#D1AF47] hover:underline">
              {currentData.viewAllText}
            </Link>
          </div>

          <div className="flex-grow overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-[#ECECEC] text-[9px] font-extrabold uppercase tracking-widest text-gray-400">
                  <th className={`pb-3 font-extrabold ${isRTL ? "text-right" : "text-left"}`}>{tableHeaders.id}</th>
                  <th className={`pb-3 font-extrabold ${isRTL ? "text-right" : "text-left"}`}>{tableHeaders.customer}</th>
                  <th className={`pb-3 font-extrabold ${isRTL ? "text-right" : "text-left"}`}>{tableHeaders.service}</th>
                  <th className={`pb-3 font-extrabold ${isRTL ? "text-right" : "text-left"}`}>{tableHeaders.provider}</th>
                  <th className={`pb-3 font-extrabold ${isRTL ? "text-right" : "text-left"}`}>{tableHeaders.time}</th>
                  <th className={`pb-3 font-extrabold ${isRTL ? "text-right" : "text-left"}`}>{tableHeaders.status}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F5F5F5] font-semibold text-gray-700">
                {currentData.bookings.map((bk) => (
                  <tr key={bk.id} className="hover:bg-gray-50/50 transition duration-150">
                    <td className={`py-3 font-serif font-black text-[#D1AF47] ${isRTL ? "text-right" : "text-left"}`}>{bk.id}</td>
                    <td className={`py-3 font-bold text-gray-900 ${isRTL ? "text-right" : "text-left"}`}>{bk.customer}</td>
                    <td className={`py-3 ${isRTL ? "text-right" : "text-left"}`}>{bk.service}</td>
                    <td className={`py-3 ${isRTL ? "text-right" : "text-left"}`}>{bk.provider}</td>
                    <td className={`py-3 text-[10px] font-bold text-gray-400 ${isRTL ? "text-right" : "text-left"}`}>{bk.time}</td>
                    <td className={`py-3 ${isRTL ? "text-right" : "text-left"}`}>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black ${
                        bk.status === "Confirmed"
                          ? "bg-[#ECFDF3] text-[#16A34A]"
                          : bk.status === "Pending"
                          ? "bg-[#FFFAEB] text-[#F59E0B]"
                          : "bg-gray-100 text-gray-600"
                      }`}>
                        {locale === "ar"
                          ? bk.status === "Confirmed"
                            ? "مؤكد"
                            : bk.status === "Pending"
                            ? "معلق"
                            : "مكتمل"
                          : bk.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Quick Actions & Reports (span-3) */}
        <section className="lg:col-span-3 flex flex-col gap-4">
          
          {/* Quick Actions Grid */}
          <div className={`${cardBase} flex-1`}>
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#667085] mb-3">
              {currentData.quickActionsTitle}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {currentData.quickActions.map((act) => (
                <Link
                  key={act.label}
                  href={act.href}
                  className="flex flex-col items-center justify-center p-3 rounded-xl border border-[#ECECEC] hover:border-[#D1AF47]/40 hover:bg-gray-50/50 transition group"
                >
                  <div className="w-9 h-9 rounded-full bg-gray-50 border border-[#ECECEC] flex items-center justify-center mb-2 group-hover:bg-white transition flex-shrink-0">
                    {getActionIcon(act.icon)}
                  </div>
                  <span className="text-[10px] font-bold text-gray-700 text-center leading-tight truncate w-full">
                    {act.label}
                  </span>
                </Link>
              ))}
            </div>
          </div>

          {/* Reports List */}
          <div className={cardBase}>
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#667085] mb-3">
              {currentData.reportsTitle}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {currentData.reportsList.map((rpt) => (
                <Link
                  key={rpt.label}
                  href={rpt.href}
                  className="flex flex-col items-center justify-center p-3 rounded-xl border border-[#ECECEC] hover:border-[#D1AF47]/40 hover:bg-gray-50/50 transition group"
                >
                  <div className="w-9 h-9 rounded-full bg-gray-50 border border-[#ECECEC] flex items-center justify-center mb-2 group-hover:bg-white transition flex-shrink-0">
                    {getActionIcon(rpt.icon)}
                  </div>
                  <span className="text-[10px] font-bold text-gray-700 text-center leading-tight truncate w-full">
                    {rpt.label}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Platform Insights (span-3) */}
        <section className={`${cardBase} flex flex-col lg:col-span-3`}>
          <div className={`flex items-center justify-between mb-4 flex-shrink-0 ${flip}`}>
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#667085]">
              {currentData.platformInsightsTitle}
            </h3>
            {/* Dropdown */}
            <div className={`flex items-center gap-0.5 border border-[#ECECEC] bg-white rounded-full px-2 py-0.5 text-[9px] font-bold text-gray-700 shadow-sm cursor-pointer hover:bg-gray-50 transition ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <span>{currentData.thisMonthText}</span>
              <svg className="w-2 h-2 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          <div className="flex-grow grid grid-cols-2 gap-4">
            {currentData.insights.map((ins) => (
              <div key={ins.label} className="border border-[#F5F5F5] rounded-xl p-3 bg-gray-50/40 hover:bg-white hover:border-[#ECECEC] transition duration-200 flex flex-col justify-between">
                <span className="block text-[8px] font-black uppercase tracking-wider text-gray-400 leading-tight">
                  {ins.label}
                </span>
                <div className="mt-2.5">
                  <strong className="block text-sm font-serif font-black text-gray-900 leading-none">
                    {ins.value}
                  </strong>
                  <div className={`flex items-center gap-0.5 text-[9px] font-bold mt-1.5 leading-none ${ins.isPositive ? "text-[#16A34A]" : "text-[#EF4444]"}`}>
                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                      {ins.isPositive ? (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                      )}
                    </svg>
                    <span>{ins.change}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

      </div>

    </div>
  );
}
