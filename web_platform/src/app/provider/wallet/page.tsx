"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ToastContainer } from "@/components/toast";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";
import { isReauthRequired } from "@/lib/step-up";

const translations = {
  en: {
    walletTitle: "Wallet & Payouts",
    subtitle: "Monitor your salon earnings, platform commission splits, and payouts",
    availableBalance: "Available Balance",
    pendingPayout: "Pending Payout",
    escrowHeld: "Awaiting Visit Completion",
    requestPayout: "Request Payout",
    transactionLedger: "Transaction Splits Ledger",
    bookingId: "Booking ID",
    totalCaptured: "Total Captured",
    platformShare: "Platform Fee (15%)",
    yourShare: "Net Salon Share",
    status: "Payout Status",
    created: "Date & Time",
    payoutBank: "Linked Bank Account",
    noAccount: "No payout bank account yet. Add one; PRIMORA finance approves it before the first payout.",
    accountApproved: "Approved",
    accountOnHold: "Approved; payouts to it start after {date} (48-hour safety hold)",
    accountPending: "Change waiting for approval by PRIMORA finance: {iban}",
    accountRejected: "Your last bank account change was not approved. Contact PRIMORA support or submit it again.",
    holderShown: "Account holder: {name}",
    changeAccount: "Change bank account",
    addAccount: "Add bank account",
    changeTitle: "Payout bank account",
    changeIntro: "For your security you sign in again before changing the account, PRIMORA finance checks the holder name against your commercial registration, and payouts to a new account start 48 hours after approval. You are notified on your registered phone and email.",
    holderLabel: "Account holder name (as registered at the bank)",
    changeSubmit: "Submit for approval",
    changeSubmitted: "Bank account submitted. PRIMORA finance approves it; you are notified.",
    reauthNeeded: "For your security, sign in again (within the last 10 minutes) to change the payout bank account.",
    signInAgain: "Sign in again",
    payoutTo: "Paid to {bank} · {iban}",
    payoutNeedsAccount: "Add a bank account and wait for its approval before requesting a payout.",
    statusPaid: "Paid Out",
    statusPending: "Pending",
    payoutModalTitle: "Request Payout Transfer",
    payoutAmountLabel: "Amount to Payout (SAR)",
    bankNameLabel: "Select Your Bank",
    ibanLabel: "IBAN (KSA Bank Account)",
    confirmPayoutBtn: "Process Payout Split",
    payoutRequests: "Payout Requests",
    payoutRequestsSubtitle: "Track withdrawal requests awaiting admin settlement.",
    payoutRequestId: "Request ID",
    payoutRequestedAt: "Requested",
    payoutAmount: "Amount",
    payoutBankColumn: "Bank",
    payoutStatusRequested: "Requested",
    payoutStatusProcessing: "Processing",
    payoutStatusPaid: "Paid",
    payoutStatusRejected: "Rejected",
    employeeEarnings: "Employee Earnings",
    employeeEarningsSubtitle: "Stylist share statements from completed bookings.",
    employeeName: "Employee",
    month: "Month",
    employeeCompleted: "Completed",
    totalEarnings: "Total Earnings",
    noEmployeeEarnings: "No employee earnings rows yet.",
    noPayoutRequests: "No payout requests yet",
    requestSubmitted: "Payout request submitted for admin review.",
    requestFailed: "Unable to submit payout request.",
    noProviderAccount: "No provider account was found for this session.",
    signInRequired: "Sign in with a provider account to request a payout.",
    submitting: "Submitting...",
    close: "Close",
    errorFill: "Please fill out all bank fields.",
    currency: "SAR"
  },
  ar: {
    walletTitle: "المحفظة والمدفوعات",
    subtitle: "مراقبة أرباح الصالون، عمولات المنصة، والمدفوعات",
    availableBalance: "الرصيد المتاح",
    pendingPayout: "الدفعة المعلقة",
    escrowHeld: "بانتظار اكتمال الزيارة",
    requestPayout: "طلب تحويل الأرباح",
    transactionLedger: "سجل تقسيم المعاملات المالية",
    bookingId: "رقم الحجز",
    totalCaptured: "المبلغ المقبوض",
    platformShare: "رسوم المنصة (15%)",
    yourShare: "صافي حصة الصالون",
    status: "حالة التحويل",
    created: "التاريخ والوقت",
    payoutBank: "الحساب البنكي المرتبط",
    statusPaid: "تم تحويلها",
    statusPending: "قيد الانتظار",
    payoutModalTitle: "تقديم طلب تحويل أرباح",
    payoutAmountLabel: "المبلغ المراد تحويله (ريال)",
    bankNameLabel: "اختر البنك الخاص بك",
    ibanLabel: "رقم الآيبان البنكي (SA)",
    confirmPayoutBtn: "تأكيد ومعالجة التحويل",
    payoutRequests: "طلبات التحويل",
    payoutRequestsSubtitle: "متابعة طلبات السحب بانتظار تسوية الإدارة.",
    payoutRequestId: "رقم الطلب",
    payoutRequestedAt: "تاريخ الطلب",
    payoutAmount: "المبلغ",
    payoutBankColumn: "البنك",
    payoutStatusRequested: "تم الطلب",
    payoutStatusProcessing: "قيد المعالجة",
    payoutStatusPaid: "مدفوع",
    payoutStatusRejected: "مرفوض",
    employeeEarnings: "أرباح الموظفين",
    employeeEarningsSubtitle: "كشوف حصة الأخصائيين من الحجوزات المكتملة.",
    employeeName: "الموظف",
    month: "الشهر",
    employeeCompleted: "المكتملة",
    totalEarnings: "إجمالي الأرباح",
    noEmployeeEarnings: "لا توجد سجلات أرباح موظفين بعد.",
    noPayoutRequests: "لا توجد طلبات تحويل بعد",
    requestSubmitted: "تم إرسال طلب التحويل لمراجعة الإدارة.",
    requestFailed: "تعذر إرسال طلب التحويل.",
    noProviderAccount: "لم يتم العثور على حساب مزود لهذه الجلسة.",
    noAccount: "لا يوجد حساب بنكي للتحويلات بعد. أضِف حساباً؛ تعتمده إدارة المالية في PRIMORA قبل أول تحويل.",
    accountApproved: "معتمد",
    accountOnHold: "معتمد؛ تبدأ التحويلات إليه بعد {date} (فترة أمان 48 ساعة)",
    accountPending: "تغيير بانتظار اعتماد مالية PRIMORA: {iban}",
    accountRejected: "لم يُعتمد آخر تغيير لحسابك البنكي. تواصل مع دعم PRIMORA أو قدّمه من جديد.",
    holderShown: "صاحب الحساب: {name}",
    changeAccount: "تغيير الحساب البنكي",
    addAccount: "إضافة حساب بنكي",
    changeTitle: "الحساب البنكي للتحويلات",
    changeIntro: "لحمايتك تسجّل الدخول من جديد قبل تغيير الحساب، وتطابق مالية PRIMORA اسم صاحب الحساب مع سجلك التجاري، وتبدأ التحويلات إلى الحساب الجديد بعد 48 ساعة من الاعتماد. يصلك إشعار على جوالك وبريدك المسجلين.",
    holderLabel: "اسم صاحب الحساب (كما هو مسجل في البنك)",
    changeSubmit: "إرسال للاعتماد",
    changeSubmitted: "أُرسل الحساب البنكي. تعتمده مالية PRIMORA ويصلك إشعار.",
    reauthNeeded: "لحمايتك، سجّل الدخول من جديد (خلال آخر 10 دقائق) لتغيير الحساب البنكي للتحويلات.",
    signInAgain: "تسجيل الدخول من جديد",
    payoutTo: "يُحوَّل إلى {bank} · {iban}",
    payoutNeedsAccount: "أضِف حساباً بنكياً وانتظر اعتماده قبل طلب تحويل.",
    signInRequired: "سجل الدخول بحساب مزود لطلب التحويل.",
    submitting: "جار الإرسال...",
    close: "إغلاق",
    errorFill: "يرجى تعبئة جميع الحقول البنكية المطلوبة.",
    currency: "ريال"
  }
};

export default function ProviderWalletPage() {
  const router = useRouter();
  const [lang, setLang] = useState<"en" | "ar">("ar");

  const [availableBalance, setAvailableBalance] = useState(0);
  const [pendingPayout, setPendingPayout] = useState(0);
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutBank, setPayoutBank] = useState("");
  const [payoutIban, setPayoutIban] = useState("");
  const [payoutHolder, setPayoutHolder] = useState("");
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [needsReauth, setNeedsReauth] = useState(false);
  type DestinationSummary = {
    active: { bank_name: string; account_holder_name: string | null; iban_masked: string; hold_until: string | null; on_hold: boolean } | null;
    pending: { bank_name: string; iban_masked: string; requested_at: string } | null;
    last_rejected_at: string | null;
  };
  const [destination, setDestination] = useState<DestinationSummary | null>(null);
  const [providerId, setProviderId] = useState("");
  const [submittingPayout, setSubmittingPayout] = useState(false);
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
  interface PayoutRequest {
    id: string;
    requestedAt: string;
    amount: string;
    bankName: string;
    iban: string;
    status: string;
    statusClass: string;
  }
  interface EmployeeEarning {
    id: string;
    employeeName: string;
    month: string;
    completedBookings: number;
    earnings: string;
  }
  type EmployeeEarningsRow = {
    employee_id?: string | null;
    month_start?: string | null;
    total_completed_bookings?: number | string | null;
    total_employee_earnings?: number | string | null;
    employees?: {
      name_en?: string | null;
      name_ar?: string | null;
    } | null;
  };
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [payoutRequests, setPayoutRequests] = useState<PayoutRequest[]>([]);
  const [employeeEarnings, setEmployeeEarnings] = useState<EmployeeEarning[]>([]);
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

  const formatSar = (value: unknown) => `${Number(value || 0).toFixed(2)} SAR`;

  const payoutStatusLabel = (status: string) => {
    if (status === "processing") return t.payoutStatusProcessing;
    if (status === "paid") return t.payoutStatusPaid;
    if (status === "rejected") return t.payoutStatusRejected;
    return t.payoutStatusRequested;
  };

  const payoutStatusClass = (status: string) => {
    if (status === "paid") return "bg-[#3DDC84]/10 text-[#22C55E] border-[#3DDC84]/20";
    if (status === "rejected") return "bg-[#FF5D73]/10 text-[#EF4444] border-[#FF5D73]/20";
    if (status === "processing") return "bg-[#D1AF47]/10 text-[#D1AF47] border-[#D1AF47]/20";
    return "bg-[#F5B041]/10 text-[#F5B041] border-[#F5B041]/20";
  };

  const loadWalletData = async () => {
    try {
      setLoadingLedger(true);
      setError("");

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setProviderId("");
        setLedgerEntries([]);
        setPayoutRequests([]);
        setEmployeeEarnings([]);
        setAvailableBalance(0);
        setPendingPayout(0);
        return;
      }

      const { data: provider, error: providerError } = await supabase
        .from("providers")
        .select("id")
        .eq("owner_id", user.id)
        .maybeSingle();

      if (providerError) throw providerError;
      if (!provider) {
        setProviderId("");
        setLedgerEntries([]);
        setPayoutRequests([]);
        setEmployeeEarnings([]);
        setAvailableBalance(0);
        setPendingPayout(0);
        setError(t.noProviderAccount);
        return;
      }

      setProviderId(provider.id);

      const { data: ledgerData, error: ledgerError } = await supabase
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

      if (ledgerError) throw ledgerError;

      const { data: requestData, error: requestError } = await supabase
        .from("payout_requests")
        .select("id, amount, bank_name, iban_masked, status, requested_at")
        .eq("provider_id", provider.id)
        .order("requested_at", { ascending: false });

      if (requestError) throw requestError;

      // GOV-1 / Q3: the approved payout account, masked; the full IBAN never reaches the browser.
      const { data: destinationData, error: destinationError } = await supabase.rpc("provider_payout_destination_summary", { p_provider_id: provider.id });
      if (destinationError) throw destinationError;
      setDestination(destinationData as DestinationSummary);

      let earningsRows: EmployeeEarningsRow[] = [];
      try {
        const { data: earningsData, error: earningsError } = await supabase
          .from("employee_earnings_summary")
          .select("employee_id, month_start, total_completed_bookings, total_employee_earnings, employees!inner(name_en, name_ar, branch_id, branches!inner(provider_id))")
          .eq("employees.branches.provider_id", provider.id)
          .order("month_start", { ascending: false });
        if (earningsError) throw earningsError;
        earningsRows = (earningsData as EmployeeEarningsRow[] | null) ?? [];
      } catch (earningsError) {
        console.warn("Employee earnings summary unavailable, hiding wallet section rows:", earningsError);
      }

      const formattedLedger: LedgerEntry[] = (ledgerData || []).map((item: any) => ({
        id: item.payment_intent_id || item.id,
        booking_id: item.booking_id,
        date: new Date(item.created_at).toLocaleString("en-US", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        }),
        total: formatSar(item.total_captured),
        platform: formatSar(item.platform_share),
        salon: formatSar(item.provider_share),
        status: item.payout_status === "released" ? t.statusPaid : t.statusPending,
        statusColor: item.payout_status === "released"
          ? "text-[hsl(150,60%,40%)] bg-[hsla(150,60%,40%,0.08)]"
          : "text-[hsl(45,60%,55%)] bg-[hsla(45,60%,55%,0.08)]"
      }));

      const formattedRequests: PayoutRequest[] = (requestData || []).map((item: any) => ({
        id: item.id,
        requestedAt: new Date(item.requested_at).toLocaleString("en-US", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        }),
        amount: formatSar(item.amount),
        bankName: item.bank_name,
        iban: item.iban_masked ?? "",
        status: payoutStatusLabel(item.status),
        statusClass: payoutStatusClass(item.status)
      }));

      const formattedEmployeeEarnings: EmployeeEarning[] = earningsRows.map((item) => ({
        id: `${item.employee_id ?? "employee"}-${item.month_start ?? "month"}`,
        employeeName: lang === "ar"
          ? item.employees?.name_ar || item.employees?.name_en || "موظف"
          : item.employees?.name_en || item.employees?.name_ar || "Employee",
        month: item.month_start
          ? new Date(item.month_start).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US", { month: "short", year: "numeric" })
          : "—",
        completedBookings: Number(item.total_completed_bookings || 0),
        earnings: formatSar(item.total_employee_earnings)
      }));

      const openRequestedAmount = (requestData || [])
        .filter((item: any) => item.status === "requested" || item.status === "processing")
        .reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);

      const withdrawableLedgerAmount = (ledgerData || [])
        .filter((item: any) => item.payout_status === "pending")
        .reduce((sum: number, item: any) => sum + Number(item.provider_share || 0), 0);

      setLedgerEntries(formattedLedger);
      setPayoutRequests(formattedRequests);
      setEmployeeEarnings(formattedEmployeeEarnings);
      setAvailableBalance(Math.max(withdrawableLedgerAmount - openRequestedAmount, 0));
      setPendingPayout(openRequestedAmount);
    } catch (err) {
      console.error("Failed to load provider wallet data:", err);
      setLedgerEntries([]);
      setPayoutRequests([]);
      setEmployeeEarnings([]);
      setAvailableBalance(0);
      setPendingPayout(0);
      setError(lang === "ar" ? "تعذر تحميل بيانات المحفظة." : "Unable to load wallet data.");
    } finally {
      setLoadingLedger(false);
    }
  };

  useEffect(() => {
    loadWalletData();
  }, [lang]);

  const handleRequestPayout = async (e: React.FormEvent) => {
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

    if (!destination?.active) {
      addToast(t.payoutNeedsAccount, "error");
      return;
    }

    if (!providerId) {
      addToast(t.signInRequired, "error");
      return;
    }

    try {
      setSubmittingPayout(true);
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        addToast(t.signInRequired, "error");
        return;
      }

      const { error: rpcError } = await supabase.rpc("request_provider_payout", {
        p_provider_id: providerId,
        p_amount: amt,
        p_bank_name: null,
        p_iban: null,
      });

      if (rpcError) throw rpcError;

      addToast(t.requestSubmitted, "success");
      setPayoutAmount("");
      setShowPayoutModal(false);
      await loadWalletData();
    } catch (err) {
      console.error("Failed to submit payout request:", err);
      addToast(`${t.requestFailed} ${errorMessage(err)}`, "error");
    } finally {
      setSubmittingPayout(false);
    }
  };



  const handleChangeAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccountError("");
    setNeedsReauth(false);
    const cleanIban = payoutIban.replace(/\s/g, "").toUpperCase();
    if (!/^SA[0-9]{22}$/.test(cleanIban)) {
      setAccountError(lang === "ar" ? "رقم الآيبان غير صحيح: SA متبوعة بـ 22 رقماً." : "Invalid IBAN: SA followed by 22 digits.");
      return;
    }
    if (!payoutBank.trim() || payoutHolder.trim().length < 3) {
      setAccountError(t.errorFill);
      return;
    }
    setSubmittingPayout(true);
    const { data, error: rpcError } = await supabase.rpc("provider_request_payout_destination", {
      p_provider_id: providerId,
      p_bank_name: payoutBank.trim(),
      p_account_holder_name: payoutHolder.trim(),
      p_iban: cleanIban,
    });
    setSubmittingPayout(false);
    if (rpcError) {
      if (isReauthRequired(rpcError)) setNeedsReauth(true);
      else setAccountError(errorMessage(rpcError));
      return;
    }
    setDestination(data as DestinationSummary);
    setPayoutIban("");
    setShowAccountModal(false);
    addToast(t.changeSubmitted, "success");
  };

  const signInAgain = async () => {
    await supabase.auth.signOut({ scope: "local" });
    router.replace(`/login?returnUrl=${encodeURIComponent("/provider/wallet")}`);
  };

  const holdDate = (value: string | null) =>
    value ? new Date(value).toLocaleString(lang === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }) : "";

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
      {/* Title Header */}
      <div className="border-b border-[#ECECEC] pb-6">
        <h2 className="text-3xl font-extrabold tracking-tight text-[#101828] font-sans flex items-center gap-3">
          <span className="w-1.5 h-8 bg-[#D1AF47] rounded-full shadow-[0_0_15px_rgba(209,175,71,0.6)]"></span>
          {t.walletTitle}
        </h2>
        <p className="text-sm text-[#667085] mt-2 font-medium tracking-wide">
          {t.subtitle}
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-[#FF5D73]/20 bg-[#FF5D73]/10 px-4 py-3 text-xs font-bold text-[#FFB3BE]">
          {error}
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 text-[#101828]">
        {/* Available Balance (Luxury Credit Card Aesthetic) */}
        <div className="relative overflow-hidden bg-white border border-[#ECECEC] rounded-[24px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.015)] flex flex-col justify-between min-h-[240px] group hover:border-[#D1AF47]/25 transition-all duration-300">
          {/* Shimmer/radial gradient reflection effects */}
          <div className="absolute -top-20 -right-20 w-48 h-48 bg-[#D1AF47]/5 rounded-full blur-[80px] pointer-events-none transition-all duration-500 group-hover:bg-[#D1AF47]/10"></div>
          <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-[#B8952E]/5 rounded-full blur-[80px] pointer-events-none"></div>

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
              <svg className="w-5 h-5 text-[#D1AF47]/40 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-[8px] font-bold tracking-[0.25em] text-[#D1AF47] uppercase bg-[#D1AF47]/10 px-3 py-1 rounded-full border border-[#D1AF47]/20 shadow-sm">
              PREMIUM PARTNER
            </span>
          </div>

          {/* Card Balance */}
          <div className="mb-6">
            <p className="text-[10px] font-bold tracking-widest text-[#667085] uppercase mb-2">
              {t.availableBalance}
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-extrabold text-[#101828] tracking-tight">
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
            disabled={availableBalance <= 0 || !providerId}
            className="w-full py-3 bg-gradient-to-r from-[#D1AF47] to-[#B8952E] hover:from-[#E0C46A] hover:to-[#D1AF47] text-[#070B12] font-bold text-xs uppercase tracking-wider rounded-xl shadow-[0_4px_12px_rgba(209,175,71,0.25)] hover:shadow-[0_4px_25px_rgba(209,175,71,0.45)] transition-all duration-300 transform active:scale-[0.98] select-none disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:shadow-[0_4px_12px_rgba(209,175,71,0.25)]"
          >
            {t.requestPayout}
          </button>
        </div>

        {/* Pending Payout */}
        <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] rounded-[24px] p-8 relative overflow-hidden flex flex-col justify-between min-h-[240px] group hover:border-[#D1AF47]/15 transition-all duration-300">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-white/[0.01] to-transparent rounded-bl-full pointer-events-none"></div>
          
          <div>
            <div className="flex justify-between items-start mb-6">
              <div>
                <p className="text-[10px] font-bold tracking-widest text-[#667085] uppercase mb-2">
                  {t.pendingPayout}
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-[#101828] tracking-tight">
                    {pendingPayout.toLocaleString()}.00
                  </span>
                  <span className="text-sm font-bold text-[#D1AF47] tracking-wider">
                    {t.currency}
                  </span>
                </div>
              </div>
              
              {/* Icon with gradient background */}
              <div className="p-3.5 rounded-2xl bg-[#FBFAF7] text-[#D1AF47] border border-[#ECECEC] shadow-inner">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
          
          <div className="mt-auto pt-4 border-t border-[#ECECEC]">
            <p className="text-[10px] text-[#667085] flex items-center gap-2">
              <svg className="w-4 h-4 text-[#D1AF47] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {lang === "ar" ? "تتم التحويلات أسبوعياً صباح كل أحد." : "Transfers occur weekly on Sunday mornings."}
            </p>
          </div>
        </div>

        {/* Escrow Held */}
        <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] rounded-[24px] p-8 relative overflow-hidden flex flex-col justify-between min-h-[240px] group hover:border-[#D1AF47]/15 transition-all duration-300">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-white/[0.01] to-transparent rounded-bl-full pointer-events-none"></div>
          
          <div>
            <div className="flex justify-between items-start mb-6">
              <div>
                <p className="text-[10px] font-bold tracking-widest text-[#667085] uppercase mb-2">
                  {t.escrowHeld}
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-[#101828] tracking-tight">
                    530.00
                  </span>
                  <span className="text-sm font-bold text-[#D1AF47] tracking-wider">
                    {t.currency}
                  </span>
                </div>
              </div>
              
              {/* Icon with gradient background */}
              <div className="p-3.5 rounded-2xl bg-[#FBFAF7] text-[#D1AF47] border border-[#ECECEC] shadow-inner">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
            </div>
          </div>
          
          <div className="mt-auto pt-4 border-t border-[#ECECEC]">
            <p className="text-[10px] text-[#667085] flex items-center gap-2">
              <svg className="w-4 h-4 text-[#D1AF47] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              {lang === "ar" ? "أموال الضمان محتجزة بأمان حتى اكتمال الخدمة." : "Deposit funds held securely until client checkout is completed."}
            </p>
          </div>
        </div>
      </div>

      {/* Linked Bank details */}
      <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] rounded-[24px] p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 text-[#101828] hover:border-[#D1AF47]/10 transition-all duration-300">
        <div className="flex items-center gap-4">
          <div className="p-3.5 rounded-2xl bg-[#FBFAF7] text-[#D1AF47] border border-[#ECECEC]">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-[10px] tracking-widest text-[#667085] uppercase">{t.payoutBank}</h3>
            {destination?.active ? (
              <>
                <p className="text-sm font-semibold text-[#101828] mt-1">{destination.active.bank_name}</p>
                <p dir="ltr" className="text-xs text-[#344054] font-mono tracking-wider mt-0.5">{destination.active.iban_masked}</p>
                {destination.active.account_holder_name && <p className="text-xs text-[#667085] mt-0.5">{t.holderShown.replace("{name}", destination.active.account_holder_name)}</p>}
              </>
            ) : (
              <p className="text-sm text-[#667085] mt-1">{t.noAccount}</p>
            )}
            {destination?.pending && <p className="text-xs font-semibold text-[#B54708] mt-1">{t.accountPending.replace("{iban}", destination.pending.iban_masked)}</p>}
            {!destination?.pending && destination?.last_rejected_at && <p className="text-xs font-semibold text-[#B42318] mt-1">{t.accountRejected}</p>}
          </div>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          {destination?.active && (
            <span className="px-4 py-2 bg-[#3DDC84]/10 text-[#16A34A] rounded-full text-xs font-bold flex items-center gap-2 border border-[#3DDC84]/20">
              {destination.active.on_hold ? t.accountOnHold.replace("{date}", holdDate(destination.active.hold_until)) : t.accountApproved}
            </span>
          )}
          {providerId && (
            <button type="button" onClick={() => { setAccountError(""); setNeedsReauth(false); setShowAccountModal(true); }}
              className="rounded-xl border border-[#D1AF47]/50 bg-[#F8F3E4] px-4 py-2 text-xs font-bold text-[#725517] focus-visible:outline-2 focus-visible:outline-[#9B7928]">
              {destination?.active ? t.changeAccount : t.addAccount}
            </button>
          )}
        </div>
      </div>

      {/* Payout Requests */}
      <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgba(0,0,0,0.015)] rounded-[24px] p-8 shadow-xl text-[#101828]">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h3 className="text-lg font-bold tracking-tight text-[#101828]">{t.payoutRequests}</h3>
            <p className="text-xs text-[#667085] mt-1">{t.payoutRequestsSubtitle}</p>
          </div>
          <span className="rounded-full border border-[#D1AF47]/20 bg-[#D1AF47]/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#D1AF47]">
            {payoutRequests.length} {t.statusPending}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-[#ECECEC] text-[#667085] text-[10px] uppercase tracking-wider bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)]/30">
                <th className="py-4 px-6 text-start font-bold">{t.payoutRequestId}</th>
                <th className="py-4 px-6 text-start font-bold">{t.payoutRequestedAt}</th>
                <th className="py-4 px-6 text-start font-bold">{t.payoutAmount}</th>
                <th className="py-4 px-6 text-start font-bold">{t.payoutBankColumn}</th>
                <th className="py-4 px-6 text-start font-bold">{t.ibanLabel}</th>
                <th className="py-4 px-6 text-center font-bold">{t.status}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loadingLedger ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-[#667085]">
                    {lang === "ar" ? "جاري تحميل طلبات التحويل..." : "Loading payout requests..."}
                  </td>
                </tr>
              ) : payoutRequests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-[#667085]">
                    {t.noPayoutRequests}
                  </td>
                </tr>
              ) : (
                payoutRequests.map((request) => (
                  <tr key={request.id} className="hover:bg-gray-50/50 transition-all duration-300">
                    <td className="py-4 px-6 font-mono font-bold text-xs tracking-wider text-[#101828]">
                      {request.id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="py-4 px-6 text-[#344054] text-xs font-medium">
                      {request.requestedAt}
                    </td>
                    <td className="py-4 px-6 font-bold text-[#101828]">
                      {request.amount}
                    </td>
                    <td className="py-4 px-6 text-[#344054] text-xs font-semibold">
                      {request.bankName}
                    </td>
                    <td className="py-4 px-6 text-[#344054] text-xs font-mono">
                      {request.iban}
                    </td>
                    <td className="py-4 px-6 text-center">
                      <span className={`inline-flex items-center justify-center rounded-full border px-3 py-1 text-[10px] font-bold ${request.statusClass}`}>
                        {request.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Employee Earnings Summary */}
      <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] rounded-[24px] p-8 text-[#101828]">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h3 className="text-lg font-bold tracking-tight text-[#101828]">{t.employeeEarnings}</h3>
            <p className="text-xs text-[#667085] mt-1">{t.employeeEarningsSubtitle}</p>
          </div>
          <span className="rounded-full border border-[#D1AF47]/20 bg-[#D1AF47]/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#9A741F]">
            employee_earnings_summary
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-[#ECECEC] text-[#667085] text-[10px] uppercase tracking-wider">
                <th className="py-4 px-6 text-start font-bold">{t.employeeName}</th>
                <th className="py-4 px-6 text-start font-bold">{t.month}</th>
                <th className="py-4 px-6 text-start font-bold">{t.employeeCompleted}</th>
                <th className="py-4 px-6 text-start font-bold">{t.totalEarnings}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ECECEC]">
              {loadingLedger ? (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-[#667085]">
                    {lang === "ar" ? "جاري تحميل أرباح الموظفين..." : "Loading employee earnings..."}
                  </td>
                </tr>
              ) : employeeEarnings.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-[#667085]">
                    {t.noEmployeeEarnings}
                  </td>
                </tr>
              ) : (
                employeeEarnings.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50/50 transition-all duration-300">
                    <td className="py-4 px-6 font-bold text-[#101828]">{entry.employeeName}</td>
                    <td className="py-4 px-6 text-[#344054] text-xs font-medium">{entry.month}</td>
                    <td className="py-4 px-6 text-[#344054] text-xs font-bold">{entry.completedBookings.toLocaleString(lang === "ar" ? "ar-SA" : "en-US")}</td>
                    <td className="py-4 px-6 font-bold text-[#9A741F]">{entry.earnings}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transactions Splits Ledger */}
      <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgba(0,0,0,0.015)] rounded-[24px] p-8 shadow-xl text-[#101828]">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h3 className="text-lg font-bold tracking-tight text-[#101828]">{t.transactionLedger}</h3>
            <p className="text-xs text-[#667085] mt-1">{lang === "ar" ? "تتبع توزيع المبالغ بين المنصة وحصتك" : "Track how captured payments are split and transferred"}</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded bg-[#FF5D73]"></span>
              <span className="text-[#344054]">{lang === "ar" ? "عمولة المنصة (15%)" : "Platform (15%)"}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded bg-[#3DDC84]"></span>
              <span className="text-[#344054]">{lang === "ar" ? "صافي الصالون (85%)" : "Net Salon (85%)"}</span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-[#ECECEC] text-[#667085] text-[10px] uppercase tracking-wider bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)]/30">
                <th className="py-4 px-6 text-start font-bold">{t.bookingId}</th>
                <th className="py-4 px-6 text-start font-bold">{t.created}</th>
                <th className="py-4 px-6 text-start font-bold">{t.totalCaptured}</th>
                <th className="py-4 px-6 text-start font-bold">{t.platformShare}</th>
                <th className="py-4 px-6 text-start font-bold">{t.yourShare}</th>
                <th className="py-4 px-6 text-center font-bold">{t.status}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ECECEC]">
              {loadingLedger ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[#667085]">
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
                  <td colSpan={6} className="py-12 text-center text-[#667085]">
                    {lang === "ar" ? "لا توجد معاملات بعد" : "No transactions found"}
                  </td>
                </tr>
              ) : (
                ledgerEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50/50 transition-all duration-300 group">
                    <td className="py-4 px-6 font-mono font-bold text-xs tracking-wider text-[#101828]">
                      {entry.id}
                    </td>
                    <td className="py-4 px-6 text-[#344054] text-xs font-medium">
                      {entry.date}
                    </td>
                    <td className="py-4 px-6 font-bold text-[#101828]">
                      {entry.total}
                    </td>
                    <td className="py-4 px-6 text-[#EF4444] font-semibold text-xs">
                      {entry.platform}
                    </td>
                    <td className="py-4 px-6">
                      <div>
                        <span className="text-[#22C55E] font-bold">{entry.salon}</span>
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
                          ? "bg-[#3DDC84]/10 text-[#22C55E] border-[#3DDC84]/20 shadow-[0_0_10px_rgba(61,220,132,0.05)]" 
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
          <div className="relative bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgba(0,0,0,0.015)] rounded-[28px] w-full max-w-md p-8 shadow-[0_0_50px_rgba(209,175,71,0.15)] space-y-6 overflow-hidden">
            {/* Decorative premium card light in the modal corner */}
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-[#D1AF47]/5 rounded-full blur-[60px] pointer-events-none"></div>

            <div className="flex items-center justify-between border-b border-[#ECECEC] pb-4">
              <h3 className="text-lg font-bold tracking-tight text-[#101828]">
                {t.payoutModalTitle}
              </h3>
              <button
                onClick={() => setShowPayoutModal(false)}
                className="text-[#667085] hover:text-[#101828] p-1 rounded-lg hover:bg-white/5 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleRequestPayout} className="space-y-5">
              <div>
                <label className="text-[10px] uppercase font-bold tracking-widest text-[#344054] block mb-2">
                  {t.payoutAmountLabel}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    placeholder="e.g. 1000"
                    min="1"
                    value={payoutAmount}
                    onChange={(e) => setPayoutAmount(e.target.value)}
                    className="w-full bg-transparent border border-[#ECECEC] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#D1AF47] focus:shadow-[0_0_12px_rgba(209,175,71,0.15)] text-[#101828] font-semibold transition-all duration-300"
                    required
                  />
                  <span className="absolute top-1/2 end-4 -translate-y-1/2 text-xs font-bold text-[#D1AF47]">
                    {t.currency}
                  </span>
                </div>
              </div>

              <p className="rounded-xl border border-[#ECECEC] bg-[#FBFAF7] px-4 py-3 text-xs font-semibold text-[#344054]">
                {destination?.active
                  ? t.payoutTo.replace("{bank}", destination.active.bank_name).replace("{iban}", destination.active.iban_masked)
                  : t.payoutNeedsAccount}
              </p>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setShowPayoutModal(false)}
                  className="flex-1 py-3 bg-[#1A2236] hover:bg-[#232F4C] border border-[#ECECEC] text-[#344054] rounded-xl font-bold text-xs uppercase tracking-wider transition duration-300"
                >
                  {t.close}
                </button>
                <button
                  type="submit"
                  disabled={submittingPayout}
                  className="flex-1 py-3 bg-gradient-to-r from-[#D1AF47] to-[#B8952E] hover:from-[#E0C46A] hover:to-[#D1AF47] text-[#070B12] rounded-xl font-bold text-xs uppercase tracking-wider shadow-[0_4px_12px_rgba(209,175,71,0.2)] hover:shadow-[0_4px_20px_rgba(209,175,71,0.35)] transition duration-300 disabled:cursor-wait disabled:opacity-60"
                >
                  {submittingPayout ? t.submitting : t.confirmPayoutBtn}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showAccountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <form role="dialog" aria-modal="true" aria-labelledby="payout-account-title" dir={lang === "ar" ? "rtl" : "ltr"} onSubmit={handleChangeAccount}
            className="w-full max-w-md space-y-4 rounded-[28px] border border-[#ECECEC] bg-white p-7 text-start shadow-2xl">
            <h3 id="payout-account-title" className="text-lg font-bold text-[#101828]">{t.changeTitle}</h3>
            <p className="text-xs leading-5 text-[#475467]">{t.changeIntro}</p>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-[#344054]">
              {t.bankNameLabel}
              <select value={payoutBank} onChange={(e) => setPayoutBank(e.target.value)} required
                className="mt-2 w-full rounded-xl border border-[#ECECEC] bg-white px-4 py-3 text-sm font-semibold normal-case tracking-normal text-[#101828] focus-visible:outline-2 focus-visible:outline-[#9B7928]">
                <option value="">{lang === "ar" ? "-- اختر البنك --" : "-- Select bank --"}</option>
                <option value="Riyad Bank">Riyad Bank (بنك الرياض)</option>
                <option value="Al Rajhi Bank">Al Rajhi Bank (مصرف الراجحي)</option>
                <option value="SNB">Al Ahli Bank / SNB (البنك الأهلي)</option>
                <option value="Alinma Bank">Alinma Bank (مصرف الإنماء)</option>
              </select>
            </label>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-[#344054]">
              {t.holderLabel}
              <input value={payoutHolder} onChange={(e) => setPayoutHolder(e.target.value)} required minLength={3} maxLength={150} autoComplete="off"
                className="mt-2 w-full rounded-xl border border-[#ECECEC] px-4 py-3 text-sm font-semibold normal-case tracking-normal text-[#101828] focus-visible:outline-2 focus-visible:outline-[#9B7928]" />
            </label>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-[#344054]">
              {t.ibanLabel}
              <input value={payoutIban} onChange={(e) => setPayoutIban(e.target.value)} required dir="ltr" autoComplete="off" inputMode="text"
                className="mt-2 w-full rounded-xl border border-[#ECECEC] px-4 py-3 font-mono text-sm tracking-wider text-[#101828] focus-visible:outline-2 focus-visible:outline-[#9B7928]" />
            </label>
            {accountError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">{accountError}</p>}
            {needsReauth && (
              <div role="alert" className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                <p>{t.reauthNeeded}</p>
                <button type="button" onClick={() => void signInAgain()} className="rounded-lg bg-[#101828] px-3 py-1.5 text-xs font-black text-white focus-visible:outline-2 focus-visible:outline-[#9B7928]">{t.signInAgain}</button>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowAccountModal(false)} className="flex-1 rounded-xl border border-[#ECECEC] py-3 text-xs font-bold text-[#344054] focus-visible:outline-2 focus-visible:outline-[#9B7928]">{t.close}</button>
              <button type="submit" disabled={submittingPayout} className="flex-1 rounded-xl bg-[#101828] py-3 text-xs font-bold text-white disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-[#9B7928]">{submittingPayout ? t.submitting : t.changeSubmit}</button>
            </div>
          </form>
        </div>
      )}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
