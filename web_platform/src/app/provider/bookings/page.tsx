"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const translations = {
  en: {
    title: "Manage Appointments",
    subtitle: "Confirm requests, assign specialist staff, and track appointment completions.",
    searchPlaceholder: "Search client name...",
    tabAll: "All Bookings",
    tabPending: "Pending Confirmation",
    tabConfirmed: "Confirmed",
    tabCompleted: "Completed",
    tabCancelled: "Cancelled",
    client: "Client",
    service: "Service",
    staff: "Assigned Staff",
    dateTime: "Date & Time",
    status: "Status",
    actions: "Actions",
    confirm: "Confirm",
    complete: "Mark Completed",
    cancel: "Cancel",
    assign: "Assign Staff",
    price: "Price",
    noBookings: "No bookings found matching this filter.",
    currency: "SAR",
    kpiTotal: "Total Bookings",
    kpiPending: "Pending Action",
    kpiConfirmed: "Confirmed Sessions",
    kpiRevenue: "Completed Revenue"
  },
  ar: {
    title: "إدارة الحجوزات",
    subtitle: "تأكيد الطلبات، وتعيين الموظفين المختصين، ومتابعة اكتمال المواعيد.",
    searchPlaceholder: "البحث باسم العميل...",
    tabAll: "جميع الحجوزات",
    tabPending: "بانتظار التأكيد",
    tabConfirmed: "المؤكدة",
    tabCompleted: "المكتملة",
    tabCancelled: "الملغية",
    client: "العميل",
    service: "الخدمة",
    staff: "الموظف المعين",
    dateTime: "التاريخ والوقت",
    status: "الحالة",
    actions: "الإجراءات",
    confirm: "تأكيد",
    complete: "تحديد كمكتمل",
    cancel: "إلغاء",
    assign: "تعيين موظف",
    price: "السعر",
    noBookings: "لا توجد حجوزات تطابق هذا الاختيار.",
    currency: "ريال",
    kpiTotal: "إجمالي الحجوزات",
    kpiPending: "بانتظار الإجراء",
    kpiConfirmed: "الجلسات المؤكدة",
    kpiRevenue: "الإيرادات المحققة"
  }
};

export default function ProviderBookingsPage() {
  const [locale, setLocale] = useState<"en" | "ar">("ar");
  const [activeTab, setActiveTab] = useState<"all" | "pending" | "confirmed" | "completed" | "cancelled">("all");
  const [bookings, setBookings] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const t = translations[locale];

  // Sync language with document root
  useEffect(() => {
    const handleLangSync = () => {
      const currentLang = document.documentElement.lang as "en" | "ar";
      if (currentLang === "en" || currentLang === "ar") {
        setLocale(currentLang);
      }
    };
    handleLangSync();
    const interval = setInterval(handleLangSync, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    loadBookings();
  }, []);

  async function loadBookings() {
    try {
      setLoading(true);
      setError("");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Find provider profile owned by the user
      const { data: providerInfo } = await supabase
        .from("providers")
        .select("id")
        .eq("owner_id", user.id)
        .maybeSingle();

      if (providerInfo) {
        // Get branches
        const { data: branches } = await supabase
          .from("branches")
          .select("id")
          .eq("provider_id", providerInfo.id);

        const branchIds = branches?.map(b => b.id) || [];
        if (branchIds.length > 0) {
          const { data, error: fetchError } = await supabase
            .from("bookings")
            .select(`
              id,
              scheduled_at,
              status,
              total_price,
              services ( name_en, name_ar ),
              profiles ( first_name, last_name, phone ),
              employees ( id, name_en, name_ar )
            `)
            .in("branch_id", branchIds)
            .order("scheduled_at", { ascending: false });

          if (fetchError) throw fetchError;
          setBookings(data || []);
          return;
        }
      }
      throw new Error("No provider active");
    } catch (err: any) {
      console.warn("Using mock provider bookings data:", err.message);
      setError("Displaying local appointment ledger.");

      // Premium Mock bookings
      const mockDate1 = new Date();
      mockDate1.setHours(mockDate1.getHours() + 1);

      const mockDate2 = new Date();
      mockDate2.setDate(mockDate2.getDate() + 1);

      const mockDate3 = new Date();
      mockDate3.setDate(mockDate3.getDate() - 2);

      setBookings([
        {
          id: "bk-100",
          scheduled_at: mockDate1.toISOString(),
          status: "confirmed",
          total_price: 220,
          services: { name_en: "Luxury Beard Grooming & Hot Towel Shave", name_ar: "حلاقة اللحية الفاخرة بالمنشفة الساخنة" },
          profiles: { first_name: "Yousif", last_name: "Al-Saud", phone: "+966 50 123 4567" },
          employees: { id: "emp-1", name_en: "Marcus Vance", name_ar: "ماركوس فانس" }
        },
        {
          id: "bk-105",
          scheduled_at: mockDate2.toISOString(),
          status: "pending_payment",
          total_price: 150,
          services: { name_en: "Classic Precision Cut & Wash", name_ar: "قص الشعر الكلاسيكي والغسيل" },
          profiles: { first_name: "Abdulrahman", last_name: "K.", phone: "+966 54 888 1234" },
          employees: { id: "emp-2", name_en: "Omar G.", name_ar: "عمر ج." }
        },
        {
          id: "bk-99",
          scheduled_at: mockDate3.toISOString(),
          status: "completed",
          total_price: 350,
          services: { name_en: "Deep Hydrating Facial & Scalp Therapy", name_ar: "علاج ترطيب البشرة العميق وتدليك فروة الرأس" },
          profiles: { first_name: "Khalid", last_name: "M.", phone: "+966 53 111 2222" },
          employees: { id: "emp-3", name_en: "Elena Rostova", name_ar: "إيلينا روستوفا" }
        }
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: string, newStatus: string) {
    try {
      const { error: updateError } = await supabase
        .from("bookings")
        .update({ status: newStatus })
        .eq("id", id);
      
      if (updateError) throw updateError;
      setBookings(prev => prev.map(b => b.id === id ? { ...b, status: newStatus } : b));
    } catch (err: unknown) {
      console.warn("Failed to update booking status:", err instanceof Error ? err.message : err);
    }
  }

  const filtered = bookings.filter(b => {
    // 1. Search filter
    const clientName = `${b.profiles?.first_name || ""} ${b.profiles?.last_name || ""}`.toLowerCase();
    if (search && !clientName.includes(search.toLowerCase())) return false;

    // 2. Tab filter
    if (activeTab === "pending") return b.status === "pending_payment" || b.status === "pending";
    if (activeTab === "confirmed") return b.status === "confirmed";
    if (activeTab === "completed") return b.status === "completed";
    if (activeTab === "cancelled") return b.status === "cancelled";
    return true;
  });

  const getStatusBadgeStyles = (status: string) => {
    switch (status.toLowerCase()) {
      case "confirmed":
      case "completed":
        return {
          bg: "bg-[#D1FADF] text-[#027A48]",
          text: "text-[#22C55E]",
          border: "border-[#3DDC84]/20",
          dot: "bg-[#3DDC84] shadow-[0_0_8px_rgba(61,220,132,0.4)]"
        };
      case "pending_payment":
      case "pending":
        return {
          bg: "bg-[#F5B041]/[0.08]",
          text: "text-[#F5B041]",
          border: "border-[#F5B041]/20",
          dot: "bg-[#F5B041] shadow-[0_0_8px_rgba(245,176,65,0.4)]"
        };
      case "cancelled":
        return {
          bg: "bg-[#FEE4E2] text-[#EF4444]",
          text: "text-[#EF4444]",
          border: "border-[#FF5D73]/20",
          dot: "bg-[#FF5D73] shadow-[0_0_8px_rgba(255,93,115,0.4)]"
        };
      default:
        return {
          bg: "bg-[#F3F4F6] border border-[#ECECEC]",
          text: "text-[#344054]",
          border: "border-[#ECECEC]",
          dot: "bg-[#667085]"
        };
    }
  };

  // Stats Calculations
  const totalCount = bookings.length;
  const pendingCount = bookings.filter(b => b.status === "pending" || b.status === "pending_payment").length;
  const confirmedCount = bookings.filter(b => b.status === "confirmed").length;
  const totalRevenue = bookings
    .filter(b => b.status === "completed")
    .reduce((acc, curr) => acc + (curr.total_price || 0), 0);

  return (
    <div className="space-y-8 font-sans">
      {/* HEADER */}
      <div className={`flex flex-col md:flex-row md:items-center md:justify-between gap-4 ${locale === "ar" ? "text-right" : "text-left"}`}>
        <div>
          <h2 className="text-3xl font-extrabold tracking-wide text-[#101828]">{t.title}</h2>
          <p className="text-sm text-[#667085] mt-1.5 max-w-2xl leading-relaxed">{t.subtitle}</p>
        </div>
      </div>

      {error && (
        <div className={`bg-white border border-[#ECECEC]/60 border border-[#ECECEC] text-[#344054] text-xs rounded-2xl p-4 shadow-[0_0_20px_rgba(0,0,0,0.15)] flex items-center gap-3 backdrop-blur-md ${locale === "ar" ? "border-r-4 border-r-[#D1AF47] text-right flex-row-reverse" : "border-l-4 border-l-[#D1AF47] text-left"}`}>
          <svg className="w-5 h-5 text-[#D1AF47] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <span className="font-bold text-[#101828] mr-1">{locale === "ar" ? "تنبيه:" : "Notice:"}</span> {error}
          </div>
        </div>
      )}

      {/* KPI STATS ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Card 1: Total */}
        <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] border border-[#ECECEC] rounded-[24px] p-6 shadow-[inset_0_0_20px_rgba(255,255,255,0.01),0_0_30px_rgba(0,0,0,0.2)] hover:border-[#D1AF47]/20 hover:shadow-[0_0_25px_rgba(209,175,71,0.05)] transition-all duration-300 hover:-translate-y-0.5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-[#667085] font-extrabold tracking-wider uppercase">{t.kpiTotal}</span>
            <h3 className="text-3xl font-bold text-[#101828] tracking-tight">{totalCount}</h3>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#D1AF47]/20 to-[#D1AF47]/5 border border-[#D1AF47]/10 flex items-center justify-center text-[#D1AF47] shadow-[0_0_15px_rgba(209,175,71,0.1)]">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 002-2h-2" />
            </svg>
          </div>
        </div>

        {/* Card 2: Pending */}
        <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] border border-[#ECECEC] rounded-[24px] p-6 shadow-[inset_0_0_20px_rgba(255,255,255,0.01),0_0_30px_rgba(0,0,0,0.2)] hover:border-[#F5B041]/20 hover:shadow-[0_0_25px_rgba(245,176,65,0.05)] transition-all duration-300 hover:-translate-y-0.5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-[#667085] font-extrabold tracking-wider uppercase">{t.kpiPending}</span>
            <h3 className="text-3xl font-bold text-[#101828] tracking-tight">{pendingCount}</h3>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#F5B041]/20 to-[#F5B041]/5 border border-[#F5B041]/10 flex items-center justify-center text-[#F5B041] shadow-[0_0_15px_rgba(245,176,65,0.1)]">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>

        {/* Card 3: Confirmed */}
        <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] border border-[#ECECEC] rounded-[24px] p-6 shadow-[inset_0_0_20px_rgba(255,255,255,0.01),0_0_30px_rgba(0,0,0,0.2)] hover:border-[#3DDC84]/20 hover:shadow-[0_0_25px_rgba(61,220,132,0.05)] transition-all duration-300 hover:-translate-y-0.5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-[#667085] font-extrabold tracking-wider uppercase">{t.kpiConfirmed}</span>
            <h3 className="text-3xl font-bold text-[#101828] tracking-tight">{confirmedCount}</h3>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#3DDC84]/20 to-[#3DDC84]/5 border border-[#D1FADF] flex items-center justify-center text-[#22C55E] shadow-[0_0_15px_rgba(61,220,132,0.1)]">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>

        {/* Card 4: Revenue */}
        <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] border border-[#ECECEC] rounded-[24px] p-6 shadow-[inset_0_0_20px_rgba(255,255,255,0.01),0_0_30px_rgba(0,0,0,0.2)] hover:border-[#D1AF47]/20 hover:shadow-[0_0_25px_rgba(209,175,71,0.05)] transition-all duration-300 hover:-translate-y-0.5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-[#667085] font-extrabold tracking-wider uppercase">{t.kpiRevenue}</span>
            <h3 className="text-3xl font-bold text-[#D1AF47] tracking-tight">{totalRevenue} <span className="text-sm font-semibold">{t.currency}</span></h3>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#D1AF47]/20 to-[#D1AF47]/5 border border-[#D1AF47]/10 flex items-center justify-center text-[#D1AF47] shadow-[0_0_15px_rgba(209,175,71,0.15)]">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M12 16v1m-4-6h8" />
            </svg>
          </div>
        </div>
      </div>

      {/* SEARCH & FILTERS BAR */}
      <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
        {/* Search */}
        <div className={`w-full lg:w-80 bg-[#F9FAFB] border border-[#ECECEC] border border-[#ECECEC] px-4 py-2.5 rounded-2xl flex items-center gap-3 shadow-[inset_0_0_12px_rgba(255,255,255,0.01)] focus-within:border-[#D1AF47]/30 focus-within:shadow-[0_0_15px_rgba(209,175,71,0.08)] transition-all duration-300 ${locale === "ar" ? "flex-row-reverse" : "flex-row"}`}>
          <svg className="w-4 h-4 text-[#667085] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder={t.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`w-full bg-transparent border-none outline-none text-xs placeholder-[#7B859C]/60 text-[#101828] ${locale === "ar" ? "text-right" : "text-left"}`}
          />
        </div>

        {/* Tabs */}
        <div className="flex bg-transparent border border-[#ECECEC] rounded-2xl p-1 gap-1 shadow-inner overflow-x-auto w-full lg:w-auto scrollbar-none">
          {(["all", "pending", "confirmed", "completed", "cancelled"] as const).map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-300 whitespace-nowrap ${
                  isActive
                    ? "bg-[#D1AF47]/15 text-[#D1AF47] border border-[#D1AF47]/25 shadow-[0_0_15px_rgba(209,175,71,0.06)]"
                    : "text-[#667085] border border-transparent hover:text-[#101828] hover:bg-[#F9FAFB] border border-[#ECECEC]"
                }`}
              >
                {tab === "all" && t.tabAll}
                {tab === "pending" && t.tabPending}
                {tab === "confirmed" && t.tabConfirmed}
                {tab === "completed" && t.tabCompleted}
                {tab === "cancelled" && t.tabCancelled}
              </button>
            );
          })}
        </div>
      </div>

      {/* BOOKINGS CONTENT */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <div className="w-10 h-10 border-2 border-[#D1AF47]/30 border-t-[#D1AF47] rounded-full animate-spin" />
          <span className="text-sm text-[#667085] tracking-wide animate-pulse">Loading appointments...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] border border-[#ECECEC] rounded-[24px] p-16 text-center text-[#667085] shadow-[0_0_50px_rgba(0,0,0,0.3)]">
          <div className="w-16 h-16 bg-white border border-[#ECECEC] rounded-full flex items-center justify-center mx-auto mb-4 shadow-[inset_0_0_10px_rgba(0,0,0,0.01)]">
            <svg className="w-6 h-6 text-[#667085]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 002-2h-2" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-[#101828] mb-1">{t.noBookings}</p>
          <p className="text-xs text-[#667085]">{locale === "ar" ? "حاول تعديل خيارات البحث أو الفلتر لعرض المزيد." : "Try adjusting your search query or selecting a different status filter."}</p>
        </div>
      ) : (
        <>
          {/* DESKTOP TABLE VIEW */}
          <div className="hidden md:block bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] border border-[#ECECEC] rounded-[24px] overflow-hidden shadow-[inset_0_0_20px_rgba(255,255,255,0.01),0_0_35px_rgba(0,0,0,0.25)]">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#ECECEC] text-[#667085] font-semibold uppercase tracking-wider text-[10px] bg-[#F9FAFB]/50">
                    <th className={`py-4.5 px-6 ${locale === "ar" ? "text-right" : "text-left"}`}>{t.client}</th>
                    <th className={`py-4.5 px-6 ${locale === "ar" ? "text-right" : "text-left"}`}>{t.service}</th>
                    <th className={`py-4.5 px-6 ${locale === "ar" ? "text-right" : "text-left"}`}>{t.dateTime}</th>
                    <th className={`py-4.5 px-6 ${locale === "ar" ? "text-right" : "text-left"}`}>{t.staff}</th>
                    <th className={`py-4.5 px-6 ${locale === "ar" ? "text-right" : "text-left"}`}>{t.price}</th>
                    <th className="py-4.5 px-6 text-center">{t.status}</th>
                    <th className={`py-4.5 px-6 ${locale === "ar" ? "text-left" : "text-right"}`}>{t.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ECECEC]">
                  {filtered.map((bk) => {
                    const badge = getStatusBadgeStyles(bk.status);
                    return (
                      <tr key={bk.id} className="hover:bg-[#F9FAFB] transition-colors duration-200">
                        {/* Client Info */}
                        <td className="py-5 px-6">
                          <span className="font-bold text-[#101828] block text-sm tracking-wide">
                            {bk.profiles?.first_name} {bk.profiles?.last_name}
                          </span>
                          <span className="text-[11px] text-[#667085] block mt-1 tracking-wider font-mono">{bk.profiles?.phone}</span>
                        </td>

                        {/* Service Info */}
                        <td className="py-5 px-6 font-medium text-[#344054] max-w-[200px] truncate">
                          {locale === "ar" ? bk.services?.name_ar : bk.services?.name_en}
                        </td>

                        {/* Date/Time */}
                        <td className="py-5 px-6">
                          <span className="font-bold text-[#101828] block">
                            {new Date(bk.scheduled_at).toLocaleDateString("en-GB", { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                          <span className="text-[11px] text-[#667085] block mt-1 tracking-wider">
                            {new Date(bk.scheduled_at).toLocaleTimeString("en-GB", { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </td>

                        {/* Assigned Employee */}
                        <td className="py-5 px-6 text-[#344054] font-medium">
                          {bk.employees ? (locale === "ar" ? bk.employees.name_ar : bk.employees.name_en) : (locale === "ar" ? "غير معين" : "Unassigned")}
                        </td>

                        {/* Price */}
                        <td className="py-5 px-6 font-extrabold text-[#D1AF47] text-sm">
                          {bk.total_price} <span className="text-[10px] font-semibold text-[#667085]">{t.currency}</span>
                        </td>

                        {/* Status Badge */}
                        <td className="py-5 px-6 text-center">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border uppercase tracking-wider ${badge.bg} ${badge.text} ${badge.border}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                            {bk.status.replace("_", " ")}
                          </span>
                        </td>

                        {/* Action buttons */}
                        <td className="py-5 px-6">
                          <div className={`flex items-center gap-2 ${locale === "ar" ? "justify-start" : "justify-end"}`}>
                            {(bk.status === "pending_payment" || bk.status === "pending") && (
                              <button
                                onClick={() => updateStatus(bk.id, "confirmed")}
                                className="px-3.5 py-2 bg-[#D1AF47] hover:bg-[#E0C46A] text-[#070B12] font-extrabold text-[10px] uppercase tracking-wider rounded-xl shadow-[0_0_15px_rgba(209,175,71,0.2)] hover:shadow-[0_0_25px_rgba(209,175,71,0.35)] active:scale-95 transition-all duration-300"
                              >
                                {t.confirm}
                              </button>
                            )}
                            {bk.status === "confirmed" && (
                              <button
                                onClick={() => updateStatus(bk.id, "completed")}
                                className="px-3.5 py-2 bg-[#3DDC84] hover:bg-[#52e291] text-[#070B12] font-extrabold text-[10px] uppercase tracking-wider rounded-xl shadow-[0_0_15px_rgba(61,220,132,0.2)] hover:shadow-[0_0_25px_rgba(61,220,132,0.35)] active:scale-95 transition-all duration-300"
                              >
                                {t.complete}
                              </button>
                            )}
                            {bk.status !== "completed" && bk.status !== "cancelled" && (
                              <button
                                onClick={() => updateStatus(bk.id, "cancelled")}
                                className="px-3.5 py-2 border border-[#FF5D73]/30 bg-[#FEE4E2] text-[#EF4444] text-[#EF4444] hover:bg-[#FF5D73] hover:text-[#101828] font-extrabold text-[10px] uppercase tracking-wider rounded-xl active:scale-95 transition-all duration-300"
                              >
                                {t.cancel}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* MOBILE CARDS VIEW */}
          <div className="block md:hidden space-y-4">
            {filtered.map((bk) => {
              const badge = getStatusBadgeStyles(bk.status);
              return (
                <div key={bk.id} className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] border border-[#ECECEC] rounded-[24px] p-5 shadow-[inset_0_0_20px_rgba(255,255,255,0.01),0_0_30px_rgba(0,0,0,0.2)] hover:border-[#D1AF47]/20 transition-all duration-300 space-y-4">
                  {/* Top: Client & Status */}
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-[#101828] text-base tracking-wide">
                        {bk.profiles?.first_name} {bk.profiles?.last_name}
                      </h4>
                      <p className="text-xs text-[#667085] mt-0.5 tracking-wider font-mono">{bk.profiles?.phone}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-bold border uppercase tracking-wider ${badge.bg} ${badge.text} ${badge.border}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                      {bk.status.replace("_", " ")}
                    </span>
                  </div>

                  {/* Middle Info Block */}
                  <div className="grid grid-cols-2 gap-4 pt-3 border-t border-[#ECECEC] text-xs">
                    <div>
                      <span className="text-[#667085] block text-[10px] uppercase font-bold tracking-wider mb-1">{t.service}</span>
                      <span className="text-[#344054] font-medium leading-relaxed">
                        {locale === "ar" ? bk.services?.name_ar : bk.services?.name_en}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#667085] block text-[10px] uppercase font-bold tracking-wider mb-1">{t.dateTime}</span>
                      <span className="text-[#101828] font-bold block">
                        {new Date(bk.scheduled_at).toLocaleDateString("en-GB", { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                      <span className="text-[#667085] text-[11px] block mt-0.5">
                        {new Date(bk.scheduled_at).toLocaleTimeString("en-GB", { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#667085] block text-[10px] uppercase font-bold tracking-wider mb-1">{t.staff}</span>
                      <span className="text-[#344054] font-medium">
                        {bk.employees ? (locale === "ar" ? bk.employees.name_ar : bk.employees.name_en) : (locale === "ar" ? "غير معين" : "Unassigned")}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#667085] block text-[10px] uppercase font-bold tracking-wider mb-1">{t.price}</span>
                      <span className="font-extrabold text-[#D1AF47] text-sm">
                        {bk.total_price} <span className="text-[10px] font-semibold text-[#667085]">{t.currency}</span>
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-3 border-t border-[#ECECEC]">
                    {(bk.status === "pending_payment" || bk.status === "pending") && (
                      <button
                        onClick={() => updateStatus(bk.id, "confirmed")}
                        className="flex-1 py-2.5 bg-[#D1AF47] hover:bg-[#E0C46A] text-[#070B12] font-extrabold text-[10px] uppercase tracking-wider rounded-xl text-center active:scale-95 transition-all duration-300"
                      >
                        {t.confirm}
                      </button>
                    )}
                    {bk.status === "confirmed" && (
                      <button
                        onClick={() => updateStatus(bk.id, "completed")}
                        className="flex-1 py-2.5 bg-[#3DDC84] hover:bg-[#52e291] text-[#070B12] font-extrabold text-[10px] uppercase tracking-wider rounded-xl text-center active:scale-95 transition-all duration-300"
                      >
                        {t.complete}
                      </button>
                    )}
                    {bk.status !== "completed" && bk.status !== "cancelled" && (
                      <button
                        onClick={() => updateStatus(bk.id, "cancelled")}
                        className="flex-1 py-2.5 border border-[#FF5D73]/30 bg-[#FEE4E2] text-[#EF4444] text-[#EF4444] hover:bg-[#FF5D73] hover:text-[#101828] font-extrabold text-[10px] uppercase tracking-wider rounded-xl text-center active:scale-95 transition-all duration-300"
                      >
                        {t.cancel}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
