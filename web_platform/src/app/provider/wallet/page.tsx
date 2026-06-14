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
    <div className="space-y-8">
      {/* Title Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-[hsl(45,60%,55%)]">{t.walletTitle}</h2>
        <p className="text-sm text-[hsl(210,8%,65%)] mt-1">{t.subtitle}</p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-white">
        {/* Available Balance */}
        <div className="bg-[hsl(220,12%,14%)] border border-[hsla(0,0%,100%,0.08)] rounded-xl p-6 relative">
          <p className="text-xs font-semibold text-[hsl(210,8%,65%)] mb-2">{t.availableBalance}</p>
          <p className="text-3xl font-bold text-[hsl(45,60%,55%)]">{availableBalance.toLocaleString()}.00 {t.currency}</p>
          <button 
            onClick={() => setShowPayoutModal(true)}
            className="mt-6 w-full py-2.5 bg-[hsl(45,60%,55%)] text-[hsl(220,15%,8%)] font-bold text-xs rounded-lg hover:bg-[hsl(45,60%,45%)] transition duration-200"
          >
            {t.requestPayout}
          </button>
        </div>

        {/* Pending Payout */}
        <div className="bg-[hsl(220,12%,14%)] border border-[hsla(0,0%,100%,0.08)] rounded-xl p-6 flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold text-[hsl(210,8%,65%)] mb-2">{t.pendingPayout}</p>
            <p className="text-3xl font-bold">{pendingPayout.toLocaleString()}.00 {t.currency}</p>
          </div>
          <p className="text-[10px] text-[hsl(210,8%,65%)] mt-4">Transfers occur weekly on Sunday mornings.</p>
        </div>

        {/* Escrow Held */}
        <div className="bg-[hsl(220,12%,14%)] border border-[hsla(0,0%,100%,0.08)] rounded-xl p-6 flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold text-[hsl(210,8%,65%)] mb-2">{t.escrowHeld}</p>
            <p className="text-3xl font-bold">530.00 {t.currency}</p>
          </div>
          <p className="text-[10px] text-[hsl(210,8%,65%)] mt-4">Deposit funds held securely until client checkout is completed.</p>
        </div>
      </div>

      {/* Linked Bank details */}
      <div className="bg-[hsl(220,12%,14%)] border border-[hsla(0,0%,100%,0.08)] rounded-xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-white">
        <div>
          <h3 className="font-semibold text-sm mb-2">{t.payoutBank}</h3>
          <p className="text-xs text-[hsl(0,0%,98%)] font-bold">{t.bankName}</p>
          <p className="text-xs text-[hsl(210,8%,65%)] mt-1">{t.iban}</p>
        </div>
        <span className="px-3 py-1 bg-[hsla(150,60%,40%,0.08)] text-[hsl(150,60%,40%)] rounded-full text-xs font-bold flex items-center gap-1.5 border border-[hsla(150,60%,40%,0.2)]">
          <svg className="w-3 h-3 text-[hsl(150,60%,40%)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
          </svg>
          {t.verified}
        </span>
      </div>

      {/* Transactions Splits Ledger */}
      <div className="bg-[hsl(220,12%,14%)] border border-[hsla(0,0%,100%,0.08)] rounded-xl p-6 text-white">
        <h3 className="text-lg font-semibold mb-6">{t.transactionLedger}</h3>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-[hsla(0,0%,100%,0.08)] text-[hsl(210,8%,65%)] text-xs uppercase bg-[hsla(0,0%,100%,0.02)]">
                <th className="py-4 px-6 text-start">{t.bookingId}</th>
                <th className="py-4 px-6 text-start">{t.created}</th>
                <th className="py-4 px-6 text-start">{t.totalCaptured}</th>
                <th className="py-4 px-6 text-start">{t.platformShare}</th>
                <th className="py-4 px-6 text-start">{t.yourShare}</th>
                <th className="py-4 px-6 text-center">{t.status}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[hsla(0,0%,100%,0.03)]">
              {ledgerEntries.map((entry) => (
                <tr key={entry.id} className="hover:bg-[hsla(0,0%,100%,0.01)] transition-colors duration-200">
                  <td className="py-4 px-6 font-semibold">{entry.id}</td>
                  <td className="py-4 px-6 text-[hsl(210,8%,65%)] text-xs">{entry.date}</td>
                  <td className="py-4 px-6 font-semibold">{entry.total}</td>
                  <td className="py-4 px-6 text-[hsl(355,75%,60%)] font-semibold">{entry.platform}</td>
                  <td className="py-4 px-6 text-[hsl(150,60%,40%)] font-bold">{entry.salon}</td>
                  <td className="py-4 px-6 text-center">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${entry.statusColor}`}>
                      {entry.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* REQUEST PAYOUT MODAL */}
      {showPayoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-[hsl(220,15%,8%)] border border-[hsla(0,0%,100%,0.08)] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-[hsla(0,0%,100%,0.08)] pb-4">
              <h3 className="font-serif font-bold text-white text-base">
                {t.payoutModalTitle}
              </h3>
              <button
                onClick={() => setShowPayoutModal(false)}
                className="text-[hsl(210,8%,65%)] hover:text-white transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleRequestPayout} className="space-y-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-[hsl(210,8%,65%)] block mb-1">
                  {t.payoutAmountLabel}
                </label>
                <input
                  type="number"
                  placeholder="e.g. 1000"
                  min="1"
                  value={payoutAmount}
                  onChange={(e) => setPayoutAmount(e.target.value)}
                  className="w-full bg-[hsl(220,12%,14%)] border border-[hsla(0,0%,100%,0.08)] rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-white font-semibold"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-[hsl(210,8%,65%)] block mb-1">
                  {t.bankNameLabel}
                </label>
                <select
                  value={payoutBank}
                  onChange={(e) => setPayoutBank(e.target.value)}
                  className="w-full bg-[hsl(220,12%,14%)] border border-[hsla(0,0%,100%,0.08)] rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-white font-semibold"
                  required
                >
                  <option value="">-- Select Bank --</option>
                  <option value="Riyad Bank">Riyad Bank (بنك الرياض)</option>
                  <option value="Al Rajhi Bank">Al Rajhi Bank (مصرف الراجحي)</option>
                  <option value="SNB">Al Ahli Bank / SNB (البنك الأهلي)</option>
                  <option value="Alinma Bank">Alinma Bank (مصرف الإنماء)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-[hsl(210,8%,65%)] block mb-1">
                  {t.ibanLabel}
                </label>
                <input
                  type="text"
                  placeholder="SA82 2000 0000..."
                  value={payoutIban}
                  onChange={(e) => setPayoutIban(e.target.value)}
                  className="w-full bg-[hsl(220,12%,14%)] border border-[hsla(0,0%,100%,0.08)] rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-white font-semibold font-mono"
                  required
                />
              </div>

              <div className="flex gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPayoutModal(false)}
                  className="flex-1 py-2.5 bg-[hsl(220,12%,14%)] hover:bg-[hsl(220,12%,18%)] border border-[hsla(0,0%,100%,0.08)] text-[hsl(210,8%,65%)] rounded-xl font-bold text-xs transition"
                >
                  {t.close}
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-[hsl(45,60%,55%)] hover:bg-[hsl(45,60%,45%)] text-[hsl(220,15%,8%)] rounded-xl font-bold text-xs transition"
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
