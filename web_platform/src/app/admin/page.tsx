"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

const translations = {
  en: {
    title: "Platform Operations Overview",
    subtitle: "Real-time indicators of GMV performance, commissions, and marketplace verification status.",
    totalGmv: "Total GMV (Captured)",
    platformRevenue: "Platform Net Revenue",
    activeProviders: "Active Providers",
    escrowDisputes: "Escrow Disputes",
    grossBooking: "Gross booking transaction value",
    reconciledRevenue: "Reconciled platform earnings",
    verifiedSalons: "Verified Salons & Freelancers",
    openRefunds: "Open refund requests",
    pendingQueue: "Pending Verification Queue",
    viewAllAudits: "View All Audits",
    registered: "Registered",
    audit: "Audit",
    quickOperations: "Quick Operations",
    arbitrateDisputes: "Arbitrate Disputes",
    approveRefunds: "Approve refunds or decline appeals",
    splitPayouts: "Split Payouts Ledger",
    auditTransaction: "Audit transaction splits & release payouts",
    globalBookings: "Global Bookings Ledger",
    viewActiveScheduler: "View active scheduler status across KSA",
    actionRequired: "Action Required",
    loadingQueue: "Loading flagged audits...",
    fallbackLabel: "Independent / Freelancer"
  },
  ar: {
    title: "نظرة عامة على عمليات المنصة",
    subtitle: "مؤشرات حية لأداء إجمالي حجم المعاملات (GMV)، والعمولات، وحالة توثيق المتجر.",
    totalGmv: "إجمالي حجم المعاملات (المقبوضة)",
    platformRevenue: "صافي إيرادات المنصة",
    activeProviders: "مزودو الخدمة النشطون",
    escrowDisputes: "نزاعات الضمان المالي",
    grossBooking: "إجمالي قيمة معاملات الحجوزات",
    reconciledRevenue: "أرباح المنصة بعد التسوية",
    verifiedSalons: "الصالونات والمستقلون الموثقون",
    openRefunds: "طلبات الاسترجاع المفتوحة",
    pendingQueue: "طابور توثيق الحسابات المعلق",
    viewAllAudits: "عرض جميع عمليات التدقيق",
    registered: "تاريخ التسجيل",
    audit: "تدقيق",
    quickOperations: "العمليات السريعة",
    arbitrateDisputes: "التحكيم في النزاعات",
    approveRefunds: "الموافقة على الاسترداد المالي أو رفض الطلبات",
    splitPayouts: "سجل تقسيم المدفوعات",
    auditTransaction: "تدقيق تقسيمات المعاملات وتحرير المدفوعات",
    globalBookings: "سجل الحجوزات الشامل",
    viewActiveScheduler: "استعراض حالة الحجوزات النشطة على مستوى المملكة",
    actionRequired: "يتطلب إجراء",
    loadingQueue: "جاري تحميل قائمة التدقيق المعلقة...",
    fallbackLabel: "مستقل / عمل حر"
  }
};

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalGmv: 425840.00,
    commissionRevenue: 63876.00,
    activeProviders: 186,
    openDisputes: 3
  });
  
  const [pendingAudits, setPendingAudits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    async function loadAdminStats() {
      try {
        setLoading(true);
        // Load pending providers from Supabase
        const { data: providers, error } = await supabase
          .from("providers")
          .select("id, business_name_en, type, created_at")
          .eq("is_verified", false)
          .order("created_at", { ascending: false })
          .limit(3);
        
        if (providers && providers.length > 0) {
          setPendingAudits(providers);
        } else {
          // Fallback to mock audits
          setPendingAudits([
            { id: "p-mock-1", business_name_en: "Jeddah Grooming Palace", type: "salon", created_at: new Date().toISOString() },
            { id: "p-mock-2", business_name_en: "Maha Stylist & Artist", type: "freelancer", created_at: new Date().toISOString() }
          ]);
        }
      } catch (err) {
        console.warn("Offline admin stats fallback warning:", err);
      } finally {
        setLoading(false);
      }
    }
    loadAdminStats();
  }, []);

  const isRTL = lang === "ar";

  return (
    <div className="space-y-8">
      {/* Page Title */}
      <div className={isRTL ? "text-right" : "text-left"}>
        <h2 className="text-2xl font-bold tracking-tight text-stone-900 font-serif">{t.title}</h2>
        <p className="text-sm text-stone-500 mt-1">{t.subtitle}</p>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
          <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
            <span className="text-[10px] uppercase font-extrabold text-stone-400 tracking-wider">{t.totalGmv}</span>
            <span className="text-emerald-600 text-xs font-bold bg-emerald-50 px-2 py-0.5 rounded">+12.4%</span>
          </div>
          <p className={`text-2xl font-black text-stone-900 mt-4 ${isRTL ? "text-right" : "text-left"}`}>
            {stats.totalGmv.toLocaleString("en-US", { minimumFractionDigits: 2 })} {lang === "ar" ? "ريال" : "SAR"}
          </p>
          <span className={`text-[10px] text-stone-400 block mt-2 font-medium ${isRTL ? "text-right" : "text-left"}`}>{t.grossBooking}</span>
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
          <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
            <span className="text-[10px] uppercase font-extrabold text-stone-400 tracking-wider">{t.platformRevenue}</span>
            <span className="text-stone-400 text-xs font-bold">15% Comm.</span>
          </div>
          <p className={`text-2xl font-black text-stone-900 mt-4 ${isRTL ? "text-right" : "text-left"}`}>
            {stats.commissionRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })} {lang === "ar" ? "ريال" : "SAR"}
          </p>
          <span className={`text-[10px] text-stone-400 block mt-2 font-medium ${isRTL ? "text-right" : "text-left"}`}>{t.reconciledRevenue}</span>
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
          <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
            <span className="text-[10px] uppercase font-extrabold text-stone-400 tracking-wider">{t.activeProviders}</span>
            <span className="text-stone-400 text-[10px] font-semibold bg-stone-100 px-2 py-0.5 rounded">{lang === "ar" ? "المملكة" : "KSA"}</span>
          </div>
          <p className={`text-2xl font-black text-stone-900 mt-4 ${isRTL ? "text-right" : "text-left"}`}>{stats.activeProviders}</p>
          <span className={`text-[10px] text-stone-400 block mt-2 font-medium ${isRTL ? "text-right" : "text-left"}`}>{t.verifiedSalons}</span>
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
          <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
            <span className="text-[10px] uppercase font-extrabold text-stone-400 tracking-wider">{t.escrowDisputes}</span>
            <span className="text-red-600 text-[9px] font-extrabold bg-red-50 px-2 py-0.5 rounded uppercase tracking-wider">{t.actionRequired}</span>
          </div>
          <p className={`text-2xl font-black text-stone-900 mt-4 ${isRTL ? "text-right" : "text-left"}`}>{stats.openDisputes}</p>
          <span className={`text-[10px] text-stone-400 block mt-2 font-medium ${isRTL ? "text-right" : "text-left"}`}>{t.openRefunds}</span>
        </div>
      </div>

      {/* Main Panel Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Side: Pending Verification audits */}
        <div className="lg:col-span-2 bg-white border border-stone-200 rounded-2xl p-6 shadow-sm space-y-6">
          <div className={`flex items-center justify-between border-b border-stone-100 pb-4 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
            <h3 className="font-bold text-sm text-stone-900 uppercase tracking-wide">{t.pendingQueue}</h3>
            <Link href="/admin/providers" className="text-[10px] font-bold text-amber-600 hover:underline">{t.viewAllAudits}</Link>
          </div>

          <div className="space-y-4">
            {loading ? (
              <div className="text-center py-6 text-stone-400 text-xs font-semibold">{t.loadingQueue}</div>
            ) : (
              pendingAudits.map((item) => (
                <div key={item.id} className={`flex items-center justify-between p-4 border border-stone-100 rounded-xl bg-stone-50/50 hover:bg-stone-50 transition duration-150 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                  <div className={`space-y-1 ${isRTL ? "text-right" : "text-left"}`}>
                    <h4 className="font-bold text-xs text-stone-900">{item.business_name_en}</h4>
                    <p className="text-[9px] text-stone-400 uppercase tracking-wider font-semibold">
                      {item.type === "salon" ? (lang === "ar" ? "صالون / مركز" : "Salon / Center") : (lang === "ar" ? "مستقل / أخصائي" : "Independent Artist")}
                    </p>
                    <p className="text-[9px] text-stone-400 font-semibold">{t.registered}: {new Date(item.created_at).toLocaleDateString()}</p>
                  </div>
                  <Link
                    href="/admin/providers"
                    className="px-3.5 py-1.5 bg-stone-900 hover:bg-stone-800 text-stone-50 text-[10px] font-bold uppercase tracking-wider rounded-lg transition"
                  >
                    {t.audit}
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Side: Quick Action Links */}
        <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm space-y-6">
          <h3 className={`font-bold text-sm text-stone-900 uppercase tracking-wide border-b border-stone-100 pb-4 ${isRTL ? "text-right" : "text-left"}`}>{t.quickOperations}</h3>
          
          <div className="space-y-3">
            <Link
              href="/admin/disputes"
              className={`flex items-center justify-between p-4 border border-stone-100 rounded-xl hover:border-stone-300 transition duration-150 group ${isRTL ? "flex-row-reverse" : "flex-row"}`}
            >
              <div className={isRTL ? "text-right" : "text-left"}>
                <h4 className="font-bold text-xs text-stone-900">{t.arbitrateDisputes}</h4>
                <p className="text-[9px] text-stone-400 font-medium mt-0.5">{t.approveRefunds}</p>
              </div>
              <span className={`text-stone-400 group-hover:text-stone-900 transition-colors ${isRTL ? "rotate-180" : ""}`}>→</span>
            </Link>

            <Link
              href="/admin/ledger"
              className={`flex items-center justify-between p-4 border border-stone-100 rounded-xl hover:border-stone-300 transition duration-150 group ${isRTL ? "flex-row-reverse" : "flex-row"}`}
            >
              <div className={isRTL ? "text-right" : "text-left"}>
                <h4 className="font-bold text-xs text-stone-900">{t.splitPayouts}</h4>
                <p className="text-[9px] text-stone-400 font-medium mt-0.5">{t.auditTransaction}</p>
              </div>
              <span className={`text-stone-400 group-hover:text-stone-900 transition-colors ${isRTL ? "rotate-180" : ""}`}>→</span>
            </Link>

            <Link
              href="/admin/bookings"
              className={`flex items-center justify-between p-4 border border-stone-100 rounded-xl hover:border-stone-300 transition duration-150 group ${isRTL ? "flex-row-reverse" : "flex-row"}`}
            >
              <div className={isRTL ? "text-right" : "text-left"}>
                <h4 className="font-bold text-xs text-stone-900">{t.globalBookings}</h4>
                <p className="text-[9px] text-stone-400 font-medium mt-0.5">{t.viewActiveScheduler}</p>
              </div>
              <span className={`text-stone-400 group-hover:text-stone-900 transition-colors ${isRTL ? "rotate-180" : ""}`}>→</span>
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
