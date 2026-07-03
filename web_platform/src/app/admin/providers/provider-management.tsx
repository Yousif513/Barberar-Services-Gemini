"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";

type Locale = "en" | "ar";
type GenderScope = "male" | "female" | "both";
type ApplicationStatus = "pending" | "approved" | "rejected";
type AccountStatus = "active" | "inactive";
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
    loadFailed: "Could not load live providers, using demo records."
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
    loadFailed: "تعذر تحميل المزودين المباشرين، يتم استخدام بيانات تجريبية."
  }
};

const employeePhotos = [
  "https://images.unsplash.com/photo-1560250097-0b93528c311a?q=80&w=400&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=400&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=400&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1599566150163-29194dcaad36?q=80&w=400&auto=format&fit=crop"
];

const hashText = (value: string) => value.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);

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
    earnings: 8200 + (hash % 42) * 310,
    rating: Number((4.55 + (hash % 38) / 100).toFixed(1)),
    completedBookings: 38 + (hash % 92),
    isActive
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
  const [detail, setDetail] = useState<ProviderRecord | null>(null);
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

  const normalizeProvider = useCallback((provider: ProviderRow, index: number): ProviderRecord => {
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

    return {
      id: provider.id,
      source: "db",
      providerName: provider.business_name_en || `Provider ${index + 1}`,
      businessNameEn: provider.business_name_en || "Provider",
      businessNameAr: provider.business_name_ar || provider.business_name_en || "مزود",
      contactEmail: `${String(provider.business_name_en || "provider").toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "") || "provider"}@primora.provider`,
      contactPhone: `+966 5${String(10000000 + (hashText(provider.id || String(index)) % 89999999)).slice(0, 8)}`,
      type: provider.type === "freelancer" || provider.type === "salon" || provider.type === "salon_barber_shop" ? provider.type : "salon_barber_shop",
      applicationStatus: provider.is_verified ? "approved" : "pending",
      accountStatus: provider.is_verified ? "active" : "inactive",
      gender: providerGender,
      shops,
      registrationDate: provider.created_at || new Date().toISOString(),
      commissionPercentage: Number(provider.commission_percentage || 15),
      tradeLicenseUrl: provider.trade_license_url || "#"
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
      if (data?.length) {
        setProviders((data as ProviderRow[]).map(normalizeProvider));
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

  const metrics = useMemo(() => ({
    total: providers.length,
    pending: providers.filter((provider) => provider.applicationStatus === "pending").length,
    approved: providers.filter((provider) => provider.applicationStatus === "approved").length,
    shops: providers.reduce((sum, provider) => sum + provider.shops.length, 0),
    employees: providers.reduce((sum, provider) => sum + provider.shops.reduce((shopSum, shop) => shopSum + shop.employees.length, 0), 0)
  }), [providers]);

  const filteredProviders = useMemo(() => providers.filter((provider) => {
    if (statusFilter !== "all" && provider.applicationStatus !== statusFilter && provider.accountStatus !== statusFilter) return false;
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    const textEn = `${provider.providerName} ${provider.businessNameEn} ${provider.contactEmail} ${provider.contactPhone} ${provider.shops.map((shop) => `${shop.nameEn} ${shop.services.map((service) => service.nameEn).join(" ")}`).join(" ")}`.toLowerCase();
    const textAr = `${provider.businessNameAr} ${provider.shops.map((shop) => `${shop.nameAr} ${shop.services.map((service) => service.nameAr).join(" ")}`).join(" ")}`;
    return textEn.includes(q) || textAr.includes(query.trim());
  }), [providers, query, statusFilter]);

  const persistProviderPatch = async (provider: ProviderRecord, patch: Partial<ProviderRecord>) => {
    if (provider.source !== "db") return;
    const payload: Record<string, unknown> = {};
    if (patch.businessNameEn !== undefined) payload.business_name_en = patch.businessNameEn;
    if (patch.businessNameAr !== undefined) payload.business_name_ar = patch.businessNameAr;
    if (patch.type !== undefined) payload.type = patch.type;
    if (patch.commissionPercentage !== undefined) payload.commission_percentage = patch.commissionPercentage;
    if (patch.tradeLicenseUrl !== undefined) payload.trade_license_url = patch.tradeLicenseUrl;
    if (patch.applicationStatus !== undefined) payload.is_verified = patch.applicationStatus === "approved";
    if (Object.keys(payload).length === 0) return;
    const { error: patchError } = await supabase.from("providers").update(payload).eq("id", provider.id);
    if (patchError) throw patchError;
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          [t.providers, metrics.total],
          [t.applications, metrics.pending],
          [t.approved, metrics.approved],
          [t.totalShops, metrics.shops],
          [t.employees, metrics.employees]
        ].map(([label, value]) => (
          <div key={String(label)} className={cardBase}>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085]">{label}</span>
            <strong className="mt-2 block font-serif text-2xl font-black text-gray-900">{Number(value).toLocaleString(isRTL ? "ar-SA" : "en-US")}</strong>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-[#ECECEC] bg-white p-4 shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
        <div className={`flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between ${rowDir}`}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} className="min-h-11 flex-1 rounded-xl border border-[#ECECEC] bg-gray-50 px-4 text-sm font-semibold text-gray-800 outline-none focus:border-[#D1AF47]" />
          <div className="flex flex-wrap gap-2">
            {([
              ["all", t.all],
              ["pending", t.pending],
              ["approved", t.approved],
              ["rejected", t.rejected],
              ["active", t.active],
              ["inactive", t.inactive],
            ] as const).map(([value, label]) => (
              <button key={value} onClick={() => setStatusFilter(value)} className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wider transition ${statusFilter === value ? "bg-[#101828] text-[#F4E7B6]" : "border border-[#ECECEC] bg-white text-[#667085] hover:border-[#D1AF47]/35"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#ECECEC] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-xs">
            <thead>
              <tr className="border-b border-[#ECECEC] bg-gray-50/70 text-[9px] font-extrabold uppercase tracking-widest text-[#667085]">
                {[t.provider, t.contact, t.applicationStatus, t.accountStatus, t.genderCategory, t.shopsManaged, t.registered, t.actions].map((heading) => (
                  <th key={heading} className={`px-5 py-4 ${dirClass}`}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F5F5F5]">
              {loading ? (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-sm font-bold text-[#667085]">Loading...</td></tr>
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
                    <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${provider.accountStatus === "active" ? "bg-[#ECFDF3] text-[#027A48]" : "bg-gray-100 text-[#667085]"}`}>
                      {t[provider.accountStatus]}
                    </span>
                  </td>
                  <td className="px-5 py-4 font-bold">{labelGender(provider.gender)}</td>
                  <td className="px-5 py-4 font-black text-gray-900">{provider.shops.length}</td>
                  <td className="px-5 py-4 font-semibold text-[#667085]">{new Date(provider.registrationDate).toLocaleDateString(isRTL ? "ar-SA" : "en-US")}</td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => setDetail(provider)} className="rounded-xl border border-[#ECECEC] px-3 py-2 text-[10px] font-black text-gray-700 hover:border-[#D1AF47]/40">{t.view}</button>
                      <button onClick={() => openEdit(provider)} className="rounded-xl border border-[#D1AF47]/30 bg-[#D1AF47]/10 px-3 py-2 text-[10px] font-black text-[#9A741F]">{t.edit}</button>
                      {provider.applicationStatus !== "approved" && <button onClick={() => void updateProvider(provider.id, { applicationStatus: "approved", accountStatus: "active" })} className="rounded-xl bg-[#101828] px-3 py-2 text-[10px] font-black text-[#F4E7B6]">{t.approve}</button>}
                      {provider.applicationStatus !== "rejected" && <button onClick={() => void updateProvider(provider.id, { applicationStatus: "rejected", accountStatus: "inactive" })} className="rounded-xl border border-[#FECDCA] bg-[#FEF3F2] px-3 py-2 text-[10px] font-black text-[#B42318]">{t.reject}</button>}
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
                        {shop.employees.map((employee) => (
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
                              <div className="rounded-xl bg-gray-50 p-2"><span className="block text-[8px] font-black uppercase text-[#667085]">{t.earnings}</span><strong className="text-[10px] text-[#9A741F]">{money(employee.earnings)}</strong></div>
                              <div className="rounded-xl bg-gray-50 p-2"><span className="block text-[8px] font-black uppercase text-[#667085]">{t.rating}</span><strong className="text-[10px] text-gray-900">★ {employee.rating}</strong></div>
                              <div className="rounded-xl bg-gray-50 p-2"><span className="block text-[8px] font-black uppercase text-[#667085]">{t.completed}</span><strong className="text-[10px] text-gray-900">{employee.completedBookings}</strong></div>
                            </div>
                            <p className="mt-3 text-[10px] font-bold text-[#667085]">{t.workType}: {labelWorkType(employee.workType)}</p>
                            <p className="mt-1 text-[10px] font-bold text-[#667085]">{t.availability}: {employee.isActive ? t.active : t.inactive}</p>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {(isRTL ? employee.assignedServiceNamesAr : employee.assignedServiceNamesEn).map((name) => (
                                <span key={name} className="rounded-full bg-[#F7F3E8] px-2 py-1 text-[9px] font-bold text-[#9A741F]">{name}</span>
                              ))}
                            </div>
                          </div>
                        ))}
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
