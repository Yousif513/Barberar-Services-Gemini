"use client";

import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";
import { CommandDialog } from "@/components/modal";
import { MAX_IMPORT_ROWS, parseClientCsv } from "@/lib/client-import.mjs";
import { ProviderDialog, providerGhostButton } from "../_components/dialog";

const importCopy = {
  en: {
    csvLabel: "Client list (Name, Phone, Notes)",
    chooseFile: "Choose a CSV file",
    orPaste: "or paste the rows below",
    fileFailed: "The file could not be read: ",
    pasteData: "Paste or choose your client list first.",
    notReady: "Your business is not loaded yet. Try again in a moment.",
    summary: "{n} client(s) ready to import",
    headerSkipped: "The first row was read as column titles and skipped.",
    rejectedTitle: "{n} row(s) will be left out",
    tooMany: "Only the first {max} clients are imported at a time; import the rest in another file.",
    reasons: {
      noName: "no name",
      noPhone: "no phone number",
      badPhone: "not a Saudi mobile number (05XXXXXXXX or +9665XXXXXXXX)",
      duplicate: "the same phone appears twice",
      tooLong: "name or note is too long",
    },
    line: "Line",
    importDone: "{ok} client(s) imported.",
    importSkipped: "{n} skipped by the server (missing name or invalid Saudi mobile number).",
    blockTitle: "Block this client?",
    blockIntro: "They will not be able to book with your business until you unblock them. The reason is kept with your name.",
    blockReason: "Reason for blocking",
    unblockTitle: "Unblock this client?",
    unblockIntro: "They can book with your business again.",
    blockFailed: "The block list was not changed: ",
    nothingToImport: "There is no row to import. Check the phone numbers.",
  },
  ar: {
    csvLabel: "قائمة العملاء (الاسم، الجوال، الملاحظات)",
    chooseFile: "اختر ملف CSV",
    orPaste: "أو الصق الصفوف أدناه",
    fileFailed: "تعذرت قراءة الملف: ",
    pasteData: "الصق قائمة العملاء أو اختر ملفاً أولاً.",
    notReady: "لم يُحمَّل نشاطك بعد. حاول بعد لحظات.",
    summary: "{n} عميل جاهز للاستيراد",
    headerSkipped: "قُرئ الصف الأول كعناوين أعمدة وتم تخطيه.",
    rejectedTitle: "سيُستبعد {n} صف",
    tooMany: "يُستورد أول {max} عميل فقط في المرة الواحدة؛ استورد الباقي في ملف آخر.",
    reasons: {
      noName: "لا يوجد اسم",
      noPhone: "لا يوجد رقم جوال",
      badPhone: "ليس رقم جوال سعودياً (05XXXXXXXX أو +9665XXXXXXXX)",
      duplicate: "الرقم نفسه مكرر",
      tooLong: "الاسم أو الملاحظة طويلة جداً",
    },
    line: "السطر",
    importDone: "تم استيراد {ok} عميل.",
    importSkipped: "تخطى الخادم {n} صفاً (اسم ناقص أو رقم جوال سعودي غير صالح).",
    blockTitle: "حظر هذا العميل؟",
    blockIntro: "لن يتمكن من الحجز لدى نشاطك حتى تلغي الحظر. يُحفظ السبب باسمك.",
    blockReason: "سبب الحظر",
    unblockTitle: "إلغاء حظر هذا العميل؟",
    unblockIntro: "يستطيع الحجز لدى نشاطك من جديد.",
    blockFailed: "لم تتغير قائمة الحظر: ",
    nothingToImport: "لا يوجد صف للاستيراد. تحقق من أرقام الجوال.",
  },
};

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
    localRecordsNotice: "Displaying client records.",
    completedStatus: "Completed",
    importClientsBtn: "Import Clients (CSV)",
    importModalTitle: "Import Existing Salon Clients (CSV)",
    importModalSubtitle: "Paste your existing client list (Name, Phone, Notes) to migrate contacts to Primora.",
    pasteCsvPlaceholder: "Sara Al-Harbi, +966501234567, Prefers organic oil treatment\nFahad Al-Otaibi, +966551234567, Low skin fade specialist",
    consentCheckbox: "I certify that these clients have explicitly consented to receiving appointment communications in compliance with Saudi PDPL regulations.",
    startImport: "Start Import",
    importing: "Importing...",
    importSuccessMsg: "Clients imported successfully into your directory.",
    importErrorConsent: "You must confirm that clients have consented to receiving messages.",
    blockClient: "Block Client",
    unblockClient: "Unblock Client",
    blockedStatus: "Blocked"
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
    localRecordsNotice: "يتم عرض سجلات العملاء.",
    completedStatus: "مكتمل",
    importClientsBtn: "استيراد العملاء (CSV)",
    importModalTitle: "استيراد قائمة عملاء الصالون الحالية",
    importModalSubtitle: "قم بلصق قائمة عملائك (الاسم، الجوال، الملاحظات) لنقل بياناتهم وحجوزاتهم إلى بريمورا بسهولة.",
    pasteCsvPlaceholder: "سارة الحربي, +966501234567, تفضل الزيوت العضوية\nفهد العتيبي, +966551234567, تدريج كلاسيكي خفيف",
    consentCheckbox: "أقر وأتعهد بأن هؤلاء العملاء قد وافقوا صراحة على استلام رسائل وتنبيهات المواعيد من منشأتنا وفقاً لنظام حماية البيانات الشخصية السعودي (PDPL).",
    startImport: "بدء الاستيراد",
    importing: "جاري الاستيراد...",
    importSuccessMsg: "تم استيراد قائمة العملاء بنجاح إلى دليلك.",
    importErrorConsent: "يجب الموافقة والإقرار بوجود موافقة العملاء المسبقة لمتابعة الاستيراد.",
    blockClient: "حظر العميل",
    unblockClient: "إلغاء الحظر",
    blockedStatus: "محظور"
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

  // Client Import State (G35)
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState("");
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");
  // Customer Blocklist State (G57)
  const [providerId, setProviderId] = useState<string>("");
  const [blockedCustomerIds, setBlockedCustomerIds] = useState<Set<string>>(new Set());

  const t = translations[locale];

  const x = importCopy[locale];
  const [blockTarget, setBlockTarget] = useState<{ id: string; name: string; blocked: boolean } | null>(null);

  // Blocking asks for a reason that the server records with the actor; the screen changes only after the command succeeds.
  const confirmBlock = async (reason: string): Promise<string | null> => {
    if (!providerId || !blockTarget) return x.notReady;
    const { error: rpcErr } = await supabase.rpc("toggle_customer_block", {
      p_provider_id: providerId,
      p_customer_id: blockTarget.id,
      p_reason: blockTarget.blocked ? "" : reason,
      p_block: !blockTarget.blocked,
    });
    if (rpcErr) return x.blockFailed + errorMessage(rpcErr);
    setBlockedCustomerIds(prev => {
      const next = new Set(prev);
      if (blockTarget.blocked) next.delete(blockTarget.id);
      else next.add(blockTarget.id);
      return next;
    });
    return null;
  };
  const handleToggleBlock = (clientId: string, currentlyBlocked: boolean) => {
    const client = clients.find(c => c.id === clientId);
    setBlockTarget({ id: clientId, name: String(client?.name || "").trim(), blocked: currentlyBlocked });
  };

  // The pasted or chosen list is read on this screen, so every rejected row is explained before anything is sent.
  const parsedImport = useMemo(() => parseClientCsv(importText), [importText]);

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setImportText(await file.text());
      setImportError("");
      setImportMessage("");
    } catch (err) {
      setImportError(x.fileFailed + errorMessage(err));
    }
  };

  const handleImportClients = async () => {
    setImportMessage("");
    if (!consentConfirmed) {
      setImportError(t.importErrorConsent);
      return;
    }
    if (!importText.trim()) {
      setImportError(x.pasteData);
      return;
    }
    if (parsedImport.rows.length === 0) {
      setImportError(x.nothingToImport);
      return;
    }
    if (!providerId) {
      setImportError(x.notReady);
      return;
    }

    try {
      setImportLoading(true);
      setImportError("");
      const { data, error: rpcErr } = await supabase.rpc("import_provider_clients", {
        p_provider_id: providerId,
        p_clients: parsedImport.rows.map(({ name, phone, notes }) => ({ name, phone, notes })),
        p_consent_confirmed: true
      });

      if (rpcErr) throw rpcErr;

      const skipped = Number(data?.skipped_rows || 0);
      const imported = Number(data?.successful_rows ?? 0);
      setImportMessage(
        `${x.importDone.replace("{ok}", String(imported))}${skipped > 0 ? ` ${x.importSkipped.replace("{n}", String(skipped))}` : ""}`
      );
      setImportText("");
      setConsentConfirmed(false);
      void loadClients();
    } catch (err: unknown) {
      console.error("Client import error:", err);
      setImportError(errorMessage(err));
    } finally {
      setImportLoading(false);
    }
  };

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
        setProviderId(providerInfo.id);

        try {
          const { data: blocks } = await supabase
            .from("provider_customer_blocks")
            .select("customer_id")
            .eq("provider_id", providerInfo.id);

          if (blocks) {
            setBlockedCustomerIds(new Set(blocks.map((b: any) => b.customer_id)));
          }
        } catch (bErr) {
          console.warn("Could not load blocked customers:", bErr);
        }

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
              profiles ( id, first_name, last_name, phone_number )
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
                phone: profile.phone_number || "",
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

          // Imported contacts (no PRIMORA account yet, or not yet booked here)
          const { data: contacts, error: contactsError } = await supabase
            .from("provider_client_contacts")
            .select("id, full_name, phone, notes, matched_profile_id, created_at")
            .eq("provider_id", providerInfo.id);
          if (contactsError) throw contactsError;
          contacts?.forEach((c: any) => {
            if (c.matched_profile_id && clientMap[c.matched_profile_id]) return;
            clientMap[`contact:${c.id}`] = {
              id: `contact:${c.id}`,
              name: c.full_name,
              phone: c.phone || "",
              bookingsCount: 0,
              totalSpend: 0,
              lastVisit: null,
              intakeNotes: c.notes || "",
              bookings: [],
              imported: true
            };
          });

          setClients(Object.values(clientMap));
          return;
        }
      }
      setClients([]);
    } catch (err: any) {
      console.warn("Failed to load CRM customers:", err.message);
      setError(err?.message || "Failed to load CRM customers from server.");
      setClients([]);

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

      if (providerInfo && String(editingClient.id).startsWith("contact:")) {
        const { error: contactError } = await supabase
          .from("provider_client_contacts")
          .update({ notes: noteText })
          .eq("id", String(editingClient.id).slice("contact:".length));
        if (contactError) throw contactError;
      } else if (providerInfo) {
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
      console.error("Failed to save customer notes:", err.message);
      setError(err?.message || "Failed to persist customer notes to database.");
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
        
        {/* ACTION BUTTONS & SEARCH BAR */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <button
            onClick={() => {
              setShowImportModal(true);
              setImportError("");
              setImportMessage("");
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#D1AF47] to-[#B8952E] text-[#070B12] font-bold text-xs shadow-[0_4px_15px_rgba(209,175,71,0.2)] hover:from-[#E0C46A] hover:to-[#D1AF47] transition-all duration-300"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <span>{t.importClientsBtn}</span>
          </button>

          {/* PREMIUM SEARCH BAR */}
          <div className="relative w-full md:w-80 flex items-center bg-white shadow-[0_8px_30px_rgb(0,0,0,0.015)]/85 backdrop-blur-md border border-[#ECECEC] px-4 py-2.5 rounded-2xl focus-within:border-[#D1AF47]/40 focus-within:shadow-[0_0_25px_rgba(209,175,71,0.1)] transition-all duration-300">
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
        <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgba(0,0,0,0.015)] rounded-[24px] p-6 flex items-center justify-between hover:shadow-[0_0_25px_rgba(209,175,71,0.08)] hover:border-[#D1AF47]/30 transition-all duration-300 group">
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
        <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgba(0,0,0,0.015)] rounded-[24px] p-6 flex items-center justify-between hover:shadow-[0_0_25px_rgba(209,175,71,0.08)] hover:border-[#D1AF47]/30 transition-all duration-300 group">
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
        <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgba(0,0,0,0.015)] rounded-[24px] p-6 flex items-center justify-between hover:shadow-[0_0_25px_rgba(209,175,71,0.08)] hover:border-[#D1AF47]/30 transition-all duration-300 group">
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
        <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgba(0,0,0,0.015)] rounded-[24px] p-6 flex items-center justify-between hover:shadow-[0_0_25px_rgba(209,175,71,0.08)] hover:border-[#D1AF47]/30 transition-all duration-300 group">
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
        <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgba(0,0,0,0.015)] rounded-[24px] p-16 text-center text-[#667085] shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
          <svg className="w-12 h-12 mx-auto text-[#667085]/40 mb-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.109A2.25 2.25 0 0112.75 21.5h-1.5a2.25 2.25 0 01-2.25-2.263V19.13m4.75-3.07a8.906 8.906 0 00-6-2.225 8.906 8.906 0 00-6 2.225m7.962-3.07a3.95 3.95 0 00-4.924-2.597M16.5 7.75a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 2.25a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
          </svg>
          <p className="text-base font-bold text-[#101828] mb-1">{t.noClients}</p>
        </div>
      ) : (
        <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgba(0,0,0,0.015)] rounded-[24px] overflow-hidden shadow-[0_8px_30px_rgba(0,0,0,0.015)]">
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
                        {c.lastVisit ? new Date(c.lastVisit).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB", { day: 'numeric', month: 'short', year: 'numeric' }) : "—"}
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
          <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgba(0,0,0,0.015)] rounded-[28px] w-full max-w-3xl p-8 shadow-[0_12px_40px_rgba(0,0,0,0.03)] text-[#101828] space-y-6 relative overflow-hidden">
            
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
                <div className="bg-white border border-[#ECECEC] rounded-2xl p-5 space-y-4">
                  
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
                      {editingClient.lastVisit ? new Date(editingClient.lastVisit).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB", { day: 'numeric', month: 'short', year: 'numeric' }) : "—"}
                    </p>
                  </div>

                  <div className="h-px bg-[#F9FAFB] border border-[#ECECEC]" />

                  {/* Status Indicator & Block Action (G57) */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${blockedCustomerIds.has(editingClient.id) ? "bg-[#EF4444] shadow-[0_0_8px_rgba(239,68,68,0.4)]" : "bg-[#3DDC84] shadow-[0_0_8px_rgba(61,220,132,0.4)]"}`}></span>
                      <span className={`text-xs font-bold ${blockedCustomerIds.has(editingClient.id) ? "text-[#EF4444]" : "text-[#22C55E]"}`}>
                        {blockedCustomerIds.has(editingClient.id) ? t.blockedStatus : t.activeStatus}
                      </span>
                    </div>

                    {!editingClient.imported && (
                    <button
                      type="button"
                      onClick={() => handleToggleBlock(editingClient.id, blockedCustomerIds.has(editingClient.id))}
                      className={`px-3 py-1 rounded-xl text-[11px] font-bold transition-all ${
                        blockedCustomerIds.has(editingClient.id)
                          ? "bg-gray-100 hover:bg-gray-200 text-[#344054] border border-[#ECECEC]"
                          : "bg-red-50 hover:bg-red-100 text-red-700 border border-red-200"
                      }`}
                    >
                      {blockedCustomerIds.has(editingClient.id) ? t.unblockClient : t.blockClient}
                    </button>
                    )}
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
                className="w-full bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgba(0,0,0,0.015)] focus:border-[#D1AF47]/50 rounded-2xl p-4 text-xs text-[#101828] outline-none placeholder-[#7B859C]/40 leading-relaxed transition-all duration-300 focus:shadow-[0_0_15px_rgba(209,175,71,0.05)] resize-none"
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

      {/* CSV CLIENT IMPORT MODAL (G35) */}
      {showImportModal && (
        <ProviderDialog label={t.importModalTitle} onClose={() => setShowImportModal(false)} canClose={!importLoading} wide>
          <div className="space-y-5 text-[#101828]">
            <div>
              <h3 className="text-lg font-bold text-[#101828]">{t.importModalTitle}</h3>
              <p className="mt-1 text-xs text-[#667085]">{t.importModalSubtitle}</p>
            </div>

            {importError && (
              <div role="alert" className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-medium">
                {importError}
              </div>
            )}
            {importMessage && (
              <div role="status" className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl font-medium">
                {importMessage}
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="client-file" className="text-[11px] font-bold text-[#344054] block uppercase tracking-wider">{x.chooseFile}</label>
              <input id="client-file" type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(e) => void handleFile(e)} className="block w-full text-xs text-[#344054] file:me-3 file:rounded-lg file:border file:border-[#ECECEC] file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-bold" />
              <label htmlFor="client-paste" className="text-[11px] font-bold text-[#344054] block uppercase tracking-wider">{x.csvLabel} - {x.orPaste}</label>
              <textarea
                id="client-paste"
                rows={6}
                dir="auto"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={t.pasteCsvPlaceholder}
                className="w-full bg-[#FAFAFA] border border-[#ECECEC] rounded-xl p-3 text-xs font-mono text-[#101828] outline-none focus-visible:border-[#D1AF47] resize-y"
              />
            </div>

            {importText.trim() && (
              <div className="rounded-xl border border-[#ECECEC] bg-[#F9FAFB] p-3 text-xs text-[#344054]" aria-live="polite">
                <p className="font-bold text-[#101828]">{x.summary.replace("{n}", String(parsedImport.rows.length))}</p>
                {parsedImport.headerSkipped && <p className="mt-1">{x.headerSkipped}</p>}
                {parsedImport.tooMany && <p className="mt-1 font-semibold text-[#9A741F]">{x.tooMany.replace("{max}", String(MAX_IMPORT_ROWS))}</p>}
                {parsedImport.rejected.length > 0 && (
                  <div className="mt-2">
                    <p className="font-bold text-[#B42318]">{x.rejectedTitle.replace("{n}", String(parsedImport.rejected.length))}</p>
                    <ul className="mt-1 max-h-32 list-disc space-y-0.5 overflow-y-auto ps-5">
                      {parsedImport.rejected.slice(0, 20).map((row) => (
                        <li key={row.line}>{x.line} {row.line}: {x.reasons[row.reason]}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* PDPL CONSENT CHECKBOX */}
            <div className="flex items-start gap-3 p-3.5 bg-[#FFFDF5] border border-[#D1AF47]/30 rounded-xl">
              <input
                type="checkbox"
                id="consentCheck"
                checked={consentConfirmed}
                onChange={(e) => setConsentConfirmed(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-[#D1AF47] text-[#D1AF47] focus:ring-[#D1AF47]"
              />
              <label htmlFor="consentCheck" className="text-xs text-[#344054] font-medium leading-relaxed cursor-pointer select-none">
                {t.consentCheckbox}
              </label>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                disabled={importLoading}
                className={`flex-1 ${providerGhostButton}`}
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={handleImportClients}
                disabled={importLoading || parsedImport.rows.length === 0}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#D1AF47] to-[#B8952E] text-[#070B12] font-black text-xs hover:from-[#E0C46A] hover:to-[#D1AF47] transition-all disabled:opacity-50"
              >
                {importLoading ? t.importing : t.startImport}
              </button>
            </div>
          </div>
        </ProviderDialog>
      )}

      {blockTarget && (
        <CommandDialog
          locale={locale}
          tone={blockTarget.blocked ? "default" : "danger"}
          title={blockTarget.blocked ? x.unblockTitle : x.blockTitle}
          intro={blockTarget.blocked ? x.unblockIntro : x.blockIntro}
          facts={blockTarget.name ? [{ label: t.clientName, value: blockTarget.name }] : []}
          reasonLabel={x.blockReason}
          reasonRequired={!blockTarget.blocked}
          confirmLabel={blockTarget.blocked ? t.unblockClient : t.blockClient}
          onConfirm={(reason) => confirmBlock(reason)}
          onClose={() => setBlockTarget(null)}
        />
      )}
    </div>
  );
}
