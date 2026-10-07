"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";
import { sar, useOperationsLocale } from "@/components/operations-ui";
import { ModalOverlay, ModalPortal } from "@/components/modal";
import { formatBookingDate, walletEntryStatus, upcomingDepositTotal } from "@/lib/booking-display.mjs";

const translations = {
  en: {
    title: "Wallet & Payments",
    subtitle: "Manage your payments, deposits for upcoming visits, referral rewards, and gift cards.",
    balanceTitle: "Store Credits Balance",
    upcomingTitle: "Deposits for Upcoming Visits",
    upcomingSubtitle: "Deposits you have paid for confirmed visits that have not happened yet",
    loyaltyTitle: "Total Loyalty Points",
    loyaltySubtitle: "Points are earned and used per provider, and only when that provider's loyalty programme is switched on",
    balanceNote: "Credits issued to your account, such as referral rewards. Using credits at checkout is not available yet.",
    storeCredit: "Store credit",
    noExpiry: "No expiry",
    pointsUnit: "pts",
    loadingLedger: "Loading ledger entries...",
    loadFailed: "Some wallet details could not be loaded:",
    notice: "Notice",
    statusUpcomingVisit: "UPCOMING VISIT",
    statusPartlyRefunded: "PARTLY REFUNDED",
    statusFeeKept: "FEE KEPT",
    statusNoCharge: "NO CHARGE",
    kindDeposit: "Booking deposit",
    kindTip: "Tip",
    colTransaction: "Transaction",
    colDate: "Date",
    colDescription: "Type & description",
    colStatus: "Status",
    colAmount: "Amount",
    refundedLine: "Refunded {amount}",
    bookingRef: "Booking",
    referralCodeUnavailable: "Your referral code could not be loaded right now.",
    referralTitleWith: "Invite Friends & Earn {amount}",
    referralTitleGeneric: "Invite Friends & Earn Wallet Credit",
    referralSubtitleWith: "Share your code. When a friend completes their first service booking, you both receive {amount} in wallet credits.",
    referralSubtitleGeneric: "Share your code. When a friend completes their first service booking, you both receive wallet credits.",
    referralBadge: "Referral & Rewards",
    giftTitle: "Send a Gift Card",
    giftRecipient: "Recipient Name",
    giftPhone: "Recipient Saudi Mobile",
    giftAmount: "Gift Amount (SAR)",
    giftMessage: "Custom Message (Optional)",
    giftSend: "Send Gift Card",
    cancel: "Cancel",
    closeDialog: "Close dialog",
    remaining: "Remaining",
    giftFor: "For:",
    giftAwaiting: "Awaiting payment",
    giftActive: "ACTIVE",
    giftPartial: "PARTLY USED",
    giftRedeemed: "USED",
    giftExpired: "EXPIRED",
    giftPending: "AWAITING PAYMENT",
    giftCancelled: "CANCELLED",
    giftMin: "Minimum gift card amount is 50 SAR",
    giftCheckoutFailed: "Could not open the payment page; the gift card was not issued.",
    giftExamplePlaceholder: "e.g. Sara or Mohammed",
    giftCustomAmount: "Custom amount",
    giftMessagePlaceholder: "A special treat for you...",
    transactionsTitle: "Transaction History",
    noTransactions: "No transactions found in your history.",
    invoice: "Invoice",
    statusCompleted: "SUCCESS",
    statusPending: "PENDING",
    statusRefunded: "REFUNDED",
    statusHeld: "UPCOMING VISIT",
    topUp: "Top Up",
    bookingDeposit: "Booking Deposit",
    topUpNotice: "Wallet top-up is not enabled yet. Booking deposits are paid during checkout.",
    currency: "SAR",
    yourReferralCode: "Your Referral Code",
    copyLink: "Copy Link",
    copied: "Copied!",
    friendsInvited: "Friends Joined",
    creditsEarned: "Total Earned",
    activeCredits: "Active Wallet Credits",
    noCredits: "No active credits yet.",
    giftCardsTitle: "Gift Cards & Appointment Gifting",
    sendGiftCard: "Send a Gift Card",
    noGiftCards: "No gift cards sent or active.",
    expiresOn: "Expires on"
  },
  ar: {
    title: "المحفظة والمدفوعات",
    subtitle: "إدارة مدفوعاتك، وعربون الزيارات القادمة، ومكافآت الإحالة، وبطاقات الإهداء.",
    balanceTitle: "رصيد المحفظة (رصيد متجر)",
    upcomingTitle: "عربون الزيارات القادمة",
    upcomingSubtitle: "عربون دفعته لزيارات مؤكدة لم تحدث بعد",
    loyaltyTitle: "إجمالي نقاط الولاء",
    loyaltySubtitle: "النقاط خاصة بكل مزود خدمة وتُستخدم لديه فقط عند تفعيل برنامج الولاء الخاص به",
    balanceNote: "أرصدة صادرة لحسابك، مثل مكافآت الإحالة. استخدام الرصيد عند الدفع غير متاح بعد.",
    storeCredit: "رصيد متجر",
    noExpiry: "بدون انتهاء",
    pointsUnit: "نقطة",
    loadingLedger: "جارٍ تحميل سجل المعاملات...",
    loadFailed: "تعذر تحميل بعض تفاصيل المحفظة:",
    notice: "تنبيه",
    statusUpcomingVisit: "زيارة قادمة",
    statusPartlyRefunded: "استرداد جزئي",
    statusFeeKept: "تم استقطاع رسم",
    statusNoCharge: "بدون رسوم",
    kindDeposit: "عربون حجز",
    kindTip: "إكرامية",
    colTransaction: "المعاملة",
    colDate: "التاريخ",
    colDescription: "النوع والوصف",
    colStatus: "الحالة",
    colAmount: "المبلغ",
    refundedLine: "المسترد {amount}",
    bookingRef: "الحجز",
    referralCodeUnavailable: "تعذر تحميل رمز الدعوة الخاص بك الآن.",
    referralTitleWith: "ادعُ أصدقاءك واكسب {amount}",
    referralTitleGeneric: "ادعُ أصدقاءك واكسب رصيداً في المحفظة",
    referralSubtitleWith: "شارك رمزك الخاص. عندما يكمل صديقك حجزه الأول، يحصل كلاكما على {amount} كرصيد في المحفظة.",
    referralSubtitleGeneric: "شارك رمزك الخاص. عندما يكمل صديقك حجزه الأول، يحصل كلاكما على رصيد في المحفظة.",
    referralBadge: "برنامج المكافآت والإحالة",
    giftTitle: "إهداء بطاقة هدية",
    giftRecipient: "اسم المستلم",
    giftPhone: "رقم جوال المستلم (سعودي)",
    giftAmount: "قيمة بطاقة الهدية (ريال)",
    giftMessage: "رسالة إهداء شخصية (اختياري)",
    giftSend: "إصدار وإرسال الهدية",
    cancel: "إلغاء",
    closeDialog: "إغلاق النافذة",
    remaining: "الرصيد المتبقي",
    giftFor: "مُهدى إلى:",
    giftAwaiting: "بانتظار الدفع",
    giftActive: "نشطة",
    giftPartial: "مستخدمة جزئياً",
    giftRedeemed: "مستخدمة",
    giftExpired: "منتهية",
    giftPending: "بانتظار الدفع",
    giftCancelled: "ملغاة",
    giftMin: "الحد الأدنى لبطاقة الهدية هو 50 ريال",
    giftCheckoutFailed: "تعذر فتح صفحة الدفع، لم يتم إصدار البطاقة.",
    giftExamplePlaceholder: "مثال: سارة أو محمد",
    giftCustomAmount: "مبلغ مخصص",
    giftMessagePlaceholder: "هدية خاصة من القلب...",
    transactionsTitle: "سجل المعاملات",
    noTransactions: "لا يوجد سجل معاملات للمحفظة.",
    invoice: "فاتورة",
    statusCompleted: "ناجحة",
    statusPending: "معلقة",
    statusRefunded: "مستردة",
    statusHeld: "زيارة قادمة",
    topUp: "شحن الرصيد",
    currency: "ريال",
    yourReferralCode: "رمز الدعوة الخاص بك",
    copyLink: "نسخ الرابط",
    copied: "تم النسخ!",
    friendsInvited: "الأصدقاء المنضمون",
    creditsEarned: "إجمالي المكافآت",
    activeCredits: "أرصدة المتجر المتاحة",
    noCredits: "لا توجد أرصدة نشطة حالياً.",
    giftCardsTitle: "بطاقات الإهداء والمواعيد المهداة",
    sendGiftCard: "إرسال بطاقة هدية",
    noGiftCards: "لا توجد بطاقات إهداء مرسلة أو نشطة حالياً.",
    expiresOn: "تنتهي في"
  }
};

export default function CustomerWalletPage() {
  const locale = useOperationsLocale();
  const [balance, setBalance] = useState(0.0);
  const [upcomingDeposits, setUpcomingDeposits] = useState(0.0);
  const [loyaltyPointsTotal, setLoyaltyPointsTotal] = useState(0);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [credits, setCredits] = useState<any[]>([]);
  const [giftCards, setGiftCards] = useState<any[]>([]);
  const [referralInfo, setReferralInfo] = useState<{
    code: string;
    shareUrl: string;
    rewardSar: number | null;
    invitedCount: number;
    earnedSar: number;
  }>({
    code: "",
    shareUrl: "",
    rewardSar: null,
    invitedCount: 0,
    earnedSar: 0,
  });
  const [referralFailed, setReferralFailed] = useState(false);
  const [notice, setNotice] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [giftForm, setGiftForm] = useState({
    recipientName: "",
    recipientPhone: "",
    recipientEmail: "",
    amount: "100",
    message: ""
  });
  const [giftSubmitting, setGiftSubmitting] = useState(false);
  const [giftError, setGiftError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const t = translations[locale];
  const walletActions = {
    topUpNotice: locale === "ar"
      ? "شحن المحفظة غير مفعل حاليا. تدفع عربونات الحجز أثناء الدفع."
      : "Wallet top-up is not enabled yet. Booking deposits are paid during checkout."
  };

  useEffect(() => {
    loadWalletData();
  }, []);

  async function loadWalletData() {
    try {
      setLoading(true);
      setError("");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Transactional ledger
      const { data: txData, error: txError } = await supabase
        .from("transactional_ledger")
        .select(`
          id,
          entry_type,
          total_captured,
          refunded_amount,
          created_at,
          bookings!inner (
            id,
            customer_id,
            status,
            scheduled_at,
            deposit_required,
            cancellation_fee,
            refund_amount,
            services ( name_en, name_ar )
          )
        `)
        .eq("bookings.customer_id", user.id)
        .in("entry_type", ["booking_payment", "tip"])
        .order("created_at", { ascending: false });

      // A failed read is reported, never shown as an empty history. Each section keeps loading so one failure
      // does not hide the others.
      const failures: string[] = [];
      if (txError) failures.push(errorMessage(txError));

      const now = new Date();
      const rows = (txData || []).map((entry: any) => ({
        entry,
        booking: Array.isArray(entry.bookings) ? entry.bookings[0] : entry.bookings,
      }));
      const formatted = rows.map(({ entry, booking }: any) => {
        const serviceName = locale === "ar"
          ? booking?.services?.name_ar || booking?.services?.name_en
          : booking?.services?.name_en || booking?.services?.name_ar;
        const isTip = entry.entry_type === "tip";
        return {
          id: entry.id,
          amount: Number(entry.total_captured) || 0,
          refunded: Number(entry.refunded_amount) || 0,
          kind: isTip ? "tip" : "deposit",
          status: isTip ? "completed" : walletEntryStatus(booking ?? {}, now),
          created_at: entry.created_at,
          description: serviceName || `${t.bookingRef} #${booking?.id?.slice(0, 8) || entry.id.slice(0, 8)}`
        };
      });

      setTransactions(formatted);
      setUpcomingDeposits(upcomingDepositTotal(
        rows.map(({ entry, booking }: any) => ({ entry_type: entry.entry_type, total_captured: entry.total_captured, refunded_amount: entry.refunded_amount, booking })),
        now
      ));

      // 2. Active Wallet Store Credits (G49)
      const { data: creditsData, error: creditsError } = await supabase
        .from("wallet_credits")
        .select("*")
        .eq("customer_id", user.id)
        .eq("is_spent", false)
        .order("created_at", { ascending: false });

      if (creditsError) failures.push(errorMessage(creditsError));
      const activeCredits = creditsData || [];
      setCredits(activeCredits);
      const totalCredits = activeCredits.reduce((sum: number, c: any) => sum + Number(c.amount || 0), 0);
      setBalance(totalCredits);

      // 3. Referral code and stats (G49)
      const { data: refData, error: refError } = await supabase.rpc("get_or_create_referral_code");
      if (refError || !refData?.referral_code) {
        setReferralFailed(true);
        if (refError) failures.push(errorMessage(refError));
      } else {
        setReferralFailed(false);
        setReferralInfo({
          code: refData.referral_code,
          shareUrl: refData.share_url || "",
          rewardSar: Number.isFinite(Number(refData.reward_per_friend_sar)) && refData.reward_per_friend_sar !== null ? Number(refData.reward_per_friend_sar) : null,
          invitedCount: Number(refData.invited_friends_count) || 0,
          earnedSar: Number(refData.total_earned_credits_sar) || 0,
        });
      }

      // 4. Gift Cards (G48)
      const { data: cardsData, error: cardsError } = await supabase
        .from("gift_cards")
        .select("*")
        .eq("purchaser_id", user.id)
        .order("created_at", { ascending: false });
      if (cardsError) failures.push(errorMessage(cardsError));
      setGiftCards(cardsData || []);

      // 5. Customer Loyalty Points (G50)
      const { data: loyaltyData, error: loyaltyError } = await supabase
        .from("customer_loyalty")
        .select("points_balance")
        .eq("customer_id", user.id);
      if (loyaltyError) failures.push(errorMessage(loyaltyError));
      const totalPoints = (loyaltyData || []).reduce((sum: number, l: any) => sum + (l.points_balance || 0), 0);
      setLoyaltyPointsTotal(totalPoints);

      if (failures.length > 0) setError(`${t.loadFailed} ${failures.join(" | ")}`);
    } catch (err) {
      setError(`${t.loadFailed} ${errorMessage(err)}`);
    } finally {
      setLoading(false);
    }
  }

  const showWalletNotice = (message: string) => {
    setNotice(message);
  };

  const handleCopyReferral = async () => {
    const textToCopy = referralInfo.shareUrl || referralInfo.code;
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const handlePurchaseGift = async (e: React.FormEvent) => {
    e.preventDefault();
    setGiftSubmitting(true);
    setGiftError("");
    try {
      let phone = giftForm.recipientPhone.replace(/[^\d+]/g, "");
      if (phone.startsWith("05")) phone = "+966" + phone.slice(1);
      else if (phone.startsWith("5")) phone = "+966" + phone;
      else if (!phone.startsWith("+966")) phone = "+966" + phone;

      const amt = Number(giftForm.amount);
      if (amt < 50) {
        throw new Error(t.giftMin);
      }

      const { data, error: purchaseErr } = await supabase.rpc("purchase_gift_card", {
        p_recipient_name: giftForm.recipientName.trim(),
        p_recipient_phone: phone,
        p_recipient_email: giftForm.recipientEmail.trim() || null,
        p_amount: amt,
        p_message: giftForm.message.trim() || null
      });

      if (purchaseErr) throw purchaseErr;

      // The card becomes usable (and its code is shown) only after Tap confirms the payment.
      const { data: checkout, error: checkoutError } = await supabase.functions.invoke("payment-checkout", {
        body: { purchaseType: "gift_card", purchaseId: data.purchase_id }
      });
      if (checkoutError || !checkout?.checkoutUrl) {
        throw new Error(t.giftCheckoutFailed);
      }
      window.location.assign(checkout.checkoutUrl);

      setGiftForm({
        recipientName: "",
        recipientPhone: "",
        recipientEmail: "",
        amount: "100",
        message: ""
      });

      await loadWalletData();
    } catch (err) {
      setGiftError(errorMessage(err));
    } finally {
      setGiftSubmitting(false);
    }
  };

  const getStatusStyle = (status: string) => {
    switch (status.toLowerCase()) {
      case "completed":
      case "success":
      case "active":
        return "bg-green-50 text-green-700 border-green-150";
      case "held":
      case "upcoming":
      case "pending":
      case "pending_payment":
      case "partially_redeemed":
      case "fee_kept":
      case "partly_refunded":
        return "bg-amber-50 text-amber-700 border-amber-150";
      case "refunded":
      case "redeemed":
        return "bg-blue-50 text-blue-700 border-blue-150";
      default:
        return "bg-gray-50 text-gray-700 border-gray-150";
    }
  };

  const entryStatusLabels: Record<string, string> = {
    completed: t.statusCompleted, upcoming: t.statusUpcomingVisit, pending: t.statusPending, refunded: t.statusRefunded,
    partly_refunded: t.statusPartlyRefunded, fee_kept: t.statusFeeKept, no_charge: t.statusNoCharge,
  };
  const giftStatusLabels: Record<string, string> = {
    pending_payment: t.giftPending, active: t.giftActive, partially_redeemed: t.giftPartial,
    redeemed: t.giftRedeemed, expired: t.giftExpired, cancelled: t.giftCancelled,
  };
  const referralAmount = referralInfo.rewardSar === null ? null : sar(referralInfo.rewardSar, locale);

  return (
    <div className="space-y-8 font-sans">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">{t.title}</h2>
          <p className="text-sm text-gray-500 mt-1">{t.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowGiftModal(true);
            setGiftError("");
          }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs rounded-xl shadow-sm transition"
        >
          <span>🎁</span>
          <span>{t.sendGiftCard}</span>
        </button>
      </div>

      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-4">
          {error}
        </div>
      )}

      {notice && (
        <div role="status" className="bg-stone-50 border border-stone-200 text-stone-700 text-xs rounded-xl p-4">
          {notice}
        </div>
      )}

      {/* BALANCE & METRICS SECTION */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Available Store Credit Balance (G49) */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between hover:border-black transition duration-200">
          <div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">{t.balanceTitle}</span>
            </div>
            <h3 className="text-3xl font-bold text-gray-900 mt-2">
              {sar(balance, locale)}
            </h3>
            <p className="text-[10px] text-gray-500 mt-2">{t.balanceNote}</p>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              type="button"
              onClick={() => showWalletNotice(walletActions.topUpNotice)}
              className="flex-1 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-xs rounded-xl transition"
            >
              {t.topUp}
            </button>
          </div>
        </div>

        {/* Upcoming deposits card */}
        <div className="bg-stone-950 text-white border border-stone-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[hsla(45,60%,55%,0.06)] rounded-full blur-3xl" />
          <div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] uppercase font-bold text-stone-400 block tracking-wider">{t.upcomingTitle}</span>
            </div>
            <h3 className="text-3xl font-bold text-white mt-2">
              {sar(upcomingDeposits, locale)}
            </h3>
            <p className="text-[10px] text-stone-400 mt-3 leading-relaxed">{t.upcomingSubtitle}</p>
          </div>
        </div>

        {/* Loyalty Points Total Card (G50) */}
        <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] uppercase font-bold text-amber-800 block tracking-wider">{t.loyaltyTitle}</span>
              <span className="text-base">⭐</span>
            </div>
            <h3 className="text-3xl font-bold text-amber-950 mt-2">
              {loyaltyPointsTotal} <span className="text-xs font-semibold text-amber-700">{t.pointsUnit}</span>
            </h3>
            <p className="text-[10px] text-amber-800 mt-3 leading-relaxed">{t.loyaltySubtitle}</p>
          </div>
        </div>
      </div>

      {/* REFERRAL CARD (G49) */}
      <div className="bg-gradient-to-r from-stone-900 via-stone-850 to-stone-900 text-white rounded-2xl p-6 sm:p-8 shadow-md relative overflow-hidden">
        <div className="max-w-2xl space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 text-[#F4E7B6] border border-[#D1AF47]/40 text-[10px] font-bold uppercase tracking-wider">
            <span>👥</span>
            <span>{t.referralBadge}</span>
          </div>
          <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            {referralAmount ? t.referralTitleWith.replace("{amount}", referralAmount) : t.referralTitleGeneric}
          </h3>
          <p className="text-xs sm:text-sm text-stone-300 leading-relaxed font-light">
            {referralAmount ? t.referralSubtitleWith.replace("{amount}", referralAmount) : t.referralSubtitleGeneric}
          </p>

          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="bg-stone-800/90 border border-stone-700 rounded-xl px-4 py-2.5 font-mono text-sm tracking-widest text-[#F4E7B6] font-bold flex items-center justify-between">
              <span dir="ltr">{referralInfo.code || "—"}</span>
            </div>
            <button
              type="button"
              disabled={!referralInfo.code}
              onClick={handleCopyReferral}
              className="px-5 py-2.5 disabled:opacity-50 bg-[#D1AF47] hover:bg-[#bfa03f] text-stone-950 font-extrabold text-xs rounded-xl shadow transition flex items-center justify-center gap-2"
            >
              <span>{copiedCode ? "✓" : "📋"}</span>
              <span>{copiedCode ? t.copied : t.copyLink}</span>
            </button>
          </div>

          {referralFailed && <p role="alert" className="text-xs font-semibold text-red-300">{t.referralCodeUnavailable}</p>}

          <div className="grid grid-cols-2 gap-4 pt-3 border-t border-stone-800 text-stone-300 text-xs">
            <div>
              <span className="text-[10px] text-stone-400 uppercase font-semibold block">{t.friendsInvited}</span>
              <span className="text-base font-bold text-white">{referralInfo.invitedCount}</span>
            </div>
            <div>
              <span className="text-[10px] text-stone-400 uppercase font-semibold block">{t.creditsEarned}</span>
              <span className="text-base font-bold text-[#F4E7B6]">{sar(referralInfo.earnedSar, locale)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ACTIVE WALLET CREDITS BREAKDOWN (G49) */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <h3 className="font-bold text-sm text-gray-800 mb-4">{t.activeCredits}</h3>
        {credits.length === 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center">{t.noCredits}</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {credits.map((c) => (
              <div key={c.id} className="py-3 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-gray-800 block">{c.reason || t.storeCredit}</span>
                  <span className="text-[10px] text-gray-400 block mt-0.5">
                    {c.expires_at ? `${t.expiresOn} ${formatBookingDate(c.expires_at, locale)}` : t.noExpiry}
                  </span>
                </div>
                <span className="font-bold text-emerald-600 text-sm">
                  +{sar(Number(c.amount), locale)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* GIFT CARDS SECTION (G48) */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-bold text-sm text-gray-800">{t.giftCardsTitle}</h3>
          <button
            type="button"
            onClick={() => {
              setShowGiftModal(true);
              setGiftError("");
            }}
            className="text-xs font-bold text-[hsl(45,60%,45%)] hover:underline flex items-center gap-1"
          >
            <span>+</span>
            <span>{t.sendGiftCard}</span>
          </button>
        </div>

        {giftCards.length === 0 ? (
          <div className="text-center py-6 text-xs text-gray-400 font-semibold">
            {t.noGiftCards}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {giftCards.map((card) => (
              <div key={card.id} className="bg-stone-50 border border-stone-200 rounded-xl p-4 flex flex-col justify-between space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-mono text-xs font-bold text-stone-900 block tracking-wider">{card.status === "pending_payment" ? t.giftAwaiting : card.code}</span>
                    <span className="text-[10px] text-stone-500 block mt-0.5">
                      {t.giftFor} {card.recipient_name}
                    </span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border uppercase ${getStatusStyle(card.status)}`}>
                    {giftStatusLabels[card.status] ?? t.statusPending}
                  </span>
                </div>
                {card.message && (
                  <p className="text-[10px] text-stone-600 italic bg-white p-2 rounded-lg border border-stone-150">
                    &ldquo;{card.message}&rdquo;
                  </p>
                )}
                <div className="flex justify-between items-center pt-2 border-t border-stone-200 text-xs">
                  <span className="text-stone-400 text-[10px]">
                    {card.expires_at ? `${t.expiresOn} ${formatBookingDate(card.expires_at, locale)}` : ""}
                  </span>
                  <div className="text-end">
                    <span className="text-[10px] text-stone-400 block">{t.remaining}</span>
                    <span className="font-bold text-stone-900 text-sm">{sar(Number(card.remaining_balance), locale)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* TRANSACTION HISTORY */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <h3 className="font-bold text-sm text-gray-800 mb-6">{t.transactionsTitle}</h3>

        {loading ? (
          <div role="status" className="text-center py-12 text-sm text-gray-400">{t.loadingLedger}</div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-xs font-semibold">{t.noTransactions}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start border-collapse">
              <thead>
                <tr className="border-b border-gray-150 text-gray-400 font-bold uppercase text-[9px]">
                  <th scope="col" className="py-3 px-4 text-start">{t.colTransaction}</th>
                  <th scope="col" className="py-3 px-4 text-start">{t.colDate}</th>
                  <th scope="col" className="py-3 px-4 text-start">{t.colDescription}</th>
                  <th scope="col" className="py-3 px-4 text-start">{t.colStatus}</th>
                  <th scope="col" className="py-3 px-4 text-end">{t.colAmount}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {transactions.map((tx) => {
                  return (
                    <tr key={tx.id} className="hover:bg-gray-50 transition-colors duration-150">
                      <td className="py-4 px-4 font-bold text-gray-800"><span dir="ltr">{String(tx.id).slice(0, 8)}</span></td>
                      <td className="py-4 px-4 text-gray-500 font-semibold">
                        {formatBookingDate(tx.created_at, locale)}
                      </td>
                      <td className="py-4 px-4 text-gray-600">
                        <span className="font-bold text-gray-800 block">{tx.kind === "tip" ? t.kindTip : t.kindDeposit}</span>
                        <span className="text-[10px] text-gray-400 block mt-0.5">{tx.description}</span>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`px-2.5 py-1 rounded-full font-bold text-[9px] border uppercase ${getStatusStyle(tx.status)}`}>
                          {entryStatusLabels[tx.status] ?? t.statusPending}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-end font-bold text-gray-900">
                        -{sar(Math.abs(tx.amount), locale)}
                        {tx.refunded > 0 && (
                          <span className="block text-[10px] font-semibold text-blue-700">{t.refundedLine.replace("{amount}", sar(tx.refunded, locale))}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SEND GIFT CARD MODAL */}
      {showGiftModal && (
        <ModalPortal>
        <ModalOverlay onClose={() => setShowGiftModal(false)} canClose={!giftSubmitting} className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-label={t.giftTitle} tabIndex={-1} className="bg-white rounded-2xl max-w-md w-full max-h-full overflow-y-auto p-6 shadow-xl border border-gray-200 space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <h3 className="font-bold text-base text-gray-900 flex items-center gap-2">
                <span aria-hidden="true">🎁</span>
                <span>{t.giftTitle}</span>
              </h3>
              <button
                type="button"
                aria-label={t.closeDialog}
                onClick={() => setShowGiftModal(false)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                ✕
              </button>
            </div>

            {giftError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{giftError}</p>}
            {(
              <form onSubmit={handlePurchaseGift} className="space-y-3 text-xs">
                <div>
                  <label htmlFor="gift-recipient" className="block text-[10px] font-bold uppercase text-gray-500 mb-1">
                    {t.giftRecipient} *
                  </label>
                  <input
                    id="gift-recipient"
                    type="text"
                    required
                    value={giftForm.recipientName}
                    onChange={(e) => setGiftForm({ ...giftForm, recipientName: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900 outline-none focus:border-stone-900"
                    placeholder={t.giftExamplePlaceholder}
                  />
                </div>

                <div>
                  <label htmlFor="gift-phone" className="block text-[10px] font-bold uppercase text-gray-500 mb-1">
                    {t.giftPhone} *
                  </label>
                  <input
                    id="gift-phone"
                    dir="ltr"
                    type="tel"
                    required
                    value={giftForm.recipientPhone}
                    onChange={(e) => setGiftForm({ ...giftForm, recipientPhone: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900 outline-none focus:border-stone-900"
                    placeholder="05XXXXXXXX"
                  />
                </div>

                <div>
                  <label htmlFor="gift-amount" className="block text-[10px] font-bold uppercase text-gray-500 mb-1">
                    {t.giftAmount} *
                  </label>
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    {["50", "100", "200", "500"].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        aria-pressed={giftForm.amount === preset}
                        onClick={() => setGiftForm({ ...giftForm, amount: preset })}
                        className={`py-1.5 border rounded-lg font-bold text-xs transition ${
                          giftForm.amount === preset
                            ? "bg-stone-900 text-white border-stone-900"
                            : "bg-stone-50 text-stone-700 border-stone-200 hover:border-stone-400"
                        }`}
                      >
                        {preset} {t.currency}
                      </button>
                    ))}
                  </div>
                  <input
                    id="gift-amount"
                    type="number"
                    min="50"
                    step="10"
                    required
                    value={giftForm.amount}
                    onChange={(e) => setGiftForm({ ...giftForm, amount: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900 outline-none focus:border-stone-900"
                    placeholder={t.giftCustomAmount}
                  />
                </div>

                <div>
                  <label htmlFor="gift-message" className="block text-[10px] font-bold uppercase text-gray-500 mb-1">
                    {t.giftMessage}
                  </label>
                  <textarea
                    id="gift-message"
                    rows={2}
                    value={giftForm.message}
                    onChange={(e) => setGiftForm({ ...giftForm, message: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900 outline-none focus:border-stone-900 text-xs"
                    placeholder={t.giftMessagePlaceholder}
                  />
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowGiftModal(false)}
                    className="flex-1 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold rounded-xl transition"
                  >
                    {t.cancel}
                  </button>
                  <button
                    type="submit"
                    disabled={giftSubmitting}
                    className="flex-1 py-2.5 bg-stone-900 hover:bg-stone-800 text-white font-bold rounded-xl disabled:opacity-50 transition"
                  >
                    {giftSubmitting ? "..." : t.giftSend}
                  </button>
                </div>
              </form>
            )}
          </div>
        </ModalOverlay>
        </ModalPortal>
      )}
    </div>
  );
}
