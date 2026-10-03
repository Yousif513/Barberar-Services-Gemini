"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const translations = {
  en: {
    title: "Customer Directory & Data Rights",
    subtitle: "Manage client records, review booking histories, and handle PDPL data subject requests & consents.",
    loading: "Loading customer directory...",
    searchPlaceholder: "Search by name, email, phone...",
    tabCustomers: "Customer Directory",
    tabDsr: "PDPL Data Rights & Consents",
    totalCustomers: "Total Customers",
    verifiedCustomers: "Verified Phone Accounts",
    pendingDsr: "Pending DSR Requests",
    customerName: "Customer Name",
    contactInfo: "Contact Info",
    verificationStatus: "Phone Verification",
    bookingsCount: "Bookings",
    totalSpend: "Total Spend",
    actions: "Actions",
    verified: "Verified",
    unverified: "Unverified",
    verifyBtn: "Verify Phone",
    revokeBtn: "Revoke Verification",
    successMsg: "Customer record updated successfully!",
    errorMsg: "Failed to update record.",
    emptyCustomers: "No customer profiles found.",
    emptyDsr: "No data-subject requests currently in queue.",
    dsrType: "Request Type",
    dsrStatus: "Status",
    dsrDueDate: "Statutory Due Date (30d)",
    dsrNotes: "Admin Notes",
    actionExport: "Export Data (JSON)",
    actionComplete: "Mark Completed",
    actionReject: "Reject Request",
    actionAnonymize: "Anonymize Records",
    consentsTitle: "Recorded Consents Audit Log",
    purpose: "Purpose",
    method: "Method",
    granted: "Granted",
    withdrawn: "Withdrawn",
  },
  ar: {
    title: "سجل العملاء وحقوق البيانات",
    subtitle: "إدارة ملفات العملاء، توثيق أرقام الجوال، ومتابعة طلبات حقوق أصحاب البيانات والموافقات وفق نظام حماية البيانات الشخصية السعودي (PDPL).",
    loading: "جاري تحميل سجل العملاء...",
    searchPlaceholder: "بحث بالاسم، البريد، الهاتف...",
    tabCustomers: "سجل العملاء",
    tabDsr: "حقوق البيانات والموافقات (PDPL)",
    totalCustomers: "إجمالي العملاء",
    verifiedCustomers: "حسابات بأرقام موثقة",
    pendingDsr: "طلبات بانتظار المعالجة",
    customerName: "اسم العميل",
    contactInfo: "بيانات الاتصال",
    verificationStatus: "توثيق الجوال",
    bookingsCount: "الحجوزات",
    totalSpend: "إجمالي الإنفاق",
    actions: "الإجراءات",
    verified: "موثق",
    unverified: "غير موثق",
    verifyBtn: "توثيق الجوال",
    revokeBtn: "إلغاء التوثيق",
    successMsg: "تم تحديث السجل بنجاح!",
    errorMsg: "فشل تحديث السجل.",
    emptyCustomers: "لا توجد ملفات عملاء مسجلة حالياً.",
    emptyDsr: "لا توجد طلبات حقوق بيانات في قائمة الانتظار.",
    dsrType: "نوع الطلب",
    dsrStatus: "الحالة",
    dsrDueDate: "المهلة النظامية (30 يوماً)",
    dsrNotes: "ملاحظات الإدارة",
    actionExport: "تصدير البيانات (JSON)",
    actionComplete: "إكمال الطلب",
    actionReject: "رفض الطلب",
    actionAnonymize: "إتلاف / طمس البيانات",
    consentsTitle: "سجل تدقيق موافقات العملاء",
    purpose: "الغرض",
    method: "طريقة المنح",
    granted: "ممنوحة",
    withdrawn: "مسحوبة",
  }
};

type ActiveTab = "customers" | "dsr";

export default function AdminCustomers() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("customers");
  const [customers, setCustomers] = useState<any[]>([]);
  const [dsrRequests, setDsrRequests] = useState<any[]>([]);
  const [consents, setConsents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
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

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");

      // 1. Fetch real customers from profiles
      const { data: customerData, error: dbError } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email, phone_number, phone_verified, role, created_at")
        .eq("role", "customer")
        .order("created_at", { ascending: false });

      if (dbError) throw dbError;

      // 2. Fetch booking stats aggregated for real users
      const { data: bookingsData } = await supabase
        .from("bookings")
        .select("client_id, total_price, status");

      const statsMap = new Map<string, { bookings: number; spend: number }>();
      (bookingsData || []).forEach((b: any) => {
        if (!b.client_id) return;
        const current = statsMap.get(b.client_id) || { bookings: 0, spend: 0 };
        current.bookings += 1;
        if (b.status === "completed" || b.status === "confirmed") {
          current.spend += Number(b.total_price) || 0;
        }
        statsMap.set(b.client_id, current);
      });

      const mapped = (customerData || []).map((c: any) => ({
        ...c,
        is_verified: !!c.phone_verified,
        bookings: statsMap.get(c.id)?.bookings || 0,
        spend: statsMap.get(c.id)?.spend || 0,
      }));

      setCustomers(mapped);

      // 3. Fetch DSR requests
      const { data: dsrData } = await supabase
        .from("data_subject_requests")
        .select("*")
        .order("created_at", { ascending: false });

      setDsrRequests(dsrData || []);

      // 4. Fetch consents audit records
      const { data: consentsData } = await supabase
        .from("consents")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      setConsents(consentsData || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load customer records.";
      setError(msg);
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [lang]);

  const handleToggleVerification = async (id: string, currentStatus: boolean) => {
    setSuccess("");
    setError("");
    const nextStatus = !currentStatus;
    try {
      const { error: updErr } = await supabase
        .from("profiles")
        .update({
          phone_verified: nextStatus,
          phone_verified_at: nextStatus ? new Date().toISOString() : null
        })
        .eq("id", id);

      if (updErr) throw updErr;

      setCustomers((prev) =>
        prev.map((c) => (c.id === id ? { ...c, is_verified: nextStatus, phone_verified: nextStatus } : c))
      );
      setSuccess(translations[lang].successMsg);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : translations[lang].errorMsg);
    }
  };

  const handleUpdateDsrStatus = async (requestId: string, nextStatus: string, reason: string) => {
    setSuccess("");
    setError("");
    try {
      const { error: updErr } = await supabase
        .from("data_subject_requests")
        .update({
          status: nextStatus,
          admin_notes: reason,
          updated_at: new Date().toISOString()
        })
        .eq("id", requestId);

      if (updErr) throw updErr;

      setDsrRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: nextStatus, admin_notes: reason } : r));
      setSuccess(`DSR status updated to ${nextStatus}.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update DSR status.");
    }
  };

  const handleExportCustomerData = (customer: any) => {
    const report = {
      exportTimestamp: new Date().toISOString(),
      regime: "Saudi PDPL Data Portability Export",
      profile: {
        id: customer.id,
        name: `${customer.first_name} ${customer.last_name}`,
        email: customer.email,
        phone_number: customer.phone_number,
        phone_verified: customer.phone_verified,
        role: customer.role,
        created_at: customer.created_at
      },
      bookingsCount: customer.bookings,
      totalSpendSAR: customer.spend,
      consents: consents.filter(c => c.user_id === customer.id)
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `primora_dsr_export_${customer.id}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setSuccess("Customer data package generated and downloaded.");
  };

  const handleAnonymizeCustomer = async (customer: any) => {
    const promptReason = window.prompt("Enter statutory erasure / anonymization reason for PDPL compliance audit:");
    if (!promptReason) return;

    try {
      const anonymizedPhone = `+966500000${Math.floor(Math.random() * 900 + 100)}`;
      const { error: updErr } = await supabase
        .from("profiles")
        .update({
          first_name: "Erased",
          last_name: "Customer",
          email: `erased_${customer.id.substring(0, 8)}@privacy.primora.internal`,
          phone_number: anonymizedPhone,
          phone_verified: false,
          phone_verified_at: null
        })
        .eq("id", customer.id);

      if (updErr) throw updErr;

      setSuccess(`Customer ${customer.id} personal records successfully anonymized per PDPL.`);
      loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to anonymize record.");
    }
  };

  const t = translations[lang];
  const isRTL = lang === "ar";
  const flip = isRTL ? "flex-row-reverse" : "flex-row";

  // Filter customer list
  const filtered = customers.filter((c) => {
    const term = search.toLowerCase();
    const fullName = `${c.first_name || ""} ${c.last_name || ""}`.toLowerCase();
    return (
      fullName.includes(term) ||
      (c.email || "").toLowerCase().includes(term) ||
      (c.phone_number || "").includes(term)
    );
  });

  const cardBase = "rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)] transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.035)] hover:border-[#D1AF47]/20";

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-6 ${isRTL ? "text-right" : "text-left"}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-serif font-black tracking-tight text-gray-900 leading-tight">
            {t.title}
          </h2>
          <p className="text-xs text-gray-500 font-semibold mt-1">
            {t.subtitle}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex rounded-xl bg-gray-100 p-1 border border-gray-200 text-xs font-bold">
          <button
            onClick={() => setActiveTab("customers")}
            className={`rounded-lg px-4 py-2 transition ${
              activeTab === "customers" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
            }`}
          >
            {t.tabCustomers}
          </button>
          <button
            onClick={() => setActiveTab("dsr")}
            className={`rounded-lg px-4 py-2 transition ${
              activeTab === "dsr" ? "bg-white text-[#A57C32] shadow-sm" : "text-gray-500 hover:text-gray-900"
            }`}
          >
            {t.tabDsr}
          </button>
        </div>
      </div>

      {success && (
        <div className={`bg-[#ECFDF3] border border-[#D1FADF] text-[#027A48] text-xs rounded-xl p-4 font-bold ${isRTL ? "text-right" : "text-left"}`}>
          {success}
        </div>
      )}

      {error && (
        <div className={`bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-4 font-bold ${isRTL ? "text-right" : "text-left"}`}>
          {error}
        </div>
      )}

      {/* Summary KPI Widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={cardBase}>
          <div className={`flex items-center justify-between ${flip}`}>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085]">{t.totalCustomers}</span>
            <span className="text-xs font-black text-[#D1AF47]">#</span>
          </div>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">
            {customers.length.toLocaleString(lang === "ar" ? "ar-SA" : "en-US")}
          </strong>
        </div>

        <div className={cardBase}>
          <div className={`flex items-center justify-between ${flip}`}>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085]">{t.verifiedCustomers}</span>
            <span className="text-xs font-black text-emerald-700">✓</span>
          </div>
          <strong className="block text-2xl font-serif font-black text-emerald-700 mt-2.5">
            {customers.filter(c => c.is_verified).length.toLocaleString(lang === "ar" ? "ar-SA" : "en-US")}
          </strong>
        </div>

        <div className={cardBase}>
          <div className={`flex items-center justify-between ${flip}`}>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085]">{t.pendingDsr}</span>
            <span className="text-xs font-black text-amber-700">⚖</span>
          </div>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">
            {dsrRequests.filter(r => r.status === "pending" || r.status === "in_progress").length}
          </strong>
        </div>
      </div>

      {activeTab === "customers" ? (
        <>
          {/* Controls Grid */}
          <div className={`flex items-center gap-4 ${flip}`}>
            <div className="relative flex-grow">
              <input
                type="text"
                placeholder={t.searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`w-full bg-white border border-[#ECECEC] rounded-xl px-4 py-2.5 text-xs text-gray-900 outline-none focus:border-[#D1AF47] transition duration-150 ${isRTL ? "text-right" : "text-left"}`}
              />
            </div>
          </div>

          {/* Data Table */}
          <div className="bg-white border border-[#ECECEC] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className={`border-b border-[#ECECEC] text-[#667085] bg-gray-50/50 uppercase tracking-widest font-extrabold text-[9px] ${isRTL ? "text-right" : ""}`}>
                    <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.customerName}</th>
                    <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.contactInfo}</th>
                    <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.verificationStatus}</th>
                    <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.bookingsCount}</th>
                    <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.totalSpend}</th>
                    <th className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>{t.actions}</th>
                  </tr>
                </thead>
                <tbody className={`divide-y divide-[#F5F5F5] font-semibold text-gray-700 ${isRTL ? "text-right" : "text-left"}`}>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-400 font-bold">{t.loading}</td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-400 font-bold">{t.emptyCustomers}</td>
                    </tr>
                  ) : (
                    filtered.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50/40 transition duration-150">
                        <td className="py-4 px-6">
                          <p className="font-bold text-gray-900">{item.first_name} {item.last_name}</p>
                          <p className="text-[9px] text-gray-400 font-semibold mt-1">UUID: {item.id.substring(0, 8)}...</p>
                        </td>
                        <td className="py-4 px-6">
                          <p className="font-bold text-gray-900">{item.email}</p>
                          <p className="text-[9px] text-gray-400 font-semibold mt-1">{item.phone_number || "No phone set"}</p>
                        </td>
                        <td className="py-4 px-6">
                          <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider inline-block ${
                            item.is_verified 
                              ? "bg-[#ECFDF3] text-[#16A34A]" 
                              : "bg-[#FFFAEB] text-[#F59E0B]"
                          }`}>
                            {item.is_verified ? t.verified : t.unverified}
                          </span>
                        </td>
                        <td className="py-4 px-6 font-serif font-black">
                          {item.bookings}
                        </td>
                        <td className="py-4 px-6 font-serif font-black text-gray-900">
                          {item.spend.toLocaleString(lang === "ar" ? "ar-SA" : "en-US")} {lang === "ar" ? "ريال" : "SAR"}
                        </td>
                        <td className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>
                          <div className="flex items-center gap-2 justify-end">
                            <button
                              onClick={() => handleExportCustomerData(item)}
                              title="Export user data per PDPL"
                              className="px-2.5 py-1.5 rounded-lg text-[9px] font-bold text-stone-700 bg-stone-100 hover:bg-stone-200 border border-stone-200"
                            >
                              JSON
                            </button>
                            <button
                              onClick={() => handleToggleVerification(item.id, item.is_verified)}
                              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition duration-150 border ${
                                item.is_verified 
                                  ? "bg-white hover:bg-gray-50 text-gray-700 border-[#ECECEC]" 
                                  : "bg-gray-900 hover:bg-gray-800 text-white border-transparent"
                              }`}
                            >
                              {item.is_verified ? t.revokeBtn : t.verifyBtn}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* DSR & Consents Tab */
        <div className="space-y-8">
          <div className="bg-white border border-[#ECECEC] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
            <div className="p-5 border-b border-[#ECECEC] flex items-center justify-between">
              <div>
                <h3 className="text-base font-serif font-black text-gray-900">
                  {lang === "ar" ? "قائمة طلبات حقوق أصحاب البيانات (DSR Queue)" : "Data Subject Requests Queue"}
                </h3>
                <p className="text-[11px] text-gray-500 font-medium mt-0.5">
                  {lang === "ar" ? "إلزام نظام حماية البيانات الشخصية بالاستجابة خلال مهلة أقصاها 30 يوماً" : "Saudi PDPL statutory fulfillment deadline: maximum 30 days from intake."}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className={`border-b border-[#ECECEC] text-[#667085] bg-gray-50/50 uppercase tracking-widest font-extrabold text-[9px] ${isRTL ? "text-right" : ""}`}>
                    <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.dsrType}</th>
                    <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>User ID</th>
                    <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.dsrStatus}</th>
                    <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.dsrDueDate}</th>
                    <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.dsrNotes}</th>
                    <th className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>{t.actions}</th>
                  </tr>
                </thead>
                <tbody className={`divide-y divide-[#F5F5F5] font-semibold text-gray-700 ${isRTL ? "text-right" : "text-left"}`}>
                  {dsrRequests.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-400 font-bold">{t.emptyDsr}</td>
                    </tr>
                  ) : (
                    dsrRequests.map((req) => (
                      <tr key={req.id} className="hover:bg-gray-50/40 transition">
                        <td className="py-4 px-6 font-bold uppercase tracking-wider text-stone-900">
                          {req.request_type}
                        </td>
                        <td className="py-4 px-6 font-mono text-[10px] text-stone-500">
                          {req.user_id.substring(0, 8)}...
                        </td>
                        <td className="py-4 px-6">
                          <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase ${
                            req.status === "completed" ? "bg-emerald-100 text-emerald-800" :
                            req.status === "pending" ? "bg-amber-100 text-amber-800" :
                            req.status === "in_progress" ? "bg-blue-100 text-blue-800" :
                            "bg-red-100 text-red-800"
                          }`}>
                            {req.status}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-stone-700 font-mono text-[11px]">
                          {req.due_date}
                        </td>
                        <td className="py-4 px-6 text-stone-600 max-w-xs truncate text-[11px]">
                          {req.admin_notes || req.details || "—"}
                        </td>
                        <td className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>
                          <div className="flex items-center gap-2 justify-end">
                            {req.status !== "completed" && (
                              <button
                                onClick={() => handleUpdateDsrStatus(req.id, "completed", "Fulfilled per customer request")}
                                className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-bold"
                              >
                                {t.actionComplete}
                              </button>
                            )}
                            {req.status !== "rejected" && req.status !== "completed" && (
                              <button
                                onClick={() => handleUpdateDsrStatus(req.id, "rejected", "Rejected per statutory exceptions")}
                                className="px-2.5 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-[9px] font-bold"
                              >
                                {t.actionReject}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Consents Log */}
          <div className="bg-white border border-[#ECECEC] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
            <div className="p-5 border-b border-[#ECECEC]">
              <h3 className="text-base font-serif font-black text-gray-900">{t.consentsTitle}</h3>
              <p className="text-[11px] text-gray-500 font-medium mt-0.5">
                {lang === "ar" ? "سجل غير قابل للتعديل يوثق موافقة العميل على التواصل عبر واتساب والتسويق" : "Immutable log verifying recorded opt-ins for WhatsApp and promotional messaging."}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className={`border-b border-[#ECECEC] text-[#667085] bg-gray-50/50 uppercase tracking-widest font-extrabold text-[9px] ${isRTL ? "text-right" : ""}`}>
                    <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>User</th>
                    <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.purpose}</th>
                    <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>Status</th>
                    <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>Version</th>
                    <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.method}</th>
                    <th className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>Timestamp</th>
                  </tr>
                </thead>
                <tbody className={`divide-y divide-[#F5F5F5] font-semibold text-gray-700 ${isRTL ? "text-right" : "text-left"}`}>
                  {consents.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-gray-400 font-bold">No recorded consent entries yet.</td>
                    </tr>
                  ) : (
                    consents.map((cs) => (
                      <tr key={cs.id} className="hover:bg-gray-50/40">
                        <td className="py-3 px-6 font-mono text-[10px] text-stone-500">{cs.user_id.substring(0, 8)}...</td>
                        <td className="py-3 px-6 font-bold text-stone-800">{cs.purpose}</td>
                        <td className="py-3 px-6">
                          <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                            cs.status === "granted" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                          }`}>
                            {cs.status}
                          </span>
                        </td>
                        <td className="py-3 px-6 text-stone-500">{cs.document_version}</td>
                        <td className="py-3 px-6 text-stone-500">{cs.method}</td>
                        <td className="py-3 px-6 text-stone-500 font-mono text-[10px] text-right">
                          {new Date(cs.created_at).toLocaleString(lang === "ar" ? "ar-SA" : "en-US")}
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
    </div>
  );
}
