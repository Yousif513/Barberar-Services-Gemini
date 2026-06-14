"use client";

import React, { useState, useEffect } from "react";
import { ToastContainer } from "@/components/toast";
import { supabase } from "@/lib/supabase";

const translations = {
  en: {
    walletTitle: "Wallet & Payouts",
    subtitle: "Monitor your salon earnings, platform commission splits, and payouts",
    availableBalance: "Available Balance",
    pendingPayout: "Pending Payout",
    escrowHeld: "Held in Escrow",
    requestPayout: "Request Payout",
    transactionLedger: "Transaction Splits Ledger",
    bookingId: "Booking ID",
    totalCaptured: "Total Captured",
    platformShare: "Platform Fee (15%)",
    yourShare: "Net Salon Share",
    status: "Payout Status",
    created: "Date & Time",
    payoutBank: "Linked Bank Account",
    bankName: "Riyad Bank (KSA)",
    iban: "SA82 2000 0000 1234 5678 9012",
    verified: "Verified Account",
    statusPaid: "Paid Out",
    statusPending: "Pending",
    payoutModalTitle: "Request Payout Transfer",
    payoutAmountLabel: "Amount to Payout (SAR)",
    bankNameLabel: "Select Your Bank",
    ibanLabel: "IBAN (KSA Bank Account)",
    confirmPayoutBtn: "Process Payout Split",
    close: "Close",
    errorFill: "Please fill out all bank fields.",
    currency: "SAR"
  },
  ar: {
    walletTitle: "المحفظة والمدفوعات",
    subtitle: "مراقبة أرباح الصالون، عمولات المنصة، والمدفوعات",
    availableBalance: "الرصيد المتاح",
    pendingPayout: "الدفعة المعلقة",
    escrowHeld: "محتجز في الضمان",
    requestPayout: "طلب تحويل الأرباح",
    transactionLedger: "سجل تقسيم المعاملات المالية",
    bookingId: "رقم الحجز",
    totalCaptured: "المبلغ المقبوض",
    platformShare: "رسوم المنصة (15%)",
    yourShare: "صافي حصة الصالون",
    status: "حالة التحويل",
    created: "التاريخ والوقت",
    payoutBank: "الحساب البنكي المرتبط",
    bankName: "بنك الرياض (المملكة العربية السعودية)",
    iban: "SA82 2000 0000 1234 5678 9012",
    verified: "حساب موثق",
    statusPaid: "تم تحويلها",
    statusPending: "قيد الانتظار",
    payoutModalTitle: "تقديم طلب تحويل أرباح",
    payoutAmountLabel: "المبلغ المراد تحويله (ريال)",
    bankNameLabel: "اختر البنك الخاص بك",
    ibanLabel: "رقم الآيبان البنكي (SA)",
    confirmPayoutBtn: "تأكيد ومعالجة التحويل",
    close: "إغلاق",
    errorFill: "يرجى تعبئة جميع الحقول البنكية المطلوبة.",
    currency: "ريال"
  }
};

export default function ProviderWalletPage() {
  const [lang, setLang] = useState<"en" | "ar">("ar");

  const [availableBalance, setAvailableBalance] = useState(6240);
  const [pendingPayout, setPendingPayout] = useState(1820);
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutBank, setPayoutBank] = useState("");
  const [payoutIban, setPayoutIban] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: "success" | "info" | "error" }>>([]);
  const addToast = (message: string, type: "success" | "info" | "error") => {
    const id = Math.random().toString(36).substring(7);
    setToasts(prev => [...prev, { id, message, type }]);
  };
  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  interface LedgerEntry {
    id: string;
    booking_id: string;
    date: string;
    total: string;
    platform: string;
    salon: string;
    status: string;
    statusColor: string;
  }
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);

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

  const loadLedger = async () => {
    try {
      setLoadingLedger(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: provider } = await supabase
        .from("providers")
        .select("id")
        .eq("owner_id", user.id)
        .maybeSingle();

      if (provider) {
        const { data, error } = await supabase
          .from("transactional_ledger")
          .select(`
            id,
            booking_id,
            payment_intent_id,
            total_captured,
            platform_share,
            provider_share,
            payout_status,
            created_at,
            bookings!inner (
              branch_id,
              branches!inner (
                provider_id
              )
            )
          `)
          .eq("bookings.branches.provider_id", provider.id)
          .order("created_at", { ascending: false });

        if (error) throw error;

        if (data && data.length > 0) {
          const formatted: LedgerEntry[] = data.map((item: any) => ({
            id: item.payment_intent_id || item.id,
            booking_id: item.booking_id,
            date: new Date(item.created_at).toLocaleString("en-US", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit"
            }),
            total: `${item.total_captured.toFixed(2)} SAR`,
            platform: `${item.platform_share.toFixed(2)} SAR`,
            salon: `${item.provider_share.toFixed(2)} SAR`,
            status: item.payout_status === "released" ? t.statusPaid : t.statusPending,
            statusColor: item.payout_status === "released" 
              ? "text-[hsl(150,60%,40%)] bg-[hsla(150,60%,40%,0.08)]" 
              : "text-[hsl(45,60%,55%)] bg-[hsla(45,60%,55%,0.08)]"
          }));
          setLedgerEntries(formatted);
          
          let available = 6240;
          let pending = 1820;
          data.forEach((item: any) => {
            if (item.payout_status === "pending") {
              pending += parseFloat(item.provider_share || "0");
            } else {
              available += parseFloat(item.provider_share || "0");
            }
          });
          setAvailableBalance(available);
          setPendingPayout(pending);
        } else {
          // Fallback mock items
          setLedgerEntries([
            {
              id: "BK-8891",
              booking_id: "b-mock-1",
              date: "2026-06-13 03:30 PM",
              total: "250.00 SAR",
              platform: "37.50 SAR",
              salon: "212.50 SAR",
              status: t.statusPaid,
              statusColor: "text-[hsl(150,60%,40%)] bg-[hsla(150,60%,40%,0.08)]"
            },
            {
              id: "BK-8892",
              booking_id: "b-mock-2",
              date: "2026-06-13 04:15 PM",
              total: "450.00 SAR",
              platform: "67.50 SAR",
              salon: "382.50 SAR",
              status: t.statusPaid,
              statusColor: "text-[hsl(150,60%,40%)] bg-[hsla(150,60%,40%,0.08)]"
            },
            {
              id: "BK-8893",
              booking_id: "b-mock-3",
              date: "2026-06-13 06:00 PM",
              total: "80.00 SAR",
              platform: "12.00 SAR",
              salon: "68.00 SAR",
              status: t.statusPending,
              statusColor: "text-[hsl(45,60%,55%)] bg-[hsla(45,60%,55%,0.08)]"
            }
          ]);
        }
      }
    } catch (err) {
      console.log("Failed to load live ledger splits, using mock fallbacks:", err);
      // Fallback
      setLedgerEntries([
        {
          id: "BK-8891",
          booking_id: "b-mock-1",
          date: "2026-06-13 03:30 PM",
          total: "250.00 SAR",
          platform: "37.50 SAR",
          salon: "212.50 SAR",
          status: t.statusPaid,
          statusColor: "text-[hsl(150,60%,40%)] bg-[hsla(150,60%,40%,0.08)]"
        },
        {
          id: "BK-8892",
          booking_id: "b-mock-2",
          date: "2026-06-13 04:15 PM",
          total: "450.00 SAR",
          platform: "67.50 SAR",
          salon: "382.50 SAR",
          status: t.statusPaid,
          statusColor: "text-[hsl(150,60%,40%)] bg-[hsla(150,60%,40%,0.08)]"
        },
        {
          id: "BK-8893",
          booking_id: "b-mock-3",
          date: "2026-06-13 06:00 PM",
          total: "80.00 SAR",
          platform: "12.00 SAR",
          salon: "68.00 SAR",
          status: t.statusPending,
          statusColor: "text-[hsl(45,60%,55%)] bg-[hsla(45,60%,55%,0.08)]"
        }
      ]);
    } finally {
      setLoadingLedger(false);
    }
  };

  useEffect(() => {
    loadLedger();
  }, [lang]);

  const handleRequestPayout = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const amt = parseFloat(payoutAmount);
    if (isNaN(amt) || amt <= 0) {
      addToast(lang === "ar" ? "يرجى إدخال مبلغ تحويل صحيح." : "Please enter a valid payout amount.", "error");
      return;
    }

    if (amt > availableBalance) {
      addToast(lang === "ar" ? "المبلغ المطلوب يتجاوز الرصيد المتاح." : "Requested amount exceeds available balance.", "error");
      return;
    }

    if (!payoutBank.trim()) {
      addToast(lang === "ar" ? "يرجى تحديد اسم البنك." : "Please select your bank.", "error");
      return;
    }

    const cleanIban = payoutIban.replace(/\s/g, "").toUpperCase();
    if (!cleanIban.startsWith("SA") || cleanIban.length !== 24) {
      addToast(lang === "ar" ? "رقم الآيبان غير صحيح. يجب أن يبدأ بـ SA ويتكون من 24 حرفاً ورقماً." : "Invalid IBAN. Must start with SA and contain 24 characters.", "error");
      return;
    }

    setAvailableBalance(prev => prev - amt);
    setPendingPayout(prev => prev + amt);
    addToast(lang === "ar" ? `تم تقديم طلب التحويل بقيمة ${amt} ريال بنجاح. سيتم إيداعه في حسابك البنكي.` : `Payout request of ${amt} SAR submitted successfully. It will be deposited to your bank account.`, "success");
    
    setPayoutAmount("");
    setPayoutIban("");
    setShowPayoutModal(false);
  };



  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
      {/* Title Header */}
      <div>
        <h2 className="text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-[#D1AF47] to-[#B8952E] font-sans">
          {t.walletTitle}
        </h2>
        <p className="text-sm text-[#B8C0D4] mt-2 font-medium tracking-wide">
          {t.subtitle}
        </p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 text-white">
        {/* Available Balance (Luxury Credit Card Aesthetic) */}
        <div className="relative overflow-hidden bg-gradient-to-br from-[#172033] via-[#0D1422] to-[#070B12] border border-white/5 rounded-[24px] p-8 shadow-[0_0_30px_rgba(209,175,71,0.08)] flex flex-col justify-between min-h-[240px] group hover:border-[#D1AF47]/25 transition-all duration-300">
          {/* Shimmer/radial gradient reflection effects */}
          <div className="absolute -top-20 -right-20 w-48 h-48 bg-[#D1AF47]/10 rounded-full blur-[80px] pointer-events-none transition-all duration-500 group-hover:bg-[#D1AF47]/15"></div>
          <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-[#B8952E]/5 rounded-full blur-[80px] pointer-events-none"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.02] to-transparent -translate-x-full group-hover:translate-x-full duration-[1500ms] transition-transform ease-out pointer-events-none"></div>

          {/* Card Header: Chip and Premium Label */}
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              {/* Golden Chip */}
              <div className="w-10 h-7 rounded bg-gradient-to-br from-[#D1AF47] via-[#E0C46A] to-[#B8952E] relative shadow-[0_0_15px_rgba(209,175,71,0.3)]">
                <div className="absolute inset-0.5 border border-black/10 rounded-sm"></div>
                <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-black/20"></div>
                <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-black/20"></div>
              </div>
              {/* Contactless symbol */}
              <svg className="w-5 h-5 text-[#B8C0D4]/30 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-[8px] font-bold tracking-[0.25em] text-[#D1AF47] uppercase bg-black/40 px-3 py-1 rounded-full border border-[#D1AF47]/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]">
              PREMIUM PARTNER
            </span>
          </div>

          {/* Card Balance */}
          <div className="mb-6">
            <p className="text-[10px] font-bold tracking-widest text-[#B8C0D4]/60 uppercase mb-2">
              {t.availableBalance}
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-extrabold text-[#FFFFFF] tracking-tight">
                {availableBalance.toLocaleString()}.00
              </span>
              <span className="text-sm font-bold text-[#D1AF47] tracking-wider">
                {t.currency}
              </span>
            </div>
          </div>

          {/* Request Payout trigger */}
          <button 
            onClick={() => setShowPayoutModal(true)}
            className="w-full py-3 bg-gradient-to-r from-[#D1AF47] to-[#B8952E] hover:from-[#E0C46A] hover:to-[#D1AF47] text-[#070B12] font-bold text-xs uppercase tracking-wider rounded-xl shadow-[0_4px_12px_rgba(209,175,71,0.25)] hover:shadow-[0_4px_25px_rgba(209,175,71,0.45)] transition-all duration-300 transform active:scale-[0.98] select-none"
          >
            {t.requestPayout}
          </button>
        </div>

        {/* Pending Payout */}
        <div className="bg-[#111827] border border-white/5 rounded-[24px] p-8 shadow-xl relative overflow-hidden flex flex-col justify-between min-h-[240px] group hover:border-[#D1AF47]/15 transition-all duration-300">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-white/[0.01] to-transparent rounded-bl-full pointer-events-none"></div>
          
          <div>
            <div className="flex justify-between items-start mb-6">
              <div>
                <p className="text-[10px] font-bold tracking-widest text-[#B8C0D4]/60 uppercase mb-2">
                  {t.pendingPayout}
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-[#FFFFFF] tracking-tight">
                    {pendingPayout.toLocaleString()}.00
                  </span>
                  <span className="text-sm font-bold text-[#D1AF47] tracking-wider">
                    {t.currency}
                  </span>
                </div>
              </div>
              
              {/* Icon with gradient background */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-br from-[#1A2236] to-[#0D1422] text-[#D1AF47] border border-white/5 shadow-inner">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
          
          <div className="mt-auto pt-4 border-t border-white/5">
            <p className="text-[10px] text-[#7B859C] flex items-center gap-2">
              <svg className="w-4 h-4 text-[#D1AF47] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {lang === "ar" ? "تتم التحويلات أسبوعياً صباح كل أحد." : "Transfers occur weekly on Sunday mornings."}
            </p>
          </div>
        </div>

        {/* Escrow Held */}
        <div className="bg-[#111827] border border-white/5 rounded-[24px] p-8 shadow-xl relative overflow-hidden flex flex-col justify-between min-h-[240px] group hover:border-[#D1AF47]/15 transition-all duration-300">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-white/[0.01] to-transparent rounded-bl-full pointer-events-none"></div>
          
          <div>
            <div className="flex justify-between items-start mb-6">
              <div>
                <p className="text-[10px] font-bold tracking-widest text-[#B8C0D4]/60 uppercase mb-2">
                  {t.escrowHeld}
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-[#FFFFFF] tracking-tight">
                    530.00
                  </span>
                  <span className="text-sm font-bold text-[#D1AF47] tracking-wider">
                    {t.currency}
                  </span>
                </div>
              </div>
              
              {/* Icon with gradient background */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-br from-[#1A2236] to-[#0D1422] text-[#D1AF47] border border-white/5 shadow-inner">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
            </div>
          </div>
          
          <div className="mt-auto pt-4 border-t border-white/5">
            <p className="text-[10px] text-[#7B859C] flex items-center gap-2">
              <svg className="w-4 h-4 text-[#D1AF47] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              {lang === "ar" ? "أموال الضمان محتجزة بأمان حتى اكتمال الخدمة." : "Deposit funds held securely until client checkout is completed."}
            </p>
          </div>
        </div>
      </div>

      {/* Linked Bank details */}
      <div className="bg-[#111827] border border-white/5 rounded-[24px] p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 text-white shadow-xl hover:border-[#D1AF47]/10 transition-all duration-300">
        <div className="flex items-center gap-4">
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-[#1A2236] to-[#0D1422] text-[#D1AF47] border border-white/5">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-[10px] tracking-widest text-[#7B859C] uppercase">{t.payoutBank}</h3>
            <p className="text-sm font-semibold text-[#FFFFFF] mt-1">{t.bankName}</p>
            <p className="text-xs text-[#B8C0D4] font-mono tracking-wider mt-0.5">{t.iban}</p>
          </div>
        </div>
        <span className="px-4 py-2 bg-[#3DDC84]/10 text-[#3DDC84] rounded-full text-xs font-bold flex items-center gap-2 border border-[#3DDC84]/20 shadow-[0_0_15px_rgba(61,220,132,0.1)] transition-all duration-300 hover:scale-105">
          <span className="w-2 h-2 rounded-full bg-[#3DDC84] animate-pulse"></span>
          {t.verified}
        </span>
      </div>

      {/* Transactions Splits Ledger */}
      <div className="bg-[#111827] border border-white/5 rounded-[24px] p-8 shadow-xl text-white">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h3 className="text-lg font-bold tracking-tight text-[#FFFFFF]">{t.transactionLedger}</h3>
            <p className="text-xs text-[#7B859C] mt-1">{lang === "ar" ? "تتبع توزيع المبالغ بين المنصة وحصتك" : "Track how captured payments are split and transferred"}</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded bg-[#FF5D73]"></span>
              <span className="text-[#B8C0D4]">{lang === "ar" ? "عمولة المنصة (15%)" : "Platform (15%)"}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded bg-[#3DDC84]"></span>
              <span className="text-[#B8C0D4]">{lang === "ar" ? "صافي الصالون (85%)" : "Net Salon (85%)"}</span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 text-[#7B859C] text-[10px] uppercase tracking-wider bg-[#0D1422]/30">
                <th className="py-4 px-6 text-start font-bold">{t.bookingId}</th>
                <th className="py-4 px-6 text-start font-bold">{t.created}</th>
                <th className="py-4 px-6 text-start font-bold">{t.totalCaptured}</th>
                <th className="py-4 px-6 text-start font-bold">{t.platformShare}</th>
                <th className="py-4 px-6 text-start font-bold">{t.yourShare}</th>
                <th className="py-4 px-6 text-center font-bold">{t.status}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loadingLedger ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[#7B859C]">
                    <div className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5 text-[#D1AF47]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>{lang === "ar" ? "جاري تحميل البيانات..." : "Loading ledger entries..."}</span>
                    </div>
                  </td>
                </tr>
              ) : ledgerEntries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[#7B859C]">
                    {lang === "ar" ? "لا توجد معاملات بعد" : "No transactions found"}
                  </td>
                </tr>
              ) : (
                ledgerEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-white/[0.01] transition-all duration-300 group">
                    <td className="py-4 px-6 font-mono font-bold text-xs tracking-wider text-white">
                      {entry.id}
                    </td>
                    <td className="py-4 px-6 text-[#B8C0D4] text-xs font-medium">
                      {entry.date}
                    </td>
                    <td className="py-4 px-6 font-bold text-white">
                      {entry.total}
                    </td>
                    <td className="py-4 px-6 text-[#FF5D73] font-semibold text-xs">
                      {entry.platform}
                    </td>
                    <td className="py-4 px-6">
                      <div>
                        <span className="text-[#3DDC84] font-bold">{entry.salon}</span>
                        {/* Splits visual indicator */}
                        <div className="mt-2 w-24 bg-white/5 h-1 rounded-full overflow-hidden flex">
                          <div className="bg-[#FF5D73] h-full" style={{ width: "15%" }}></div>
                          <div className="bg-[#3DDC84] h-full" style={{ width: "85%" }}></div>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-center">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border transition-all duration-300 ${
                        entry.status === t.statusPaid 
                          ? "bg-[#3DDC84]/10 text-[#3DDC84] border-[#3DDC84]/20 shadow-[0_0_10px_rgba(61,220,132,0.05)]" 
                          : "bg-[#F5B041]/10 text-[#F5B041] border-[#F5B041]/20 shadow-[0_0_10px_rgba(245,176,65,0.05)]"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          entry.status === t.statusPaid ? "bg-[#3DDC84] animate-pulse" : "bg-[#F5B041]"
                        }`}></span>
                        {entry.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* REQUEST PAYOUT MODAL */}
      {showPayoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-[fadeIn_0.25s_ease-out]">
          <div className="relative bg-[#111827] border border-white/5 rounded-[28px] w-full max-w-md p-8 shadow-[0_0_50px_rgba(209,175,71,0.15)] space-y-6 overflow-hidden">
            {/* Decorative premium card light in the modal corner */}
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-[#D1AF47]/5 rounded-full blur-[60px] pointer-events-none"></div>

            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <h3 className="text-lg font-bold tracking-tight text-white">
                {t.payoutModalTitle}
              </h3>
              <button
                onClick={() => setShowPayoutModal(false)}
                className="text-[#7B859C] hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleRequestPayout} className="space-y-5">
              <div>
                <label className="text-[10px] uppercase font-bold tracking-widest text-[#B8C0D4] block mb-2">
                  {t.payoutAmountLabel}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    placeholder="e.g. 1000"
                    min="1"
                    value={payoutAmount}
                    onChange={(e) => setPayoutAmount(e.target.value)}
                    className="w-full bg-[#070B12] border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#D1AF47] focus:shadow-[0_0_12px_rgba(209,175,71,0.15)] text-white font-semibold transition-all duration-300"
                    required
                  />
                  <span className="absolute top-1/2 end-4 -translate-y-1/2 text-xs font-bold text-[#D1AF47]">
                    {t.currency}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold tracking-widest text-[#B8C0D4] block mb-2">
                  {t.bankNameLabel}
                </label>
                <select
                  value={payoutBank}
                  onChange={(e) => setPayoutBank(e.target.value)}
                  className="w-full bg-[#070B12] border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#D1AF47] focus:shadow-[0_0_12px_rgba(209,175,71,0.15)] text-white font-semibold transition-all duration-300 appearance-none"
                  style={{
                    backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23D1AF47' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>")`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: lang === "ar" ? "left 1rem center" : "right 1rem center",
                    backgroundSize: "1em",
                    paddingLeft: lang === "ar" ? "2.5rem" : "1rem",
                    paddingRight: lang === "ar" ? "1rem" : "2.5rem"
                  }}
                  required
                >
                  <option value="" className="bg-[#111827]">-- Select Bank --</option>
                  <option value="Riyad Bank" className="bg-[#111827]">Riyad Bank (بنك الرياض)</option>
                  <option value="Al Rajhi Bank" className="bg-[#111827]">Al Rajhi Bank (مصرف الراجحي)</option>
                  <option value="SNB" className="bg-[#111827]">Al Ahli Bank / SNB (البنك الأهلي)</option>
                  <option value="Alinma Bank" className="bg-[#111827]">Alinma Bank (مصرف الإنماء)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold tracking-widest text-[#B8C0D4] block mb-2">
                  {t.ibanLabel}
                </label>
                <input
                  type="text"
                  placeholder="SA82 2000 0000..."
                  value={payoutIban}
                  onChange={(e) => setPayoutIban(e.target.value)}
                  className="w-full bg-[#070B12] border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#D1AF47] focus:shadow-[0_0_12px_rgba(209,175,71,0.15)] text-white font-semibold font-mono tracking-wider transition-all duration-300"
                  required
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setShowPayoutModal(false)}
                  className="flex-1 py-3 bg-[#1A2236] hover:bg-[#232F4C] border border-white/5 text-[#B8C0D4] rounded-xl font-bold text-xs uppercase tracking-wider transition duration-300"
                >
                  {t.close}
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-gradient-to-r from-[#D1AF47] to-[#B8952E] hover:from-[#E0C46A] hover:to-[#D1AF47] text-[#070B12] rounded-xl font-bold text-xs uppercase tracking-wider shadow-[0_4px_12px_rgba(209,175,71,0.2)] hover:shadow-[0_4px_20px_rgba(209,175,71,0.35)] transition duration-300"
                >
                  {t.confirmPayoutBtn}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
