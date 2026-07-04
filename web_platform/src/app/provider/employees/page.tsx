"use client";

import React, { useCallback, useMemo, useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const translations = {
  en: {
    teamTitle: "Employees",
    subtitle: "Manage employees, service assignments, work types, availability, and performance",
    addStaff: "+ Add Employee",
    stylist: "Employee",
    title: "Title / Role",
    status: "Status",
    assignedServices: "Assigned Services",
    weeklyAvailability: "Weekly Availability",
    actions: "Actions",
    active: "Active",
    inactive: "Inactive",
    onBreak: "On Break",
    editShifts: "Edit Shifts",
    editServices: "Edit Services",
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
    saturday: "Saturday",
    sunday: "Sunday",
    totalStaff: "Total Employees",
    activeStaff: "Active Employees",
    breakStaff: "Inactive Staff"
  },
  ar: {
    teamTitle: "الموظفون",
    subtitle: "إدارة الموظفين وتعيين الخدمات ونوع العمل والمناوبات والأداء",
    addStaff: "+ إضافة موظف",
    stylist: "الموظف",
    title: "المسمى الوظيفي / الدور",
    status: "الحالة",
    assignedServices: "الخدمات المعينة",
    weeklyAvailability: "الدوام الأسبوعي",
    actions: "الإجراءات",
    active: "نشط",
    inactive: "غير نشط",
    onBreak: "في استراحة",
    editShifts: "تعديل المناوبات",
    editServices: "تعديل الخدمات",
    monday: "الاثنين",
    tuesday: "الثلاثاء",
    wednesday: "الأربعاء",
    thursday: "الخميس",
    friday: "الجمعة",
    saturday: "السبت",
    sunday: "الأحد",
    totalStaff: "إجمالي الأخصائيين",
    activeStaff: "على رأس العمل",
    breakStaff: "غير نشط"
  }
};

type StaffStatus = "active" | "inactive" | "break";
type WorkType = "remote" | "in_shop" | "both";

type StaffMember = {
  id: string;
  name: string;
  nameEn: string;
  nameAr: string;
  title: string;
  titleEn: string;
  titleAr: string;
  branchId: string;
  status: StaffStatus;
  statusLabel: string;
  servicesCount: number;
  avatar: string;
  photoUrl: string;
  phone: string;
  email: string;
  workType: WorkType;
  workTypeLabel: string;
  totalEarnings: number;
  rating: number;
  completedBookings: number;
  assignedServiceNames: string[];
  availability: string;
  serviceIds: string[];
  availabilityRows: ShiftRow[];
};

type StaffForm = {
  id: string;
  nameEn: string;
  nameAr: string;
  titleEn: string;
  titleAr: string;
  branchId: string;
  phone: string;
  email: string;
  photoUrl: string;
  workType: WorkType;
  isActive: boolean;
};

type BranchOption = {
  id: string;
  name: string;
};

type ServiceOption = {
  id: string;
  name: string;
  price: number;
};

type ShiftRow = {
  day: number;
  enabled: boolean;
  start: string;
  end: string;
};

const dayLabels = {
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  ar: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]
};

const defaultShiftRows = (): ShiftRow[] =>
  Array.from({ length: 7 }, (_, day) => ({
    day,
    enabled: day !== 5,
    start: "09:00",
    end: "21:00"
  }));

const employeePhotoPool = [
  "https://images.unsplash.com/photo-1560250097-0b93528c311a?q=80&w=400&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1618077360395-f3068be8e001?q=80&w=400&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=400&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=400&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1599566150163-29194dcaad36?q=80&w=400&auto=format&fit=crop"
];

const workTypeSequence: WorkType[] = ["in_shop", "remote", "both"];

const hashText = (value: string) =>
  value.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);

const demoProfileFor = (id: string, name: string, index: number, servicesCount: number) => {
  const hash = hashText(`${id}-${name}-${index}`);
  const normalizedName = (name || "employee")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "") || "employee";

  return {
    photoUrl: employeePhotoPool[hash % employeePhotoPool.length],
    phone: `+966 5${String(10000000 + (hash % 89999999)).slice(0, 8)}`,
    email: `${normalizedName}@primora.team`,
    workType: workTypeSequence[hash % workTypeSequence.length],
    totalEarnings: 6200 + (hash % 38) * 420 + servicesCount * 350,
    rating: Number((4.55 + (hash % 40) / 100).toFixed(1)),
    completedBookings: 42 + (hash % 76) + servicesCount * 4
  };
};

export default function ProviderEmployeesPage() {
  const [lang, setLang] = useState<"en" | "ar">("ar");

  useEffect(() => {
    const checkLang = () => {
      const currentLang = document.documentElement.lang as "en" | "ar";
      if (currentLang && currentLang !== lang) {
        setLang(currentLang);
      }
    };
    checkLang();
    const observer = new MutationObserver(checkLang);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, [lang]);

  const t = translations[lang];

  const teamCopy = lang === "ar" ? {
    loading: "جاري تحميل فريق العمل...",
    providerMissing: "لم يتم العثور على ملف مزود مرتبط بحسابك.",
    branchRequired: "أضف فرعا أولا قبل إضافة الموظفين.",
    loadFailed: "تعذر تحميل بيانات الفريق.",
    saveFailed: "تعذر حفظ بيانات الموظف.",
    servicesFailed: "تعذر حفظ الخدمات المعينة.",
    shiftsFailed: "تعذر حفظ المناوبات.",
    deleteFailed: "تعذر حذف الموظف أو تعطيله.",
    saved: "تم حفظ بيانات الموظف.",
    servicesSaved: "تم تحديث خدمات الموظف.",
    shiftsSaved: "تم تحديث المناوبات الأسبوعية.",
    deleted: "تم حذف الموظف.",
    deactivated: "لدى الموظف حجوزات مرتبطة، لذلك تم تعطيله بدلا من الحذف.",
    addStaffTitle: "إضافة موظف",
    editStaffTitle: "تعديل بيانات الموظف",
    servicesTitle: "تعيين الخدمات",
    shiftsTitle: "تعديل المناوبات",
    nameEn: "الاسم بالإنجليزية",
    nameAr: "الاسم بالعربية",
    titleEn: "المسمى بالإنجليزية",
    titleAr: "المسمى بالعربية",
    branch: "الفرع",
    activeEmployee: "موظف نشط",
    cancel: "إلغاء",
    save: "حفظ",
    saving: "جاري الحفظ...",
    delete: "حذف",
    editStaff: "تعديل الملف",
    noStaff: "لا يوجد موظفون بعد. أضف أول موظف وابدأ بتعيين الخدمات والمناوبات.",
    noServices: "لا توجد خدمات نشطة لتعيينها لهذا الموظف.",
    confirmDelete: "هل تريد حذف {name}؟ إذا كان لديه حجوزات سابقة سيتم تعطيله بدلا من الحذف.",
    required: "الاسم والفرع مطلوبان.",
    phone: "الهاتف",
    email: "البريد الإلكتروني",
    photoUrl: "رابط الصورة",
    workType: "نوع العمل",
    remote: "عن بعد",
    inShop: "داخل المحل",
    both: "عن بعد وداخل المحل",
    totalEarnings: "إجمالي أرباح الموظفين",
    completedBookings: "الحجوزات المكتملة",
    averageRating: "متوسط التقييم",
    bestPerformer: "أفضل موظف أداء",
    activeEmployees: "الموظفون النشطون",
    remoteEmployees: "موظفو العمل عن بعد",
    inShopEmployees: "موظفو المحل",
    earnings: "الأرباح",
    rating: "التقييم",
    bookings: "الحجوزات",
    view: "عرض",
    employeeDetails: "تفاصيل الموظف",
    contact: "التواصل",
    statusAndMode: "الحالة ونوع العمل",
    closed: "غير متاح"
  } : {
    loading: "Loading team roster...",
    providerMissing: "No provider profile is linked to your account.",
    branchRequired: "Add a branch before adding staff members.",
    loadFailed: "Failed to load team data.",
    saveFailed: "Failed to save staff member.",
    servicesFailed: "Failed to save assigned services.",
    shiftsFailed: "Failed to save weekly shifts.",
    deleteFailed: "Failed to delete or deactivate staff member.",
    saved: "Staff member saved.",
    servicesSaved: "Staff services updated.",
    shiftsSaved: "Weekly shifts updated.",
    deleted: "Staff member deleted.",
    deactivated: "This staff member has linked bookings, so they were deactivated instead of deleted.",
    addStaffTitle: "Add Staff Member",
    editStaffTitle: "Edit Staff Member",
    servicesTitle: "Assign Services",
    shiftsTitle: "Edit Weekly Shifts",
    nameEn: "English name",
    nameAr: "Arabic name",
    titleEn: "English title",
    titleAr: "Arabic title",
    branch: "Branch",
    activeEmployee: "Active employee",
    cancel: "Cancel",
    save: "Save",
    saving: "Saving...",
    delete: "Delete",
    editStaff: "Edit Profile",
    noStaff: "No staff members yet. Add the first specialist, then assign services and shifts.",
    noServices: "No active services are available to assign to this staff member.",
    confirmDelete: "Delete {name}? If they have previous bookings, the account will be deactivated instead.",
    required: "Name and branch are required.",
    phone: "Phone",
    email: "Email",
    photoUrl: "Photo URL",
    workType: "Work type",
    remote: "Remote",
    inShop: "In-shop",
    both: "Remote + in-shop",
    totalEarnings: "Employee earnings",
    completedBookings: "Completed bookings",
    averageRating: "Average rating",
    bestPerformer: "Best performer",
    activeEmployees: "Active employees",
    remoteEmployees: "Remote employees",
    inShopEmployees: "In-shop employees",
    earnings: "Earnings",
    rating: "Rating",
    bookings: "Bookings",
    view: "View",
    employeeDetails: "Employee details",
    contact: "Contact",
    statusAndMode: "Status & mode",
    closed: "Closed"
  };

  const makeStaffForm = (branchId = ""): StaffForm => ({
    id: "",
    nameEn: "",
    nameAr: "",
    titleEn: "Stylist",
    titleAr: "أخصائي",
    branchId,
    phone: "",
    email: "",
    photoUrl: "",
    workType: "in_shop",
    isActive: true
  });

  const [providerId, setProviderId] = useState("");
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [liveStaffMembers, setLiveStaffMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [servicesModalOpen, setServicesModalOpen] = useState(false);
  const [shiftsModalOpen, setShiftsModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [activeMember, setActiveMember] = useState<StaffMember | null>(null);
  const [staffForm, setStaffForm] = useState<StaffForm>(() => makeStaffForm(""));
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [shiftRows, setShiftRows] = useState<ShiftRow[]>(() => defaultShiftRows());

  const getWorkTypeLabel = useCallback((workType: WorkType) => {
    if (workType === "remote") return teamCopy.remote;
    if (workType === "both") return teamCopy.both;
    return teamCopy.inShop;
  }, [teamCopy.both, teamCopy.inShop, teamCopy.remote]);

  const summarizeAvailability = useCallback((rows: ShiftRow[]) => {
    const activeRows = rows.filter((row) => row.enabled);
    if (activeRows.length === 0) {
      return teamCopy.closed;
    }

    const first = activeRows[0];
    const last = activeRows[activeRows.length - 1];
    const labels = dayLabels[lang];
    return `${labels[first.day]} - ${labels[last.day]} (${first.start} - ${last.end})`;
  }, [lang, teamCopy.closed]);

  const normalizeStaffMember = useCallback((employee: any, index = 0, serviceOptions: ServiceOption[] = []): StaffMember => {
    const serviceIds = (employee.employee_services || [])
      .map((row: any) => row.service_id as string)
      .filter(Boolean);
    const savedAvailability = employee.employee_availability || [];
    const availabilityRows = defaultShiftRows().map((row) => {
      const savedRow = savedAvailability.find((item: any) => item.day_of_week === row.day);
      return savedRow ? {
        day: row.day,
        enabled: Boolean(savedRow.is_working_day),
        start: String(savedRow.start_time || row.start).slice(0, 5),
        end: String(savedRow.end_time || row.end).slice(0, 5)
      } : row;
    });
    const displayName = lang === "ar" ? employee.name_ar || employee.name_en : employee.name_en || employee.name_ar;
    const title = lang === "ar" ? employee.title_ar || employee.title_en : employee.title_en || employee.title_ar;
    const profile = demoProfileFor(employee.id || String(index), displayName || employee.name_en || "Staff", index, serviceIds.length);
    const assignedServiceNames = serviceOptions
      .filter((service) => serviceIds.includes(service.id))
      .map((service) => service.name);

    return {
      id: employee.id,
      name: displayName || "Staff",
      nameEn: employee.name_en || "",
      nameAr: employee.name_ar || employee.name_en || "",
      title: title || (lang === "ar" ? "أخصائي" : "Stylist"),
      titleEn: employee.title_en || "Stylist",
      titleAr: employee.title_ar || "أخصائي",
      branchId: employee.branch_id || "",
      status: employee.is_active ? "active" : "inactive",
      statusLabel: employee.is_active ? t.active : t.inactive,
      servicesCount: serviceIds.length,
      avatar: String(displayName || "S").trim().charAt(0).toUpperCase(),
      photoUrl: profile.photoUrl,
      phone: profile.phone,
      email: profile.email,
      workType: profile.workType,
      workTypeLabel: getWorkTypeLabel(profile.workType),
      totalEarnings: profile.totalEarnings,
      rating: profile.rating,
      completedBookings: profile.completedBookings,
      assignedServiceNames,
      availability: summarizeAvailability(availabilityRows),
      serviceIds,
      availabilityRows
    };
  }, [getWorkTypeLabel, lang, summarizeAvailability, t.active, t.inactive]);

  const loadTeamData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) {
        const message = userError.message || "";
        if (message.includes("Auth session missing")) {
          setProviderId("");
          setBranches([]);
          setServices([]);
          setLiveStaffMembers([]);
          return;
        }
        throw userError;
      }
      if (!user) {
        setProviderId("");
        setBranches([]);
        setServices([]);
        setLiveStaffMembers([]);
        return;
      }

      const { data: providerInfo, error: providerError } = await supabase
        .from("providers")
        .select("id")
        .eq("owner_id", user.id)
        .maybeSingle();

      if (providerError) throw providerError;
      if (!providerInfo) {
        setProviderId("");
        setBranches([]);
        setServices([]);
        setLiveStaffMembers([]);
        setError(teamCopy.providerMissing);
        return;
      }

      setProviderId(providerInfo.id);

      const [branchesResult, servicesResult] = await Promise.all([
        supabase
          .from("branches")
          .select("id, name_en, name_ar")
          .eq("provider_id", providerInfo.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("services")
          .select("id, name_en, name_ar, base_price, is_active")
          .eq("provider_id", providerInfo.id)
          .eq("is_active", true)
          .order("created_at", { ascending: true })
      ]);

      if (branchesResult.error) throw branchesResult.error;
      if (servicesResult.error) throw servicesResult.error;

      const normalizedBranches: BranchOption[] = (branchesResult.data || []).map((branch: any) => ({
        id: branch.id,
        name: lang === "ar" ? branch.name_ar || branch.name_en : branch.name_en || branch.name_ar
      }));
      const normalizedServices: ServiceOption[] = (servicesResult.data || []).map((service: any) => ({
        id: service.id,
        name: lang === "ar" ? service.name_ar || service.name_en : service.name_en || service.name_ar,
        price: Number(service.base_price || 0)
      }));

      setBranches(normalizedBranches);
      setServices(normalizedServices);

      const branchIds = normalizedBranches.map((branch) => branch.id);
      if (branchIds.length === 0) {
        setLiveStaffMembers([]);
        return;
      }

      const { data: staffData, error: staffError } = await supabase
        .from("employees")
        .select(`
          id,
          branch_id,
          name_en,
          name_ar,
          title_en,
          title_ar,
          is_active,
          employee_services ( service_id ),
          employee_availability ( day_of_week, start_time, end_time, is_working_day )
        `)
        .in("branch_id", branchIds)
        .order("created_at", { ascending: false });

      if (staffError) throw staffError;
      setLiveStaffMembers((staffData || []).map((employee, index) => normalizeStaffMember(employee, index, normalizedServices)));
    } catch (err) {
      console.error("Error loading team roster:", err);
      setError(teamCopy.loadFailed);
      setLiveStaffMembers([]);
    } finally {
      setLoading(false);
    }
  }, [lang, normalizeStaffMember, teamCopy.loadFailed, teamCopy.providerMissing]);

  useEffect(() => {
    void loadTeamData();
  }, [loadTeamData]);

  const openAddStaff = () => {
    setSuccess("");
    setError("");
    if (branches.length === 0) {
      setError(teamCopy.branchRequired);
      return;
    }
    setStaffForm(makeStaffForm(branches[0].id));
    setStaffModalOpen(true);
  };

  const openEditStaff = (member: StaffMember) => {
    setSuccess("");
    setError("");
    setStaffForm({
      id: member.id,
      nameEn: member.nameEn,
      nameAr: member.nameAr,
      titleEn: member.titleEn,
      titleAr: member.titleAr,
      branchId: member.branchId,
      phone: member.phone,
      email: member.email,
      photoUrl: member.photoUrl,
      workType: member.workType,
      isActive: member.status === "active"
    });
    setStaffModalOpen(true);
  };

  const openProfileModal = (member: StaffMember) => {
    setActiveMember(member);
    setProfileModalOpen(true);
  };

  const saveStaff = async () => {
    if (!staffForm.branchId || !staffForm.nameEn.trim() || !staffForm.nameAr.trim()) {
      setError(teamCopy.required);
      return;
    }

    try {
      setSaving(true);
      setError("");
      const payload = {
        branch_id: staffForm.branchId,
        name_en: staffForm.nameEn.trim(),
        name_ar: staffForm.nameAr.trim(),
        title_en: staffForm.titleEn.trim() || "Stylist",
        title_ar: staffForm.titleAr.trim() || "أخصائي",
        is_active: staffForm.isActive
      };

      const result = staffForm.id
        ? await supabase.from("employees").update(payload).eq("id", staffForm.id)
        : await supabase.from("employees").insert(payload);

      if (result.error) throw result.error;
      setSuccess(teamCopy.saved);
      setStaffModalOpen(false);
      await loadTeamData();
    } catch (err) {
      console.error("Error saving staff member:", err);
      setError(teamCopy.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const deleteStaff = async (member: StaffMember) => {
    const message = teamCopy.confirmDelete.replace("{name}", member.name);
    if (typeof window !== "undefined" && !window.confirm(message)) return;

    try {
      setSaving(true);
      setError("");
      setSuccess("");
      const { error: deleteError } = await supabase
        .from("employees")
        .delete()
        .eq("id", member.id);

      if (deleteError) {
        const { error: deactivateError } = await supabase
          .from("employees")
          .update({ is_active: false })
          .eq("id", member.id);
        if (deactivateError) throw deactivateError;
        setSuccess(teamCopy.deactivated);
      } else {
        setSuccess(teamCopy.deleted);
      }

      await loadTeamData();
    } catch (err) {
      console.error("Error deleting staff member:", err);
      setError(teamCopy.deleteFailed);
    } finally {
      setSaving(false);
    }
  };

  const openServicesModal = (member: StaffMember) => {
    setSuccess("");
    setError("");
    setActiveMember(member);
    setSelectedServiceIds(member.serviceIds);
    setServicesModalOpen(true);
  };

  const toggleServiceSelection = (serviceId: string) => {
    setSelectedServiceIds((current) =>
      current.includes(serviceId)
         ? current.filter((id) => id !== serviceId)
         : [...current, serviceId]
    );
  };

  const saveServiceAssignments = async () => {
    if (!activeMember) return;

    try {
      setSaving(true);
      setError("");
      const { error: deleteError } = await supabase
        .from("employee_services")
        .delete()
        .eq("employee_id", activeMember.id);
      if (deleteError) throw deleteError;

      if (selectedServiceIds.length > 0) {
        const rows = selectedServiceIds.map((serviceId) => ({
          employee_id: activeMember.id,
          service_id: serviceId
        }));
        const { error: insertError } = await supabase.from("employee_services").insert(rows);
        if (insertError) throw insertError;
      }

      setSuccess(teamCopy.servicesSaved);
      setServicesModalOpen(false);
      await loadTeamData();
    } catch (err) {
      console.error("Error saving service assignments:", err);
      setError(teamCopy.servicesFailed);
    } finally {
      setSaving(false);
    }
  };

  const openShiftsModal = (member: StaffMember) => {
    setSuccess("");
    setError("");
    setActiveMember(member);
    setShiftRows(member.availabilityRows);
    setShiftsModalOpen(true);
  };

  const updateShiftEnabled = (day: number, enabled: boolean) => {
    setShiftRows((rows) => rows.map((row) => row.day === day ? { ...row, enabled } : row));
  };

  const updateShiftTime = (day: number, field: "start" | "end", value: string) => {
    setShiftRows((rows) => rows.map((row) => row.day === day ? { ...row, [field]: value } : row));
  };

  const saveShifts = async () => {
    if (!activeMember) return;

    try {
      setSaving(true);
      setError("");
      const rows = shiftRows.map((row) => ({
        employee_id: activeMember.id,
        day_of_week: row.day,
        start_time: row.start,
        end_time: row.end,
        is_working_day: row.enabled
      }));

      const { error: shiftError } = await supabase
        .from("employee_availability")
        .upsert(rows, { onConflict: "employee_id,day_of_week" });
      if (shiftError) throw shiftError;

      setSuccess(teamCopy.shiftsSaved);
      setShiftsModalOpen(false);
      await loadTeamData();
    } catch (err) {
      console.error("Error saving staff shifts:", err);
      setError(teamCopy.shiftsFailed);
    } finally {
      setSaving(false);
    }
  };

  const demoServiceOptions = useMemo<ServiceOption[]>(() => services.length > 0 ? services : [
    { id: "demo-classic", name: lang === "ar" ? "قص شعر كلاسيكي" : "Classic Haircut", price: 45 },
    { id: "demo-beard", name: lang === "ar" ? "تحديد اللحية" : "Beard Sculpt", price: 30 },
    { id: "demo-facial", name: lang === "ar" ? "تنظيف البشرة" : "Express Facial", price: 80 },
    { id: "demo-spa", name: lang === "ar" ? "حمام مغربي" : "Moroccan Bath", price: 90 }
  ], [lang, services]);

  const demoStaffMembers = useMemo(() => {
    const rows = [
      {
        id: "demo-omar",
        branch_id: "demo-branch",
        name_en: "Omar Khaled",
        name_ar: "عمر خالد",
        title_en: "Master Barber",
        title_ar: "حلاق خبير",
        is_active: true,
        employee_services: demoServiceOptions.slice(0, 3).map((service) => ({ service_id: service.id })),
        employee_availability: []
      },
      {
        id: "demo-yousef",
        branch_id: "demo-branch",
        name_en: "Yousef Adel",
        name_ar: "يوسف عادل",
        title_en: "Beard Specialist",
        title_ar: "أخصائي لحية",
        is_active: true,
        employee_services: demoServiceOptions.slice(0, 2).map((service) => ({ service_id: service.id })),
        employee_availability: []
      },
      {
        id: "demo-karim",
        branch_id: "demo-branch",
        name_en: "Karim Saad",
        name_ar: "كريم سعد",
        title_en: "Grooming Expert",
        title_ar: "خبير عناية",
        is_active: true,
        employee_services: demoServiceOptions.slice(1, 4).map((service) => ({ service_id: service.id })),
        employee_availability: []
      }
    ];

    return rows.map((employee, index) => normalizeStaffMember(employee, index, demoServiceOptions));
  }, [demoServiceOptions, normalizeStaffMember]);

  const staffMembers = loading || liveStaffMembers.length > 0 ? liveStaffMembers : demoStaffMembers;

  const employeeMetrics = useMemo(() => {
    const totalEarnings = staffMembers.reduce((sum, member) => sum + member.totalEarnings, 0);
    const completedBookings = staffMembers.reduce((sum, member) => sum + member.completedBookings, 0);
    const averageRating = staffMembers.length
      ? staffMembers.reduce((sum, member) => sum + member.rating, 0) / staffMembers.length
      : 0;
    const bestPerformer = staffMembers.reduce<StaffMember | null>((best, member) => {
      if (!best) return member;
      return member.totalEarnings + member.completedBookings * 40 > best.totalEarnings + best.completedBookings * 40 ? member : best;
    }, null);

    return {
      totalEarnings,
      completedBookings,
      averageRating,
      bestPerformer,
      activeEmployees: staffMembers.filter((member) => member.status === "active").length,
      remoteEmployees: staffMembers.filter((member) => member.workType === "remote" || member.workType === "both").length,
      inShopEmployees: staffMembers.filter((member) => member.workType === "in_shop" || member.workType === "both").length
    };
  }, [staffMembers]);

  const formatMoney = (value: number) => `${value.toLocaleString(lang === "ar" ? "ar-SA" : "en-US")} SAR`;

  return (
    <div className="space-y-8 text-start">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 pb-2">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-[#D1AF47] via-[#E0C46A] to-[#B8952E] bg-clip-text text-transparent">
            {t.teamTitle}
          </h2>
          <p className="text-sm text-[#344054] mt-2 max-w-xl leading-relaxed">
            {t.subtitle}
          </p>
        </div>
        <button onClick={openAddStaff} className="inline-flex items-center justify-center px-6 py-3 bg-[#D1AF47] hover:bg-[#E0C46A] active:scale-[0.98] text-[#070B12] font-bold text-sm rounded-xl transition-all duration-300 shadow-[0_0_20px_rgba(209,175,71,0.2)] hover:shadow-[0_0_25px_rgba(209,175,71,0.35)] self-start">
          <svg className="w-4 h-4 me-2" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {t.addStaff}
        </button>
      </div>

      {(loading || error || success) && (
        <div className={`rounded-2xl border px-5 py-4 text-sm font-semibold ${
          error
            ? "border-[#FEE4E2] bg-[#FEF3F2] text-[#EF4444]"
            : success
              ? "border-[#D1FADF] bg-[#ECFDF3] text-[#22C55E]"
              : "border-[#D1AF47]/20 bg-[#D1AF47]/10 text-[#D1AF47]"
        }`}>
          {error || success || teamCopy.loading}
        </div>
      )}

      {/* Employee Performance Dashboard */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
        {[
          { label: teamCopy.totalEarnings, value: formatMoney(employeeMetrics.totalEarnings), accent: "text-[#D1AF47]" },
          { label: teamCopy.completedBookings, value: employeeMetrics.completedBookings.toLocaleString(lang === "ar" ? "ar-SA" : "en-US"), accent: "text-[#101828]" },
          { label: teamCopy.averageRating, value: employeeMetrics.averageRating.toFixed(1), accent: "text-[#22C55E]" },
          { label: teamCopy.bestPerformer, value: employeeMetrics.bestPerformer?.name || "—", accent: "text-[#9A741F]" },
          { label: teamCopy.activeEmployees, value: employeeMetrics.activeEmployees.toLocaleString(lang === "ar" ? "ar-SA" : "en-US"), accent: "text-[#22C55E]" },
          { label: teamCopy.remoteEmployees, value: employeeMetrics.remoteEmployees.toLocaleString(lang === "ar" ? "ar-SA" : "en-US"), accent: "text-[#344054]" },
          { label: teamCopy.inShopEmployees, value: employeeMetrics.inShopEmployees.toLocaleString(lang === "ar" ? "ar-SA" : "en-US"), accent: "text-[#D1AF47]" }
        ].map((metric) => (
          <div key={metric.label} className="group relative overflow-hidden rounded-[24px] border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#D1AF47]/35 hover:shadow-[0_12px_40px_rgba(0,0,0,0.035)]">
            <div className="relative space-y-2">
              <span className="block text-[9px] font-black uppercase tracking-[0.18em] text-[#667085]">{metric.label}</span>
              <strong className={`block truncate text-2xl font-black ${metric.accent}`}>{metric.value}</strong>
            </div>
          </div>
        ))}
      </div>

      {/* Roster Layout (Grid of Premium Cards) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4">
        {!loading && staffMembers.length === 0 && (
          <div className="md:col-span-2 lg:col-span-3 rounded-[24px] bg-white border border-[#ECECEC] p-8 text-center text-sm text-[#667085] shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
            {teamCopy.noStaff}
          </div>
        )}
        {staffMembers.map((member) => {
          const isActive = member.status === "active";
          const isBreak = member.status === "break";
          
          let statusBadgeClass = "";
          let dotColorClass = "";
          let hoverBorderClass = "";
          
          if (isActive) {
            statusBadgeClass = "bg-[#ECFDF3] text-[#22C55E] border border-[#D1FADF]";
            dotColorClass = "bg-[#22C55E]";
            hoverBorderClass = "hover:border-[#22C55E]/30";
          } else if (isBreak) {
            statusBadgeClass = "bg-[#FFF9E6] text-[#F5B041] border border-[#FFE8A3]";
            dotColorClass = "bg-[#F5B041]";
            hoverBorderClass = "hover:border-[#F5B041]/30";
          } else {
            statusBadgeClass = "bg-[#FEF3F2] text-[#EF4444] border border-[#FEE4E2]";
            dotColorClass = "bg-[#EF4444]";
            hoverBorderClass = "hover:border-[#EF4444]/30";
          }

          return (
            <div
              key={member.id}
              className={`group relative rounded-[24px] bg-white border border-[#ECECEC] ${hoverBorderClass} p-6 flex flex-col justify-between transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.035)] hover:-translate-y-1 overflow-hidden`}
            >
              <div>
                {/* Card Top Header: Avatar, Name, Status */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="relative flex-shrink-0">
                      <div className="relative w-14 h-14 overflow-hidden rounded-full bg-white border-2 border-[#D1AF47]/30 flex items-center justify-center text-[#D1AF47] font-bold text-lg tracking-wider group-hover:border-[#D1AF47] transition-all duration-300">
                        <span>{member.avatar}</span>
                        <img
                          src={member.photoUrl}
                          alt={member.name}
                          className="absolute inset-0 h-full w-full object-cover"
                          onError={(event) => {
                            event.currentTarget.style.display = "none";
                          }}
                        />
                      </div>
                      {/* Avatar Status Dot */}
                      <span className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white ${dotColorClass} ${isActive ? "animate-pulse" : ""}`} />
                    </div>
                    
                    <div>
                      <h3 className="font-bold text-base text-[#101828] tracking-wide group-hover:text-[#D1AF47] transition-colors duration-300">
                        {member.name}
                      </h3>
                      <p className="text-xs text-[#667085] mt-0.5 font-medium leading-tight">
                        {member.title}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-[#D1AF47]/20 bg-[#D1AF47]/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#D1AF47]">
                          {member.workTypeLabel}
                        </span>
                        <span className="text-[10px] font-semibold text-[#667085]">{member.phone}</span>
                      </div>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusBadgeClass}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${dotColorClass} ${isActive ? "animate-pulse" : ""}`} />
                    {member.statusLabel}
                  </span>
                </div>

                {/* Divider */}
                <div className="h-[1px] bg-[#ECECEC] my-5" />

                {/* Details Section */}
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-2xl border border-[#ECECEC] bg-[#F9FAFB] p-3">
                      <span className="block text-[9px] font-black uppercase tracking-widest text-[#667085]">{teamCopy.earnings}</span>
                      <strong className="mt-1 block text-xs font-black text-[#D1AF47]">{formatMoney(member.totalEarnings)}</strong>
                    </div>
                    <div className="rounded-2xl border border-[#ECECEC] bg-[#F9FAFB] p-3">
                      <span className="block text-[9px] font-black uppercase tracking-widest text-[#667085]">{teamCopy.rating}</span>
                      <strong className="mt-1 block text-xs font-black text-[#22C55E]">★ {member.rating.toFixed(1)}</strong>
                    </div>
                    <div className="rounded-2xl border border-[#ECECEC] bg-[#F9FAFB] p-3">
                      <span className="block text-[9px] font-black uppercase tracking-widest text-[#667085]">{teamCopy.bookings}</span>
                      <strong className="mt-1 block text-xs font-black text-[#101828]">{member.completedBookings}</strong>
                    </div>
                  </div>

                  {/* Assigned Services */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-[#667085]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.121 14.121L19 19m-4.879-4.879l-4.121-4.12M14.121 14.121A3 3 0 1017.5 17.5a3 3 0 00-3.379-3.379zm-7 0A3 3 0 103 17.5a3 3 0 005.121-2.121l4.12-4.121m-4.12 4.121a3 3 0 11-3.38-3.38 3 3 0 013.38 3.38zm0-7a3 3 0 105.121-2.121L19 19m-9.879-9.879a3 3 0 00-3.379-3.379A3 3 0 003 9v.121m7 0A3 3 0 1010.5 3a3 3 0 00-3.379 3.379" />
                        </svg>
                        <span className="text-xs text-[#344054] font-medium">{t.assignedServices}</span>
                      </div>
                      <span className="text-xs text-[#101828] font-extrabold bg-[#F9FAFB] border border-[#ECECEC] px-2.5 py-1 rounded-lg">
                        {member.servicesCount}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(member.assignedServiceNames.length ? member.assignedServiceNames : [teamCopy.noServices]).slice(0, 3).map((serviceName) => (
                        <span key={serviceName} className="rounded-full border border-[#ECECEC] bg-[#F3F4F6] px-2.5 py-1 text-[10px] font-bold text-[#344054]">
                          {serviceName}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-2xl border border-[#ECECEC] bg-[#F9FAFB] px-3 py-2">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-[#667085]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      <span className="text-xs text-[#344054] font-medium">{teamCopy.email}</span>
                    </div>
                    <span className="max-w-[170px] truncate text-xs font-bold text-[#101828]">{member.email}</span>
                  </div>

                  {/* Availability */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-[#667085]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-xs text-[#344054] font-medium">{t.weeklyAvailability}</span>
                    </div>
                    <div className="text-xs text-[#344054] bg-[#F9FAFB] rounded-xl p-3 border border-[#ECECEC] font-medium leading-relaxed">
                      {member.availability}
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="mt-6 pt-5 border-t border-[#ECECEC] grid grid-cols-2 gap-3">
                <button onClick={() => openProfileModal(member)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-white border border-[#ECECEC] hover:border-[#D1AF47]/40 hover:bg-gray-50 rounded-xl text-xs font-semibold text-[#344054] hover:text-[#101828] transition-all duration-300 shadow-[0_4px_12px_rgba(0,0,0,0.02)]">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.269 2.943 9.542 7-1.273 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  {teamCopy.view}
                </button>
                <button onClick={() => openEditStaff(member)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-white border border-[#ECECEC] hover:border-[#D1AF47]/40 hover:bg-gray-50 rounded-xl text-xs font-semibold text-[#344054] hover:text-[#101828] transition-all duration-300 shadow-[0_4px_12px_rgba(0,0,0,0.02)]">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.25a8.25 8.25 0 0115 0" />
                  </svg>
                  {teamCopy.editStaff}
                </button>
                <button onClick={() => openServicesModal(member)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-white border border-[#ECECEC] hover:border-[#D1AF47]/40 hover:bg-gray-50 rounded-xl text-xs font-semibold text-[#344054] hover:text-[#101828] transition-all duration-300 shadow-[0_4px_12px_rgba(0,0,0,0.02)]">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.83 20.013a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                  </svg>
                  {t.editServices}
                </button>
                <button onClick={() => openShiftsModal(member)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-gradient-to-r from-[#D1AF47]/10 to-[#B8952E]/10 hover:from-[#D1AF47]/20 hover:to-[#B8952E]/20 border border-[#D1AF47]/20 hover:border-[#D1AF47]/50 rounded-xl text-xs font-semibold text-[#D1AF47] hover:text-[#D1AF47] transition-all duration-300">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  </svg>
                  {t.editShifts}
                </button>
                <button onClick={() => void deleteStaff(member)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-[#FEF3F2] hover:bg-[#FEE4E2] border border-[#FEE4E2] hover:border-[#FDA29B] rounded-xl text-xs font-semibold text-[#D92D20] hover:text-[#B42318] transition-all duration-300">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673A2.25 2.25 0 0115.916 21H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                  {teamCopy.delete}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {staffModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#101828]/40 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[28px] border border-[#ECECEC] bg-white p-6 shadow-[0_12px_40px_rgba(0,0,0,0.02)]">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-black text-[#101828]">
                  {staffForm.id ? teamCopy.editStaffTitle : teamCopy.addStaffTitle}
                </h3>
                <p className="mt-1 text-xs text-[#667085]">{t.subtitle}</p>
              </div>
              <button onClick={() => setStaffModalOpen(false)} className="rounded-full border border-[#ECECEC] px-3 py-1 text-xs font-bold text-[#344054] hover:border-[#D1AF47]/40 hover:text-[#D1AF47]">
                {teamCopy.cancel}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-xs font-bold uppercase tracking-wider text-[#667085]">
                {teamCopy.nameEn}
                <input value={staffForm.nameEn} onChange={(event) => setStaffForm((form) => ({ ...form, nameEn: event.target.value }))} className="w-full rounded-2xl border border-[#ECECEC] bg-[#F9FAFB] px-4 py-3 text-sm normal-case tracking-normal text-[#101828] outline-none focus:border-[#D1AF47]/60" />
              </label>
              <label className="space-y-2 text-xs font-bold uppercase tracking-wider text-[#667085]">
                {teamCopy.nameAr}
                <input value={staffForm.nameAr} onChange={(event) => setStaffForm((form) => ({ ...form, nameAr: event.target.value }))} className="w-full rounded-2xl border border-[#ECECEC] bg-[#F9FAFB] px-4 py-3 text-sm normal-case tracking-normal text-[#101828] outline-none focus:border-[#D1AF47]/60" />
              </label>
              <label className="space-y-2 text-xs font-bold uppercase tracking-wider text-[#667085]">
                {teamCopy.titleEn}
                <input value={staffForm.titleEn} onChange={(event) => setStaffForm((form) => ({ ...form, titleEn: event.target.value }))} className="w-full rounded-2xl border border-[#ECECEC] bg-[#F9FAFB] px-4 py-3 text-sm normal-case tracking-normal text-[#101828] outline-none focus:border-[#D1AF47]/60" />
              </label>
              <label className="space-y-2 text-xs font-bold uppercase tracking-wider text-[#667085]">
                {teamCopy.titleAr}
                <input value={staffForm.titleAr} onChange={(event) => setStaffForm((form) => ({ ...form, titleAr: event.target.value }))} className="w-full rounded-2xl border border-[#ECECEC] bg-[#F9FAFB] px-4 py-3 text-sm normal-case tracking-normal text-[#101828] outline-none focus:border-[#D1AF47]/60" />
              </label>
              <label className="space-y-2 text-xs font-bold uppercase tracking-wider text-[#667085]">
                {teamCopy.phone}
                <input value={staffForm.phone} onChange={(event) => setStaffForm((form) => ({ ...form, phone: event.target.value }))} className="w-full rounded-2xl border border-[#ECECEC] bg-[#F9FAFB] px-4 py-3 text-sm normal-case tracking-normal text-[#101828] outline-none focus:border-[#D1AF47]/60" />
              </label>
              <label className="space-y-2 text-xs font-bold uppercase tracking-wider text-[#667085]">
                {teamCopy.email}
                <input type="email" value={staffForm.email} onChange={(event) => setStaffForm((form) => ({ ...form, email: event.target.value }))} className="w-full rounded-2xl border border-[#ECECEC] bg-[#F9FAFB] px-4 py-3 text-sm normal-case tracking-normal text-[#101828] outline-none focus:border-[#D1AF47]/60" />
              </label>
              <label className="space-y-2 text-xs font-bold uppercase tracking-wider text-[#667085]">
                {teamCopy.photoUrl}
                <input value={staffForm.photoUrl} onChange={(event) => setStaffForm((form) => ({ ...form, photoUrl: event.target.value }))} className="w-full rounded-2xl border border-[#ECECEC] bg-[#F9FAFB] px-4 py-3 text-sm normal-case tracking-normal text-[#101828] outline-none focus:border-[#D1AF47]/60" />
              </label>
              <label className="space-y-2 text-xs font-bold uppercase tracking-wider text-[#667085]">
                {teamCopy.workType}
                <select value={staffForm.workType} onChange={(event) => setStaffForm((form) => ({ ...form, workType: event.target.value as WorkType }))} className="w-full rounded-2xl border border-[#ECECEC] bg-[#F9FAFB] px-4 py-3 text-sm normal-case tracking-normal text-[#101828] outline-none focus:border-[#D1AF47]/60">
                  <option value="in_shop" className="bg-white text-[#101828]">{teamCopy.inShop}</option>
                  <option value="remote" className="bg-white text-[#101828]">{teamCopy.remote}</option>
                  <option value="both" className="bg-white text-[#101828]">{teamCopy.both}</option>
                </select>
              </label>
              <label className="space-y-2 text-xs font-bold uppercase tracking-wider text-[#667085] sm:col-span-2">
                {teamCopy.branch}
                <select value={staffForm.branchId} onChange={(event) => setStaffForm((form) => ({ ...form, branchId: event.target.value }))} className="w-full rounded-2xl border border-[#ECECEC] bg-[#F9FAFB] px-4 py-3 text-sm normal-case tracking-normal text-[#101828] outline-none focus:border-[#D1AF47]/60">
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id} className="bg-white text-[#101828]">{branch.name}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center justify-between rounded-2xl border border-[#ECECEC] bg-[#F9FAFB] px-4 py-3 text-sm font-bold text-[#344054] sm:col-span-2">
                {teamCopy.activeEmployee}
                <input type="checkbox" checked={staffForm.isActive} onChange={(event) => setStaffForm((form) => ({ ...form, isActive: event.target.checked }))} className="h-5 w-5 accent-[#D1AF47]" />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setStaffModalOpen(false)} className="rounded-xl border border-[#ECECEC] px-5 py-2.5 text-xs font-bold text-[#344054] hover:border-[#D1AF47]/40 hover:text-[#D1AF47]">
                {teamCopy.cancel}
              </button>
              <button onClick={() => void saveStaff()} disabled={saving} className="rounded-xl bg-[#D1AF47] px-5 py-2.5 text-xs font-black text-[#070B12] transition hover:bg-[#E0C46A] disabled:cursor-not-allowed disabled:opacity-60">
                {saving ? teamCopy.saving : teamCopy.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {profileModalOpen && activeMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#101828]/40 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-[28px] border border-[#ECECEC] bg-white shadow-[0_12px_40px_rgba(0,0,0,0.02)]">
            <div className="relative h-36 bg-gradient-to-br from-[#F4E7B6]/40 via-[#FDFBF7] to-[#F5EEE0] border-b border-[#ECECEC]">
              <button onClick={() => setProfileModalOpen(false)} className="absolute right-5 top-5 rounded-full border border-[#ECECEC] bg-white px-3 py-1 text-xs font-bold text-[#344054] hover:border-[#D1AF47]/40 hover:text-[#D1AF47]">
                {teamCopy.cancel}
              </button>
            </div>
            <div className="relative px-6 pb-6">
              <div className="-mt-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex items-end gap-4">
                  <div className="relative h-24 w-24 overflow-hidden rounded-[28px] border-2 border-[#D1AF47]/50 bg-white shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
                    <img src={activeMember.photoUrl} alt={activeMember.name} className="h-full w-full object-cover" />
                  </div>
                  <div className="pb-1">
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#D1AF47]">{teamCopy.employeeDetails}</p>
                    <h3 className="mt-1 text-2xl font-black text-[#101828]">{activeMember.name}</h3>
                    <p className="text-sm font-semibold text-[#344054]">{activeMember.title}</p>
                  </div>
                </div>
                <span className="rounded-full border border-[#D1AF47]/25 bg-[#D1AF47]/10 px-3 py-1 text-xs font-black text-[#D1AF47]">
                  {activeMember.workTypeLabel}
                </span>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-[#ECECEC] bg-[#F9FAFB] p-4">
                  <span className="text-[9px] font-black uppercase tracking-widest text-[#667085]">{teamCopy.earnings}</span>
                  <strong className="mt-2 block text-lg font-black text-[#D1AF47]">{formatMoney(activeMember.totalEarnings)}</strong>
                </div>
                <div className="rounded-2xl border border-[#ECECEC] bg-[#F9FAFB] p-4">
                  <span className="text-[9px] font-black uppercase tracking-widest text-[#667085]">{teamCopy.rating}</span>
                  <strong className="mt-2 block text-lg font-black text-[#22C55E]">★ {activeMember.rating.toFixed(1)}</strong>
                </div>
                <div className="rounded-2xl border border-[#ECECEC] bg-[#F9FAFB] p-4">
                  <span className="text-[9px] font-black uppercase tracking-widest text-[#667085]">{teamCopy.bookings}</span>
                  <strong className="mt-2 block text-lg font-black text-[#101828]">{activeMember.completedBookings}</strong>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-[#ECECEC] bg-[#F9FAFB] p-4">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.18em] text-[#667085]">{teamCopy.contact}</h4>
                  <p className="mt-3 text-sm font-bold text-[#101828]">{activeMember.phone}</p>
                  <p className="mt-1 text-xs font-semibold text-[#344054]">{activeMember.email}</p>
                </div>
                <div className="rounded-2xl border border-[#ECECEC] bg-[#F9FAFB] p-4">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.18em] text-[#667085]">{teamCopy.statusAndMode}</h4>
                  <p className="mt-3 text-sm font-bold text-[#101828]">{activeMember.statusLabel}</p>
                  <p className="mt-1 text-xs font-semibold text-[#344054]">{activeMember.workTypeLabel}</p>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-[#ECECEC] bg-[#F9FAFB] p-4">
                <h4 className="text-[10px] font-black uppercase tracking-[0.18em] text-[#667085]">{t.assignedServices}</h4>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(activeMember.assignedServiceNames.length ? activeMember.assignedServiceNames : [teamCopy.noServices]).map((serviceName) => (
                    <span key={serviceName} className="rounded-full border border-[#ECECEC] bg-[#F3F4F6] px-3 py-1 text-xs font-bold text-[#344054]">
                      {serviceName}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {servicesModalOpen && activeMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#101828]/40 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[28px] border border-[#ECECEC] bg-white p-6 shadow-[0_12px_40px_rgba(0,0,0,0.02)]">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-black text-[#101828]">{teamCopy.servicesTitle}</h3>
                <p className="mt-1 text-xs text-[#667085]">{activeMember.name}</p>
              </div>
              <button onClick={() => setServicesModalOpen(false)} className="rounded-full border border-[#ECECEC] px-3 py-1 text-xs font-bold text-[#344054] hover:border-[#D1AF47]/40 hover:text-[#D1AF47]">
                {teamCopy.cancel}
              </button>
            </div>

            <div className="max-h-[50vh] space-y-3 overflow-y-auto pe-1">
              {services.length === 0 && (
                <div className="rounded-2xl border border-[#ECECEC] bg-[#F9FAFB] p-4 text-sm text-[#344054]">
                  {teamCopy.noServices}
                </div>
              )}
              {services.map((service) => (
                <label key={service.id} className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-[#ECECEC] bg-[#F9FAFB] px-4 py-3 transition hover:border-[#D1AF47]/40">
                  <span>
                    <span className="block text-sm font-bold text-[#101828]">{service.name}</span>
                    <span className="text-xs font-semibold text-[#D1AF47]">{service.price} SAR</span>
                  </span>
                  <input type="checkbox" checked={selectedServiceIds.includes(service.id)} onChange={() => toggleServiceSelection(service.id)} className="h-5 w-5 accent-[#D1AF47]" />
                </label>
              ))}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setServicesModalOpen(false)} className="rounded-xl border border-[#ECECEC] px-5 py-2.5 text-xs font-bold text-[#344054] hover:border-[#D1AF47]/40 hover:text-[#D1AF47]">
                {teamCopy.cancel}
              </button>
              <button onClick={() => void saveServiceAssignments()} disabled={saving} className="rounded-xl bg-[#D1AF47] px-5 py-2.5 text-xs font-black text-[#070B12] transition hover:bg-[#E0C46A] disabled:cursor-not-allowed disabled:opacity-60">
                {saving ? teamCopy.saving : teamCopy.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {shiftsModalOpen && activeMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#101828]/40 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[28px] border border-[#ECECEC] bg-white p-6 shadow-[0_12px_40px_rgba(0,0,0,0.02)]">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-black text-[#101828]">{teamCopy.shiftsTitle}</h3>
                <p className="mt-1 text-xs text-[#667085]">{activeMember.name}</p>
              </div>
              <button onClick={() => setShiftsModalOpen(false)} className="rounded-full border border-[#ECECEC] px-3 py-1 text-xs font-bold text-[#344054] hover:border-[#D1AF47]/40 hover:text-[#D1AF47]">
                {teamCopy.cancel}
              </button>
            </div>

            <div className="max-h-[52vh] space-y-3 overflow-y-auto pe-1">
              {shiftRows.map((row) => (
                <div key={row.day} className="grid grid-cols-1 gap-3 rounded-2xl border border-[#ECECEC] bg-[#F9FAFB] p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                  <label className="flex items-center gap-3 text-sm font-bold text-[#101828]">
                    <input type="checkbox" checked={row.enabled} onChange={(event) => updateShiftEnabled(row.day, event.target.checked)} className="h-5 w-5 accent-[#D1AF47]" />
                    {dayLabels[lang][row.day]}
                  </label>
                  <input type="time" value={row.start} disabled={!row.enabled} onChange={(event) => updateShiftTime(row.day, "start", event.target.value)} className="rounded-xl border border-[#ECECEC] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.015)] px-3 py-2 text-sm text-[#101828] outline-none focus:border-[#D1AF47]/60 disabled:opacity-40" />
                  <input type="time" value={row.end} disabled={!row.enabled} onChange={(event) => updateShiftTime(row.day, "end", event.target.value)} className="rounded-xl border border-[#ECECEC] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.015)] px-3 py-2 text-sm text-[#101828] outline-none focus:border-[#D1AF47]/60 disabled:opacity-40" />
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShiftsModalOpen(false)} className="rounded-xl border border-[#ECECEC] px-5 py-2.5 text-xs font-bold text-[#344054] hover:border-[#D1AF47]/40 hover:text-[#D1AF47]">
                {teamCopy.cancel}
              </button>
              <button onClick={() => void saveShifts()} disabled={saving} className="rounded-xl bg-[#D1AF47] px-5 py-2.5 text-xs font-black text-[#070B12] transition hover:bg-[#E0C46A] disabled:cursor-not-allowed disabled:opacity-60">
                {saving ? teamCopy.saving : teamCopy.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
