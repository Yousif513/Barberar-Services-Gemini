"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const translations = {
  en: {
    title: "Client Directory",
    subtitle: "Track client profiles, spending history, booking frequency, and intake notes.",
    searchPlaceholder: "Search client directory...",
    clientName: "Client Name",
    bookingsCount: "Bookings",
    totalSpend: "Total Spend",
    lastVisit: "Last Visit",
    intakeNotes: "Intake Notes",
    editNotes: "Edit Intake Notes",
    saveNotes: "Save Notes",
    noClients: "No clients registered in your database yet.",
    notesPlaceholder: "Write specific preferences (e.g. prefers low skin fade, allergic to certain facial creams)...",
    currency: "SAR",
    statsTotalClients: "Total Clients",
    statsTotalSpend: "Total Volume",
    statsTotalBookings: "Total Bookings",
    statsAverageSpend: "Average Spend",
    clientSummary: "Client Summary",
    bookingHistory: "Booking History",
    actions: "Actions",
    viewSummary: "View Details",
    noBookingHistory: "No booking records found.",
    cancel: "Cancel",
    phone: "Phone",
    activeStatus: "Active",
    loadingClients: "Loading client directory...",
    localRecordsNotice: "Displaying demo sandbox client records.",
    completedStatus: "Completed"
  },
  ar: {
    title: "دليل العملاء",
    subtitle: "متابعة ملفات العملاء، سجل المبيعات، تكرار الحجز، وملاحظات التفضيلات الخاصة بهم.",
    searchPlaceholder: "البحث في دليل العملاء...",
    clientName: "اسم العميل",
    bookingsCount: "الحجوزات",
    totalSpend: "إجمالي المبيعات",
    lastVisit: "آخر زيارة",
    intakeNotes: "ملاحظات التفضيلات",
    editNotes: "تعديل الملاحظات",
    saveNotes: "حفظ الملاحظات",
    noClients: "لا يوجد عملاء مسجلون في قاعدة البيانات حالياً.",
    notesPlaceholder: "اكتب تفضيلات العميل (مثل: يفضل قصة شعر معينة، يعاني من حساسية تجاه كريمات معينة)...",
    currency: "ريال",
    statsTotalClients: "إجمالي العملاء",
    statsTotalSpend: "حجم المبيعات",
    statsTotalBookings: "إجمالي الحجوزات",
    statsAverageSpend: "متوسط الإنفاق",
    clientSummary: "ملخص العميل",
    bookingHistory: "سجل الحجوزات",
    actions: "الإجراءات",
    viewSummary: "عرض التفاصيل",
    noBookingHistory: "لا يوجد سجل حجوزات.",
    cancel: "إلغاء",
    phone: "الجوال",
    activeStatus: "نشط",
    loadingClients: "جاري تحميل دليل العملاء...",
    localRecordsNotice: "يتم عرض سجلات تجريبية للعملاء.",
    completedStatus: "مكتمل"
  }
};

export default function ProviderCustomersPage() {
  const [locale, setLocale] = useState<"en" | "ar">("ar");
  const [clients, setClients] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Edit notes state
  const [editingClient, setEditingClient] = useState<any>(null);
  const [noteText, setNoteText] = useState("");

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
    loadClients();
  }, []);

  async function loadClients() {
    try {
      setLoading(true);
      setError("");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: providerInfo } = await supabase
        .from("providers")
        .select("id")
        .eq("owner_id", user.id)
        .maybeSingle();

      if (providerInfo) {
        const { data: branches } = await supabase
          .from("branches")
          .select("id")
          .eq("provider_id", providerInfo.id);

        const branchIds = branches?.map(b => b.id) || [];
        if (branchIds.length > 0) {
          // Fetch distinct customer profiles with aggregate logic simulated in client or database
          const { data: bookingsData, error: fetchError } = await supabase
            .from("bookings")
            .select(`
              id,
              total_price,
              scheduled_at,
              profiles ( id, first_name, last_name, phone )
            `)
            .in("branch_id", branchIds);

          if (fetchError) throw fetchError;

          // Process database results into a client ledger list
          const clientMap: { [key: string]: any } = {};
          bookingsData?.forEach(b => {
            const profile = b.profiles as any;
            if (!profile) return;
            if (!clientMap[profile.id]) {
              clientMap[profile.id] = {
                id: profile.id,
                name: `${profile.first_name || ""} ${profile.last_name || ""}`,
                phone: profile.phone || "",
                bookingsCount: 0,
                totalSpend: 0,
                lastVisit: b.scheduled_at,
                intakeNotes: "",
                bookings: []
              };
            }

            clientMap[profile.id].bookingsCount += 1;
            clientMap[profile.id].totalSpend += Number(b.total_price);
            
            clientMap[profile.id].bookings.push({
              id: b.id,
              total_price: Number(b.total_price),
              scheduled_at: b.scheduled_at
            });

            if (new Date(b.scheduled_at) > new Date(clientMap[profile.id].lastVisit)) {
              clientMap[profile.id].lastVisit = b.scheduled_at;
            }
          });

          // Fetch notes
          const { data: notes } = await supabase
            .from("provider_customer_notes")
            .select("customer_id, notes")
            .eq("provider_id", providerInfo.id);
          
          notes?.forEach(n => {
            if (clientMap[n.customer_id]) {
              clientMap[n.customer_id].intakeNotes = n.notes;
            }
          });

          // Sort each client's bookings
          Object.values(clientMap).forEach((c: any) => {
            c.bookings.sort((a: any, b: any) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime());
          });

          setClients(Object.values(clientMap));
          return;
        }
      }
      throw new Error("No provider active");
    } catch (err: any) {
      console.warn("Using default CRM clients list due to offline sandbox session:", err.message);
      setError("Displaying local customer records.");

      // Set mock client data with detailed bookings
      const now = Date.now();
      setClients([
        {
          id: "cust-1",
          name: "Yousif Al-Saud",
          phone: "+966 50 123 4567",
          bookingsCount: 4,
          totalSpend: 940,
          lastVisit: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
          intakeNotes: "Prefers low skin fade on beard, hot steam towel, and light styling cream. Highly sensitive to alcohol-based products.",
          bookings: [
            { id: "b1-1", total_price: 250, scheduled_at: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString() },
            { id: "b1-2", total_price: 300, scheduled_at: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString() },
            { id: "b1-3", total_price: 190, scheduled_at: new Date(now - 25 * 24 * 60 * 60 * 1000).toISOString() },
            { id: "b1-4", total_price: 200, scheduled_at: new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString() },
          ]
        },
        {
          id: "cust-2",
          name: "Abdulrahman K.",
          phone: "+966 54 888 1234",
          bookingsCount: 2,
          totalSpend: 300,
          lastVisit: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(),
          intakeNotes: "Classic haircut. Prefers scheduling morning appointments.",
          bookings: [
            { id: "b2-1", total_price: 150, scheduled_at: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString() },
            { id: "b2-2", total_price: 150, scheduled_at: new Date(now - 18 * 24 * 60 * 60 * 1000).toISOString() },
          ]
        },
        {
          id: "cust-3",
          name: "Khalid M.",
          phone: "+966 53 111 2222",
          bookingsCount: 3,
          totalSpend: 1050,
          lastVisit: new Date(now - 12 * 24 * 60 * 60 * 1000).toISOString(),
          intakeNotes: "Deep hydration facials, prefers quiet room environments, likes herbal tea service.",
          bookings: [
            { id: "b3-1", total_price: 400, scheduled_at: new Date(now - 12 * 24 * 60 * 60 * 1000).toISOString() },
            { id: "b3-2", total_price: 350, scheduled_at: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString() },
            { id: "b3-3", total_price: 300, scheduled_at: new Date(now - 50 * 24 * 60 * 60 * 1000).toISOString() },
          ]
        }
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function saveNotes() {
    if (!editingClient) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user");

      const { data: providerInfo } = await supabase
        .from("providers")
        .select("id")
        .eq("owner_id", user.id)
        .single();

      if (providerInfo) {
        const { error: upsertError } = await supabase
          .from("provider_customer_notes")
          .upsert({
            provider_id: providerInfo.id,
            customer_id: editingClient.id,
            notes: noteText
          }, { onConflict: "provider_id,customer_id" });

        if (upsertError) throw upsertError;
      }

      setClients(prev => prev.map(c => c.id === editingClient.id ? { ...c, intakeNotes: noteText } : c));
      setEditingClient(null);
    } catch (err: any) {
      console.warn("Saving notes locally for preview simulation:", err.message);
      setClients(prev => prev.map(c => c.id === editingClient.id ? { ...c, intakeNotes: noteText } : c));
      setEditingClient(null);
    }
  }

  const filtered = clients.filter(c => {
    return c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search);
  });

  // Stats calculations based on all clients
  const totalClientsCount = clients.length;
  const totalSpendSum = clients.reduce((acc, c) => acc + (c.totalSpend || 0), 0);
  const totalBookingsCount = clients.reduce((acc, c) => acc + (c.bookingsCount || 0), 0);
  const avgSpendPerClient = totalClientsCount > 0 ? Math.round(totalSpendSum / totalClientsCount) : 0;

  return (
    <div className="space-y-8 font-sans text-[#101828]">
      {/* HEADER WITH GOLD DETAILS */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 pb-6 border-b border-[#ECECEC]">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-[#101828] flex items-center gap-3">
            <span className="bg-gradient-to-r from-[#D1AF47] to-[#E0C46A] bg-clip-text text-transparent">{t.title}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#D1AF47] animate-pulse"></span>
          </h2>
          <p className="text-sm text-[#344054] mt-2 font-medium">{t.subtitle}</p>
        </div>
        
        {/* PREMIUM SEARCH BAR */}
        <div className="relative w-full md:w-96 flex items-center bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)]/85 backdrop-blur-md border border-[#ECECEC] px-5 py-3 rounded-2xl focus-within:border-[#D1AF47]/40 focus-within:shadow-[0_0_25px_rgba(209,175,71,0.1)] transition-all duration-300">
          <svg className="w-4 h-4 text-[#D1AF47] me-3 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder={t.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent border-none outline-none text-xs placeholder-[#7B859C]/60 text-[#101828] font-medium focus:ring-0"
          />
        </div>
      </div>

      {error && (
        <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] border border-[#D1AF47]/20 text-[#D1AF47] text-xs rounded-2xl p-4 flex items-center gap-3 shadow-[0_4px_12px_rgba(0,0,0,0.2)]">
          <span className="w-2 h-2 rounded-full bg-[#D1AF47] animate-pulse"></span>
          <span className="font-semibold">{t.localRecordsNotice} ({error})</span>
        </div>
      )}

      {/* ACTIVE STATISTICS OVERVIEW SECTION */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* STAT 1: Total Clients */}
        <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] border border-[#ECECEC] rounded-[24px] p-6 flex items-center justify-between hover:shadow-[0_0_25px_rgba(209,175,71,0.08)] hover:border-[#D1AF47]/30 transition-all duration-300 group">
          <div className="space-y-2">
            <span className="text-[10px] uppercase font-bold text-[#667085] tracking-[0.1em] block">{t.statsTotalClients}</span>
            <span className="text-3xl font-extrabold text-[#101828] block tracking-tight">{totalClientsCount}</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#D1AF47]/10 flex items-center justify-center text-[#D1AF47] group-hover:bg-[#D1AF47] group-hover:text-[#070B12] transition-all duration-300">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2M9 11a4 4 0 110-8 4 4 0 010 8zm6 9v-2a3 3 0 00-3-3H9a3 3 0 00-3 3v2" />
            </svg>
          </div>
        </div>

        {/* STAT 2: Total Bookings */}
        <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] border border-[#ECECEC] rounded-[24px] p-6 flex items-center justify-between hover:shadow-[0_0_25px_rgba(209,175,71,0.08)] hover:border-[#D1AF47]/30 transition-all duration-300 group">
          <div className="space-y-2">
            <span className="text-[10px] uppercase font-bold text-[#667085] tracking-[0.1em] block">{t.statsTotalBookings}</span>
            <span className="text-3xl font-extrabold text-[#101828] block tracking-tight">{totalBookingsCount}</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#D1AF47]/10 flex items-center justify-center text-[#D1AF47] group-hover:bg-[#D1AF47] group-hover:text-[#070B12] transition-all duration-300">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        </div>

        {/* STAT 3: Total Spend */}
        <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] border border-[#ECECEC] rounded-[24px] p-6 flex items-center justify-between hover:shadow-[0_0_25px_rgba(209,175,71,0.08)] hover:border-[#D1AF47]/30 transition-all duration-300 group">
          <div className="space-y-2">
            <span className="text-[10px] uppercase font-bold text-[#667085] tracking-[0.1em] block">{t.statsTotalSpend}</span>
            <span className="text-3xl font-extrabold text-[#D1AF47] block tracking-tight">
              {totalSpendSum.toLocaleString()} <span className="text-xs font-semibold text-[#101828]/70">{t.currency}</span>
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#D1AF47]/10 flex items-center justify-center text-[#D1AF47] group-hover:bg-[#D1AF47] group-hover:text-[#070B12] transition-all duration-300">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>

        {/* STAT 4: Average Spend */}
        <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] border border-[#ECECEC] rounded-[24px] p-6 flex items-center justify-between hover:shadow-[0_0_25px_rgba(209,175,71,0.08)] hover:border-[#D1AF47]/30 transition-all duration-300 group">
          <div className="space-y-2">
            <span className="text-[10px] uppercase font-bold text-[#667085] tracking-[0.1em] block">{t.statsAverageSpend}</span>
            <span className="text-3xl font-extrabold text-[#D1AF47] block tracking-tight">
              {avgSpendPerClient.toLocaleString()} <span className="text-xs font-semibold text-[#101828]/70">{t.currency}</span>
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#D1AF47]/10 flex items-center justify-center text-[#D1AF47] group-hover:bg-[#D1AF47] group-hover:text-[#070B12] transition-all duration-300">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-8a2 2 0 00-2-2H14a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
        </div>

      </div>

      {/* CRM CLIENT DIRECTORY TABLE */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <div className="w-12 h-12 rounded-full border-4 border-[#D1AF47]/20 border-t-[#D1AF47] animate-spin"></div>
          <p className="text-sm font-semibold text-[#344054]">{t.loadingClients}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] border border-[#ECECEC] rounded-[24px] p-16 text-center text-[#667085] shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
          <svg className="w-12 h-12 mx-auto text-[#667085]/40 mb-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.109A2.25 2.25 0 0112.75 21.5h-1.5a2.25 2.25 0 01-2.25-2.263V19.13m4.75-3.07a8.906 8.906 0 00-6-2.225 8.906 8.906 0 00-6 2.225m7.962-3.07a3.95 3.95 0 00-4.924-2.597M16.5 7.75a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 2.25a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
          </svg>
          <p className="text-base font-bold text-[#101828] mb-1">{t.noClients}</p>
        </div>
      ) : (
        <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] border border-[#ECECEC] rounded-[24px] overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start border-collapse">
              <thead>
                <tr className="border-b border-[#ECECEC] text-[#667085] font-semibold uppercase text-[10px] tracking-[0.12em] bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)]/50">
                  <th className="py-4 px-6 text-start">{t.clientName}</th>
                  <th className="py-4 px-6 text-center">{t.bookingsCount}</th>
                  <th className="py-4 px-6 text-center">{t.totalSpend}</th>
                  <th className="py-4 px-6 text-start">{t.lastVisit}</th>
                  <th className="py-4 px-6 text-start">{t.intakeNotes}</th>
                  <th className="py-4 px-6 text-end">{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECECEC]">
                {filtered.map((c) => {
                  // Generate Initials
                  const initials = c.name
                    ? c.name
                        .split(" ")
                        .map((n: string) => n[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()
                    : "CL";

                  return (
                    <tr key={c.id} className="hover:bg-transparent transition-colors duration-200">
                      
                      {/* Client Name & Phone */}
                      <td className="py-4 px-6 text-start">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#D1AF47]/20 to-[#E0C46A]/5 border border-[#D1AF47]/30 flex items-center justify-center text-[#D1AF47] font-bold text-xs tracking-wider shadow-[0_0_10px_rgba(209,175,71,0.05)]">
                            {initials}
                          </div>
                          <div>
                            <span className="font-bold text-[#101828] block text-sm">{c.name}</span>
                            <span className="text-[10px] text-[#667085] block mt-0.5 tracking-wide">{c.phone}</span>
                          </div>
                        </div>
                      </td>

                      {/* Bookings Count */}
                      <td className="py-4 px-6 text-center">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold bg-white border border-[#ECECEC] text-[#344054] border border-[#ECECEC]">
                          {c.bookingsCount}
                        </span>
                      </td>

                      {/* Total Spend */}
                      <td className="py-4 px-6 text-center font-extrabold text-[#D1AF47] text-sm">
                        {c.totalSpend.toLocaleString()} <span className="text-[10px] font-medium text-[#667085]">{t.currency}</span>
                      </td>

                      {/* Last Visit */}
                      <td className="py-4 px-6 text-start text-[#344054] font-medium">
                        {new Date(c.lastVisit).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB", { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>

                      {/* Intake Notes Snippet */}
                      <td className="py-4 px-6 text-start max-w-xs truncate text-[#667085] font-medium">
                        {c.intakeNotes || "—"}
                      </td>

                      {/* Edit Notes / Summary Trigger */}
                      <td className="py-4 px-6 text-end">
                        <button
                          onClick={() => {
                            setEditingClient(c);
                            setNoteText(c.intakeNotes || "");
                          }}
                          className="px-4 py-2 border border-[#D1AF47]/30 hover:border-[#D1AF47] text-[#D1AF47] hover:bg-[#D1AF47]/10 text-[10px] font-bold rounded-xl transition-all duration-300 shadow-[0_0_15px_rgba(209,175,71,0.02)]"
                        >
                          {t.viewSummary}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* INDIVIDUAL CLIENT SUMMARY & NOTES EDIT POPUP (MODAL) */}
      {editingClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-transparent/80 backdrop-blur-md">
          <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] border border-[#ECECEC] rounded-[28px] w-full max-w-3xl p-8 shadow-[0_12px_40px_rgba(0,0,0,0.6),0_0_40px_rgba(209,175,71,0.05)] text-[#101828] space-y-6 relative overflow-hidden">
            
            {/* Ambient Background Glow inside Popup */}
            <div className="absolute -top-20 -right-20 w-48 h-48 bg-[#D1AF47]/5 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-[#D1AF47]/5 rounded-full blur-3xl pointer-events-none" />

            <div className="flex justify-between items-start border-b border-[#ECECEC] pb-4 relative z-10">
              <div>
                <h3 className="text-xl font-bold tracking-tight text-[#101828] flex items-center gap-2">
                  <span className="bg-gradient-to-r from-[#D1AF47] to-[#E0C46A] bg-clip-text text-transparent">{t.clientSummary}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#D1AF47] animate-ping"></span>
                </h3>
                <p className="text-xs text-[#344054] mt-1.5 font-medium">{editingClient.name}</p>
              </div>
              <button
                onClick={() => setEditingClient(null)}
                className="text-[#667085] hover:text-[#101828] bg-[#F3F4F6] border border-[#ECECEC] hover:bg-[#E5E7EB] border border-[#ECECEC] p-2 rounded-xl transition duration-200 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {/* SPLIT LAYOUT: INFO & HISTORIES */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 relative z-10">
              
              {/* LEFT PROFILE & METRICS PANEL (5 Cols) */}
              <div className="md:col-span-5 space-y-4">
                <div className="bg-white border border-[#ECECEC] border border-[#ECECEC] rounded-2xl p-5 space-y-4">
                  
                  {/* Name & Phone */}
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold text-[#667085] tracking-[0.1em]">{t.clientName}</span>
                    <p className="text-base font-bold text-[#101828]">{editingClient.name}</p>
                    <p className="text-xs text-[#344054] mt-0.5">{t.phone}: {editingClient.phone}</p>
                  </div>
                  
                  <div className="h-px bg-[#F9FAFB] border border-[#ECECEC]" />

                  {/* Quick stats grid inside modal */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <span className="text-[9px] uppercase font-bold text-[#667085] tracking-[0.08em] block">{t.bookingsCount}</span>
                      <span className="text-base font-bold text-[#101828]">{editingClient.bookingsCount}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[9px] uppercase font-bold text-[#667085] tracking-[0.08em] block">{t.totalSpend}</span>
                      <span className="text-base font-bold text-[#D1AF47]">{editingClient.totalSpend.toLocaleString()} <span className="text-[10px] text-[#101828]/70">{t.currency}</span></span>
                    </div>
                  </div>

                  <div className="h-px bg-[#F9FAFB] border border-[#ECECEC]" />

                  {/* Last visit info */}
                  <div className="space-y-1">
                    <span className="text-[9px] uppercase font-bold text-[#667085] tracking-[0.08em] block">{t.lastVisit}</span>
                    <p className="text-xs text-[#344054] font-medium">
                      {new Date(editingClient.lastVisit).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB", { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>

                  <div className="h-px bg-[#F9FAFB] border border-[#ECECEC]" />

                  {/* Status Indicator */}
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#3DDC84] shadow-[0_0_8px_rgba(61,220,132,0.4)]"></span>
                    <span className="text-xs font-bold text-[#22C55E]">{t.activeStatus}</span>
                  </div>

                </div>
              </div>

              {/* RIGHT BOOKING TIMELINE PANEL (7 Cols) */}
              <div className="md:col-span-7 flex flex-col space-y-3">
                <span className="text-[10px] uppercase font-bold text-[#667085] tracking-[0.1em]">{t.bookingHistory}</span>
                
                <div className="flex-1 bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)]/50 border border-[#ECECEC] rounded-2xl p-4 overflow-y-auto max-h-[220px] scrollbar-thin scrollbar-thumb-white/[0.08] space-y-4">
                  {(!editingClient.bookings || editingClient.bookings.length === 0) ? (
                    <div className="h-full flex items-center justify-center text-center py-6 text-xs text-[#667085]">
                      {t.noBookingHistory}
                    </div>
                  ) : (
                    <div className="relative border-s border-[#ECECEC] ms-2.5 py-1 space-y-5">
                      {editingClient.bookings.map((booking: any) => (
                        <div key={booking.id} className="relative ps-6">
                          
                          {/* Chronological Indicator Dot */}
                          <span className="absolute -start-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-[#D1AF47] border-2 border-[#111827] shadow-[0_0_8px_rgba(209,175,71,0.5)]"></span>
                          
                          <div className="flex items-center justify-between gap-4">
                            <div className="text-start">
                              <p className="text-xs font-bold text-[#101828]">
                                {new Date(booking.scheduled_at).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB", { day: 'numeric', month: 'short', year: 'numeric' })}
                              </p>
                              <p className="text-[10px] text-[#667085] mt-0.5">
                                {new Date(booking.scheduled_at).toLocaleTimeString(locale === "ar" ? "ar-EG" : "en-US", { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                            
                            <div className="text-end">
                              <span className="text-xs font-extrabold text-[#D1AF47] block">
                                {Number(booking.total_price).toLocaleString()} {t.currency}
                              </span>
                              <span className="inline-flex items-center gap-1 text-[9px] font-bold text-[#22C55E] mt-0.5">
                                <span className="w-1 h-1 rounded-full bg-[#3DDC84]"></span>
                                {t.completedStatus}
                              </span>
                            </div>

                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* INTAKE NOTES TEXTAREA */}
            <div className="space-y-2 relative z-10">
              <label className="text-[10px] uppercase font-bold text-[#667085] tracking-[0.1em] block">{t.intakeNotes}</label>
              <textarea
                rows={3}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder={t.notesPlaceholder}
                className="w-full bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] border border-[#ECECEC] focus:border-[#D1AF47]/50 rounded-2xl p-4 text-xs text-[#101828] outline-none placeholder-[#7B859C]/40 leading-relaxed transition-all duration-300 focus:shadow-[0_0_15px_rgba(209,175,71,0.05)] resize-none"
              />
            </div>

            {/* MODAL ACTION BUTTONS */}
            <div className="flex gap-4 pt-2 border-t border-[#ECECEC] relative z-10">
              <button
                onClick={() => setEditingClient(null)}
                className="flex-1 py-3 border border-[#ECECEC] bg-transparent text-[#344054] hover:text-[#101828] font-bold text-xs rounded-xl hover:bg-[#F9FAFB] border border-[#ECECEC] transition-all duration-300"
              >
                {t.cancel}
              </button>
              <button
                onClick={saveNotes}
                className="flex-1 py-3 bg-gradient-to-r from-[#D1AF47] to-[#B8952E] hover:from-[#E0C46A] hover:to-[#D1AF47] text-[#070B12] font-black text-xs rounded-xl shadow-[0_4px_15px_rgba(209,175,71,0.15)] hover:shadow-[0_4px_25px_rgba(209,175,71,0.25)] hover:scale-[1.01] active:scale-[0.99] transition-all duration-300"
              >
                {t.saveNotes}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
