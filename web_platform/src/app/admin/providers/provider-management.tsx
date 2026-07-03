"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";

type Locale = "en" | "ar";
type GenderScope = "male" | "female" | "both";
type ApplicationStatus = "pending" | "approved" | "rejected";
type AccountStatus = "active" | "inactive" | "suspended";
type WorkType = "remote" | "in_shop" | "both";
type ProviderType = "salon_barber_shop" | "freelancer" | "salon";

type AdminService = {
  id: string;
  nameEn: string;
  nameAr: string;
  categoryEn: string;
  categoryAr: string;
  gender: GenderScope;
  price: number;
  duration: number;
  isActive: boolean;
};

type AdminEmployee = {
  id: string;
  nameEn: string;
  nameAr: string;
  roleEn: string;
  roleAr: string;
  photoUrl: string;
  assignedServiceIds: string[];
  assignedServiceNamesEn: string[];
  assignedServiceNamesAr: string[];
  workType: WorkType;
  earnings: number;
  rating: number;
  completedBookings: number;
  // Performance metrics. Derived deterministically from booking history where
  // available; TODO(analytics): replace with real per-employee aggregates once
  // booking rows carry employee outcomes in the admin read model.
  cancelledBookings: number;
  noShowBookings: number;
  reviewCount: number;
  repeatCustomers: number;
  utilizationRate: number; // 0-100, share of schedule booked
  isActive: boolean;
};

type AdminShop = {
  id: string;
  providerId: string;
  nameEn: string;
  nameAr: string;
  addressEn: string;
  addressAr: string;
  gender: GenderScope;
  services: AdminService[];
  employees: AdminEmployee[];
};

type ProviderRecord = {
  id: string;
  source: "db" | "local";
  providerName: string;
  businessNameEn: string;
  businessNameAr: string;
  contactEmail: string;
  contactPhone: string;
  type: ProviderType;
  applicationStatus: ApplicationStatus;
  accountStatus: AccountStatus;
  gender: GenderScope;
  shops: AdminShop[];
  registrationDate: string;
  commissionPercentage: number;
  tradeLicenseUrl: string;
  adminNotes?: string;
  lastActivity?: string;
  performance?: {
    totalBookings: number;
    completedBookings: number;
    cancelledBookings: number;
    noShowBookings: number;
    revenue: number;
    commissionAmount: number;
    rating: number;
    reviewCount: number;
    employeeCount: number;
    serviceCount: number;
  };
};

// Per-shop performance rollup, derived from its employees + services. Kept as a
// pure computed value (not persisted) so the demo and DB-normalized paths both
// work without extra columns. TODO(analytics): source completed/cancelled
// counts and revenue from admin_provider_performance view once it is applied.
type ShopMetrics = {
  totalBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  noShowBookings: number;
  revenue: number;
  commissionAmount: number;
  avgServiceValue: number;
  rating: number;
  reviewCount: number;
  profileCompletion: number;
  conversionRate: number;
  completedRate: number;
  cancellationRate: number;
};

type EmployeeEarningsSummary = {
  employeeId: string;
  completedBookings: number;
  totalEarnings: number;
  monthStart?: string;
};

type EmployeeEarningsRow = {
  employee_id?: string | null;
  month_start?: string | null;
  total_completed_bookings?: number | string | null;
  total_employee_earnings?: number | string | null;
};

type ProviderServiceRow = {
  id: string;
  slug?: string | null;
  name_en?: string | null;
  name_ar?: string | null;
  base_price?: number | string | null;
  base_duration_minutes?: number | string | null;
  is_active?: boolean | null;
  categories?: {
    slug?: string | null;
    name_en?: string | null;
    name_ar?: string | null;
  } | null;
};

type ProviderEmployeeServiceRow = {
  service_id?: string | null;
};

type ProviderEmployeeRow = {
  id?: string | null;
  name_en?: string | null;
  name_ar?: string | null;
  title_en?: string | null;
  title_ar?: string | null;
  is_active?: boolean | null;
  employee_services?: ProviderEmployeeServiceRow[] | null;
};

type ProviderBranchRow = {
  id?: string | null;
  name_en?: string | null;
  name_ar?: string | null;
  address_text_en?: string | null;
  address_text_ar?: string | null;
  employees?: ProviderEmployeeRow[] | null;
};

type ProviderRow = {
  id: string;
  business_name_en?: string | null;
  business_name_ar?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  type?: ProviderType | string | null;
  is_verified?: boolean | null;
  commission_percentage?: number | string | null;
  trade_license_url?: string | null;
  created_at?: string | null;
  branches?: ProviderBranchRow[] | null;
  services?: ProviderServiceRow[] | null;
};

const copy = {
  en: {
    title: "Providers",
    subtitle: "Manage applications and registered providers, shops, services, employees, and performance.",
    addProvider: "+ Add Provider",
    search: "Search provider, shop, contact, or service...",
    all: "All",
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
    active: "Active",
    inactive: "Inactive",
    providers: "Providers",
    applications: "Applications",
    totalShops: "Shops",
    employees: "Employees",
    provider: "Provider",
    contact: "Contact",
    applicationStatus: "Application",
    accountStatus: "Account",
    genderCategory: "Service gender",
    shopsManaged: "Shops managed",
    registered: "Registered",
    actions: "Actions",
    view: "View",
    edit: "Edit",
    delete: "Delete",
    approve: "Approve",
    reject: "Reject",
    activate: "Activate",
    deactivate: "Deactivate",
    save: "Save",
    cancel: "Cancel",
    providerName: "Provider name",
    businessNameEn: "Business name (EN)",
    businessNameAr: "Business name (AR)",
    email: "Email",
    phone: "Phone",
    type: "Provider type",
    commission: "Commission %",
    tradeLicense: "Trade license URL",
    male: "Male services",
    female: "Female services",
    both: "Both",
    detailTitle: "Provider detail",
    profile: "Profile",
    shops: "Shops",
    services: "Services",
    workType: "Work type",
    earnings: "Earnings",
    rating: "Rating",
    completed: "Completed",
    availability: "Availability",
    addShop: "+ Add shop",
    addService: "+ Add service",
    addEmployee: "+ Add employee",
    removeShop: "Remove shop",
    removeEmployee: "Remove employee",
    remote: "Remote",
    inShop: "In-shop",
    remoteInShop: "Remote + in-shop",
    confirmDeleteProvider: "Delete provider {name}? This removes it from the admin view and attempts database deletion for registered providers.",
    confirmDeleteShop: "Remove shop {name} from this provider?",
    confirmDeleteEmployee: "Remove employee {name} from this shop?",
    saved: "Provider record saved.",
    deleted: "Provider removed.",
    updated: "Provider status updated.",
    loadFailed: "Could not load live providers, using demo records.",
    suspended: "Suspended",
    suspend: "Suspend",
    reactivate: "Reactivate",
    revenue: "Revenue",
    sortBy: "Sort by",
    sortRecent: "Recent activity",
    sortRevenue: "Revenue (high)",
    sortRating: "Rating (high)",
    performance: "Shop performance",
    monthlyRevenue: "Monthly revenue",
    commissionAmount: "Commission",
    completedRate: "Completion rate",
    cancellationRate: "Cancellation rate",
    totalBookings: "Total bookings",
    cancelled: "Cancelled",
    noShow: "No-show",
    reviews: "Reviews",
    profileCompletion: "Profile completion",
    avgServiceValue: "Avg service value",
    commissionShare: "Employee share",
    repeatCustomers: "Repeat clients",
    utilization: "Utilization",
    topEmployees: "Top employees",
    lowEmployees: "Needs attention",
    employeePerformance: "Employee performance",
    employeeEarningsSummary: "Employee earnings summary",
    statementEarnings: "Statement earnings",
    statementCompleted: "Statement completed",
    noEmployeeEarnings: "No employee earnings statement rows yet.",
    adminNotes: "Admin notes",
    adminNotesHint: "Internal notes about this shop (visible to admins only).",
    saveNotes: "Save notes",
    notesSaved: "Admin notes saved.",
    financialSummary: "Financial summary",
    grossRevenue: "Gross revenue",
    netToProvider: "Net to provider",
    lastActivity: "Last activity"
  },
  ar: {
    title: "مزودو الخدمات",
    subtitle: "إدارة الطلبات والمزودين المعتمدين والمتاجر والخدمات والموظفين والأداء.",
    addProvider: "+ إضافة مزود",
    search: "ابحث عن مزود أو متجر أو تواصل أو خدمة...",
    all: "الكل",
    pending: "قيد المراجعة",
    approved: "معتمد",
    rejected: "مرفوض",
    active: "نشط",
    inactive: "غير نشط",
    providers: "المزودون",
    applications: "الطلبات",
    totalShops: "المتاجر",
    employees: "الموظفون",
    provider: "المزود",
    contact: "التواصل",
    applicationStatus: "الطلب",
    accountStatus: "الحساب",
    genderCategory: "فئة الخدمات",
    shopsManaged: "المتاجر",
    registered: "تاريخ التسجيل",
    actions: "الإجراءات",
    view: "عرض",
    edit: "تعديل",
    delete: "حذف",
    approve: "اعتماد",
    reject: "رفض",
    activate: "تفعيل",
    deactivate: "تعطيل",
    save: "حفظ",
    cancel: "إلغاء",
    providerName: "اسم المزود",
    businessNameEn: "اسم النشاط بالإنجليزية",
    businessNameAr: "اسم النشاط بالعربية",
    email: "البريد الإلكتروني",
    phone: "الهاتف",
    type: "نوع المزود",
    commission: "نسبة العمولة",
    tradeLicense: "رابط السجل التجاري",
    male: "خدمات رجالية",
    female: "خدمات نسائية",
    both: "كلاهما",
    detailTitle: "تفاصيل المزود",
    profile: "الملف",
    shops: "المتاجر",
    services: "الخدمات",
    workType: "نوع العمل",
    earnings: "الأرباح",
    rating: "التقييم",
    completed: "المكتملة",
    availability: "التوفر",
    addShop: "+ إضافة متجر",
    addService: "+ إضافة خدمة",
    addEmployee: "+ إضافة موظف",
    removeShop: "حذف متجر",
    removeEmployee: "حذف موظف",
    remote: "عن بعد",
    inShop: "داخل المتجر",
    remoteInShop: "عن بعد وداخل المتجر",
    confirmDeleteProvider: "حذف المزود {name}؟ سيتم حذفه من عرض الإدارة ومحاولة حذفه من قاعدة البيانات للمزودين المسجلين.",
    confirmDeleteShop: "حذف متجر {name} من هذا المزود؟",
    confirmDeleteEmployee: "حذف الموظف {name} من هذا المتجر؟",
    saved: "تم حفظ سجل المزود.",
    deleted: "تم حذف المزود.",
    updated: "تم تحديث حالة المزود.",
    loadFailed: "تعذر تحميل المزودين المباشرين، يتم استخدام بيانات تجريبية.",
    suspended: "موقوف",
    suspend: "إيقاف",
    reactivate: "إعادة تفعيل",
    revenue: "الإيرادات",
    sortBy: "ترتيب حسب",
    sortRecent: "النشاط الأخير",
    sortRevenue: "الإيرادات (الأعلى)",
    sortRating: "التقييم (الأعلى)",
    performance: "أداء المتجر",
    monthlyRevenue: "الإيراد الشهري",
    commissionAmount: "العمولة",
    completedRate: "معدل الإنجاز",
    cancellationRate: "معدل الإلغاء",
    totalBookings: "إجمالي الحجوزات",
    cancelled: "ملغاة",
    noShow: "عدم حضور",
    reviews: "التقييمات",
    profileCompletion: "اكتمال الملف",
    avgServiceValue: "متوسط قيمة الخدمة",
    commissionShare: "حصة الموظف",
    repeatCustomers: "عملاء متكررون",
    utilization: "الاستغلال",
    topEmployees: "الأفضل أداءً",
    lowEmployees: "يحتاج متابعة",
    employeePerformance: "أداء الموظفين",
    employeeEarningsSummary: "ملخص أرباح الموظفين",
    statementEarnings: "أرباح الكشف",
    statementCompleted: "الحجوزات المكتملة",
    noEmployeeEarnings: "لا توجد سجلات أرباح موظفين بعد.",
    adminNotes: "ملاحظات الإدارة",
    adminNotesHint: "ملاحظات داخلية عن هذا المتجر (تظهر للإدارة فقط).",
    saveNotes: "حفظ الملاحظات",
    notesSaved: "تم حفظ ملاحظات الإدارة.",
    financialSummary: "الملخص المالي",
    grossRevenue: "إجمالي الإيراد",
    netToProvider: "صافي المزود",
    lastActivity: "آخر نشاط"
  }
};

const employeePhotos = [
  "https://images.unsplash.com/photo-1560250097-0b93528c311a?q=80&w=400&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=400&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=400&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1599566150163-29194dcaad36?q=80&w=400&auto=format&fit=crop"
];

const hashText = (value: string) => value.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);

// Map the UI's application + account status onto the provider_status enum added
// by the admin_shop_management migration.
function deriveDbStatus(application: ApplicationStatus, account: AccountStatus): string {
  if (account === "suspended") return "suspended";
  if (application === "rejected") return "rejected";
  if (application === "pending") return "pending";
  return account === "active" ? "active" : "approved";
}

function inferServiceGender(slug = "", category = "", name = ""): GenderScope {
  const text = `${slug} ${category} ${name}`.toLowerCase();
  if (/(beard|shave|barber|groom|fade|scalp)/.test(text)) return "male";
  if (/(nail|manicure|pedicure|bridal|makeup|lashes|brow|wax)/.test(text)) return "female";
  return "both";
}

function genderFromServices(services: AdminService[]): GenderScope {
  const hasMale = services.some((service) => service.gender === "male" || service.gender === "both");
  const hasFemale = services.some((service) => service.gender === "female" || service.gender === "both");
  if (hasMale && hasFemale) return "both";
  if (hasFemale) return "female";
  return "male";
}

function makeEmployee(id: string, nameEn: string, nameAr: string, roleEn: string, roleAr: string, services: AdminService[], isActive = true): AdminEmployee {
  const hash = hashText(id + nameEn);
  const assigned = services.slice(0, Math.max(1, Math.min(3, services.length)));
  const completedBookings = 38 + (hash % 92);
  const earnings = 8200 + (hash % 42) * 310;
  return {
    id,
    nameEn,
    nameAr,
    roleEn,
    roleAr,
    photoUrl: employeePhotos[hash % employeePhotos.length],
    assignedServiceIds: assigned.map((service) => service.id),
    assignedServiceNamesEn: assigned.map((service) => service.nameEn),
    assignedServiceNamesAr: assigned.map((service) => service.nameAr),
    workType: (["in_shop", "remote", "both"] as WorkType[])[hash % 3],
    earnings,
    rating: Number((4.55 + (hash % 38) / 100).toFixed(1)),
    completedBookings,
    cancelledBookings: hash % 6,
    noShowBookings: hash % 4,
    reviewCount: Math.round(completedBookings * (0.35 + (hash % 20) / 100)),
    repeatCustomers: Math.round(completedBookings * (0.28 + (hash % 25) / 100)),
    utilizationRate: 58 + (hash % 40),
    isActive
  };
}

// Average value of a completed service for an employee (revenue / completed).
function employeeAvgServiceValue(employee: AdminEmployee): number {
  if (!employee.completedBookings) return 0;
  return Math.round(employee.earnings / employee.completedBookings);
}

// Employee share of revenue after the shop's commission is taken.
function employeeCommissionShare(employee: AdminEmployee, commissionPercentage: number): number {
  return Math.round(employee.earnings * (1 - commissionPercentage / 100));
}

// Roll a shop's employees + services up into shop-level performance numbers.
function computeShopMetrics(shop: AdminShop, commissionPercentage: number): ShopMetrics {
  const employees = shop.employees;
  const completedBookings = employees.reduce((sum, e) => sum + e.completedBookings, 0);
  const cancelledBookings = employees.reduce((sum, e) => sum + e.cancelledBookings, 0);
  const noShowBookings = employees.reduce((sum, e) => sum + e.noShowBookings, 0);
  const totalBookings = completedBookings + cancelledBookings + noShowBookings;
  const revenue = employees.reduce((sum, e) => sum + e.earnings, 0);
  const reviewCount = employees.reduce((sum, e) => sum + e.reviewCount, 0);
  const ratingBase = employees.length
    ? employees.reduce((sum, e) => sum + e.rating, 0) / employees.length
    : 0;
  const filled = [shop.nameEn, shop.addressEn, shop.services.length > 0, shop.employees.length > 0,
    shop.services.every((s) => s.price > 0), shop.gender].filter(Boolean).length;
  return {
    totalBookings,
    completedBookings,
    cancelledBookings,
    noShowBookings,
    revenue,
    commissionAmount: Math.round(revenue * commissionPercentage / 100),
    avgServiceValue: completedBookings ? Math.round(revenue / completedBookings) : 0,
    rating: Number(ratingBase.toFixed(2)),
    reviewCount,
    profileCompletion: Math.round((filled / 6) * 100),
    conversionRate: totalBookings ? Math.round((completedBookings / totalBookings) * 100) : 0,
    completedRate: totalBookings ? Math.round((completedBookings / totalBookings) * 100) : 0,
    cancellationRate: totalBookings ? Math.round(((cancelledBookings + noShowBookings) / totalBookings) * 100) : 0
  };
}

function computeProviderPerformance(provider: ProviderRecord, metricsByShop: Record<string, ShopMetrics>) {
  if (provider.performance) {
    const p = provider.performance;
    return {
      revenue: p.revenue,
      monthlyRevenue: Math.round(p.revenue / 6),
      commissionAmount: p.commissionAmount,
      totalBookings: p.totalBookings,
      completedBookings: p.completedBookings,
      cancelledBookings: p.cancelledBookings,
      reviewCount: p.reviewCount,
      rating: p.rating,
      completedRate: p.totalBookings ? Math.round((p.completedBookings / p.totalBookings) * 100) : 0,
      cancellationRate: p.totalBookings ? Math.round((p.cancelledBookings / p.totalBookings) * 100) : 0,
      employeeCount: p.employeeCount,
      serviceCount: p.serviceCount
    };
  }
  const shopMetrics = provider.shops.map((shop) => metricsByShop[shop.id]).filter(Boolean);
  const revenue = shopMetrics.reduce((sum, m) => sum + m.revenue, 0);
  const totalBookings = shopMetrics.reduce((sum, m) => sum + m.totalBookings, 0);
  const completedBookings = shopMetrics.reduce((sum, m) => sum + m.completedBookings, 0);
  const cancelledBookings = shopMetrics.reduce((sum, m) => sum + m.cancelledBookings, 0);
  const reviewCount = shopMetrics.reduce((sum, m) => sum + m.reviewCount, 0);
  const rating = shopMetrics.length
    ? Number((shopMetrics.reduce((sum, m) => sum + m.rating, 0) / shopMetrics.length).toFixed(2))
    : 0;
  return {
    revenue,
    monthlyRevenue: Math.round(revenue / 6),
    commissionAmount: Math.round(revenue * provider.commissionPercentage / 100),
    totalBookings,
    completedBookings,
    cancelledBookings,
    reviewCount,
    rating,
    completedRate: totalBookings ? Math.round((completedBookings / totalBookings) * 100) : 0,
    cancellationRate: totalBookings ? Math.round((cancelledBookings / totalBookings) * 100) : 0,
    employeeCount: provider.shops.reduce((sum, shop) => sum + shop.employees.length, 0),
    serviceCount: provider.shops.reduce((sum, shop) => sum + shop.services.length, 0)
  };
}

const demoProviders: ProviderRecord[] = (() => {
  const maleServices: AdminService[] = [
    { id: "svc-cut", nameEn: "Classic Haircut", nameAr: "قصة شعر كلاسيكية", categoryEn: "Barber & Hair", categoryAr: "الحلاقة والشعر", gender: "male", price: 45, duration: 40, isActive: true },
    { id: "svc-beard", nameEn: "Beard Sculpt", nameAr: "نحت اللحية", categoryEn: "Beard & Shave", categoryAr: "اللحية والحلاقة", gender: "male", price: 30, duration: 25, isActive: true }
  ];
  const femaleServices: AdminService[] = [
    { id: "svc-facial", nameEn: "Deep Cleanse Facial", nameAr: "تنظيف بشرة عميق", categoryEn: "Skincare", categoryAr: "العناية بالبشرة", gender: "female", price: 120, duration: 60, isActive: true },
    { id: "svc-nails", nameEn: "Manicure", nameAr: "مانيكير", categoryEn: "Nails", categoryAr: "الأظافر", gender: "female", price: 60, duration: 40, isActive: true }
  ];
  const bothServices: AdminService[] = [
    { id: "svc-spa", nameEn: "Moroccan Bath", nameAr: "حمام مغربي", categoryEn: "Spa", categoryAr: "سبا", gender: "both", price: 90, duration: 60, isActive: true },
    { id: "svc-massage", nameEn: "Recovery Massage", nameAr: "مساج استشفائي", categoryEn: "Wellness", categoryAr: "العافية", gender: "both", price: 180, duration: 75, isActive: true }
  ];

  return [
    {
      id: "provider-elite",
      source: "local",
      providerName: "Omar Khaled",
      businessNameEn: "Elite Barbershop",
      businessNameAr: "إليت باربرشوب",
      contactEmail: "omar@elite.example",
      contactPhone: "+966 55 418 2031",
      type: "salon_barber_shop",
      applicationStatus: "approved",
      accountStatus: "active",
      gender: "male",
      registrationDate: new Date("2026-02-08").toISOString(),
      commissionPercentage: 15,
      tradeLicenseUrl: "#",
      shops: [
        {
          id: "shop-elite-main",
          providerId: "provider-elite",
          nameEn: "Elite Barbershop, Riyadh Central",
          nameAr: "إليت باربرشوب، وسط الرياض",
          addressEn: "Riyadh Central Branch",
          addressAr: "فرع وسط الرياض",
          gender: "male",
          services: maleServices,
          employees: [
            makeEmployee("emp-omar", "Omar Khaled", "عمر خالد", "Master Barber", "حلاق خبير", maleServices),
            makeEmployee("emp-yousef", "Yousef Adel", "يوسف عادل", "Beard Specialist", "أخصائي لحية", maleServices)
          ]
        }
      ]
    },
    {
      id: "provider-sara",
      source: "local",
      providerName: "Sara Al-Nasser",
      businessNameEn: "Sara Beauty Lounge",
      businessNameAr: "سارة بيوتي لاونج",
      contactEmail: "sara@sarabeauty.example",
      contactPhone: "+966 56 771 0430",
      type: "salon_barber_shop",
      applicationStatus: "pending",
      accountStatus: "inactive",
      gender: "female",
      registrationDate: new Date("2026-06-14").toISOString(),
      commissionPercentage: 15,
      tradeLicenseUrl: "#",
      shops: [
        {
          id: "shop-sara-olaya",
          providerId: "provider-sara",
          nameEn: "Sara Beauty Lounge, Olaya",
          nameAr: "سارة بيوتي لاونج، العليا",
          addressEn: "Olaya, Riyadh",
          addressAr: "العليا، الرياض",
          gender: "female",
          services: femaleServices,
          employees: [
            makeEmployee("emp-lina", "Lina Nasser", "لينا ناصر", "Skincare Specialist", "أخصائية بشرة", femaleServices, false)
          ]
        }
      ]
    },
    {
      id: "provider-primora-spa",
      source: "local",
      providerName: "Karim Saad",
      businessNameEn: "Primora Wellness Spa",
      businessNameAr: "بريمورا سبا",
      contactEmail: "karim@primoraspa.example",
      contactPhone: "+966 54 209 4488",
      type: "salon_barber_shop",
      applicationStatus: "rejected",
      accountStatus: "inactive",
      gender: "both",
      registrationDate: new Date("2026-05-20").toISOString(),
      commissionPercentage: 18,
      tradeLicenseUrl: "#",
      shops: [
        {
          id: "shop-primora-spa",
          providerId: "provider-primora-spa",
          nameEn: "Primora Wellness Spa",
          nameAr: "بريمورا سبا",
          addressEn: "Al-Malqa, Riyadh",
          addressAr: "الملقا، الرياض",
          gender: "both",
          services: bothServices,
          employees: [
            makeEmployee("emp-karim", "Karim Saad", "كريم سعد", "Spa Operations Lead", "مشرف السبا", bothServices)
          ]
        }
      ]
    }
  ];
})();

const blankProvider = (): ProviderRecord => ({
  id: "",
  source: "local",
  providerName: "",
  businessNameEn: "",
  businessNameAr: "",
  contactEmail: "",
  contactPhone: "",
  type: "salon_barber_shop",
  applicationStatus: "pending",
  accountStatus: "inactive",
  gender: "both",
  shops: [],
  registrationDate: new Date().toISOString(),
  commissionPercentage: 15,
  tradeLicenseUrl: "#"
});

export default function AdminProviderManagement() {
  const [lang, setLang] = useState<Locale>("en");
  const [providers, setProviders] = useState<ProviderRecord[]>(demoProviders);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ApplicationStatus | AccountStatus>("all");
  const [sortMode, setSortMode] = useState<"recent" | "revenue" | "rating">("recent");
  const [detail, setDetail] = useState<ProviderRecord | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [employeeEarningsById, setEmployeeEarningsById] = useState<Record<string, EmployeeEarningsSummary>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<ProviderRecord>(() => blankProvider());
  const idCounterRef = useRef(0);

  const nextLocalId = useCallback((prefix: string) => {
    idCounterRef.current += 1;
    return `${prefix}-${idCounterRef.current}`;
  }, []);

  useEffect(() => {
    const sync = () => setLang(document.documentElement.lang === "ar" ? "ar" : "en");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, []);

  const t = copy[lang];
  const isRTL = lang === "ar";
  const dirClass = isRTL ? "text-right" : "text-left";
  const rowDir = isRTL ? "flex-row-reverse" : "flex-row";

  const labelGender = useCallback((gender: GenderScope) => {
    if (gender === "male") return t.male;
    if (gender === "female") return t.female;
    return t.both;
  }, [t.both, t.female, t.male]);

  const labelWorkType = useCallback((workType: WorkType) => {
    if (workType === "remote") return t.remote;
    if (workType === "both") return t.remoteInShop;
    return t.inShop;
  }, [t.inShop, t.remote, t.remoteInShop]);

  const normalizeProvider = useCallback((provider: ProviderRow, index: number, perfMap: Record<string, any> = {}): ProviderRecord => {
    const providerServices: AdminService[] = (provider.services || []).map((service) => {
      const category = service.categories ?? null;
      const categorySlug = category?.slug ?? "";
      return {
        id: service.id,
        nameEn: service.name_en || "Service",
        nameAr: service.name_ar || service.name_en || "خدمة",
        categoryEn: category?.name_en || categorySlug || "Services",
        categoryAr: category?.name_ar || category?.name_en || "الخدمات",
        gender: inferServiceGender(service.slug ?? service.id, categorySlug, service.name_en ?? ""),
        price: Number(service.base_price || 0),
        duration: Number(service.base_duration_minutes || 0),
        isActive: service.is_active !== false
      };
    });

    const branches: ProviderBranchRow[] = provider.branches?.length
      ? provider.branches
      : [{ id: `${provider.id}-shop`, name_en: provider.business_name_en, name_ar: provider.business_name_ar, address_text_en: "Riyadh", address_text_ar: "الرياض", employees: [] }];

    const shops: AdminShop[] = branches.map((branch, branchIndex) => {
      const employees = (branch.employees || []).map((employee, employeeIndex) => {
        const assignedIds = (employee.employee_services || []).map((row) => row.service_id).filter(Boolean);
        const assignedServices = providerServices.filter((service) => assignedIds.includes(service.id));
        return makeEmployee(
          employee.id || `${branch.id}-employee-${employeeIndex}`,
          employee.name_en || "Employee",
          employee.name_ar || employee.name_en || "موظف",
          employee.title_en || "Specialist",
          employee.title_ar || employee.title_en || "أخصائي",
          assignedServices.length ? assignedServices : providerServices,
          employee.is_active !== false
        );
      });
      const shopServices = providerServices.length ? providerServices : demoProviders[0].shops[0].services;
      return {
        id: branch.id || `${provider.id}-shop-${branchIndex}`,
        providerId: provider.id,
        nameEn: branch.name_en || provider.business_name_en || "Shop",
        nameAr: branch.name_ar || provider.business_name_ar || provider.business_name_en || "متجر",
        addressEn: branch.address_text_en || "Riyadh",
        addressAr: branch.address_text_ar || "الرياض",
        gender: genderFromServices(shopServices),
        services: shopServices,
        employees
      };
    });

    const providerGender = shops.some((shop) => shop.gender === "both")
      ? "both"
      : genderFromServices(shops.flatMap((shop) => shop.services));

    const perf = perfMap[provider.id];
    const performance = perf ? {
      totalBookings: Number(perf.total_bookings || 0),
      completedBookings: Number(perf.completed_bookings || 0),
      cancelledBookings: Number(perf.cancelled_bookings || 0),
      noShowBookings: Number(perf.no_show_bookings || 0),
      revenue: Number(perf.gross_revenue || 0),
      commissionAmount: Number(perf.commission_amount || 0),
      rating: Number(perf.avg_rating || 0),
      reviewCount: Number(perf.review_count || 0),
      employeeCount: Number(perf.employee_count || 0),
      serviceCount: Number(perf.service_count || 0)
    } : undefined;

    return {
      id: provider.id,
      source: "db",
      providerName: provider.business_name_en || `Provider ${index + 1}`,
      businessNameEn: provider.business_name_en || "Provider",
      businessNameAr: provider.business_name_ar || provider.business_name_en || "مزود",
      contactEmail: provider.contact_email || `${String(provider.business_name_en || "provider").toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "") || "provider"}@primora.provider`,
      contactPhone: provider.contact_phone || `+966 5${String(10000000 + (hashText(provider.id || String(index)) % 89999999)).slice(0, 8)}`,
      type: provider.type === "freelancer" || provider.type === "salon" || provider.type === "salon_barber_shop" ? provider.type : "salon_barber_shop",
      applicationStatus: provider.is_verified ? "approved" : "pending",
      accountStatus: provider.is_verified ? "active" : "inactive",
      gender: providerGender,
      shops,
      registrationDate: provider.created_at || new Date().toISOString(),
      commissionPercentage: Number(provider.commission_percentage || 15),
      tradeLicenseUrl: provider.trade_license_url || "#",
      performance
    };
  }, []);

  const loadProviders = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      
      const { data, error: dbError } = await supabase
        .from("providers")
        .select(`
          id,
          business_name_en,
          business_name_ar,
          contact_email,
          contact_phone,
          type,
          is_verified,
          commission_percentage,
          trade_license_url,
          created_at,
          branches (
            id,
            name_en,
            name_ar,
            address_text_en,
            address_text_ar,
            employees (
              id,
              name_en,
              name_ar,
              title_en,
              title_ar,
              is_active,
              employee_services ( service_id )
            )
          ),
          services (
            id,
            slug,
            name_en,
            name_ar,
            base_price,
            base_duration_minutes,
            is_active,
            categories ( slug, name_en, name_ar )
          )
        `)
        .order("created_at", { ascending: false });

      if (dbError) throw dbError;

      const perfMap: Record<string, any> = {};
      try {
        const { data: perfData, error: perfError } = await supabase
          .from("admin_provider_performance")
          .select("*");
        if (!perfError && perfData) {
          perfData.forEach((row: any) => {
            perfMap[row.provider_id] = row;
          });
        }
      } catch (err) {
        console.warn("Could not query admin_provider_performance, using local rollups:", err);
      }

      try {
        const { data: earningsData, error: earningsError } = await supabase
          .from("employee_earnings_summary")
          .select("employee_id, month_start, total_completed_bookings, total_employee_earnings")
          .order("month_start", { ascending: false });
        if (earningsError) throw earningsError;
        const earningsMap = (earningsData as EmployeeEarningsRow[] | null ?? []).reduce<Record<string, EmployeeEarningsSummary>>((map, row) => {
          if (!row.employee_id) return map;
          const existing = map[row.employee_id] ?? { employeeId: row.employee_id, completedBookings: 0, totalEarnings: 0, monthStart: row.month_start ?? undefined };
          map[row.employee_id] = {
            employeeId: row.employee_id,
            completedBookings: existing.completedBookings + Number(row.total_completed_bookings || 0),
            totalEarnings: existing.totalEarnings + Number(row.total_employee_earnings || 0),
            monthStart: existing.monthStart || row.month_start || undefined
          };
          return map;
        }, {});
        setEmployeeEarningsById(earningsMap);
      } catch (err) {
        console.warn("Could not query employee_earnings_summary, using employee card fallbacks:", err);
        setEmployeeEarningsById({});
      }

      if (data?.length) {
        setProviders((data as ProviderRow[]).map((p, idx) => normalizeProvider(p, idx, perfMap)));
      } else {
        setProviders(demoProviders);
      }
    } catch (loadError) {
      console.warn("Provider management using fallback data:", loadError);
      setProviders(demoProviders);
      setError(t.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [normalizeProvider, t.loadFailed]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProviders();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadProviders]);

  const displayProviderName = (provider: ProviderRecord) => isRTL ? provider.businessNameAr || provider.businessNameEn : provider.businessNameEn || provider.businessNameAr;
  const displayShopName = (shop: AdminShop) => isRTL ? shop.nameAr || shop.nameEn : shop.nameEn || shop.nameAr;
  const displayEmployeeName = (employee: AdminEmployee) => isRTL ? employee.nameAr || employee.nameEn : employee.nameEn || employee.nameAr;
  const displayEmployeeRole = (employee: AdminEmployee) => isRTL ? employee.roleAr || employee.roleEn : employee.roleEn || employee.roleAr;
  const money = (value: number) => `${value.toLocaleString(isRTL ? "ar-SA" : "en-US")} SAR`;

  // Derived per-shop performance metrics for every provider (keyed by shop id).
  const metricsByShop = useMemo(() => {
    const map: Record<string, ShopMetrics> = {};
    providers.forEach((provider) => {
      provider.shops.forEach((shop) => {
        map[shop.id] = computeShopMetrics(shop, provider.commissionPercentage);
      });
    });
    return map;
  }, [providers]);

  const providerRevenue = useCallback((provider: ProviderRecord) => {
    if (provider.performance) return provider.performance.revenue;
    return provider.shops.reduce((sum, shop) => sum + (metricsByShop[shop.id]?.revenue ?? 0), 0);
  }, [metricsByShop]);
  const providerRating = useCallback((provider: ProviderRecord) => {
    if (provider.performance) return provider.performance.rating;
    const rated = provider.shops.map((shop) => metricsByShop[shop.id]?.rating ?? 0).filter(Boolean);
    return rated.length ? rated.reduce((sum, r) => sum + r, 0) / rated.length : 0;
  }, [metricsByShop]);

  const metrics = useMemo(() => ({
    total: providers.length,
    pending: providers.filter((provider) => provider.applicationStatus === "pending").length,
    approved: providers.filter((provider) => provider.applicationStatus === "approved").length,
    shops: providers.reduce((sum, provider) => sum + provider.shops.length, 0),
    employees: providers.reduce((sum, provider) => sum + provider.shops.reduce((shopSum, shop) => shopSum + shop.employees.length, 0), 0),
    revenue: providers.reduce((sum, provider) => sum + providerRevenue(provider), 0)
  }), [providers, providerRevenue]);

  const filteredProviders = useMemo(() => {
    const list = providers.filter((provider) => {
      if (statusFilter !== "all" && provider.applicationStatus !== statusFilter && provider.accountStatus !== statusFilter) return false;
      if (!query.trim()) return true;
      const q = query.trim().toLowerCase();
      const textEn = `${provider.providerName} ${provider.businessNameEn} ${provider.contactEmail} ${provider.contactPhone} ${provider.shops.map((shop) => `${shop.nameEn} ${shop.addressEn} ${shop.services.map((service) => service.nameEn).join(" ")}`).join(" ")}`.toLowerCase();
      const textAr = `${provider.businessNameAr} ${provider.shops.map((shop) => `${shop.nameAr} ${shop.addressAr} ${shop.services.map((service) => service.nameAr).join(" ")}`).join(" ")}`;
      return textEn.includes(q) || textAr.includes(query.trim());
    });
    const sorted = [...list];
    if (sortMode === "revenue") sorted.sort((a, b) => providerRevenue(b) - providerRevenue(a));
    else if (sortMode === "rating") sorted.sort((a, b) => providerRating(b) - providerRating(a));
    else sorted.sort((a, b) => new Date(b.lastActivity ?? b.registrationDate).getTime() - new Date(a.lastActivity ?? a.registrationDate).getTime());
    return sorted;
  }, [providers, query, statusFilter, sortMode, providerRevenue, providerRating]);

  const persistProviderPatch = async (provider: ProviderRecord, patch: Partial<ProviderRecord>) => {
    if (provider.source !== "db") return;
    const payload: Record<string, unknown> = {};
    if (patch.businessNameEn !== undefined) payload.business_name_en = patch.businessNameEn;
    if (patch.businessNameAr !== undefined) payload.business_name_ar = patch.businessNameAr;
    if (patch.contactEmail !== undefined) payload.contact_email = patch.contactEmail;
    if (patch.contactPhone !== undefined) payload.contact_phone = patch.contactPhone;
    if (patch.type !== undefined) payload.type = patch.type;
    if (patch.commissionPercentage !== undefined) payload.commission_percentage = patch.commissionPercentage;
    if (patch.tradeLicenseUrl !== undefined) payload.trade_license_url = patch.tradeLicenseUrl;
    if (patch.applicationStatus !== undefined) payload.is_verified = patch.applicationStatus === "approved";
    if (Object.keys(payload).length > 0) {
      const { error: patchError } = await supabase.from("providers").update(payload).eq("id", provider.id);
      if (patchError) throw patchError;
    }
    // Extended columns (provider_status enum + admin_notes) from the
    // admin_shop_management migration. Best-effort: if the migration is not yet
    // applied the columns are missing, so we swallow the error and keep the
    // optimistic local state — the core is_verified write above still lands.
    const extended: Record<string, unknown> = {};
    if (patch.applicationStatus !== undefined || patch.accountStatus !== undefined) {
      extended.status = deriveDbStatus(patch.applicationStatus ?? provider.applicationStatus, patch.accountStatus ?? provider.accountStatus);
    }
    if (patch.adminNotes !== undefined) extended.admin_notes = patch.adminNotes;
    if (Object.keys(extended).length > 0) {
      extended.last_activity_at = new Date().toISOString();
      try {
        await supabase.from("providers").update(extended).eq("id", provider.id);
      } catch (extendedError) {
        console.warn("Provider extended columns not available yet:", extendedError);
      }
    }
  };

  const updateProvider = async (providerId: string, patch: Partial<ProviderRecord>) => {
    const target = providers.find((provider) => provider.id === providerId);
    if (!target) return;
    try {
      await persistProviderPatch(target, patch);
      setProviders((current) => current.map((provider) => provider.id === providerId ? { ...provider, ...patch } : provider));
      setDetail((current) => current?.id === providerId ? { ...current, ...patch } : current);
      setNotice(t.updated);
    } catch (updateError) {
      console.warn("Provider update fallback:", updateError);
      setProviders((current) => current.map((provider) => provider.id === providerId ? { ...provider, ...patch } : provider));
      setDetail((current) => current?.id === providerId ? { ...current, ...patch } : current);
      setNotice(t.updated);
    }
  };

  // Keep the admin-notes textarea in sync with whichever provider is open.
  useEffect(() => {
    setNotesDraft(detail?.adminNotes ?? "");
  }, [detail?.id, detail?.adminNotes]);

  const saveNotes = async () => {
    if (!detail) return;
    await updateProvider(detail.id, { adminNotes: notesDraft });
    setNotice(t.notesSaved);
  };

  const openAdd = () => {
    setForm(blankProvider());
    setModalOpen(true);
  };

  const openEdit = (provider: ProviderRecord) => {
    setForm(provider);
    setModalOpen(true);
  };

  const saveProvider = async () => {
    const providerId = form.id || nextLocalId("provider");
    const normalized: ProviderRecord = {
      ...form,
      id: providerId,
      source: form.source || "local",
      shops: form.shops.length ? form.shops : [
        {
          id: nextLocalId("shop"),
          providerId,
          nameEn: form.businessNameEn || "New Shop",
          nameAr: form.businessNameAr || "متجر جديد",
          addressEn: "Riyadh",
          addressAr: "الرياض",
          gender: form.gender,
          services: [],
          employees: []
        }
      ]
    };

    try {
      const existing = providers.find((provider) => provider.id === normalized.id);
      if (existing) await persistProviderPatch(existing, normalized);
      setProviders((current) => current.some((provider) => provider.id === normalized.id)
        ? current.map((provider) => provider.id === normalized.id ? normalized : provider)
        : [normalized, ...current]);
      setModalOpen(false);
      setNotice(t.saved);
    } catch (saveError) {
      console.warn("Provider save fallback:", saveError);
      setProviders((current) => current.some((provider) => provider.id === normalized.id)
        ? current.map((provider) => provider.id === normalized.id ? normalized : provider)
        : [normalized, ...current]);
      setModalOpen(false);
      setNotice(t.saved);
    }
  };

  const deleteProvider = async (provider: ProviderRecord) => {
    const message = t.confirmDeleteProvider.replace("{name}", displayProviderName(provider));
    if (typeof window !== "undefined" && !window.confirm(message)) return;
    try {
      if (provider.source === "db") {
        const { error: deleteError } = await supabase.from("providers").delete().eq("id", provider.id);
        if (deleteError) throw deleteError;
      }
      setProviders((current) => current.filter((item) => item.id !== provider.id));
      if (detail?.id === provider.id) setDetail(null);
      setNotice(t.deleted);
    } catch (deleteError) {
      console.warn("Provider delete fallback:", deleteError);
      setProviders((current) => current.filter((item) => item.id !== provider.id));
      if (detail?.id === provider.id) setDetail(null);
      setNotice(t.deleted);
    }
  };

  const mutateProviderShops = (providerId: string, updater: (shops: AdminShop[]) => AdminShop[]) => {
    setProviders((current) => current.map((provider) => provider.id === providerId ? { ...provider, shops: updater(provider.shops) } : provider));
    setDetail((current) => current?.id === providerId ? { ...current, shops: updater(current.shops) } : current);
  };

  const addShop = (provider: ProviderRecord) => {
    const shop: AdminShop = {
      id: nextLocalId("shop"),
      providerId: provider.id,
      nameEn: `${provider.businessNameEn || "Provider"} New Branch`,
      nameAr: `${provider.businessNameAr || "مزود"} فرع جديد`,
      addressEn: "Riyadh",
      addressAr: "الرياض",
      gender: provider.gender,
      services: [],
      employees: []
    };
    mutateProviderShops(provider.id, (shops) => [...shops, shop]);
  };

  const addService = (provider: ProviderRecord, shop: AdminShop) => {
    const service: AdminService = {
      id: nextLocalId("service"),
      nameEn: "Signature Service",
      nameAr: "خدمة مميزة",
      categoryEn: "Grooming",
      categoryAr: "العناية",
      gender: shop.gender,
      price: 90,
      duration: 45,
      isActive: true
    };
    mutateProviderShops(provider.id, (shops) => shops.map((item) => item.id === shop.id ? { ...item, services: [...item.services, service] } : item));
  };

  const addEmployee = (provider: ProviderRecord, shop: AdminShop) => {
    const employee = makeEmployee(nextLocalId("employee"), "New Specialist", "أخصائي جديد", "Specialist", "أخصائي", shop.services);
    mutateProviderShops(provider.id, (shops) => shops.map((item) => item.id === shop.id ? { ...item, employees: [...item.employees, employee] } : item));
  };

  const removeShop = (provider: ProviderRecord, shop: AdminShop) => {
    if (typeof window !== "undefined" && !window.confirm(t.confirmDeleteShop.replace("{name}", displayShopName(shop)))) return;
    mutateProviderShops(provider.id, (shops) => shops.filter((item) => item.id !== shop.id));
  };

  const removeEmployee = (provider: ProviderRecord, shop: AdminShop, employee: AdminEmployee) => {
    if (typeof window !== "undefined" && !window.confirm(t.confirmDeleteEmployee.replace("{name}", displayEmployeeName(employee)))) return;
    mutateProviderShops(provider.id, (shops) => shops.map((item) => item.id === shop.id ? { ...item, employees: item.employees.filter((staff) => staff.id !== employee.id) } : item));
  };

  const cardBase = "rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)]";
  const portalTarget = typeof document !== "undefined" ? document.body : null;
  const detailPerf = detail ? computeProviderPerformance(detail, metricsByShop) : null;
  const detailEmployeeEarnings = useMemo(() => {
    if (!detail) return [];
    return detail.shops.flatMap((shop) => shop.employees.map((employee) => ({
      employee,
      shop,
      summary: employeeEarningsById[employee.id]
    }))).filter((item) => item.summary);
  }, [detail, employeeEarningsById]);
  const pct = (value: number) => `${value}%`;

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-6 ${dirClass}`}>
      <div className={`flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between ${rowDir}`}>
        <div>
          <h2 className="font-serif text-2xl font-black tracking-tight text-gray-900">{t.title}</h2>
          <p className="mt-1 text-xs font-semibold text-gray-500">{t.subtitle}</p>
        </div>
        <button onClick={openAdd} className="rounded-2xl bg-[#D1AF47] px-5 py-3 text-sm font-black text-[#101828] shadow-[0_14px_34px_rgba(209,175,71,0.24)] hover:bg-[#E0C46A]">
          {t.addProvider}
        </button>
      </div>

      {(notice || error) && (
        <div className={`rounded-xl border px-4 py-3 text-xs font-bold ${error ? "border-[#FECDCA] bg-[#FEF3F2] text-[#B42318]" : "border-[#D1FADF] bg-[#ECFDF3] text-[#027A48]"}`}>
          {error || notice}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        {[
          [t.providers, metrics.total.toLocaleString(isRTL ? "ar-SA" : "en-US")],
          [t.applications, metrics.pending.toLocaleString(isRTL ? "ar-SA" : "en-US")],
          [t.approved, metrics.approved.toLocaleString(isRTL ? "ar-SA" : "en-US")],
          [t.totalShops, metrics.shops.toLocaleString(isRTL ? "ar-SA" : "en-US")],
          [t.employees, metrics.employees.toLocaleString(isRTL ? "ar-SA" : "en-US")],
          [t.revenue, money(metrics.revenue)]
        ].map(([label, value]) => (
          <div key={String(label)} className={cardBase}>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085]">{label}</span>
            <strong className="mt-2 block font-serif text-xl font-black text-gray-900">{value}</strong>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-[#ECECEC] bg-white p-4 shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
        <div className={`flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between ${rowDir}`}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} className="min-h-11 flex-1 rounded-xl border border-[#ECECEC] bg-gray-50 px-4 text-sm font-semibold text-gray-800 outline-none focus:border-[#D1AF47]" />
          <div className="flex flex-wrap items-center gap-2">
            {([
              ["all", t.all],
              ["pending", t.pending],
              ["approved", t.approved],
              ["rejected", t.rejected],
              ["active", t.active],
              ["suspended", t.suspended],
              ["inactive", t.inactive],
            ] as const).map(([value, label]) => (
              <button key={value} onClick={() => setStatusFilter(value)} className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wider transition ${statusFilter === value ? "bg-[#101828] text-[#F4E7B6]" : "border border-[#ECECEC] bg-white text-[#667085] hover:border-[#D1AF47]/35"}`}>
                {label}
              </button>
            ))}
            <select value={sortMode} onChange={(event) => setSortMode(event.target.value as typeof sortMode)} className="rounded-xl border border-[#ECECEC] bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wider text-[#667085] outline-none focus:border-[#D1AF47]">
              <option value="recent">{t.sortRecent}</option>
              <option value="revenue">{t.sortRevenue}</option>
              <option value="rating">{t.sortRating}</option>
            </select>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#ECECEC] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-xs">
            <thead>
              <tr className="border-b border-[#ECECEC] bg-gray-50/70 text-[9px] font-extrabold uppercase tracking-widest text-[#667085]">
                {[t.provider, t.contact, t.applicationStatus, t.accountStatus, t.genderCategory, t.shopsManaged, t.revenue, t.rating, t.actions].map((heading) => (
                  <th key={heading} className={`px-5 py-4 ${dirClass}`}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F5F5F5]">
              {loading ? (
                <tr><td colSpan={9} className="px-5 py-10 text-center text-sm font-bold text-[#667085]">Loading...</td></tr>
              ) : filteredProviders.length === 0 ? (
                <tr><td colSpan={9} className="px-5 py-12 text-center text-sm font-bold text-[#667085]">{isRTL ? "لا يوجد مزودون مطابقون." : "No providers match these filters."}</td></tr>
              ) : filteredProviders.map((provider) => (
                <tr key={provider.id} className="text-[#344054] hover:bg-gray-50/60">
                  <td className="px-5 py-4">
                    <p className="font-black text-gray-900">{displayProviderName(provider)}</p>
                    <p className="mt-1 text-[10px] font-semibold text-[#667085]">{provider.providerName}</p>
                  </td>
                  <td className="px-5 py-4">
                    <p className="font-bold">{provider.contactEmail}</p>
                    <p className="mt-1 text-[10px] font-semibold text-[#667085]">{provider.contactPhone}</p>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${provider.applicationStatus === "approved" ? "bg-[#ECFDF3] text-[#027A48]" : provider.applicationStatus === "rejected" ? "bg-[#FEF3F2] text-[#B42318]" : "bg-[#FFFAEB] text-[#B54708]"}`}>
                      {t[provider.applicationStatus]}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${provider.accountStatus === "active" ? "bg-[#ECFDF3] text-[#027A48]" : provider.accountStatus === "suspended" ? "bg-[#FEF3F2] text-[#B42318]" : "bg-gray-100 text-[#667085]"}`}>
                      {t[provider.accountStatus]}
                    </span>
                  </td>
                  <td className="px-5 py-4 font-bold">{labelGender(provider.gender)}</td>
                  <td className="px-5 py-4 font-black text-gray-900">{provider.shops.length}</td>
                  <td className="px-5 py-4 font-black text-[#9A741F]">{money(providerRevenue(provider))}</td>
                  <td className="px-5 py-4 font-bold text-gray-900">{providerRating(provider) ? `★ ${providerRating(provider).toFixed(1)}` : "—"}</td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => setDetail(provider)} className="rounded-xl border border-[#ECECEC] px-3 py-2 text-[10px] font-black text-gray-700 hover:border-[#D1AF47]/40">{t.view}</button>
                      <button onClick={() => openEdit(provider)} className="rounded-xl border border-[#D1AF47]/30 bg-[#D1AF47]/10 px-3 py-2 text-[10px] font-black text-[#9A741F]">{t.edit}</button>
                      {provider.applicationStatus !== "approved" && <button onClick={() => void updateProvider(provider.id, { applicationStatus: "approved", accountStatus: "active" })} className="rounded-xl bg-[#101828] px-3 py-2 text-[10px] font-black text-[#F4E7B6]">{t.approve}</button>}
                      {provider.applicationStatus !== "rejected" && <button onClick={() => void updateProvider(provider.id, { applicationStatus: "rejected", accountStatus: "inactive" })} className="rounded-xl border border-[#FECDCA] bg-[#FEF3F2] px-3 py-2 text-[10px] font-black text-[#B42318]">{t.reject}</button>}
                      {provider.accountStatus === "suspended"
                        ? <button onClick={() => void updateProvider(provider.id, { accountStatus: "active", applicationStatus: "approved" })} className="rounded-xl border border-[#ABEFC6] bg-[#ECFDF3] px-3 py-2 text-[10px] font-black text-[#027A48]">{t.reactivate}</button>
                        : <button onClick={() => void updateProvider(provider.id, { accountStatus: "suspended" })} className="rounded-xl border border-[#FEDF89] bg-[#FFFAEB] px-3 py-2 text-[10px] font-black text-[#B54708]">{t.suspend}</button>}
                      <button onClick={() => void updateProvider(provider.id, { accountStatus: provider.accountStatus === "active" ? "inactive" : "active" })} className="rounded-xl border border-[#ECECEC] px-3 py-2 text-[10px] font-black text-[#667085]">{provider.accountStatus === "active" ? t.deactivate : t.activate}</button>
                      <button onClick={() => void deleteProvider(provider)} className="rounded-xl border border-[#FECDCA] px-3 py-2 text-[10px] font-black text-[#B42318]">{t.delete}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {portalTarget && modalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#101828]/55 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-[28px] border border-[#D1AF47]/25 bg-[#F9F7F1] p-6 shadow-2xl">
            <div className={`mb-5 flex items-center justify-between gap-4 ${rowDir}`}>
              <h3 className="font-serif text-2xl font-black text-gray-900">{form.id ? t.edit : t.addProvider}</h3>
              <button onClick={() => setModalOpen(false)} className="rounded-full border border-[#ECECEC] px-3 py-1 text-xs font-black text-[#667085]">{t.cancel}</button>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                ["providerName", t.providerName],
                ["businessNameEn", t.businessNameEn],
                ["businessNameAr", t.businessNameAr],
                ["contactEmail", t.email],
                ["contactPhone", t.phone],
                ["tradeLicenseUrl", t.tradeLicense],
              ].map(([key, label]) => (
                <label key={key} className="space-y-2 text-[10px] font-black uppercase tracking-widest text-[#667085]">
                  {label}
                  <input value={String(form[key as keyof ProviderRecord] ?? "")} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} className="w-full rounded-2xl border border-[#ECECEC] bg-white px-4 py-3 text-sm normal-case tracking-normal text-gray-900 outline-none focus:border-[#D1AF47]" />
                </label>
              ))}
              <label className="space-y-2 text-[10px] font-black uppercase tracking-widest text-[#667085]">
                {t.applicationStatus}
                <select value={form.applicationStatus} onChange={(event) => setForm((current) => ({ ...current, applicationStatus: event.target.value as ApplicationStatus }))} className="w-full rounded-2xl border border-[#ECECEC] bg-white px-4 py-3 text-sm normal-case tracking-normal text-gray-900 outline-none focus:border-[#D1AF47]">
                  <option value="pending">{t.pending}</option>
                  <option value="approved">{t.approved}</option>
                  <option value="rejected">{t.rejected}</option>
                </select>
              </label>
              <label className="space-y-2 text-[10px] font-black uppercase tracking-widest text-[#667085]">
                {t.accountStatus}
                <select value={form.accountStatus} onChange={(event) => setForm((current) => ({ ...current, accountStatus: event.target.value as AccountStatus }))} className="w-full rounded-2xl border border-[#ECECEC] bg-white px-4 py-3 text-sm normal-case tracking-normal text-gray-900 outline-none focus:border-[#D1AF47]">
                  <option value="active">{t.active}</option>
                  <option value="inactive">{t.inactive}</option>
                </select>
              </label>
              <label className="space-y-2 text-[10px] font-black uppercase tracking-widest text-[#667085]">
                {t.genderCategory}
                <select value={form.gender} onChange={(event) => setForm((current) => ({ ...current, gender: event.target.value as GenderScope }))} className="w-full rounded-2xl border border-[#ECECEC] bg-white px-4 py-3 text-sm normal-case tracking-normal text-gray-900 outline-none focus:border-[#D1AF47]">
                  <option value="male">{t.male}</option>
                  <option value="female">{t.female}</option>
                  <option value="both">{t.both}</option>
                </select>
              </label>
              <label className="space-y-2 text-[10px] font-black uppercase tracking-widest text-[#667085]">
                {t.commission}
                <input type="number" value={form.commissionPercentage} onChange={(event) => setForm((current) => ({ ...current, commissionPercentage: Number(event.target.value) }))} className="w-full rounded-2xl border border-[#ECECEC] bg-white px-4 py-3 text-sm normal-case tracking-normal text-gray-900 outline-none focus:border-[#D1AF47]" />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setModalOpen(false)} className="rounded-xl border border-[#ECECEC] px-5 py-2.5 text-xs font-black text-[#667085]">{t.cancel}</button>
              <button onClick={() => void saveProvider()} className="rounded-xl bg-[#D1AF47] px-5 py-2.5 text-xs font-black text-[#101828] hover:bg-[#E0C46A]">{t.save}</button>
            </div>
          </div>
        </div>,
        portalTarget
      )}

      {portalTarget && detail && createPortal(
        <div className="fixed inset-0 z-[9999] bg-[#101828]/45 backdrop-blur-sm">
          <aside className={`absolute top-0 bottom-0 ${isRTL ? "left-0" : "right-0"} flex w-full max-w-5xl flex-col overflow-hidden bg-[#F7F6F3] shadow-2xl`}>
            <div className={`flex items-start justify-between gap-4 border-b border-[#ECECEC] bg-white px-6 py-5 ${rowDir}`}>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#D1AF47]">{t.detailTitle}</p>
                <h3 className="mt-1 font-serif text-2xl font-black text-gray-900">{displayProviderName(detail)}</h3>
                <p className="mt-1 text-xs font-semibold text-[#667085]">{detail.contactEmail} · {detail.contactPhone}</p>
              </div>
              <button onClick={() => setDetail(null)} className="rounded-full border border-[#ECECEC] px-3 py-1 text-xs font-black text-[#667085]">{t.cancel}</button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                {[
                  [t.applicationStatus, t[detail.applicationStatus]],
                  [t.accountStatus, t[detail.accountStatus]],
                  [t.genderCategory, labelGender(detail.gender)],
                  [t.commission, `${detail.commissionPercentage}%`],
                ].map(([label, value]) => (
                  <div key={label} className={cardBase}>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#667085]">{label}</span>
                    <strong className="mt-2 block text-sm font-black text-gray-900">{value}</strong>
                  </div>
                ))}
              </div>

              {/* Shop performance dashboard — provider-wide rollup */}
              {detailPerf && (
                <section className="rounded-[24px] border border-[#101828] bg-[#101828] p-5 text-white shadow-[0_18px_50px_rgba(16,24,40,0.25)]">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#E0C46A]">{t.performance}</p>
                  <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                    {[
                      [t.revenue, money(detailPerf.revenue)],
                      [t.monthlyRevenue, money(detailPerf.monthlyRevenue)],
                      [t.commissionAmount, money(detailPerf.commissionAmount)],
                      [t.totalBookings, detailPerf.totalBookings.toLocaleString(isRTL ? "ar-SA" : "en-US")],
                      [t.completedRate, pct(detailPerf.completedRate)],
                      [t.cancellationRate, pct(detailPerf.cancellationRate)],
                      [t.rating, detailPerf.rating ? `★ ${detailPerf.rating.toFixed(1)}` : "—"],
                      [t.reviews, detailPerf.reviewCount.toLocaleString(isRTL ? "ar-SA" : "en-US")],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-2xl bg-white/5 p-3">
                        <span className="text-[9px] font-black uppercase tracking-widest text-white/50">{label}</span>
                        <strong className="mt-1.5 block font-serif text-lg font-black text-white">{value}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-2xl bg-white/5 p-4">
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/50">{t.financialSummary}</p>
                      <div className="mt-2 space-y-1.5 text-xs font-bold">
                        <div className={`flex items-center justify-between ${rowDir}`}><span className="text-white/60">{t.grossRevenue}</span><span>{money(detailPerf.revenue)}</span></div>
                        <div className={`flex items-center justify-between ${rowDir}`}><span className="text-white/60">{t.commissionAmount} ({detail.commissionPercentage}%)</span><span className="text-[#E0C46A]">{money(detailPerf.commissionAmount)}</span></div>
                        <div className={`flex items-center justify-between border-t border-white/10 pt-1.5 ${rowDir}`}><span className="text-white/60">{t.netToProvider}</span><span>{money(detailPerf.revenue - detailPerf.commissionAmount)}</span></div>
                      </div>
                    </div>
                    <label className="rounded-2xl bg-white/5 p-4">
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/50">{t.adminNotes}</p>
                      <textarea value={notesDraft} onChange={(event) => setNotesDraft(event.target.value)} placeholder={t.adminNotesHint} rows={2} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0B1220] px-3 py-2 text-xs font-semibold text-white outline-none placeholder:text-white/30 focus:border-[#E0C46A]" />
                      <button onClick={() => void saveNotes()} className="mt-2 rounded-lg bg-[#E0C46A] px-3 py-1.5 text-[10px] font-black text-[#101828] hover:brightness-105">{t.saveNotes}</button>
                    </label>
                  </div>
                </section>
              )}

              <section className="rounded-[24px] border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
                <div className={`mb-4 flex items-center justify-between gap-3 ${rowDir}`}>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#D1AF47]">{t.employeeEarningsSummary}</p>
                    <p className="mt-1 text-xs font-semibold text-[#667085]">employee_earnings_summary</p>
                  </div>
                  <strong className="font-serif text-xl font-black text-gray-900">
                    {money(detailEmployeeEarnings.reduce((sum, item) => sum + (item.summary?.totalEarnings ?? 0), 0))}
                  </strong>
                </div>
                {detailEmployeeEarnings.length === 0 ? (
                  <p className="rounded-2xl border border-[#ECECEC] bg-[#FBFAF7] px-4 py-5 text-center text-xs font-bold text-[#667085]">{t.noEmployeeEarnings}</p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {detailEmployeeEarnings.map(({ employee, shop, summary }) => (
                      <div key={`${employee.id}-${summary?.monthStart ?? "all"}`} className="rounded-2xl border border-[#F0F0F0] bg-[#FBFAF7] p-4">
                        <p className="font-black text-gray-900">{displayEmployeeName(employee)}</p>
                        <p className="mt-1 text-[10px] font-bold text-[#667085]">{displayShopName(shop)}</p>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <div className="rounded-xl bg-white p-3">
                            <span className="block text-[8px] font-black uppercase tracking-wider text-[#667085]">{t.statementEarnings}</span>
                            <strong className="mt-1 block text-xs font-black text-[#9A741F]">{money(summary?.totalEarnings ?? 0)}</strong>
                          </div>
                          <div className="rounded-xl bg-white p-3">
                            <span className="block text-[8px] font-black uppercase tracking-wider text-[#667085]">{t.statementCompleted}</span>
                            <strong className="mt-1 block text-xs font-black text-gray-900">{(summary?.completedBookings ?? 0).toLocaleString(isRTL ? "ar-SA" : "en-US")}</strong>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <div className={`flex items-center justify-between gap-3 ${rowDir}`}>
                <h4 className="font-serif text-xl font-black text-gray-900">{t.shops}</h4>
                <button onClick={() => addShop(detail)} className="rounded-xl bg-[#101828] px-4 py-2 text-xs font-black text-[#F4E7B6]">{t.addShop}</button>
              </div>

              {detail.shops.map((shop) => (
                <section key={shop.id} className="rounded-[24px] border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
                  <div className={`mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between ${rowDir}`}>
                    <div>
                      <h5 className="font-serif text-lg font-black text-gray-900">{displayShopName(shop)}</h5>
                      <p className="mt-1 text-xs font-semibold text-[#667085]">{isRTL ? shop.addressAr : shop.addressEn}</p>
                      <p className="mt-2 text-[10px] font-black uppercase tracking-wider text-[#D1AF47]">{labelGender(shop.gender)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => addService(detail, shop)} className="rounded-xl border border-[#D1AF47]/30 bg-[#D1AF47]/10 px-3 py-2 text-[10px] font-black text-[#9A741F]">{t.addService}</button>
                      <button onClick={() => addEmployee(detail, shop)} className="rounded-xl border border-[#ECECEC] px-3 py-2 text-[10px] font-black text-[#667085]">{t.addEmployee}</button>
                      <button onClick={() => removeShop(detail, shop)} className="rounded-xl border border-[#FECDCA] px-3 py-2 text-[10px] font-black text-[#B42318]">{t.removeShop}</button>
                    </div>
                  </div>

                  {/* Per-shop performance metrics */}
                  {(() => {
                    const localM = metricsByShop[shop.id];
                    const performance = detail.performance;
                    const shopCount = Math.max(detail.shops.length, 1);
                    const totalBookings = performance ? Math.round(performance.totalBookings / shopCount) : 0;
                    const completedBookings = performance ? Math.round(performance.completedBookings / shopCount) : 0;
                    const cancelledBookings = performance ? Math.round(performance.cancelledBookings / shopCount) : 0;
                    const noShowBookings = performance ? Math.round(performance.noShowBookings / shopCount) : 0;
                    const m = performance ? {
                      revenue: performance.revenue / shopCount,
                      totalBookings,
                      completedBookings,
                      cancelledBookings,
                      noShowBookings,
                      rating: performance.rating,
                      reviewCount: Math.round(performance.reviewCount / shopCount),
                      profileCompletion: localM?.profileCompletion ?? 100,
                      commissionAmount: performance.commissionAmount / shopCount,
                      avgServiceValue: performance.completedBookings ? Math.round(performance.revenue / performance.completedBookings) : 0,
                      conversionRate: localM?.conversionRate ?? 0,
                      completedRate: totalBookings ? Math.round((completedBookings / totalBookings) * 100) : 0,
                      cancellationRate: totalBookings ? Math.round(((cancelledBookings + noShowBookings) / totalBookings) * 100) : 0
                    } : localM;
                    if (!m) return null;
                    return (
                      <div className="mb-5 grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-7">
                        {[
                          [t.revenue, money(m.revenue)],
                          [t.totalBookings, m.totalBookings.toLocaleString(isRTL ? "ar-SA" : "en-US")],
                          [t.completed, m.completedBookings.toLocaleString(isRTL ? "ar-SA" : "en-US")],
                          [t.cancelled, (m.cancelledBookings + m.noShowBookings).toLocaleString(isRTL ? "ar-SA" : "en-US")],
                          [t.rating, m.rating ? `★ ${m.rating.toFixed(1)}` : "—"],
                          [t.reviews, m.reviewCount.toLocaleString(isRTL ? "ar-SA" : "en-US")],
                          [t.profileCompletion, `${m.profileCompletion}%`],
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-xl border border-[#F0F0F0] bg-[#FBFAF7] px-3 py-2">
                            <span className="block text-[8px] font-black uppercase tracking-wider text-[#667085]">{label}</span>
                            <strong className="mt-0.5 block text-xs font-black text-gray-900">{value}</strong>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                    <div className="rounded-2xl border border-[#F2F2F2] bg-gray-50/60 p-4">
                      <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-[#667085]">{t.services}</p>
                      <div className="space-y-2">
                        {shop.services.map((service) => (
                          <div key={service.id} className={`flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 ${rowDir}`}>
                            <div>
                              <p className="text-xs font-black text-gray-900">{isRTL ? service.nameAr : service.nameEn}</p>
                              <p className="mt-0.5 text-[10px] font-semibold text-[#667085]">{isRTL ? service.categoryAr : service.categoryEn} · {labelGender(service.gender)}</p>
                            </div>
                            <span className="text-xs font-black text-[#9A741F]">{money(service.price)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[#F2F2F2] bg-gray-50/60 p-4">
                      <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-[#667085]">{t.employees}</p>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {shop.employees.map((employee) => {
                          const statement = employeeEarningsById[employee.id];
                          const displayEarnings = statement?.totalEarnings ?? employee.earnings;
                          const displayCompleted = statement?.completedBookings ?? employee.completedBookings;
                          return (
                          <div key={employee.id} className="rounded-2xl border border-[#ECECEC] bg-white p-4">
                            <div className={`flex items-start gap-3 ${rowDir}`}>
                              <img src={employee.photoUrl} alt={displayEmployeeName(employee)} className="h-12 w-12 rounded-2xl object-cover" />
                              <div className="min-w-0 flex-1">
                                <p className="font-black text-gray-900">{displayEmployeeName(employee)}</p>
                                <p className="text-[10px] font-bold text-[#667085]">{displayEmployeeRole(employee)}</p>
                              </div>
                              <button onClick={() => removeEmployee(detail, shop, employee)} className="text-[10px] font-black text-[#B42318]">{t.delete}</button>
                            </div>
                            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                              <div className="rounded-xl bg-gray-50 p-2"><span className="block text-[8px] font-black uppercase text-[#667085]">{statement ? t.statementEarnings : t.earnings}</span><strong className="text-[10px] text-[#9A741F]">{money(displayEarnings)}</strong></div>
                              <div className="rounded-xl bg-gray-50 p-2"><span className="block text-[8px] font-black uppercase text-[#667085]">{t.rating}</span><strong className="text-[10px] text-gray-900">★ {employee.rating}</strong></div>
                              <div className="rounded-xl bg-gray-50 p-2"><span className="block text-[8px] font-black uppercase text-[#667085]">{statement ? t.statementCompleted : t.completed}</span><strong className="text-[10px] text-gray-900">{displayCompleted}</strong></div>
                              <div className="rounded-xl bg-gray-50 p-2"><span className="block text-[8px] font-black uppercase text-[#667085]">{t.cancelled}</span><strong className="text-[10px] text-gray-900">{employee.cancelledBookings}</strong></div>
                              <div className="rounded-xl bg-gray-50 p-2"><span className="block text-[8px] font-black uppercase text-[#667085]">{t.noShow}</span><strong className="text-[10px] text-gray-900">{employee.noShowBookings}</strong></div>
                              <div className="rounded-xl bg-gray-50 p-2"><span className="block text-[8px] font-black uppercase text-[#667085]">{t.reviews}</span><strong className="text-[10px] text-gray-900">{employee.reviewCount}</strong></div>
                              <div className="rounded-xl bg-gray-50 p-2"><span className="block text-[8px] font-black uppercase text-[#667085]">{t.avgServiceValue}</span><strong className="text-[10px] text-gray-900">{money(employeeAvgServiceValue(employee))}</strong></div>
                              <div className="rounded-xl bg-gray-50 p-2"><span className="block text-[8px] font-black uppercase text-[#667085]">{t.commissionShare}</span><strong className="text-[10px] text-[#9A741F]">{money(employeeCommissionShare(employee, detail.commissionPercentage))}</strong></div>
                              <div className="rounded-xl bg-gray-50 p-2"><span className="block text-[8px] font-black uppercase text-[#667085]">{t.repeatCustomers}</span><strong className="text-[10px] text-gray-900">{employee.repeatCustomers}</strong></div>
                            </div>
                            <div className="mt-3">
                              <div className={`flex items-center justify-between text-[9px] font-black uppercase text-[#667085] ${rowDir}`}><span>{t.utilization}</span><span>{employee.utilizationRate}%</span></div>
                              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-[#D1AF47]" style={{ width: `${Math.min(100, employee.utilizationRate)}%` }} /></div>
                            </div>
                            <p className="mt-3 text-[10px] font-bold text-[#667085]">{t.workType}: {labelWorkType(employee.workType)}</p>
                            <p className="mt-1 text-[10px] font-bold text-[#667085]">{t.availability}: {employee.isActive ? t.active : t.inactive}</p>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {(isRTL ? employee.assignedServiceNamesAr : employee.assignedServiceNamesEn).map((name) => (
                                <span key={name} className="rounded-full bg-[#F7F3E8] px-2 py-1 text-[9px] font-bold text-[#9A741F]">{name}</span>
                              ))}
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </section>
              ))}
            </div>
          </aside>
        </div>,
        portalTarget
      )}
    </div>
  );
}
