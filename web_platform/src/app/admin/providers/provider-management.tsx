"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import { CommandDialog, ModalOverlay } from "@/components/modal";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";
import { CommandResult, sar } from "@/components/operations-ui";
import { oneOf, writeUrlState } from "@/lib/url-state";

type Locale = "en" | "ar";
type WorkType = "remote" | "in_shop" | "both";
type ApplicationStatus = "pending" | "approved" | "rejected";
type AccountStatus = "active" | "inactive" | "suspended";
type ProviderType = "salon_barber_shop" | "freelancer" | "salon";
type DbProviderStatus = "pending" | "approved" | "rejected" | "suspended" | "active";

type AdminService = {
  id: string;
  nameEn: string;
  nameAr: string;
  categoryEn: string;
  categoryAr: string;
  price: number;
  duration: number;
  isActive: boolean;
};

// Booking, revenue and review totals for one branch or a whole provider. They come from
// admin_branch_performance (bookings and published reviews); nothing here is estimated.
type Tally = {
  totalBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  noShowBookings: number;
  revenue: number;
  commissionAmount: number;
  revenue30d: number;
  reviewCount: number;
  ratingSum: number;
};

// One employee's recorded outcomes, from admin_employee_performance. earnings is what the ledger credited
// to the employee on completed bookings (tips included).
type EmployeeFigures = {
  completedBookings: number;
  cancelledBookings: number;
  noShowBookings: number;
  revenue: number;
  commissionAmount: number;
  // null when the console role holds no ledger permission (GOV-2): shown as "—", never as zero.
  earnings: number | null;
  reviewCount: number;
  ratingSum: number;
  repeatCustomers: number;
};

type AdminEmployee = {
  id: string;
  nameEn: string;
  nameAr: string;
  roleEn: string;
  roleAr: string;
  assignedServiceIds: string[];
  assignedServiceNamesEn: string[];
  assignedServiceNamesAr: string[];
  isActive: boolean;
  photoUrl: string;
  workType: WorkType;
  figures: EmployeeFigures | null;
};

type AdminShop = {
  id: string;
  providerId: string;
  nameEn: string;
  nameAr: string;
  addressEn: string;
  addressAr: string;
  services: AdminService[];
  employees: AdminEmployee[];
  figures: Tally | null;
};

type ProviderRecord = {
  id: string;
  businessNameEn: string;
  businessNameAr: string;
  contactEmail: string;
  contactPhone: string;
  type: ProviderType;
  status: DbProviderStatus;
  applicationStatus: ApplicationStatus;
  accountStatus: AccountStatus;
  shops: AdminShop[];
  registrationDate: string;
  recordedCommission: number | null;
  tradeLicenseUrl: string;
  crNumber?: string;
  crVerificationStatus?: string;
  adminNotes?: string;
  lastActivity?: string;
  figures: Tally | null;
};

type EditDraft = {
  businessNameEn: string;
  businessNameAr: string;
  contactEmail: string;
  contactPhone: string;
  tradeLicenseUrl: string;
};

type ProviderApplicationRecord = {
  id: string;
  user_id: string;
  first_name?: string;
  last_name?: string;
  business_name_en: string;
  business_name_ar: string;
  business_type: string;
  cr_number?: string;
  tax_number?: string;
  contact_email: string;
  contact_phone: string;
  city: string;
  district: string;
  address_text: string;
  trade_license_url?: string;
  status: "pending" | "under_review" | "approved" | "rejected";
  rejection_reason?: string;
  admin_notes?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  cr_verification_status?: string | null;
  cr_check_data?: { registered_name?: string | null; name_match?: boolean | null; notes?: string | null } | null;
  created_at: string;
  updated_at: string;
};

type Numeric = number | string | null;

type BranchPerformanceRow = {
  branch_id: string;
  total_bookings: Numeric;
  completed_bookings: Numeric;
  cancelled_bookings: Numeric;
  no_show_bookings: Numeric;
  gross_revenue: Numeric;
  commission_amount: Numeric;
  revenue_30d: Numeric;
  review_count: Numeric;
  rating_sum: Numeric;
};

type EmployeePerformanceRow = {
  employee_id: string;
  completed_bookings: Numeric;
  cancelled_bookings: Numeric;
  no_show_bookings: Numeric;
  gross_revenue: Numeric;
  commission_amount: Numeric;
  employee_earnings: Numeric;
  review_count: Numeric;
  rating_sum: Numeric;
  repeat_customers: Numeric;
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
  id: string;
  name_en?: string | null;
  name_ar?: string | null;
  title_en?: string | null;
  title_ar?: string | null;
  is_active?: boolean | null;
  photo_url?: string | null;
  work_type?: string | null;
  employee_services?: ProviderEmployeeServiceRow[] | null;
};

type ProviderBranchRow = {
  id: string;
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
  status?: string | null;
  is_verified?: boolean | null;
  cr_number?: string | null;
  cr_verification_status?: string | null;
  commission_percentage?: number | string | null;
  trade_license_url?: string | null;
  admin_notes?: string | null;
  last_activity_at?: string | null;
  created_at?: string | null;
  branches?: ProviderBranchRow[] | null;
  services?: ProviderServiceRow[] | null;
};

const copy = {
  en: {
    title: "Providers",
    subtitle: "Review applications and registered providers, their branches, services, employees and recorded performance.",
    loading: "Loading providers…",
    loadingApplications: "Loading applications…",
    noProviders: "No providers yet.",
    noMatches: "No providers match these filters.",
    close: "Close",
    commission: "Commission",
    joinHint: "Providers join by application. Review new applications in the Applications tab.",
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
    shopsManaged: "Shops managed",
    actions: "Actions",
    view: "View",
    edit: "Edit",
    approve: "Approve",
    reject: "Reject",
    reopen: "Reopen",
    save: "Save",
    saving: "Saving…",
    cancel: "Cancel",
    businessNameEn: "Business name (EN)",
    businessNameAr: "Business name (AR)",
    email: "Email",
    phone: "Phone",
    type: "Provider type",
    tradeLicense: "Trade license URL",
    notProvided: "Not provided",
    workType: "Work type",
    remote: "Remote",
    inShop: "In-shop",
    remoteInShop: "Remote + in-shop",
    detailTitle: "Provider detail",
    shops: "Shops",
    services: "Services",
    earnings: "Earnings",
    rating: "Rating",
    completed: "Completed",
    availability: "Availability",
    saved: "Provider record saved.",
    updated: "Provider status updated.",
    statusChangedUpcoming: "Provider status updated. {n} upcoming bookings were not changed; review them in Bookings.",
    statusDialogTitle: "{action}: {name}",
    statusUpcomingWarning: "Bookings already scheduled with this provider are not changed or cancelled. Review them in Bookings afterwards.",
    statusReasonLabel: "Reason (recorded in the audit log)",
    statusFactStatus: "Current status",
    statusFactShops: "Shops",
    reasonTooShort: "Enter a reason of at least 3 characters.",
    nameRequired: "Both business names are required.",
    invalidEmail: "Enter a valid email address or leave it empty.",
    loadFailed: "Could not load providers.",
    metricsFailed: "Performance figures could not be loaded, so none are shown: {reason}",
    metricsUnavailable: "Performance figures are unavailable right now.",
    applicationsFailed: "Applications could not be loaded: {reason}",
    noBranches: "This provider has no branches yet.",
    noEmployees: "No employees on this branch.",
    activeRegistry: "Active Providers Registry",
    applicationsQueue: "Applications Review Queue",
    approveApplication: "Approve Application",
    rejectApplication: "Reject Application",
    rejectionReason: "Rejection Reason",
    approvalFeeNote: "Platform fees follow the fee rules under Taxes & Fees. No per-provider commission is applied.",
    applicant: "Applicant",
    crNumber: "CR Number",
    taxNumber: "Tax Number",
    noApplications: "No provider applications found.",
    suspended: "Suspended",
    suspend: "Suspend",
    reactivate: "Reactivate",
    revenue: "Revenue",
    revenue30d: "Revenue, last 30 days",
    sortRecent: "Recent activity",
    sortRevenue: "Revenue (high)",
    sortRating: "Rating (high)",
    performance: "Recorded performance",
    commissionCharged: "Platform commission charged",
    commissionChargedNote: "Total commission recorded on this provider's completed bookings. It comes from the fee rules under Taxes & Fees.",
    recordedCommission: "Recorded commission %",
    recordedCommissionNote: "Stored on the provider record only. It does not set any price or fee.",
    completedRate: "Completion rate",
    cancellationRate: "Cancellation rate",
    totalBookings: "Total bookings",
    cancelled: "Cancelled",
    noShow: "No-show",
    reviews: "Reviews",
    profileCompletion: "Profile completion",
    avgServiceValue: "Avg booking value",
    repeatCustomers: "Repeat clients",
    employeeEarningsSummary: "Employee earnings",
    employeeEarningsSource: "Credited by the ledger on completed bookings, tips included.",
    noEmployeeEarnings: "No employee earnings recorded yet.",
    adminNotes: "Admin notes",
    adminNotesHint: "Internal notes about this shop (visible to admins only).",
    saveNotes: "Save notes",
    notesSaved: "Admin notes saved.",
    financialSummary: "Financial summary",
    grossRevenue: "Gross revenue",
    lastActivity: "Last activity"
  },
  ar: {
    title: "مزودو الخدمات",
    subtitle: "مراجعة الطلبات والمزودين المسجلين وفروعهم وخدماتهم وموظفيهم وأدائهم المسجل.",
    loading: "جارٍ تحميل المزودين…",
    loadingApplications: "جارٍ تحميل الطلبات…",
    noProviders: "لا يوجد مزودون بعد.",
    noMatches: "لا يوجد مزودون مطابقون.",
    close: "إغلاق",
    commission: "العمولة",
    joinHint: "ينضم المزودون عبر طلب انضمام. راجع الطلبات الجديدة في تبويب الطلبات.",
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
    shopsManaged: "المتاجر",
    actions: "الإجراءات",
    view: "عرض",
    edit: "تعديل",
    approve: "اعتماد",
    reject: "رفض",
    reopen: "إعادة فتح",
    save: "حفظ",
    saving: "جارٍ الحفظ…",
    cancel: "إلغاء",
    businessNameEn: "اسم النشاط بالإنجليزية",
    businessNameAr: "اسم النشاط بالعربية",
    email: "البريد الإلكتروني",
    phone: "الهاتف",
    type: "نوع المزود",
    tradeLicense: "رابط السجل التجاري",
    notProvided: "غير مُدخل",
    workType: "نوع العمل",
    remote: "عن بعد",
    inShop: "داخل المتجر",
    remoteInShop: "عن بعد وداخل المتجر",
    detailTitle: "تفاصيل المزود",
    shops: "المتاجر",
    services: "الخدمات",
    earnings: "الأرباح",
    rating: "التقييم",
    completed: "المكتملة",
    availability: "التوفر",
    saved: "تم حفظ سجل المزود.",
    updated: "تم تحديث حالة المزود.",
    statusChangedUpcoming: "تم تحديث حالة المزود. لم تتغير {n} من الحجوزات القادمة؛ راجعها في صفحة الحجوزات.",
    statusDialogTitle: "{action}: {name}",
    statusUpcomingWarning: "لا تتغير الحجوزات المجدولة مسبقاً مع هذا المزود ولا تُلغى. راجعها في صفحة الحجوزات بعد ذلك.",
    statusReasonLabel: "السبب (يُسجل في سجل التدقيق)",
    statusFactStatus: "الحالة الحالية",
    statusFactShops: "الفروع",
    reasonTooShort: "أدخل سبباً من 3 أحرف على الأقل.",
    nameRequired: "اسم النشاط مطلوب بالإنجليزية والعربية.",
    invalidEmail: "أدخل بريداً إلكترونياً صحيحاً أو اتركه فارغاً.",
    loadFailed: "تعذر تحميل المزودين.",
    metricsFailed: "تعذر تحميل أرقام الأداء، لذا لا تُعرض أي أرقام: {reason}",
    metricsUnavailable: "أرقام الأداء غير متاحة حالياً.",
    applicationsFailed: "تعذر تحميل الطلبات: {reason}",
    noBranches: "لا توجد فروع لهذا المزود بعد.",
    noEmployees: "لا يوجد موظفون في هذا الفرع.",
    activeRegistry: "سجل مزودي الخدمة المعتمدين",
    applicationsQueue: "طابور مراجعة طلبات الانضمام",
    approveApplication: "الموافقة على الطلب",
    rejectApplication: "رفض الطلب",
    rejectionReason: "سبب الرفض",
    approvalFeeNote: "تتبع رسوم المنصة قواعد الرسوم في صفحة الضرائب والرسوم. لا تُطبق عمولة خاصة بكل مزود.",
    applicant: "مقدم الطلب",
    crNumber: "رقم السجل التجاري",
    taxNumber: "الرقم الضريبي",
    noApplications: "لا توجد طلبات انضمام حالياً.",
    suspended: "موقوف",
    suspend: "إيقاف",
    reactivate: "إعادة تفعيل",
    revenue: "الإيرادات",
    revenue30d: "الإيرادات، آخر ٣٠ يوماً",
    sortRecent: "النشاط الأخير",
    sortRevenue: "الإيرادات (الأعلى)",
    sortRating: "التقييم (الأعلى)",
    performance: "الأداء المسجل",
    commissionCharged: "عمولة المنصة المحتسبة",
    commissionChargedNote: "إجمالي العمولة المسجلة على الحجوزات المكتملة لهذا المزود. تأتي من قواعد الرسوم في صفحة الضرائب والرسوم.",
    recordedCommission: "نسبة العمولة المسجلة",
    recordedCommissionNote: "محفوظة في سجل المزود فقط، ولا تحدد أي سعر أو رسم.",
    completedRate: "معدل الإنجاز",
    cancellationRate: "معدل الإلغاء",
    totalBookings: "إجمالي الحجوزات",
    cancelled: "ملغاة",
    noShow: "عدم حضور",
    reviews: "التقييمات",
    profileCompletion: "اكتمال الملف",
    avgServiceValue: "متوسط قيمة الحجز",
    repeatCustomers: "عملاء متكررون",
    employeeEarningsSummary: "أرباح الموظفين",
    employeeEarningsSource: "تُسجلها دفاتر الحسابات على الحجوزات المكتملة، شاملة الإكراميات.",
    noEmployeeEarnings: "لا توجد أرباح مسجلة للموظفين بعد.",
    adminNotes: "ملاحظات الإدارة",
    adminNotesHint: "ملاحظات داخلية عن هذا المتجر (تظهر للإدارة فقط).",
    saveNotes: "حفظ الملاحظات",
    notesSaved: "تم حفظ ملاحظات الإدارة.",
    financialSummary: "الملخص المالي",
    grossRevenue: "إجمالي الإيراد",
    lastActivity: "آخر نشاط"
  }
};

const num = (value: Numeric | undefined) => Number(value ?? 0);

const initialsOf = (name: string) =>
  name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word.charAt(0)).join("").toUpperCase();

function fill(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), template);
}

// providers.status is what the database acts on: a provider is visible and bookable exactly when it is
// approved or active (a trigger derives is_verified from it), never when pending, rejected or suspended.
function statusesFromDb(status: string | null | undefined, verified: boolean | null | undefined): { application: ApplicationStatus; account: AccountStatus; db: DbProviderStatus } {
  switch (status) {
    case "rejected": return { application: "rejected", account: "inactive", db: "rejected" };
    case "suspended": return { application: "approved", account: "suspended", db: "suspended" };
    case "active": return { application: "approved", account: "active", db: "active" };
    case "approved": return { application: "approved", account: "inactive", db: "approved" };
    case "pending": return { application: "pending", account: "inactive", db: "pending" };
    default: return verified
      ? { application: "approved", account: "active", db: "active" }
      : { application: "pending", account: "inactive", db: "pending" };
  }
}

// A provider with no branches has no bookings, so zero is a fact for it rather than a guess.
const EMPTY_TALLY: Tally = {
  totalBookings: 0, completedBookings: 0, cancelledBookings: 0, noShowBookings: 0,
  revenue: 0, commissionAmount: 0, revenue30d: 0, reviewCount: 0, ratingSum: 0
};

function tallyFromBranchRow(row: BranchPerformanceRow): Tally {
  return {
    totalBookings: num(row.total_bookings),
    completedBookings: num(row.completed_bookings),
    cancelledBookings: num(row.cancelled_bookings),
    noShowBookings: num(row.no_show_bookings),
    revenue: num(row.gross_revenue),
    commissionAmount: num(row.commission_amount),
    revenue30d: num(row.revenue_30d),
    reviewCount: num(row.review_count),
    ratingSum: num(row.rating_sum)
  };
}

function figuresFromEmployeeRow(row: EmployeePerformanceRow): EmployeeFigures {
  return {
    completedBookings: num(row.completed_bookings),
    cancelledBookings: num(row.cancelled_bookings),
    noShowBookings: num(row.no_show_bookings),
    revenue: num(row.gross_revenue),
    commissionAmount: num(row.commission_amount),
    earnings: row.employee_earnings === null || row.employee_earnings === undefined ? null : num(row.employee_earnings),
    reviewCount: num(row.review_count),
    ratingSum: num(row.rating_sum),
    repeatCustomers: num(row.repeat_customers)
  };
}

function addTallies(items: Tally[]): Tally {
  return items.reduce<Tally>((sum, item) => ({
    totalBookings: sum.totalBookings + item.totalBookings,
    completedBookings: sum.completedBookings + item.completedBookings,
    cancelledBookings: sum.cancelledBookings + item.cancelledBookings,
    noShowBookings: sum.noShowBookings + item.noShowBookings,
    revenue: sum.revenue + item.revenue,
    commissionAmount: sum.commissionAmount + item.commissionAmount,
    revenue30d: sum.revenue30d + item.revenue30d,
    reviewCount: sum.reviewCount + item.reviewCount,
    ratingSum: sum.ratingSum + item.ratingSum
  }), EMPTY_TALLY);
}

// Rates are taken over visits that reached an outcome (completed, cancelled or no-show); bookings still
// ahead or awaiting payment are neither successes nor failures yet. Each is null while there are none.
function describeOutcomes(counts: { completedBookings: number; cancelledBookings: number; noShowBookings: number; revenue: number; reviewCount: number; ratingSum: number }) {
  const finished = counts.completedBookings + counts.cancelledBookings + counts.noShowBookings;
  return {
    finished,
    completedRate: finished ? Math.round((counts.completedBookings / finished) * 100) : null,
    cancellationRate: finished ? Math.round(((counts.cancelledBookings + counts.noShowBookings) / finished) * 100) : null,
    rating: counts.reviewCount ? counts.ratingSum / counts.reviewCount : null,
    avgBookingValue: counts.completedBookings ? Math.round(counts.revenue / counts.completedBookings) : null
  };
}

// How much of the shop's public profile is filled in; a plain count of present fields.
function profileCompletion(shop: Pick<AdminShop, "nameEn" | "addressEn" | "services" | "employees">): number {
  const filled = [
    shop.nameEn,
    shop.addressEn,
    shop.services.length > 0,
    shop.employees.length > 0,
    shop.services.length > 0 && shop.services.every((service) => service.price > 0)
  ].filter(Boolean).length;
  return Math.round((filled / 5) * 100);
}

const providerRevenue = (provider: ProviderRecord) => provider.figures?.revenue ?? 0;
const providerRating = (provider: ProviderRecord) => (provider.figures ? describeOutcomes(provider.figures).rating ?? 0 : 0);

const blankDraft: EditDraft = { businessNameEn: "", businessNameAr: "", contactEmail: "", contactPhone: "", tradeLicenseUrl: "" };

function crIsCleared(app: { cr_verification_status?: string | null }) {
  return app.cr_verification_status === "verified" || app.cr_verification_status === "manually_reviewed";
}

export default function AdminProviderManagement() {
  const [lang, setLang] = useState<Locale>("en");
  const [providers, setProviders] = useState<ProviderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [crDialog, setCrDialog] = useState<{ kind: "wathq" | "manual"; providerId: string; applicationId?: string; cr: string; name: string } | null>(null);
  const [statusPending, setStatusPending] = useState<{ provider: ProviderRecord; next: DbProviderStatus; actionLabel: string } | null>(null);
  const [metricsError, setMetricsError] = useState("");
  const params = useSearchParams();
  const [query, setQuery] = useState(() => params.get("q") ?? "");
  const [statusFilter, setStatusFilter] = useState<"all" | ApplicationStatus | AccountStatus>(() =>
    oneOf(params.get("status"), ["all", "pending", "approved", "rejected", "active", "suspended", "inactive"] as const, "all"));
  const [sortMode, setSortMode] = useState<"recent" | "revenue" | "rating">("recent");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [notesEdit, setNotesEdit] = useState<{ id: string; text: string } | null>(null);
  const [editing, setEditing] = useState<ProviderRecord | null>(null);
  const [draft, setDraft] = useState<EditDraft>(blankDraft);
  const [draftError, setDraftError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [busyProviderId, setBusyProviderId] = useState("");
  const [mainTab, setMainTab] = useState<"providers" | "applications">(() => (params.get("tab") === "applications" ? "applications" : "providers"));
  const [applications, setApplications] = useState<ProviderApplicationRecord[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [appsError, setAppsError] = useState("");
  const [appFilter, setAppFilter] = useState<"all" | "pending" | "approved" | "rejected">(() =>
    oneOf(params.get("appStatus"), ["all", "pending", "approved", "rejected"] as const, "pending"));
  useEffect(() => {
    writeUrlState({
      tab: mainTab === "applications" ? "applications" : "",
      status: statusFilter === "all" ? "" : statusFilter,
      appStatus: appFilter === "pending" ? "" : appFilter,
      q: query.trim(),
    });
  }, [mainTab, statusFilter, appFilter, query]);
  const [approvalModalApp, setApprovalModalApp] = useState<ProviderApplicationRecord | null>(null);
  const [rejectionModalApp, setRejectionModalApp] = useState<ProviderApplicationRecord | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [submittingAppAction, setSubmittingAppAction] = useState(false);

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
  const detail = useMemo(() => providers.find((provider) => provider.id === detailId) ?? null, [providers, detailId]);
  // The notes box shows what the operator is typing for this provider, or the saved notes until they type.
  const notesDraft = detail ? (notesEdit?.id === detail.id ? notesEdit.text : detail.adminNotes ?? "") : "";

  const labelWorkType = (workType: WorkType) => (workType === "remote" ? t.remote : workType === "both" ? t.remoteInShop : t.inShop);

  const normalizeProvider = useCallback((provider: ProviderRow, branchFigures: Record<string, Tally> | null, employeeFigures: Record<string, EmployeeFigures> | null): ProviderRecord => {
    const providerServices: AdminService[] = (provider.services || []).map((service) => {
      const category = service.categories ?? null;
      const categorySlug = category?.slug ?? "";
      return {
        id: service.id,
        nameEn: service.name_en || "",
        nameAr: service.name_ar || service.name_en || "",
        categoryEn: category?.name_en || categorySlug || "",
        categoryAr: category?.name_ar || category?.name_en || "",
        price: Number(service.base_price || 0),
        duration: Number(service.base_duration_minutes || 0),
        isActive: service.is_active !== false
      };
    });

    const shops: AdminShop[] = (provider.branches || []).map((branch) => {
      const employees: AdminEmployee[] = (branch.employees || []).map((employee) => {
        const assignedIds = (employee.employee_services || []).map((row) => row.service_id).filter(Boolean);
        const assigned = providerServices.filter((service) => assignedIds.includes(service.id));
        return {
          id: employee.id,
          nameEn: employee.name_en || "",
          nameAr: employee.name_ar || employee.name_en || "",
          roleEn: employee.title_en || "",
          roleAr: employee.title_ar || employee.title_en || "",
          assignedServiceIds: assigned.map((service) => service.id),
          assignedServiceNamesEn: assigned.map((service) => service.nameEn),
          assignedServiceNamesAr: assigned.map((service) => service.nameAr),
          isActive: employee.is_active !== false,
          photoUrl: employee.photo_url || "",
          workType: employee.work_type === "remote" || employee.work_type === "both" ? employee.work_type : "in_shop",
          figures: employeeFigures?.[employee.id] ?? null
        };
      });
      return {
        id: branch.id,
        providerId: provider.id,
        nameEn: branch.name_en || provider.business_name_en || "",
        nameAr: branch.name_ar || provider.business_name_ar || provider.business_name_en || "",
        addressEn: branch.address_text_en || branch.address_text_ar || "",
        addressAr: branch.address_text_ar || branch.address_text_en || "",
        services: providerServices,
        employees,
        figures: branchFigures?.[branch.id] ?? null
      };
    });

    const branchTallies = shops.map((shop) => shop.figures);
    const figures = shops.length === 0
      ? EMPTY_TALLY
      : branchTallies.every((tally): tally is Tally => tally !== null) ? addTallies(branchTallies) : null;
    const { application, account, db } = statusesFromDb(provider.status, provider.is_verified);
    const commission = provider.commission_percentage;

    return {
      id: provider.id,
      businessNameEn: provider.business_name_en || "",
      businessNameAr: provider.business_name_ar || provider.business_name_en || "",
      contactEmail: provider.contact_email || "",
      contactPhone: provider.contact_phone || "",
      type: provider.type === "freelancer" || provider.type === "salon" || provider.type === "salon_barber_shop" ? provider.type : "salon_barber_shop",
      status: db,
      applicationStatus: application,
      accountStatus: account,
      shops,
      registrationDate: provider.created_at || "",
      recordedCommission: commission === null || commission === undefined ? null : Number(commission),
      tradeLicenseUrl: provider.trade_license_url || "",
      crNumber: provider.cr_number || "",
      crVerificationStatus: provider.cr_verification_status || (provider.is_verified ? "verified" : "unverified"),
      adminNotes: provider.admin_notes || "",
      lastActivity: provider.last_activity_at || undefined,
      figures
    };
  }, []);

  const loadProviders = useCallback(async () => {
    setLoading(true);
    setError("");
    setMetricsError("");
    try {
      const { data, error: dbError } = await supabase
        .from("providers")
        .select(`
          id,
          business_name_en,
          business_name_ar,
          type,
          status,
          is_verified,
          cr_verification_status,
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
              photo_url,
              work_type,
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

      // Contact details, registration numbers, commission and the review notes are not readable from the table by signed-in users;
      // administrators read them through one audited command.
      const privateResult = await supabase.rpc("admin_provider_private_directory");
      if (privateResult.error) throw privateResult.error;
      const privateById = new Map(((privateResult.data ?? []) as Array<{ provider_id: string }>).map((row) => [row.provider_id, row]));

      // Branch and employee figures come from their own views. If either fails nothing is estimated in
      // its place: the screen says so and shows no figures.
      const [branchResult, employeeResult] = await Promise.all([
        supabase.from("admin_branch_performance").select("*"),
        // GOV-2 (Q4): per-employee figures (earnings come from the ledger) are read through the audited report.
        supabase.rpc("admin_employee_performance_report", { p_provider_id: null, p_purpose: "provider_onboarding" })
      ]);
      let branchFigures: Record<string, Tally> | null = null;
      let employeeFigures: Record<string, EmployeeFigures> | null = null;
      const failures = [branchResult.error, employeeResult.error].filter(Boolean).map((failure) => errorMessage(failure));
      if (failures.length > 0) {
        setMetricsError(failures.join(" · "));
      } else {
        branchFigures = Object.fromEntries(((branchResult.data ?? []) as BranchPerformanceRow[]).map((row) => [row.branch_id, tallyFromBranchRow(row)]));
        employeeFigures = Object.fromEntries(((employeeResult.data ?? []) as EmployeePerformanceRow[]).map((row) => [row.employee_id, figuresFromEmployeeRow(row)]));
      }
      setProviders(((data ?? []) as unknown as ProviderRow[]).map((row) => normalizeProvider({ ...row, ...(privateById.get(row.id) ?? {}) } as ProviderRow, branchFigures, employeeFigures)));
    } catch (loadError) {
      setProviders([]);
      setError(`${t.loadFailed} ${errorMessage(loadError)}`.trim());
    } finally {
      setLoading(false);
    }
  }, [normalizeProvider, t.loadFailed]);

  const loadApplications = useCallback(async () => {
    setAppsLoading(true);
    setAppsError("");
    try {
      // GOV-2 (Q4): applicants' names and contact details are read through the audited admin_list_provider_applications.
      const result = await supabase.rpc("admin_list_provider_applications", { p_status: null, p_limit: 500, p_offset: 0, p_purpose: "provider_onboarding" });
      if (result.error) throw result.error;
      setApplications(((result.data as { rows?: ProviderApplicationRecord[] } | null)?.rows ?? []) as ProviderApplicationRecord[]);
    } catch (loadError) {
      setApplications([]);
      setAppsError(errorMessage(loadError));
    } finally {
      setAppsLoading(false);
    }
  }, []);

  // Approval is one server command that needs the operator's reason; a refusal goes back to the dialog, which keeps
  // what was typed.
  const handleApproveApplication = async (appId: string, reason: string): Promise<string | null> => {
    // Platform fees follow the fee rules; the function's own default fills the recorded percentage.
    const { error: rpcError } = await supabase.rpc("approve_provider_application", { p_application_id: appId, p_reason: reason });
    if (rpcError) return errorMessage(rpcError) || (isRTL ? "فشلت عملية الموافقة." : "Failed to approve application.");
    setError("");
    setNotice(isRTL ? "تمت الموافقة على الطلب بنجاح وتفعيل مزود الخدمة." : "Application approved successfully and provider activated.");
    await Promise.all([loadApplications(), loadProviders()]);
    return null;
  };

  const handleRejectApplication = async (appId: string, reason: string) => {
    if (!reason.trim()) {
      setError(isRTL ? "يرجى كتابة سبب الرفض." : "Please specify a rejection reason.");
      return;
    }
    setSubmittingAppAction(true);
    setError("");
    try {
      const { error: rpcError } = await supabase.rpc("reject_provider_application", {
        p_application_id: appId,
        p_reason: reason.trim()
      });
      if (rpcError) throw rpcError;
      setNotice(isRTL ? "تم رفض الطلب بنجاح وتسجيل السبب." : "Application rejected and reason recorded.");
      setRejectionModalApp(null);
      setRejectionReason("");
      await loadApplications();
    } catch (err) {
      setError(errorMessage(err) || (isRTL ? "فشلت عملية الرفض." : "Failed to reject application."));
    } finally {
      setSubmittingAppAction(false);
    }
  };

  const applyCrStatus = (providerId: string, crNumber: string, status: string) => {
    setProviders((prev) => prev.map((p) => p.id === providerId ? { ...p, crNumber, crVerificationStatus: status } : p));
  };

  const crStatusLabel = (status: string | null | undefined) => {
    switch (status) {
      case "verified": return isRTL ? "مؤكد عبر واثق" : "Confirmed by Wathq";
      case "manually_reviewed": return isRTL ? "مراجعة يدوية" : "Manually reviewed";
      case "name_mismatch": return isRTL ? "الاسم لا يطابق واثق" : "Name differs from Wathq";
      case "rejected": return isRTL ? "غير قائم في واثق" : "Not active in Wathq";
      default: return isRTL ? "لم يُفحص بعد" : "Not checked yet";
    }
  };

  // Calls the Ministry of Commerce Wathq API through the wathq-verify Edge Function. The target is an approved provider or,
  // before approval, an application: approve_provider_application refuses an application whose CR is not cleared.
  const handleVerifyCr = async (target: { providerId: string; applicationId?: string }, crNumber: string) => {
    const cr = crNumber.trim();
    if (!/^[0-9]{10}$/.test(cr)) {
      setError(isRTL ? "يجب أن يتكون السجل التجاري من 10 أرقام بالضبط." : "Commercial Registration (CR) must be exactly 10 digits.");
      return;
    }
    setError("");
    setNotice("");
    const { data, error: fnError } = await supabase.functions.invoke("wathq-verify", {
      body: target.applicationId ? { applicationId: target.applicationId, crNumber: cr } : { providerId: target.providerId, crNumber: cr },
    });
    if (fnError) {
      let detailMessage = fnError.message;
      try {
        const body = await (fnError as { context?: Response }).context?.json();
        if (body?.error) detailMessage = body.error;
      } catch {
        // keep the generic message
      }
      setError(detailMessage);
      return;
    }
    const outcome: string = data?.status === "verified" || data?.status === "name_mismatch" ? data.status : "rejected";
    if (outcome === "verified") {
      setNotice(isRTL ? "أكد واثق أن السجل التجاري قائم ويطابق اسم النشاط." : "Wathq confirmed the Commercial Registration is active and matches the business name.");
    } else if (outcome === "name_mismatch") {
      const registered = data?.crName ? ` (${data.crName})` : "";
      setError(isRTL
        ? `السجل قائم لكن الاسم المسجل في واثق${registered} لا يطابق اسم النشاط. راجع الشهادة وسجّل مراجعة يدوية إن كانت صحيحة.`
        : `The registration is active but the name registered with Wathq${registered} does not match the business name. Review the certificate and record a manual review if it is correct.`);
    } else {
      setError(isRTL ? "واثق لم يؤكد هذا السجل التجاري (غير موجود أو غير قائم)." : "Wathq did not confirm this CR (not found or not active).");
    }
    if (target.applicationId) await loadApplications();
    else applyCrStatus(target.providerId, cr, outcome);
  };

  // Manual review of the CR certificate by an admin. Recorded as "manually reviewed", never as Wathq-verified.
  const handleManualCrReview = async (target: { providerId: string; applicationId?: string }, crNumber: string, notes: string): Promise<string | null> => {
    const cr = crNumber.trim();
    setError("");
    const { error: rpcError } = target.applicationId
      ? await supabase.rpc("admin_confirm_application_cr", { p_application_id: target.applicationId, p_notes: notes.trim() })
      : await supabase.rpc("admin_record_cr_review", { p_provider_id: target.providerId, p_cr_number: cr, p_notes: notes.trim() });
    if (rpcError) return errorMessage(rpcError);
    setNotice(isRTL ? "تم تسجيل المراجعة اليدوية للسجل التجاري." : "Manual CR review recorded.");
    if (target.applicationId) await loadApplications();
    else applyCrStatus(target.providerId, cr, "manually_reviewed");
    return null;
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProviders();
      void loadApplications();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadProviders, loadApplications]);

  const displayProviderName = (provider: ProviderRecord) => isRTL ? provider.businessNameAr || provider.businessNameEn : provider.businessNameEn || provider.businessNameAr;
  const displayShopName = (shop: AdminShop) => isRTL ? shop.nameAr || shop.nameEn : shop.nameEn || shop.nameAr;
  const displayEmployeeName = (employee: AdminEmployee) => isRTL ? employee.nameAr || employee.nameEn : employee.nameEn || employee.nameAr;
  const displayEmployeeRole = (employee: AdminEmployee) => isRTL ? employee.roleAr || employee.roleEn : employee.roleEn || employee.roleAr;
  const numberFormat = isRTL ? "ar-SA" : "en-US";
  const count = (value: number) => value.toLocaleString(numberFormat);
  const money = (value: number) => sar(value, lang);
  const pct = (value: number | null) => value === null ? "—" : `${value.toLocaleString(numberFormat)}%`;
  const stars = (value: number | null) => value === null ? "—" : `★ ${value.toLocaleString(numberFormat, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;

  const metrics = useMemo(() => ({
    total: providers.length,
    pending: providers.filter((provider) => provider.applicationStatus === "pending").length,
    approved: providers.filter((provider) => provider.applicationStatus === "approved").length,
    shops: providers.reduce((sum, provider) => sum + provider.shops.length, 0),
    employees: providers.reduce((sum, provider) => sum + provider.shops.reduce((shopSum, shop) => shopSum + shop.employees.length, 0), 0),
    revenue: providers.every((provider) => provider.figures !== null)
      ? providers.reduce((sum, provider) => sum + (provider.figures?.revenue ?? 0), 0)
      : null
  }), [providers]);

  const filteredProviders = useMemo(() => {
    const list = providers.filter((provider) => {
      if (statusFilter !== "all" && provider.applicationStatus !== statusFilter && provider.accountStatus !== statusFilter) return false;
      if (!query.trim()) return true;
      const q = query.trim().toLowerCase();
      const textEn = `${provider.businessNameEn} ${provider.contactEmail} ${provider.contactPhone} ${provider.shops.map((shop) => `${shop.nameEn} ${shop.addressEn} ${shop.services.map((service) => service.nameEn).join(" ")}`).join(" ")}`.toLowerCase();
      const textAr = `${provider.businessNameAr} ${provider.shops.map((shop) => `${shop.nameAr} ${shop.addressAr} ${shop.services.map((service) => service.nameAr).join(" ")}`).join(" ")}`;
      return textEn.includes(q) || textAr.includes(query.trim());
    });
    const sorted = [...list];
    if (sortMode === "revenue") sorted.sort((a, b) => providerRevenue(b) - providerRevenue(a));
    else if (sortMode === "rating") sorted.sort((a, b) => providerRating(b) - providerRating(a));
    else sorted.sort((a, b) => new Date(b.lastActivity ?? b.registrationDate).getTime() - new Date(a.lastActivity ?? a.registrationDate).getTime());
    return sorted;
  }, [providers, query, statusFilter, sortMode]);

  // Status changes are one server command: it checks the move is allowed, records the reason in the audit
  // log in the same transaction, and tells us how many upcoming bookings the change leaves in place. The reason
  // is collected in a dialog that names the provider, so a refusal keeps what the operator typed.
  const changeStatus = (provider: ProviderRecord, next: DbProviderStatus, actionLabel: string) => {
    setError("");
    setNotice("");
    setStatusPending({ provider, next, actionLabel });
  };

  const runStatusChange = async (provider: ProviderRecord, next: DbProviderStatus, reason: string): Promise<string | null> => {
    setBusyProviderId(provider.id);
    const { data, error: rpcError } = await supabase.rpc("admin_set_provider_status", {
      p_provider_id: provider.id,
      p_status: next,
      p_reason: reason
    });
    setBusyProviderId("");
    if (rpcError) return errorMessage(rpcError);
    const upcoming = Number((data as { upcoming_bookings?: number } | null)?.upcoming_bookings ?? 0);
    setNotice(upcoming > 0 && (next === "suspended" || next === "rejected") ? fill(t.statusChangedUpcoming, { n: count(upcoming) }) : t.updated);
    await loadProviders();
    return null;
  };

  const saveNotes = async () => {
    if (!detail) return;
    setError("");
    const { error: notesError } = await supabase.from("providers").update({ admin_notes: notesDraft }).eq("id", detail.id);
    if (notesError) {
      setError(errorMessage(notesError));
      return;
    }
    setNotice(t.notesSaved);
    setNotesEdit(null);
    await loadProviders();
  };

  const openEdit = (provider: ProviderRecord) => {
    setDraft({
      businessNameEn: provider.businessNameEn,
      businessNameAr: provider.businessNameAr,
      contactEmail: provider.contactEmail,
      contactPhone: provider.contactPhone,
      tradeLicenseUrl: provider.tradeLicenseUrl
    });
    setDraftError("");
    setEditing(provider);
  };

  // Only fields the operator actually changed are written, so opening and saving never rewrites a value.
  const saveEdit = async () => {
    if (!editing) return;
    const next = {
      businessNameEn: draft.businessNameEn.trim(),
      businessNameAr: draft.businessNameAr.trim(),
      contactEmail: draft.contactEmail.trim(),
      contactPhone: draft.contactPhone.trim(),
      tradeLicenseUrl: draft.tradeLicenseUrl.trim()
    };
    if (!next.businessNameEn || !next.businessNameAr) {
      setDraftError(t.nameRequired);
      return;
    }
    if (next.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.contactEmail)) {
      setDraftError(t.invalidEmail);
      return;
    }
    const payload: Record<string, string | null> = {};
    if (next.businessNameEn !== editing.businessNameEn) payload.business_name_en = next.businessNameEn;
    if (next.businessNameAr !== editing.businessNameAr) payload.business_name_ar = next.businessNameAr;
    if (next.contactEmail !== editing.contactEmail) payload.contact_email = next.contactEmail || null;
    if (next.contactPhone !== editing.contactPhone) payload.contact_phone = next.contactPhone || null;
    if (next.tradeLicenseUrl !== editing.tradeLicenseUrl) payload.trade_license_url = next.tradeLicenseUrl || null;
    if (Object.keys(payload).length === 0) {
      setEditing(null);
      return;
    }
    setSavingEdit(true);
    setDraftError("");
    const { error: updateError } = await supabase.from("providers").update(payload).eq("id", editing.id);
    setSavingEdit(false);
    if (updateError) {
      // The dialog stays open with the operator's input intact.
      setDraftError(errorMessage(updateError));
      return;
    }
    setEditing(null);
    setNotice(t.saved);
    await loadProviders();
  };

  const cardBase = "rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)]";
  const portalTarget = typeof document !== "undefined" ? document.body : null;
  const detailOutcomes = detail?.figures ? describeOutcomes(detail.figures) : null;
  const detailEmployeeEarnings = detail
    ? detail.shops.flatMap((shop) => shop.employees.map((employee) => ({ employee, shop }))).filter((item) => item.employee.figures && ((item.employee.figures.earnings ?? 0) > 0 || item.employee.figures.completedBookings > 0))
    : [];
  const actionButton = "rounded-xl px-3 py-2 text-[11px] font-black disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[#9B7928]";

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-6 ${dirClass}`}>
      <div>
        <h1 className="font-serif text-2xl font-black tracking-tight text-gray-900">{t.title}</h1>
        <p className="mt-1 text-xs font-semibold text-gray-500">{t.subtitle}</p>
        <p className="mt-1 text-[11px] font-semibold text-[#7A5B12]">{t.joinHint}</p>
      </div>

      <CommandResult
        error={error || undefined}
        success={error ? undefined : notice || undefined}
        locale={isRTL ? "ar" : "en"}
        onDismiss={() => {
          setError("");
          setNotice("");
        }}
      />
      {metricsError && (
        <div role="alert" className="rounded-xl border border-[#FEDF89] bg-[#FFFAEB] px-4 py-3 text-xs font-bold text-[#B54708]">
          {fill(t.metricsFailed, { reason: metricsError })}
        </div>
      )}

      {/* 1. TOP TAB SWITCHER */}
      <div className={`flex flex-wrap items-center gap-3 border-b border-[#ECECEC] pb-4 ${rowDir}`}>
        <button
          type="button"
          aria-pressed={mainTab === "providers"}
          onClick={() => setMainTab("providers")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black transition focus-visible:outline-2 focus-visible:outline-[#9B7928] ${
            mainTab === "providers"
              ? "bg-[#101828] text-[#F4E7B6] shadow-sm"
              : "border border-[#ECECEC] bg-white text-[#667085] hover:border-[#D1AF47]/40"
          }`}
        >
          <span>{t.activeRegistry}</span>
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px]">{count(providers.length)}</span>
        </button>
        <button
          type="button"
          aria-pressed={mainTab === "applications"}
          onClick={() => setMainTab("applications")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black transition focus-visible:outline-2 focus-visible:outline-[#9B7928] ${
            mainTab === "applications"
              ? "bg-[#101828] text-[#F4E7B6] shadow-sm"
              : "border border-[#ECECEC] bg-white text-[#667085] hover:border-[#D1AF47]/40"
          }`}
        >
          <span>{t.applicationsQueue}</span>
          {applications.filter((a) => a.status === "pending").length > 0 && (
            <span className="rounded-full bg-[#D1AF47] px-2 py-0.5 text-[11px] text-[#101828] font-black">
              {count(applications.filter((a) => a.status === "pending").length)}
            </span>
          )}
        </button>
      </div>

      {mainTab === "providers" ? (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
            {[
              [t.providers, count(metrics.total)],
              [t.applications, count(metrics.pending)],
              [t.approved, count(metrics.approved)],
              [t.totalShops, count(metrics.shops)],
              [t.employees, count(metrics.employees)],
              [t.revenue, metrics.revenue === null ? "—" : money(metrics.revenue)]
            ].map(([label, value]) => (
              <div key={String(label)} className={cardBase}>
                <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#667085]">{label}</span>
                <strong className="mt-2 block font-serif text-lg font-black text-gray-900 [overflow-wrap:anywhere] sm:text-xl">{value}</strong>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-[#ECECEC] bg-white p-4 shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
            <div className={`flex flex-col gap-3 lg:items-center lg:justify-between ${isRTL ? "lg:flex-row-reverse" : "lg:flex-row"}`}>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t.search}
                aria-label={t.search}
                className="min-h-11 flex-1 rounded-xl border border-[#ECECEC] bg-gray-50 px-4 text-sm font-semibold text-gray-800 outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928]"
              />
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
                  <button
                    key={value}
                    type="button"
                    aria-pressed={statusFilter === value}
                    onClick={() => setStatusFilter(value)}
                    className={`rounded-xl px-3 py-2 text-[11px] font-black uppercase tracking-wider transition focus-visible:outline-2 focus-visible:outline-[#9B7928] ${statusFilter === value ? "bg-[#101828] text-[#F4E7B6]" : "border border-[#ECECEC] bg-white text-[#667085] hover:border-[#D1AF47]/35"}`}
                  >
                    {label}
                  </button>
                ))}
                <select
                  value={sortMode}
                  aria-label={isRTL ? "ترتيب" : "Sort"}
                  onChange={(event) => setSortMode(event.target.value as typeof sortMode)}
                  className="rounded-xl border border-[#ECECEC] bg-white px-3 py-2 text-[11px] font-black uppercase tracking-wider text-[#667085] outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928]"
                >
                  <option value="recent">{t.sortRecent}</option>
                  <option value="revenue">{t.sortRevenue}</option>
                  <option value="rating">{t.sortRating}</option>
                </select>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[#ECECEC] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
            <div role="region" aria-label={t.title} tabIndex={0} className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-[#9B7928]">
              <table className="w-full min-w-[1040px] text-xs">
                <thead>
                  <tr className="border-b border-[#ECECEC] bg-gray-50/70 text-[11px] font-extrabold uppercase tracking-widest text-[#667085]">
                    {[t.provider, t.contact, t.applicationStatus, t.accountStatus, t.shopsManaged, t.revenue, t.rating, t.actions].map((heading) => (
                      <th key={heading} scope="col" className={`px-5 py-4 ${dirClass}`}>{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F5F5F5]">
                  {loading ? (
                    <tr><td colSpan={8} className="px-5 py-10 text-center text-sm font-bold text-[#667085]">{t.loading}</td></tr>
                  ) : filteredProviders.length === 0 ? (
                    <tr><td colSpan={8} className="px-5 py-12 text-center text-sm font-bold text-[#667085]">{providers.length === 0 ? (error ? t.loadFailed : t.noProviders) : t.noMatches}</td></tr>
                  ) : filteredProviders.map((provider) => (
                    <tr key={provider.id} className="text-[#344054] hover:bg-gray-50/60">
                      <td className="px-5 py-4">
                        <p className="font-black text-gray-900">{displayProviderName(provider)}</p>
                        <p className="mt-1 text-[11px] font-semibold text-[#667085]">{isRTL ? provider.businessNameEn : provider.businessNameAr}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-bold">{provider.contactEmail || t.notProvided}</p>
                        <p className="mt-1 text-[11px] font-semibold text-[#667085]">{provider.contactPhone || t.notProvided}</p>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-black uppercase ${provider.applicationStatus === "approved" ? "bg-[#ECFDF3] text-[#027A48]" : provider.applicationStatus === "rejected" ? "bg-[#FEF3F2] text-[#B42318]" : "bg-[#FFFAEB] text-[#B54708]"}`}>
                          {t[provider.applicationStatus]}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-black uppercase ${provider.accountStatus === "active" ? "bg-[#ECFDF3] text-[#027A48]" : provider.accountStatus === "suspended" ? "bg-[#FEF3F2] text-[#B42318]" : "bg-gray-100 text-[#667085]"}`}>
                          {t[provider.accountStatus]}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-black text-gray-900">{count(provider.shops.length)}</td>
                      <td className="px-5 py-4 font-black text-[#9A741F]">{provider.figures ? money(providerRevenue(provider)) : "—"}</td>
                      <td className="px-5 py-4 font-bold text-gray-900">{provider.figures ? stars(describeOutcomes(provider.figures).rating) : "—"}</td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" aria-label={`${t.view}: ${displayProviderName(provider)}`} onClick={() => setDetailId(provider.id)} className={`${actionButton} border border-[#ECECEC] text-gray-700 hover:border-[#D1AF47]/40`}>{t.view}</button>
                          <button type="button" aria-label={`${t.edit}: ${displayProviderName(provider)}`} onClick={() => openEdit(provider)} className={`${actionButton} border border-[#D1AF47]/30 bg-[#D1AF47]/10 text-[#9A741F]`}>{t.edit}</button>
                          {(provider.status === "pending" || provider.status === "rejected") && (
                            <button type="button" aria-label={`${t.approve}: ${displayProviderName(provider)}`} disabled={busyProviderId !== ""} onClick={() => changeStatus(provider, "active", t.approve)} className={`${actionButton} bg-[#101828] text-[#F4E7B6]`}>{t.approve}</button>
                          )}
                          {provider.status === "pending" && (
                            <button type="button" aria-label={`${t.reject}: ${displayProviderName(provider)}`} disabled={busyProviderId !== ""} onClick={() => changeStatus(provider, "rejected", t.reject)} className={`${actionButton} border border-[#FECDCA] bg-[#FEF3F2] text-[#B42318]`}>{t.reject}</button>
                          )}
                          {provider.status === "rejected" && (
                            <button type="button" aria-label={`${t.reopen}: ${displayProviderName(provider)}`} disabled={busyProviderId !== ""} onClick={() => changeStatus(provider, "pending", t.reopen)} className={`${actionButton} border border-[#ECECEC] text-[#667085]`}>{t.reopen}</button>
                          )}
                          {(provider.status === "active" || provider.status === "approved") && (
                            <button type="button" aria-label={`${t.suspend}: ${displayProviderName(provider)}`} disabled={busyProviderId !== ""} onClick={() => changeStatus(provider, "suspended", t.suspend)} className={`${actionButton} border border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]`}>{t.suspend}</button>
                          )}
                          {provider.status === "suspended" && (
                            <button type="button" aria-label={`${t.reactivate}: ${displayProviderName(provider)}`} disabled={busyProviderId !== ""} onClick={() => changeStatus(provider, "active", t.reactivate)} className={`${actionButton} border border-[#ABEFC6] bg-[#ECFDF3] text-[#027A48]`}>{t.reactivate}</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-6">
          {/* Applications Queue Header & Filter */}
          <div className="rounded-2xl border border-[#ECECEC] bg-white p-4 shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
            <div className={`flex flex-wrap items-center justify-between gap-3 ${rowDir}`}>
              <div className="flex flex-wrap items-center gap-2">
                {(["all", "pending", "approved", "rejected"] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    aria-pressed={appFilter === st}
                    onClick={() => setAppFilter(st)}
                    className={`rounded-xl px-3 py-2 text-[11px] font-black uppercase tracking-wider transition focus-visible:outline-2 focus-visible:outline-[#9B7928] ${
                      appFilter === st
                        ? "bg-[#101828] text-[#F4E7B6]"
                        : "border border-[#ECECEC] bg-white text-[#667085] hover:border-[#D1AF47]/35"
                    }`}
                  >
                    {t[st] || st}
                    {st === "pending" && applications.filter((a) => a.status === "pending").length > 0 && ` (${applications.filter((a) => a.status === "pending").length})`}
                  </button>
                ))}
              </div>
              <button
                onClick={() => void loadApplications()}
                className="rounded-xl border border-[#ECECEC] bg-white px-3 py-2 text-[11px] font-bold text-[#667085] hover:bg-gray-50"
              >
                {isRTL ? "تحديث الطلبات" : "Refresh Applications"}
              </button>
            </div>
          </div>

          {appsError && (
            <div role="alert" className="rounded-xl border border-[#FECDCA] bg-[#FEF3F2] px-4 py-3 text-xs font-bold text-[#B42318]">
              {fill(t.applicationsFailed, { reason: appsError })}
            </div>
          )}

          {/* Applications Table */}
          <div className="overflow-hidden rounded-2xl border border-[#ECECEC] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] text-xs">
                <thead>
                  <tr className="border-b border-[#ECECEC] bg-gray-50/70 text-[11px] font-extrabold uppercase tracking-widest text-[#667085]">
                    <th className={`px-5 py-4 ${dirClass}`}>{t.applicant}</th>
                    <th className={`px-5 py-4 ${dirClass}`}>{t.businessNameEn} / {t.businessNameAr}</th>
                    <th className={`px-5 py-4 ${dirClass}`}>{t.type}</th>
                    <th className={`px-5 py-4 ${dirClass}`}>{t.crNumber} / {t.taxNumber}</th>
                    <th className={`px-5 py-4 ${dirClass}`}>{t.contact}</th>
                    <th className={`px-5 py-4 ${dirClass}`}>{isRTL ? "الموقع والعنوان" : "Location"}</th>
                    <th className={`px-5 py-4 ${dirClass}`}>{t.tradeLicense}</th>
                    <th className={`px-5 py-4 ${dirClass}`}>{t.applicationStatus}</th>
                    <th className={`px-5 py-4 ${dirClass}`}>{t.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F5F5F5]">
                  {appsLoading ? (
                    <tr><td colSpan={9} className="px-5 py-10 text-center text-sm font-bold text-[#667085]">{t.loadingApplications}</td></tr>
                  ) : applications.filter((a) => appFilter === "all" || a.status === appFilter).length === 0 ? (
                    <tr><td colSpan={9} className="px-5 py-12 text-center text-sm font-bold text-[#667085]">{t.noApplications}</td></tr>
                  ) : (
                    applications.filter((a) => appFilter === "all" || a.status === appFilter).map((app) => (
                      <tr key={app.id} className="text-[#344054] hover:bg-gray-50/60">
                        <td className="px-5 py-4">
                          <p className="font-black text-gray-900">{app.first_name || ""} {app.last_name || ""}</p>
                          <p className="mt-1 text-[11px] text-[#667085]">{new Date(app.created_at).toLocaleDateString()}</p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-black text-gray-900">{isRTL ? app.business_name_ar || app.business_name_en : app.business_name_en || app.business_name_ar}</p>
                          <p className="mt-1 text-[11px] text-[#667085]">{isRTL ? app.business_name_en : app.business_name_ar}</p>
                        </td>
                        <td className="px-5 py-4">
                          <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[11px] font-bold uppercase">{app.business_type}</span>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-semibold text-gray-900">CR: {app.cr_number || "—"}</p>
                          <p className="mt-0.5 text-[11px] text-[#667085]">VAT: {app.tax_number || "—"}</p>
                          {app.cr_number ? (
                            <div className="mt-2 space-y-1">
                              <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-black ${crIsCleared(app) ? "bg-[#ECFDF3] text-[#027A48]" : "bg-[#FFFAEB] text-[#B54708]"}`}>
                                {crStatusLabel(app.cr_verification_status)}
                              </span>
                              {app.cr_check_data?.registered_name ? (
                                <p className="text-[11px] text-[#667085]">{isRTL ? "الاسم في واثق:" : "Wathq name:"} {app.cr_check_data.registered_name}</p>
                              ) : null}
                              {!crIsCleared(app) && (app.status === "pending" || app.status === "under_review") ? (
                                <div className="flex flex-wrap gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setCrDialog({ kind: "wathq", providerId: "", applicationId: app.id, cr: app.cr_number || "", name: app.business_name_en || app.business_name_ar })}
                                    className="rounded-lg bg-[#101828] px-2 py-1 text-[11px] font-black text-[#F4E7B6] hover:bg-black"
                                  >
                                    {isRTL ? "تحقق عبر واثق" : "Check with Wathq"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setCrDialog({ kind: "manual", providerId: "", applicationId: app.id, cr: app.cr_number || "", name: app.business_name_en || app.business_name_ar })}
                                    className="rounded-lg border border-gray-300 px-2 py-1 text-[11px] font-bold text-gray-800 hover:border-gray-500"
                                  >
                                    {isRTL ? "مراجعة يدوية" : "Manual review"}
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-bold text-gray-900">{app.contact_email}</p>
                          <p className="mt-0.5 text-[11px] text-[#667085]">{app.contact_phone}</p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-semibold text-gray-900">{app.city} · {app.district}</p>
                          <p className="mt-0.5 text-[11px] text-[#667085] truncate max-w-[180px]">{app.address_text}</p>
                        </td>
                        <td className="px-5 py-4">
                          {app.trade_license_url && app.trade_license_url !== "#" ? (
                            <a href={app.trade_license_url} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold text-[#D1AF47] hover:underline">
                              {isRTL ? "عرض الوثيقة" : "View Document"}
                            </a>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-black uppercase ${
                            app.status === "approved"
                              ? "bg-[#ECFDF3] text-[#027A48]"
                              : app.status === "rejected"
                              ? "bg-[#FEF3F2] text-[#B42318]"
                              : "bg-[#FFFAEB] text-[#B54708]"
                          }`}>
                            {app.status === "approved"
                              ? t.approved
                              : app.status === "rejected"
                              ? t.rejected
                              : t.pending}
                          </span>
                          {app.status === "rejected" && app.rejection_reason && (
                            <p className="mt-1 text-[11px] text-[#B42318] max-w-[140px] truncate" title={app.rejection_reason}>
                              {app.rejection_reason}
                            </p>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          {app.status === "pending" || app.status === "under_review" ? (
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => {
                                  setApprovalModalApp(app);
                                }}
                                className="rounded-xl bg-[#101828] px-3 py-1.5 text-[11px] font-black text-[#F4E7B6] hover:bg-black transition"
                              >
                                {t.approve}
                              </button>
                              <button
                                onClick={() => {
                                  setRejectionModalApp(app);
                                  setRejectionReason("");
                                }}
                                className="rounded-xl border border-[#FECDCA] bg-[#FEF3F2] px-3 py-1.5 text-[11px] font-black text-[#B42318] hover:bg-[#FEE4E2] transition"
                              >
                                {t.reject}
                              </button>
                            </div>
                          ) : app.status === "approved" ? (
                            <span className="text-[11px] font-bold text-[#027A48]">{isRTL ? "مفعل كشريك" : "Active Merchant"}</span>
                          ) : (
                            <span className="text-[11px] font-bold text-[#B42318]">{isRTL ? "مرفوض" : "Rejected"}</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {portalTarget && editing && createPortal(
        <ModalOverlay onClose={() => setEditing(null)} canClose={!savingEdit} className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#101828]/55 px-4 py-8 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="provider-edit-title" className="max-h-full w-full max-w-3xl overflow-y-auto rounded-[28px] border border-[#D1AF47]/25 bg-[#F9F7F1] p-6 shadow-2xl">
            <div className={`mb-5 flex items-center justify-between gap-4 ${rowDir}`}>
              <h3 id="provider-edit-title" className="font-serif text-2xl font-black text-gray-900">{t.edit}: {displayProviderName(editing)}</h3>
              <button type="button" onClick={() => setEditing(null)} className="rounded-full border border-[#ECECEC] px-3 py-1 text-xs font-black text-[#667085] focus-visible:outline-2 focus-visible:outline-[#9B7928]">{t.cancel}</button>
            </div>
            {draftError && (
              <div role="alert" className="mb-4 rounded-xl border border-[#FECDCA] bg-[#FEF3F2] px-4 py-3 text-xs font-bold text-[#B42318]">{draftError}</div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {([
                ["businessNameEn", t.businessNameEn, "text"],
                ["businessNameAr", t.businessNameAr, "text"],
                ["contactEmail", t.email, "email"],
                ["contactPhone", t.phone, "tel"],
                ["tradeLicenseUrl", t.tradeLicense, "url"],
              ] as const).map(([key, label, inputType]) => (
                <label key={key} className="space-y-2 text-[11px] font-black uppercase tracking-widest text-[#667085]">
                  {label}
                  <input
                    type={inputType}
                    dir={inputType === "text" ? undefined : "ltr"}
                    value={draft[key]}
                    onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
                    className="w-full rounded-2xl border border-[#ECECEC] bg-white px-4 py-3 text-sm normal-case tracking-normal text-gray-900 outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928]"
                  />
                </label>
              ))}
              <div className="space-y-2 text-[11px] font-black uppercase tracking-widest text-[#667085]">
                <span>{t.recordedCommission}</span>
                <div className="rounded-2xl border border-[#ECECEC] bg-gray-50 px-4 py-3 text-sm normal-case tracking-normal text-gray-900">
                  {editing.recordedCommission === null ? "—" : `${editing.recordedCommission.toLocaleString(numberFormat)}%`}
                </div>
                <div className="text-[11px] font-semibold normal-case tracking-normal text-[#667085]">{t.recordedCommissionNote}</div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setEditing(null)} className="rounded-xl border border-[#ECECEC] px-5 py-2.5 text-xs font-black text-[#667085] focus-visible:outline-2 focus-visible:outline-[#9B7928]">{t.cancel}</button>
              <button type="button" disabled={savingEdit} onClick={() => void saveEdit()} className="rounded-xl bg-[#D1AF47] px-5 py-2.5 text-xs font-black text-[#101828] hover:bg-[#E0C46A] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[#9B7928]">{savingEdit ? t.saving : t.save}</button>
            </div>
          </div>
        </ModalOverlay>,
        portalTarget
      )}

      {crDialog && (
        <CommandDialog
          locale={isRTL ? "ar" : "en"}
          title={crDialog.kind === "wathq" ? (isRTL ? "التحقق من السجل التجاري عبر واثق" : "Check the Commercial Registration with Wathq") : (isRTL ? "تسجيل مراجعة يدوية للسجل التجاري" : "Record a manual Commercial Registration review")}
          intro={crDialog.kind === "wathq"
            ? (isRTL ? "يُرسل الرقم إلى واثق، وتُسجَّل النتيجة كما أعادتها الخدمة." : "The number is sent to Wathq and the result is recorded as the service returns it.")
            : (isRTL ? "تُسجَّل كمراجعة يدوية ولا تُعدّ تأكيداً من واثق." : "Recorded as a manual review, never as a Wathq confirmation.")}
          facts={[{ label: t.provider, value: crDialog.name }]}
          field={{ label: isRTL ? "رقم السجل التجاري (10 أرقام)" : "Commercial Registration number (10 digits)", initial: crDialog.cr, pattern: /^\d{10}$/, error: isRTL ? "أدخل 10 أرقام." : "Enter exactly 10 digits.", ltr: true }}
          reasonLabel={isRTL ? "ما الذي تم التحقق منه؟ (المستند، تاريخ الانتهاء)" : "What did you check? (document reviewed, expiry date)"}
          reasonRequired={crDialog.kind === "manual"}
          confirmLabel={crDialog.kind === "wathq" ? (isRTL ? "التحقق عبر واثق" : "Check with Wathq") : (isRTL ? "تسجيل المراجعة" : "Record review")}
          onConfirm={async (reason, cr) => {
            const target = { providerId: crDialog.providerId, applicationId: crDialog.applicationId };
            if (crDialog.kind === "manual") return handleManualCrReview(target, cr, reason);
            await handleVerifyCr(target, cr);
            return null;
          }}
          onClose={() => setCrDialog(null)}
        />
      )}

      {statusPending && (
        <CommandDialog
          locale={isRTL ? "ar" : "en"}
          tone={statusPending.next === "suspended" || statusPending.next === "rejected" ? "danger" : "default"}
          title={fill(t.statusDialogTitle, { action: statusPending.actionLabel, name: displayProviderName(statusPending.provider) })}
          intro={statusPending.next === "suspended" || statusPending.next === "rejected" ? t.statusUpcomingWarning : undefined}
          facts={[
            { label: t.provider, value: displayProviderName(statusPending.provider) },
            { label: t.statusFactStatus, value: String(t[statusPending.provider.status as keyof typeof t] ?? statusPending.provider.status) },
            { label: t.statusFactShops, value: count(statusPending.provider.shops.length) },
          ]}
          reasonLabel={t.statusReasonLabel}
          confirmLabel={statusPending.actionLabel}
          onConfirm={(reason) => runStatusChange(statusPending.provider, statusPending.next, reason)}
          onClose={() => setStatusPending(null)}
        />
      )}

      {/* APPROVAL DIALOG */}
      {approvalModalApp && (
        <CommandDialog
          locale={isRTL ? "ar" : "en"}
          title={t.approveApplication}
          intro={isRTL
            ? "سيتم إنشاء سجل المزود والفرع الرئيسي وترقية حساب المستخدم إلى مالك مزود (provider_owner) وتوثيق العملية في سجل التدقيق الإداري."
            : "Approving this application will atomically create the provider record, main branch, upgrade user role to provider_owner, and log the action in the admin audit trail."}
          facts={[
            { label: t.applicant, value: [approvalModalApp.first_name, approvalModalApp.last_name].filter(Boolean).join(" ") || "—" },
            { label: t.businessNameEn, value: approvalModalApp.business_name_en },
            { label: t.businessNameAr, value: approvalModalApp.business_name_ar },
            { label: t.contact, value: approvalModalApp.contact_email || approvalModalApp.contact_phone || "—" },
            { label: "CR", value: approvalModalApp.cr_number || "—" },
            ...(approvalModalApp.cr_number ? [{ label: isRTL ? "حالة السجل التجاري" : "CR check", value: crStatusLabel(approvalModalApp.cr_verification_status) }] : []),
          ]}
          effects={[
            t.approvalFeeNote,
            ...(approvalModalApp.cr_number && !crIsCleared(approvalModalApp)
              ? [isRTL
                ? "السجل التجاري لم يُعتمد بعد: سترفض قاعدة البيانات الموافقة حتى يتم التحقق عبر واثق أو تسجيل مراجعة يدوية."
                : "The commercial registration is not cleared yet: the database refuses approval until it is verified with Wathq or manually reviewed."]
              : []),
          ]}
          reasonLabel={t.statusReasonLabel}
          confirmLabel={t.approve}
          onConfirm={(reason) => handleApproveApplication(approvalModalApp.id, reason)}
          onClose={() => setApprovalModalApp(null)}
        />
      )}

      {/* REJECTION MODAL */}
      {portalTarget && rejectionModalApp && createPortal(
        <ModalOverlay onClose={() => setRejectionModalApp(null)} canClose={!submittingAppAction} className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#101828]/55 px-4 py-8 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="provider-reject-title" tabIndex={-1} className="w-full max-w-lg rounded-[28px] border border-[#FECDCA] bg-white p-6 shadow-2xl">
            <div className={`mb-4 flex items-center justify-between gap-4 ${rowDir}`}>
              <div>
                <h3 id="provider-reject-title" className="font-serif text-xl font-black text-[#B42318]">{t.rejectApplication}</h3>
                <p className="mt-1 text-xs text-[#667085]">{rejectionModalApp.business_name_en} ({rejectionModalApp.business_name_ar})</p>
              </div>
              <button onClick={() => setRejectionModalApp(null)} className="rounded-full border border-[#ECECEC] px-3 py-1 text-xs font-black text-[#667085]">{t.cancel}</button>
            </div>
            <div className="space-y-4 py-2">
              <label className="block space-y-1 text-xs font-bold text-gray-700">
                <span>{t.rejectionReason} *</span>
                <textarea
                  data-autofocus
                  rows={3}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder={isRTL ? "وضح سبب عدم قبول الطلب (بيانات السجل التجاري غير متطابقة، إلخ)..." : "Specify rejection reason (e.g., CR document mismatch)..."}
                  className="w-full rounded-xl border border-[#ECECEC] bg-white px-4 py-2.5 text-xs text-gray-900 outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#B42318]"
                />
              </label>
            </div>
            <div className={`mt-6 flex justify-end gap-3 ${rowDir}`}>
              <button
                onClick={() => setRejectionModalApp(null)}
                className="rounded-xl border border-[#ECECEC] px-5 py-2.5 text-xs font-black text-[#667085]"
              >
                {t.cancel}
              </button>
              <button
                disabled={submittingAppAction || !rejectionReason.trim()}
                onClick={() => void handleRejectApplication(rejectionModalApp.id, rejectionReason)}
                className="rounded-xl bg-[#B42318] px-5 py-2.5 text-xs font-black text-white hover:bg-[#912018] transition disabled:opacity-50"
              >
                {submittingAppAction ? (isRTL ? "جاري الرفض..." : "Rejecting...") : t.reject}
              </button>
            </div>
          </div>
        </ModalOverlay>,
        portalTarget
      )}

      {portalTarget && detail && createPortal(
        <ModalOverlay onClose={() => setDetailId(null)} className="fixed inset-0 z-[9999] bg-[#101828]/45 backdrop-blur-sm">
          <aside role="dialog" aria-modal="true" aria-labelledby="provider-detail-title" className={`absolute top-0 bottom-0 ${isRTL ? "left-0" : "right-0"} flex w-full max-w-5xl flex-col overflow-hidden bg-[#F7F6F3] shadow-2xl`}>
            <div className={`flex items-start justify-between gap-4 border-b border-[#ECECEC] bg-white px-6 py-5 ${rowDir}`}>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#D1AF47]">{t.detailTitle}</p>
                <h3 id="provider-detail-title" className="mt-1 font-serif text-2xl font-black text-gray-900">{displayProviderName(detail)}</h3>
                <p className="mt-1 text-xs font-semibold text-[#667085]">{detail.contactEmail || t.notProvided} · {detail.contactPhone || t.notProvided}</p>
              </div>
              <button type="button" onClick={() => setDetailId(null)} className="rounded-full border border-[#ECECEC] px-3 py-1 text-xs font-black text-[#667085] focus-visible:outline-2 focus-visible:outline-[#9B7928]">{t.close}</button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-6">
              {(notice || error) && (
                <div role={error ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-xs font-bold ${error ? "border-[#FECDCA] bg-[#FEF3F2] text-[#B42318]" : "border-[#D1FADF] bg-[#ECFDF3] text-[#027A48]"}`}>
                  {error || notice}
                </div>
              )}
              {metricsError && (
                <div role="alert" className="rounded-xl border border-[#FEDF89] bg-[#FFFAEB] px-4 py-3 text-xs font-bold text-[#B54708]">
                  {fill(t.metricsFailed, { reason: metricsError })}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {[
                  [t.applicationStatus, t[detail.applicationStatus]],
                  [t.accountStatus, t[detail.accountStatus]],
                  [t.recordedCommission, detail.recordedCommission === null ? "—" : `${detail.recordedCommission.toLocaleString(numberFormat)}%`],
                ].map(([label, value]) => (
                  <div key={label} className={cardBase}>
                    <span className="text-[11px] font-black uppercase tracking-widest text-[#667085]">{label}</span>
                    <strong className="mt-2 block text-sm font-black text-gray-900">{value}</strong>
                  </div>
                ))}
              </div>
              <div className="-mt-2 text-[11px] font-semibold text-[#667085]">{t.recordedCommissionNote}</div>

              {/* Wathq CR Verification (G26) */}
              <div className="rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
                <div className={`flex flex-wrap items-center justify-between gap-4 ${rowDir}`}>
                  <div>
                    <span className="text-[11px] font-black uppercase tracking-widest text-[#D1AF47] block">
                      {isRTL ? "توثيق واثق (السجل التجاري السعودي)" : "Wathq Saudi CR Verification"}
                    </span>
                    <p className="mt-1 text-sm font-bold text-gray-900">
                      CR: {detail.crNumber || (isRTL ? "غير مسجل" : "Not Registered")}
                    </p>
                    <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider ${
                      detail.crVerificationStatus === "verified"
                        ? "bg-[#ECFDF3] text-[#027A48]"
                        : "bg-[#FFFAEB] text-[#B54708]"
                    }`}>
                      {detail.crVerificationStatus === "verified"
                        ? (isRTL ? "مؤكد عبر واثق" : "Confirmed by Wathq")
                        : detail.crVerificationStatus === "manually_reviewed"
                        ? (isRTL ? "مراجعة يدوية" : "Manually reviewed")
                        : detail.crVerificationStatus === "rejected"
                        ? (isRTL ? "غير قائم في واثق" : "Not active in Wathq")
                        : detail.crVerificationStatus === "name_mismatch"
                        ? (isRTL ? "الاسم لا يطابق واثق" : "Name differs from Wathq")
                        : (isRTL ? "غير موثق" : "Unverified")}
                    </span>
                  </div>
                  {detail.crVerificationStatus !== "verified" && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setCrDialog({ kind: "wathq", providerId: detail.id, cr: detail.crNumber || "", name: displayProviderName(detail) })}
                        className="px-4 py-2 rounded-xl bg-[#101828] text-[#F4E7B6] text-xs font-black hover:bg-black transition"
                      >
                        {isRTL ? "التحقق عبر واثق" : "Check with Wathq"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCrDialog({ kind: "manual", providerId: detail.id, cr: detail.crNumber || "", name: displayProviderName(detail) })}
                        className="px-4 py-2 rounded-xl border border-gray-300 text-gray-800 text-xs font-bold hover:border-gray-500 transition"
                      >
                        {isRTL ? "تسجيل مراجعة يدوية" : "Record manual review"}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Recorded performance: every figure comes from bookings, the ledger and published reviews */}
              <section className="rounded-[24px] border border-[#101828] bg-[#101828] p-5 text-white shadow-[0_18px_50px_rgba(16,24,40,0.25)]">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#E0C46A]">{t.performance}</p>
                {detail.figures && detailOutcomes ? (
                  <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                    {[
                      [t.revenue, money(detail.figures.revenue)],
                      [t.revenue30d, money(detail.figures.revenue30d)],
                      [t.commissionCharged, money(detail.figures.commissionAmount)],
                      [t.totalBookings, count(detail.figures.totalBookings)],
                      [t.completedRate, pct(detailOutcomes.completedRate)],
                      [t.cancellationRate, pct(detailOutcomes.cancellationRate)],
                      [t.rating, stars(detailOutcomes.rating)],
                      [t.reviews, count(detail.figures.reviewCount)],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-2xl bg-white/5 p-3">
                        <span className="text-[11px] font-black uppercase tracking-widest text-white/50">{label}</span>
                        <strong className="mt-1.5 block font-serif text-lg font-black text-white">{value}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl bg-white/5 p-4 text-sm font-semibold text-white/70">{t.metricsUnavailable}</div>
                )}
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {detail.figures && (
                    <div className="rounded-2xl bg-white/5 p-4">
                      <p className="text-[11px] font-black uppercase tracking-widest text-white/50">{t.financialSummary}</p>
                      <div className="mt-2 space-y-1.5 text-xs font-bold">
                        <div className={`flex items-center justify-between ${rowDir}`}><span className="text-white/60">{t.grossRevenue}</span><span>{money(detail.figures.revenue)}</span></div>
                        <div className={`flex items-center justify-between ${rowDir}`}><span className="text-white/60">{t.commissionCharged}</span><span className="text-[#E0C46A]">{money(detail.figures.commissionAmount)}</span></div>
                      </div>
                      <div className="mt-2 text-[11px] font-semibold text-white/50">{t.commissionChargedNote}</div>
                    </div>
                  )}
                  <label className="rounded-2xl bg-white/5 p-4">
                    <p className="text-[11px] font-black uppercase tracking-widest text-white/50">{t.adminNotes}</p>
                    <textarea value={notesDraft} onChange={(event) => setNotesEdit({ id: detail.id, text: event.target.value })} placeholder={t.adminNotesHint} rows={2} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0B1220] px-3 py-2 text-xs font-semibold text-white outline-2 outline-offset-2 outline-transparent placeholder:text-white/30 focus-visible:outline-[#E0C46A]" />
                    <button type="button" onClick={() => void saveNotes()} className="mt-2 rounded-lg bg-[#E0C46A] px-3 py-1.5 text-[11px] font-black text-[#101828] hover:brightness-105 focus-visible:outline-2 focus-visible:outline-white">{t.saveNotes}</button>
                  </label>
                </div>
              </section>

              <section className="rounded-[24px] border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
                <div className={`mb-4 flex items-center justify-between gap-3 ${rowDir}`}>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#D1AF47]">{t.employeeEarningsSummary}</p>
                    <div className="mt-1 text-xs font-semibold text-[#667085]">{t.employeeEarningsSource}</div>
                  </div>
                  <strong className="font-serif text-xl font-black text-gray-900">
                    {detailEmployeeEarnings.some((item) => item.employee.figures?.earnings === null)
                      ? "—"
                      : money(detailEmployeeEarnings.reduce((sum, item) => sum + (item.employee.figures?.earnings ?? 0), 0))}
                  </strong>
                </div>
                {detailEmployeeEarnings.length === 0 ? (
                  <div className="rounded-2xl border border-[#ECECEC] bg-[#FBFAF7] px-4 py-5 text-center text-xs font-bold text-[#667085]">{detail.shops.some((shop) => shop.employees.some((employee) => employee.figures === null)) ? t.metricsUnavailable : t.noEmployeeEarnings}</div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {detailEmployeeEarnings.map(({ employee, shop }) => (
                      <div key={employee.id} className="rounded-2xl border border-[#F0F0F0] bg-[#FBFAF7] p-4">
                        <p className="font-black text-gray-900">{displayEmployeeName(employee)}</p>
                        <p className="mt-1 text-[11px] font-bold text-[#667085]">{displayShopName(shop)}</p>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <div className="rounded-xl bg-white p-3">
                            <span className="block text-[8px] font-black uppercase tracking-wider text-[#667085]">{t.earnings}</span>
                            <strong className="mt-1 block text-xs font-black text-[#9A741F]">{employee.figures?.earnings === null || employee.figures?.earnings === undefined ? "—" : money(employee.figures.earnings)}</strong>
                          </div>
                          <div className="rounded-xl bg-white p-3">
                            <span className="block text-[8px] font-black uppercase tracking-wider text-[#667085]">{t.completed}</span>
                            <strong className="mt-1 block text-xs font-black text-gray-900">{count(employee.figures?.completedBookings ?? 0)}</strong>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <div className={`flex items-center justify-between gap-3 ${rowDir}`}>
                <h4 className="font-serif text-xl font-black text-gray-900">{t.shops}</h4>
              </div>

              {detail.shops.length === 0 && (
                <div className="rounded-2xl border border-[#ECECEC] bg-white px-4 py-6 text-center text-sm font-bold text-[#667085]">{t.noBranches}</div>
              )}

              {detail.shops.map((shop) => {
                const shopOutcomes = shop.figures ? describeOutcomes(shop.figures) : null;
                return (
                <section key={shop.id} className="rounded-[24px] border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
                  <div className={`mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between ${rowDir}`}>
                    <div>
                      <h5 className="font-serif text-lg font-black text-gray-900">{displayShopName(shop)}</h5>
                      <p className="mt-1 text-xs font-semibold text-[#667085]">{(isRTL ? shop.addressAr : shop.addressEn) || t.notProvided}</p>
                    </div>
                  </div>

                  {/* Per-branch figures */}
                  {shop.figures && shopOutcomes ? (
                    <div className="mb-5 grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-7">
                      {[
                        [t.revenue, money(shop.figures.revenue)],
                        [t.totalBookings, count(shop.figures.totalBookings)],
                        [t.completed, count(shop.figures.completedBookings)],
                        [t.cancelled, count(shop.figures.cancelledBookings + shop.figures.noShowBookings)],
                        [t.rating, stars(shopOutcomes.rating)],
                        [t.reviews, count(shop.figures.reviewCount)],
                        [t.profileCompletion, pct(profileCompletion(shop))],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-xl border border-[#F0F0F0] bg-[#FBFAF7] px-3 py-2">
                          <span className="block text-[8px] font-black uppercase tracking-wider text-[#667085]">{label}</span>
                          <strong className="mt-0.5 block text-xs font-black text-gray-900">{value}</strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mb-5 rounded-xl border border-[#F0F0F0] bg-[#FBFAF7] px-3 py-3 text-xs font-bold text-[#667085]">{t.metricsUnavailable}</div>
                  )}

                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                    <div className="rounded-2xl border border-[#F2F2F2] bg-gray-50/60 p-4">
                      <p className="mb-3 text-[11px] font-black uppercase tracking-widest text-[#667085]">{t.services}</p>
                      <div className="space-y-2">
                        {shop.services.map((service) => (
                          <div key={service.id} className={`flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 ${rowDir}`}>
                            <div>
                              <p className="text-xs font-black text-gray-900">{isRTL ? service.nameAr : service.nameEn}</p>
                              <p className="mt-0.5 text-[11px] font-semibold text-[#667085]">{(isRTL ? service.categoryAr : service.categoryEn) || "—"}</p>
                            </div>
                            <span className="text-xs font-black text-[#9A741F]">{money(service.price)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[#F2F2F2] bg-gray-50/60 p-4">
                      <p className="mb-3 text-[11px] font-black uppercase tracking-widest text-[#667085]">{t.employees}</p>
                      {shop.employees.length === 0 && <div className="text-xs font-bold text-[#667085]">{t.noEmployees}</div>}
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {shop.employees.map((employee) => {
                          const figures = employee.figures;
                          const outcomes = figures ? describeOutcomes(figures) : null;
                          return (
                          <div key={employee.id} className="rounded-2xl border border-[#ECECEC] bg-white p-4">
                            <div className={`flex items-start gap-3 ${rowDir}`}>
                              {employee.photoUrl ? (
                                // Photos are stored as links to storage we do not control, so next/image would need every host allow-listed.
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={employee.photoUrl} alt={displayEmployeeName(employee)} loading="lazy" className="h-12 w-12 shrink-0 rounded-2xl object-cover" />
                              ) : (
                                <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F4E7B6]/60 text-sm font-black text-[#7A5B12]">{initialsOf(displayEmployeeName(employee))}</span>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="font-black text-gray-900">{displayEmployeeName(employee)}</p>
                                <p className="text-[11px] font-bold text-[#667085]">{displayEmployeeRole(employee) || "—"}</p>
                              </div>
                            </div>
                            {figures && outcomes ? (
                              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                                {[
                                  [t.earnings, figures.earnings === null ? "—" : money(figures.earnings), "text-[#9A741F]"],
                                  [t.rating, stars(outcomes.rating), "text-gray-900"],
                                  [t.completed, count(figures.completedBookings), "text-gray-900"],
                                  [t.cancelled, count(figures.cancelledBookings), "text-gray-900"],
                                  [t.noShow, count(figures.noShowBookings), "text-gray-900"],
                                  [t.reviews, count(figures.reviewCount), "text-gray-900"],
                                  [t.avgServiceValue, outcomes.avgBookingValue === null ? "—" : money(outcomes.avgBookingValue), "text-gray-900"],
                                  [t.commission, money(figures.commissionAmount), "text-[#9A741F]"],
                                  [t.repeatCustomers, count(figures.repeatCustomers), "text-gray-900"],
                                ].map(([label, value, tone]) => (
                                  <div key={label} className="rounded-xl bg-gray-50 p-2"><span className="block text-[8px] font-black uppercase text-[#667085]">{label}</span><strong className={`text-[11px] ${tone}`}>{value}</strong></div>
                                ))}
                              </div>
                            ) : (
                              <div className="mt-3 text-[11px] font-bold text-[#667085]">{t.metricsUnavailable}</div>
                            )}
                            <p className="mt-3 text-[11px] font-bold text-[#667085]">{t.workType}: {labelWorkType(employee.workType)}</p>
                            <p className="mt-1 text-[11px] font-bold text-[#667085]">{t.availability}: {employee.isActive ? t.active : t.inactive}</p>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {(isRTL ? employee.assignedServiceNamesAr : employee.assignedServiceNamesEn).map((name) => (
                                <span key={name} className="rounded-full bg-[#F7F3E8] px-2 py-1 text-[11px] font-bold text-[#9A741F]">{name}</span>
                              ))}
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </section>
                );
              })}
            </div>
          </aside>
        </ModalOverlay>,
        portalTarget
      )}
    </div>
  );
}
