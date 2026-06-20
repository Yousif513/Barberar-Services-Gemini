"use client";

import React, { useCallback, useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const translations = {
  en: {
    teamTitle: "Team & Staff Roster",
    subtitle: "Manage your beauty specialists, assign services, and edit weekly availability",
    addStaff: "+ Add Staff",
    stylist: "Stylist",
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
    totalStaff: "Total Specialists",
    activeStaff: "Active Duty",
    breakStaff: "Inactive Staff"
  },
  ar: {
    teamTitle: "فريق العمل والموظفين",
    subtitle: "إدارة أخصائيي التجميل وتعيين الخدمات وتعديل المناوبات الأسبوعية",
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

export default function ProviderTeamPage() {
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
    closed: "Closed"
  };

  const makeStaffForm = (branchId = ""): StaffForm => ({
    id: "",
    nameEn: "",
    nameAr: "",
    titleEn: "Stylist",
    titleAr: "أخصائي",
    branchId,
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
  const [activeMember, setActiveMember] = useState<StaffMember | null>(null);
  const [staffForm, setStaffForm] = useState<StaffForm>(() => makeStaffForm(""));
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [shiftRows, setShiftRows] = useState<ShiftRow[]>(() => defaultShiftRows());

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

  const normalizeStaffMember = useCallback((employee: any): StaffMember => {
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
      availability: summarizeAvailability(availabilityRows),
      serviceIds,
      availabilityRows
    };
  }, [lang, summarizeAvailability, t.active, t.inactive]);

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
      setLiveStaffMembers((staffData || []).map(normalizeStaffMember));
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
      isActive: member.status === "active"
    });
    setStaffModalOpen(true);
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

  const staffMembers = liveStaffMembers;

  const fallbackStaffMembers: StaffMember[] = [];
  void fallbackStaffMembers;
  /*
    {
      id: "1",
      name: "Ali Al-Harbi",
      title: lang === "ar" ? "أخصائي حلاقة شعر ورأس" : "Master Barber & Beard Stylist",
      status: "active",
      statusLabel: t.active,
      statusColor: "text-[hsl(150,60%,40%)] bg-[hsla(150,60%,40%,0.08)]",
      servicesCount: 6,
      avatar: "A",
      availability: lang === "ar" ? "السبت - الخميس (09:00 ص - 09:00 م)" : "Sat - Thu (09:00 AM - 09:00 PM)"
    },
    {
      id: "2",
      name: "Elena Rostova",
      title: lang === "ar" ? "أخصائية تسريح وصبغ الشعر" : "Senior Hair Stylist & Color Specialist",
      status: "break",
      statusLabel: t.onBreak,
      statusColor: "text-[hsl(45,60%,55%)] bg-[hsla(45,60%,55%,0.08)]",
      servicesCount: 8,
      avatar: "E",
      availability: lang === "ar" ? "السبت - الخميس (10:00 ص - 08:00 م)" : "Sat - Thu (10:00 AM - 08:00 PM)"
    },
    {
      id: "3",
      name: "Tariq Mahmood",
      title: lang === "ar" ? "مصفف شعر أطفال" : "Junior Groomer & Kids Barber",
      status: "active",
      statusLabel: t.active,
      statusColor: "text-[hsl(150,60%,40%)] bg-[hsla(150,60%,40%,0.08)]",
      servicesCount: 4,
      avatar: "T",
      availability: lang === "ar" ? "السبت - الخميس (01:00 م - 09:00 م)" : "Sat - Thu (01:00 PM - 09:00 PM)"
    }
  */

  return (
    <div className="space-y-8 text-start">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 pb-2">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-[#D1AF47] via-[#E0C46A] to-[#B8952E] bg-clip-text text-transparent">
            {t.teamTitle}
          </h2>
          <p className="text-sm text-[#B8C0D4] mt-2 max-w-xl leading-relaxed">
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
            ? "border-[#FF5D73]/25 bg-[#FF5D73]/10 text-[#FFB3BF]"
            : success
              ? "border-[#3DDC84]/25 bg-[#3DDC84]/10 text-[#9AF0BE]"
              : "border-[#D1AF47]/20 bg-[#D1AF47]/10 text-[#E0C46A]"
        }`}>
          {error || success || teamCopy.loading}
        </div>
      )}

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {/* Total Specialists Card */}
        <div className="group relative rounded-[24px] bg-gradient-to-b from-[#111827] to-[#0D1422] border border-[rgba(255,255,255,0.06)] hover:border-[#D1AF47]/20 p-6 flex items-center justify-between transition-all duration-300 shadow-xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-[#D1AF47]/[0.02] to-transparent pointer-events-none" />
          <div className="space-y-1 z-10">
            <span className="text-[10px] text-[#7B859C] font-bold tracking-wider uppercase">{t.totalStaff}</span>
            <div className="text-3xl font-black text-white">{staffMembers.length}</div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#D1AF47]/10 to-[#B8952E]/5 border border-[#D1AF47]/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 z-10">
            <svg className="w-6 h-6 text-[#D1AF47]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
          </div>
        </div>

        {/* Active Duty Card */}
        <div className="group relative rounded-[24px] bg-gradient-to-b from-[#111827] to-[#0D1422] border border-[rgba(255,255,255,0.06)] hover:border-[#3DDC84]/20 p-6 flex items-center justify-between transition-all duration-300 shadow-xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-[#3DDC84]/[0.01] to-transparent pointer-events-none" />
          <div className="space-y-1 z-10">
            <span className="text-[10px] text-[#7B859C] font-bold tracking-wider uppercase">{t.activeStaff}</span>
            <div className="text-3xl font-black text-[#3DDC84] flex items-center gap-2">
              {staffMembers.filter(m => m.status === 'active').length}
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3DDC84] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-[#3DDC84]"></span>
              </span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#3DDC84]/15 to-[#3DDC84]/5 border border-[#3DDC84]/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 z-10">
            <svg className="w-6 h-6 text-[#3DDC84]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>

        {/* On Break Card */}
        <div className="group relative rounded-[24px] bg-gradient-to-b from-[#111827] to-[#0D1422] border border-[rgba(255,255,255,0.06)] hover:border-[#F5B041]/20 p-6 flex items-center justify-between transition-all duration-300 shadow-xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-[#F5B041]/[0.01] to-transparent pointer-events-none" />
          <div className="space-y-1 z-10">
            <span className="text-[10px] text-[#7B859C] font-bold tracking-wider uppercase">{t.breakStaff}</span>
            <div className="text-3xl font-black text-[#F5B041]">
              {staffMembers.filter(m => m.status !== 'active').length}
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#F5B041]/15 to-[#F5B041]/5 border border-[#F5B041]/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 z-10">
            <svg className="w-6 h-6 text-[#F5B041]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
            </svg>
          </div>
        </div>
      </div>

      {/* Roster Layout (Grid of Premium Cards) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4">
        {!loading && staffMembers.length === 0 && (
          <div className="md:col-span-2 lg:col-span-3 rounded-[24px] bg-gradient-to-b from-[#111827] to-[#0D1422] border border-[#D1AF47]/15 p-8 text-center text-sm text-[#B8C0D4] shadow-[0_0_30px_rgba(209,175,71,0.08)]">
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
            statusBadgeClass = "bg-[#3DDC84]/10 text-[#3DDC84] border border-[#3DDC84]/20";
            dotColorClass = "bg-[#3DDC84]";
            hoverBorderClass = "hover:border-[#3DDC84]/30";
          } else if (isBreak) {
            statusBadgeClass = "bg-[#F5B041]/10 text-[#F5B041] border border-[#F5B041]/20";
            dotColorClass = "bg-[#F5B041]";
            hoverBorderClass = "hover:border-[#F5B041]/30";
          } else {
            statusBadgeClass = "bg-[#FF5D73]/10 text-[#FF5D73] border border-[#FF5D73]/20";
            dotColorClass = "bg-[#FF5D73]";
            hoverBorderClass = "hover:border-[#FF5D73]/30";
          }

          return (
            <div
              key={member.id}
              className={`group relative rounded-[24px] bg-gradient-to-b from-[#111827] to-[#0D1422] border border-[rgba(255,255,255,0.06)] ${hoverBorderClass} p-6 flex flex-col justify-between transition-all duration-300 hover:shadow-[0_0_30px_rgba(209,175,71,0.1)] hover:-translate-y-1 overflow-hidden`}
            >
              {/* Decorative subtle gold light inside the card */}
              <div className="absolute inset-0 bg-gradient-to-br from-[#D1AF47]/[0.02] to-transparent pointer-events-none" />
              
              <div>
                {/* Card Top Header: Avatar, Name, Status */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="relative flex-shrink-0">
                      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#1A2236] to-[#0D1422] border-2 border-[#D1AF47]/30 flex items-center justify-center text-[#D1AF47] font-bold text-lg tracking-wider group-hover:border-[#D1AF47] transition-all duration-300">
                        {member.avatar}
                      </div>
                      {/* Avatar Status Dot */}
                      <span className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-[#0D1422] ${dotColorClass} ${isActive ? "animate-pulse" : ""}`} />
                    </div>
                    
                    <div>
                      <h3 className="font-bold text-base text-white tracking-wide group-hover:text-[#D1AF47] transition-colors duration-300">
                        {member.name}
                      </h3>
                      <p className="text-xs text-[#7B859C] mt-0.5 font-medium leading-tight">
                        {member.title}
                      </p>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusBadgeClass}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${dotColorClass} ${isActive ? "animate-pulse" : ""}`} />
                    {member.statusLabel}
                  </span>
                </div>

                {/* Divider */}
                <div className="h-[1px] bg-[rgba(255,255,255,0.06)] my-5" />

                {/* Details Section */}
                <div className="space-y-4">
                  {/* Assigned Services */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-[#7B859C]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.121 14.121L19 19m-4.879-4.879l-4.121-4.12M14.121 14.121A3 3 0 1017.5 17.5a3 3 0 00-3.379-3.379zm-7 0A3 3 0 103 17.5a3 3 0 005.121-2.121l4.12-4.121m-4.12 4.121a3 3 0 11-3.38-3.38 3 3 0 013.38 3.38zm0-7a3 3 0 105.121-2.121L19 19m-9.879-9.879a3 3 0 00-3.379-3.379A3 3 0 003 9v.121m7 0A3 3 0 1010.5 3a3 3 0 00-3.379 3.379" />
                      </svg>
                      <span className="text-xs text-[#B8C0D4] font-medium">{t.assignedServices}</span>
                    </div>
                    <span className="text-xs text-white font-extrabold bg-[#172033] px-2.5 py-1 rounded-lg border border-[rgba(255,255,255,0.04)] shadow-inner">
                      {member.servicesCount}
                    </span>
                  </div>

                  {/* Availability */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-[#7B859C]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-xs text-[#B8C0D4] font-medium">{t.weeklyAvailability}</span>
                    </div>
                    <div className="text-xs text-[#B8C0D4] bg-[#070B12]/60 rounded-xl p-3 border border-[rgba(255,255,255,0.04)] font-medium leading-relaxed shadow-inner">
                      {member.availability}
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="mt-6 pt-5 border-t border-[rgba(255,255,255,0.06)] grid grid-cols-2 gap-3">
                <button onClick={() => openEditStaff(member)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-[#0D1422]/60 hover:bg-[#172033] border border-[rgba(255,255,255,0.06)] hover:border-[#D1AF47]/30 rounded-xl text-xs font-semibold text-[#B8C0D4] hover:text-white transition-all duration-300">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.25a8.25 8.25 0 0115 0" />
                  </svg>
                  {teamCopy.editStaff}
                </button>
                <button onClick={() => openServicesModal(member)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-[#0D1422]/60 hover:bg-[#172033] border border-[rgba(255,255,255,0.06)] hover:border-[#D1AF47]/30 rounded-xl text-xs font-semibold text-[#B8C0D4] hover:text-white transition-all duration-300">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.83 20.013a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                  </svg>
                  {t.editServices}
                </button>
                <button onClick={() => openShiftsModal(member)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-gradient-to-r from-[#D1AF47]/10 to-[#B8952E]/10 hover:from-[#D1AF47]/20 hover:to-[#B8952E]/20 border border-[#D1AF47]/20 hover:border-[#D1AF47]/50 rounded-xl text-xs font-semibold text-[#D1AF47] hover:text-[#E0C46A] transition-all duration-300">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  </svg>
                  {t.editShifts}
                </button>
                <button onClick={() => void deleteStaff(member)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-[#FF5D73]/10 hover:bg-[#FF5D73]/15 border border-[#FF5D73]/20 hover:border-[#FF5D73]/45 rounded-xl text-xs font-semibold text-[#FF9AAA] hover:text-[#FFC2CB] transition-all duration-300">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#070B12]/80 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[28px] border border-[#D1AF47]/20 bg-gradient-to-b from-[#111827] to-[#0D1422] p-6 shadow-[0_0_45px_rgba(209,175,71,0.16)]">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-black text-white">
                  {staffForm.id ? teamCopy.editStaffTitle : teamCopy.addStaffTitle}
                </h3>
                <p className="mt-1 text-xs text-[#7B859C]">{t.subtitle}</p>
              </div>
              <button onClick={() => setStaffModalOpen(false)} className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-[#B8C0D4] hover:border-[#D1AF47]/40 hover:text-[#D1AF47]">
                {teamCopy.cancel}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-xs font-bold uppercase tracking-wider text-[#7B859C]">
                {teamCopy.nameEn}
                <input value={staffForm.nameEn} onChange={(event) => setStaffForm((form) => ({ ...form, nameEn: event.target.value }))} className="w-full rounded-2xl border border-white/10 bg-[#070B12]/70 px-4 py-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[#D1AF47]/60" />
              </label>
              <label className="space-y-2 text-xs font-bold uppercase tracking-wider text-[#7B859C]">
                {teamCopy.nameAr}
                <input value={staffForm.nameAr} onChange={(event) => setStaffForm((form) => ({ ...form, nameAr: event.target.value }))} className="w-full rounded-2xl border border-white/10 bg-[#070B12]/70 px-4 py-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[#D1AF47]/60" />
              </label>
              <label className="space-y-2 text-xs font-bold uppercase tracking-wider text-[#7B859C]">
                {teamCopy.titleEn}
                <input value={staffForm.titleEn} onChange={(event) => setStaffForm((form) => ({ ...form, titleEn: event.target.value }))} className="w-full rounded-2xl border border-white/10 bg-[#070B12]/70 px-4 py-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[#D1AF47]/60" />
              </label>
              <label className="space-y-2 text-xs font-bold uppercase tracking-wider text-[#7B859C]">
                {teamCopy.titleAr}
                <input value={staffForm.titleAr} onChange={(event) => setStaffForm((form) => ({ ...form, titleAr: event.target.value }))} className="w-full rounded-2xl border border-white/10 bg-[#070B12]/70 px-4 py-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[#D1AF47]/60" />
              </label>
              <label className="space-y-2 text-xs font-bold uppercase tracking-wider text-[#7B859C] sm:col-span-2">
                {teamCopy.branch}
                <select value={staffForm.branchId} onChange={(event) => setStaffForm((form) => ({ ...form, branchId: event.target.value }))} className="w-full rounded-2xl border border-white/10 bg-[#070B12]/70 px-4 py-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[#D1AF47]/60">
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#070B12]/50 px-4 py-3 text-sm font-bold text-[#B8C0D4] sm:col-span-2">
                {teamCopy.activeEmployee}
                <input type="checkbox" checked={staffForm.isActive} onChange={(event) => setStaffForm((form) => ({ ...form, isActive: event.target.checked }))} className="h-5 w-5 accent-[#D1AF47]" />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setStaffModalOpen(false)} className="rounded-xl border border-white/10 px-5 py-2.5 text-xs font-bold text-[#B8C0D4] hover:border-[#D1AF47]/40 hover:text-[#D1AF47]">
                {teamCopy.cancel}
              </button>
              <button onClick={() => void saveStaff()} disabled={saving} className="rounded-xl bg-[#D1AF47] px-5 py-2.5 text-xs font-black text-[#070B12] transition hover:bg-[#E0C46A] disabled:cursor-not-allowed disabled:opacity-60">
                {saving ? teamCopy.saving : teamCopy.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {servicesModalOpen && activeMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#070B12]/80 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[28px] border border-[#D1AF47]/20 bg-gradient-to-b from-[#111827] to-[#0D1422] p-6 shadow-[0_0_45px_rgba(209,175,71,0.16)]">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-black text-white">{teamCopy.servicesTitle}</h3>
                <p className="mt-1 text-xs text-[#7B859C]">{activeMember.name}</p>
              </div>
              <button onClick={() => setServicesModalOpen(false)} className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-[#B8C0D4] hover:border-[#D1AF47]/40 hover:text-[#D1AF47]">
                {teamCopy.cancel}
              </button>
            </div>

            <div className="max-h-[50vh] space-y-3 overflow-y-auto pe-1">
              {services.length === 0 && (
                <div className="rounded-2xl border border-white/10 bg-[#070B12]/50 p-4 text-sm text-[#B8C0D4]">
                  {teamCopy.noServices}
                </div>
              )}
              {services.map((service) => (
                <label key={service.id} className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#070B12]/50 px-4 py-3 transition hover:border-[#D1AF47]/40">
                  <span>
                    <span className="block text-sm font-bold text-white">{service.name}</span>
                    <span className="text-xs font-semibold text-[#D1AF47]">{service.price} SAR</span>
                  </span>
                  <input type="checkbox" checked={selectedServiceIds.includes(service.id)} onChange={() => toggleServiceSelection(service.id)} className="h-5 w-5 accent-[#D1AF47]" />
                </label>
              ))}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setServicesModalOpen(false)} className="rounded-xl border border-white/10 px-5 py-2.5 text-xs font-bold text-[#B8C0D4] hover:border-[#D1AF47]/40 hover:text-[#D1AF47]">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#070B12]/80 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[28px] border border-[#D1AF47]/20 bg-gradient-to-b from-[#111827] to-[#0D1422] p-6 shadow-[0_0_45px_rgba(209,175,71,0.16)]">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-black text-white">{teamCopy.shiftsTitle}</h3>
                <p className="mt-1 text-xs text-[#7B859C]">{activeMember.name}</p>
              </div>
              <button onClick={() => setShiftsModalOpen(false)} className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-[#B8C0D4] hover:border-[#D1AF47]/40 hover:text-[#D1AF47]">
                {teamCopy.cancel}
              </button>
            </div>

            <div className="max-h-[52vh] space-y-3 overflow-y-auto pe-1">
              {shiftRows.map((row) => (
                <div key={row.day} className="grid grid-cols-1 gap-3 rounded-2xl border border-white/10 bg-[#070B12]/50 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                  <label className="flex items-center gap-3 text-sm font-bold text-white">
                    <input type="checkbox" checked={row.enabled} onChange={(event) => updateShiftEnabled(row.day, event.target.checked)} className="h-5 w-5 accent-[#D1AF47]" />
                    {dayLabels[lang][row.day]}
                  </label>
                  <input type="time" value={row.start} disabled={!row.enabled} onChange={(event) => updateShiftTime(row.day, "start", event.target.value)} className="rounded-xl border border-white/10 bg-[#0D1422] px-3 py-2 text-sm text-white outline-none focus:border-[#D1AF47]/60 disabled:opacity-40" />
                  <input type="time" value={row.end} disabled={!row.enabled} onChange={(event) => updateShiftTime(row.day, "end", event.target.value)} className="rounded-xl border border-white/10 bg-[#0D1422] px-3 py-2 text-sm text-white outline-none focus:border-[#D1AF47]/60 disabled:opacity-40" />
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShiftsModalOpen(false)} className="rounded-xl border border-white/10 px-5 py-2.5 text-xs font-bold text-[#B8C0D4] hover:border-[#D1AF47]/40 hover:text-[#D1AF47]">
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
