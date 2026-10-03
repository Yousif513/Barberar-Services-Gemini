"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const translations = {
  en: {
    title: "Wallet & Payments",
    subtitle: "Manage your secure payments, escrow status, referral rewards, and gift cards.",
    balanceTitle: "Store Credits Balance",
    escrowTitle: "Escrow Holds",
    escrowSubtitle: "Held safely until services are rendered",
    loyaltyTitle: "Total Loyalty Points",
    loyaltySubtitle: "Redeemable during checkout across salons",
    linkedCards: "Saved Payment Methods",
    addCard: "Add Card",
    transactionsTitle: "Transaction History",
    noTransactions: "No transactions found in your history.",
    invoice: "Invoice",
    statusCompleted: "SUCCESS",
    statusPending: "PENDING",
    statusRefunded: "REFUNDED",
    statusHeld: "HELD IN ESCROW",
    topUp: "Top Up",
    bookingDeposit: "Booking Deposit",
    cardNotice: "Cards are added securely during checkout.",
    topUpNotice: "Wallet top-up is not enabled yet. Booking deposits are paid during checkout.",
    currency: "SAR",
    referralTitle: "Invite Friends & Earn 25 SAR",
    referralSubtitle: "Share your code. When a friend completes their first service booking, you both receive 25 SAR in wallet credits!",
    yourReferralCode: "Your Referral Code",
    copyLink: "Copy Link",
    copied: "Copied!",
    friendsInvited: "Friends Joined",
    creditsEarned: "Total Earned",
    activeCredits: "Active Wallet Credits",
    noCredits: "No active promotional credits. Invite friends to earn credits!",
    giftCardsTitle: "Gift Cards & Appointment Gifting",
    sendGiftCard: "Send a Gift Card",
    noGiftCards: "No gift cards sent or active.",
    expiresOn: "Expires on"
  },
  ar: {
    title: "المحفظة والمدفوعات",
    subtitle: "إدارة مدفوعاتك الآمنة، حالات الضمان، مكافآت الإحالة، وبطاقات الإهداء.",
    balanceTitle: "رصيد المحفظة (رصيد متجر)",
    escrowTitle: "المبالغ المحتجزة بالضمان",
    escrowSubtitle: "تُحفظ بأمان لحين اكتمال تقديم الخدمة",
    loyaltyTitle: "إجمالي نقاط الولاء",
    loyaltySubtitle: "قابلة للاستبدال أثناء الدفع لدى الصالونات",
    linkedCards: "وسائل الدفع المحفوظة",
    addCard: "إضافة بطاقة",
    transactionsTitle: "سجل المعاملات",
    noTransactions: "لا يوجد سجل معاملات للمحفظة.",
    invoice: "فاتورة",
    statusCompleted: "ناجحة",
    statusPending: "معلقة",
    statusRefunded: "مستردة",
    statusHeld: "محتجزة بالضمان",
    topUp: "شحن الرصيد",
    currency: "ريال",
    referralTitle: "ادعُ أصدقاءك واكسب 25 ريال",
    referralSubtitle: "شارك رمزك الخاص. عندما يكمل صديقك حجزه الأول، يحصل كلاكما تلقائياً على 25 ريال كرصيد في المحفظة!",
    yourReferralCode: "رمز الدعوة الخاص بك",
    copyLink: "نسخ الرابط",
    copied: "تم النسخ!",
    friendsInvited: "الأصدقاء المنضمون",
    creditsEarned: "إجمالي المكافآت",
    activeCredits: "أرصدة المتجر المتاحة",
    noCredits: "لا توجد أرصدة ترويجية حالياً. ادعُ أصدقاءك لبدء كسب الأرصدة!",
    giftCardsTitle: "بطاقات الإهداء والمواعيد المهداة",
    sendGiftCard: "إرسال بطاقة هدية",
    noGiftCards: "لا توجد بطاقات إهداء مرسلة أو نشطة حالياً.",
    expiresOn: "تنتهي في"
  }
};

export default function CustomerWalletPage() {
  const [locale, setLocale] = useState<"en" | "ar">("ar");
  const [balance, setBalance] = useState(0.0);
  const [escrowBalance, setEscrowBalance] = useState(0.0);
  const [loyaltyPointsTotal, setLoyaltyPointsTotal] = useState(0);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [credits, setCredits] = useState<any[]>([]);
  const [giftCards, setGiftCards] = useState<any[]>([]);
  const [referralInfo, setReferralInfo] = useState<{
    code: string;
    shareUrl: string;
    rewardSar: number;
    invitedCount: number;
    earnedSar: number;
  }>({
    code: "",
    shareUrl: "",
    rewardSar: 25,
    invitedCount: 0,
    earnedSar: 0,
  });
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
  const [giftSuccessMsg, setGiftSuccessMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const t = translations[locale];
  const walletActions = {
    bookingDeposit: locale === "ar" ? "عربون حجز" : "Booking Deposit",
    cardNotice: locale === "ar"
      ? "تتم إضافة البطاقات بأمان أثناء الدفع."
      : "Cards are added securely during checkout.",
    topUpNotice: locale === "ar"
      ? "شحن المحفظة غير مفعل حاليا. تدفع عربونات الحجز أثناء الدفع."
      : "Wallet top-up is not enabled yet. Booking deposits are paid during checkout."
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
          total_captured,
          payout_status,
          created_at,
          bookings!inner (
            id,
            customer_id,
            status,
            scheduled_at,
            services ( name_en, name_ar )
          )
        `)
        .eq("bookings.customer_id", user.id)
        .order("created_at", { ascending: false });

      if (txError) {
        console.warn("Transactional ledger load notice:", txError.message);
      }

      const formatted = (txData || []).map((entry: any) => {
        const booking = Array.isArray(entry.bookings) ? entry.bookings[0] : entry.bookings;
        const serviceName = locale === "ar"
          ? booking?.services?.name_ar || booking?.services?.name_en
          : booking?.services?.name_en || booking?.services?.name_ar;
        const status = booking?.status === "cancelled"
          ? "refunded"
          : entry.payout_status === "released"
            ? "completed"
            : "held";

        return {
          id: entry.id,
          amount: Number(entry.total_captured) || 0,
          type: walletActions.bookingDeposit,
          status,
          created_at: entry.created_at,
          description: serviceName || `Booking #${booking?.id?.slice(0, 8) || entry.id.slice(0, 8)}`
        };
      });

      setTransactions(formatted);
      setEscrowBalance(formatted
        .filter((entry) => entry.status === "held")
        .reduce((sum, entry) => sum + entry.amount, 0));

      // 2. Active Wallet Store Credits (G49)
      const { data: creditsData } = await supabase
        .from("wallet_credits")
        .select("*")
        .eq("customer_id", user.id)
        .eq("is_spent", false)
        .order("created_at", { ascending: false });

      const activeCredits = creditsData || [];
      setCredits(activeCredits);
      const totalCredits = activeCredits.reduce((sum: number, c: any) => sum + Number(c.amount || 0), 0);
      setBalance(totalCredits);

      // 3. Referral code and stats (G49)
      try {
        const { data: refData } = await supabase.rpc("get_or_create_referral_code");
        if (refData?.referral_code) {
          setReferralInfo({
            code: refData.referral_code,
            shareUrl: refData.share_url || `https://primora.sa/login?ref=${refData.referral_code}`,
            rewardSar: Number(refData.reward_per_friend_sar) || 25,
            invitedCount: Number(refData.invited_friends_count) || 0,
            earnedSar: Number(refData.total_earned_credits_sar) || 0,
          });
        }
      } catch (refErr) {
        console.warn("Referral code fetch notice:", refErr);
      }

      // 4. Gift Cards (G48)
      const { data: cardsData } = await supabase
        .from("gift_cards")
        .select("*")
        .eq("purchaser_id", user.id)
        .order("created_at", { ascending: false });
      setGiftCards(cardsData || []);

      // 5. Customer Loyalty Points (G50)
      const { data: loyaltyData } = await supabase
        .from("customer_loyalty")
        .select("points_balance")
        .eq("customer_id", user.id);
      const totalPoints = (loyaltyData || []).reduce((sum: number, l: any) => sum + (l.points_balance || 0), 0);
      setLoyaltyPointsTotal(totalPoints);

    } catch (err: any) {
      console.warn("Failed to load customer wallet data:", err.message);
      setError(err.message || "Failed to load wallet data.");
    } finally {
      setLoading(false);
    }
  }

  const showWalletNotice = (message: string) => {
    setError(message);
  };

  const handleCopyReferral = () => {
    const textToCopy = referralInfo.shareUrl || referralInfo.code;
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handlePurchaseGift = async (e: React.FormEvent) => {
    e.preventDefault();
    setGiftSubmitting(true);
    setGiftSuccessMsg("");
    setError("");
    try {
      let phone = giftForm.recipientPhone.replace(/[^\d+]/g, "");
      if (phone.startsWith("05")) phone = "+966" + phone.slice(1);
      else if (phone.startsWith("5")) phone = "+966" + phone;
      else if (!phone.startsWith("+966")) phone = "+966" + phone;

      const amt = Number(giftForm.amount);
      if (amt < 50) {
        throw new Error(locale === "ar" ? "الحد الأدنى لبطاقة الهدية هو 50 ريال" : "Minimum gift card amount is 50 SAR");
      }

      const { data, error: purchaseErr } = await supabase.rpc("purchase_gift_card", {
        p_recipient_name: giftForm.recipientName.trim(),
        p_recipient_phone: phone,
        p_recipient_email: giftForm.recipientEmail.trim() || null,
        p_amount: amt,
        p_message: giftForm.message.trim() || null
      });

      if (purchaseErr) throw purchaseErr;

      setGiftSuccessMsg(locale === "ar" 
        ? `تم إصدار بطاقة الهدية بنجاح! كود الهدية: ${data?.code || "PRM-GIFT"}` 
        : `Gift card issued successfully! Gift code: ${data?.code || "PRM-GIFT"}`);

      setGiftForm({
        recipientName: "",
        recipientPhone: "",
        recipientEmail: "",
        amount: "100",
        message: ""
      });

      await loadWalletData();
    } catch (err: any) {
      setError(err.message || "Failed to purchase gift card");
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
      case "escrow":
      case "partially_redeemed":
        return "bg-amber-50 text-amber-700 border-amber-150";
      case "refunded":
      case "redeemed":
        return "bg-blue-50 text-blue-700 border-blue-150";
      default:
        return "bg-gray-50 text-gray-700 border-gray-150";
    }
  };

  const savedCards = [
    { brand: "Mada", last4: "4920", expiry: "12/28", holder: "YOUSIF AL-SAUD" },
    { brand: "Visa / Apple Pay", last4: "7701", expiry: "09/27", holder: "YOUSIF AL-SAUD" }
  ];

  const isRTL = locale === "ar";

  return (
    <div className="space-y-8 font-sans" dir={isRTL ? "rtl" : "ltr"}>
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">{t.title}</h2>
          <p className="text-sm text-gray-500 mt-1">{t.subtitle}</p>
        </div>
        <button
          onClick={() => {
            setShowGiftModal(true);
            setGiftSuccessMsg("");
          }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs rounded-xl shadow-sm transition"
        >
          <span>🎁</span>
          <span>{t.sendGiftCard}</span>
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-4">
          Notice: {error}
        </div>
      )}

      {/* BALANCE & METRICS SECTION */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Available Store Credit Balance (G49) */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between hover:border-black transition duration-200">
          <div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">{t.balanceTitle}</span>
              <span className="px-2 py-0.5 rounded text-[9px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200">
                {locale === "ar" ? "رصيد فوري" : "Instant"}
              </span>
            </div>
            <h3 className="text-3xl font-bold text-gray-900 mt-2">
              {balance.toFixed(2)} <span className="text-xs font-semibold text-gray-400">{t.currency}</span>
            </h3>
            <p className="text-[10px] text-gray-500 mt-2">
              {locale === "ar" ? "يُخصم تلقائياً عند تأكيد أي حجز" : "Auto-applied as discount during checkout"}
            </p>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => showWalletNotice(walletActions.topUpNotice)}
              className="flex-1 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-xs rounded-xl transition"
            >
              {t.topUp}
            </button>
          </div>
        </div>

        {/* Escrow Holds Card */}
        <div className="bg-stone-950 text-white border border-stone-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[hsla(45,60%,55%,0.06)] rounded-full blur-3xl" />
          <div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] uppercase font-bold text-stone-400 block tracking-wider">{t.escrowTitle}</span>
              <span className="px-2 py-0.5 border border-stone-800 rounded text-[9px] font-bold text-[hsl(45,60%,55%)] bg-stone-900 uppercase">Secured</span>
            </div>
            <h3 className="text-3xl font-bold text-white mt-2">
              {escrowBalance.toFixed(2)} <span className="text-xs font-semibold text-stone-500">{t.currency}</span>
            </h3>
            <p className="text-[10px] text-stone-400 mt-3 leading-relaxed">{t.escrowSubtitle}</p>
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
              {loyaltyPointsTotal} <span className="text-xs font-semibold text-amber-700">{locale === "ar" ? "نقطة" : "pts"}</span>
            </h3>
            <p className="text-[10px] text-amber-800 mt-3 leading-relaxed">{t.loyaltySubtitle}</p>
          </div>
          <div className="mt-4 pt-3 border-t border-amber-200/60 flex items-center justify-between text-[10px] text-amber-900 font-bold">
            <span>{locale === "ar" ? "القيمة التقريبية:" : "Equivalent Value:"}</span>
            <span>{(loyaltyPointsTotal / 10).toFixed(2)} {t.currency}</span>
          </div>
        </div>
      </div>

      {/* REFERRAL CARD (G49) */}
      <div className="bg-gradient-to-r from-stone-900 via-stone-850 to-stone-900 text-white rounded-2xl p-6 sm:p-8 shadow-md relative overflow-hidden">
        <div className="max-w-2xl space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 text-[#F4E7B6] border border-[#D1AF47]/40 text-[10px] font-bold uppercase tracking-wider">
            <span>👥</span>
            <span>{locale === "ar" ? "برنامج المكافآت والإحالة" : "Referral & Rewards"}</span>
          </div>
          <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            {t.referralTitle}
          </h3>
          <p className="text-xs sm:text-sm text-stone-300 leading-relaxed font-light">
            {t.referralSubtitle}
          </p>

          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="bg-stone-800/90 border border-stone-700 rounded-xl px-4 py-2.5 font-mono text-sm tracking-widest text-[#F4E7B6] font-bold flex items-center justify-between">
              <span>{referralInfo.code || "REF-PRIMORA"}</span>
            </div>
            <button
              onClick={handleCopyReferral}
              className="px-5 py-2.5 bg-[#D1AF47] hover:bg-[#bfa03f] text-stone-950 font-extrabold text-xs rounded-xl shadow transition flex items-center justify-center gap-2"
            >
              <span>{copiedCode ? "✓" : "📋"}</span>
              <span>{copiedCode ? t.copied : t.copyLink}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-3 border-t border-stone-800 text-stone-300 text-xs">
            <div>
              <span className="text-[10px] text-stone-400 uppercase font-semibold block">{t.friendsInvited}</span>
              <span className="text-base font-bold text-white">{referralInfo.invitedCount}</span>
            </div>
            <div>
              <span className="text-[10px] text-stone-400 uppercase font-semibold block">{t.creditsEarned}</span>
              <span className="text-base font-bold text-[#F4E7B6]">{referralInfo.earnedSar} {t.currency}</span>
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
                  <span className="font-bold text-gray-800 block">{c.reason || "Store Credit"}</span>
                  <span className="text-[10px] text-gray-400 block mt-0.5">
                    {c.source} • {c.expires_at ? `${t.expiresOn} ${new Date(c.expires_at).toLocaleDateString()}` : "No expiry"}
                  </span>
                </div>
                <span className="font-bold text-emerald-600 text-sm">
                  +{Number(c.amount).toFixed(2)} {t.currency}
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
            onClick={() => {
              setShowGiftModal(true);
              setGiftSuccessMsg("");
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
                    <span className="font-mono text-xs font-bold text-stone-900 block tracking-wider">{card.code}</span>
                    <span className="text-[10px] text-stone-500 block mt-0.5">
                      {locale === "ar" ? `مُهدى إلى: ${card.recipient_name}` : `For: ${card.recipient_name}`}
                    </span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border uppercase ${getStatusStyle(card.status)}`}>
                    {card.status}
                  </span>
                </div>
                {card.message && (
                  <p className="text-[10px] text-stone-600 italic bg-white p-2 rounded-lg border border-stone-150">
                    &ldquo;{card.message}&rdquo;
                  </p>
                )}
                <div className="flex justify-between items-center pt-2 border-t border-stone-200 text-xs">
                  <span className="text-stone-400 text-[10px]">
                    {card.expires_at ? `${t.expiresOn} ${new Date(card.expires_at).toLocaleDateString()}` : ""}
                  </span>
                  <div className="text-end">
                    <span className="text-[10px] text-stone-400 block">{locale === "ar" ? "الرصيد المتبقي" : "Remaining"}</span>
                    <span className="font-bold text-stone-900 text-sm">{card.remaining_balance} {t.currency}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CARDS & PAYMENT METHODS */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-bold text-sm text-gray-800">{t.linkedCards}</h3>
          <button
            onClick={() => showWalletNotice(walletActions.cardNotice)}
            className="text-xs font-bold text-[hsl(45,60%,55%)] hover:underline"
          >
            {t.addCard}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {savedCards.map((card, idx) => (
            <div key={idx} className="bg-gray-50 border border-gray-200/60 rounded-xl p-4 flex items-center justify-between hover:border-gray-400 transition duration-150">
              <div className="space-y-1">
                <span className="text-[9px] uppercase font-bold text-gray-400 block">{card.brand}</span>
                <span className="text-xs font-bold text-gray-800 block">•••• •••• •••• {card.last4}</span>
                <span className="text-[9px] text-gray-500 font-semibold block">{card.holder}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-gray-400 font-bold block">EXP</span>
                <span className="text-xs font-bold text-gray-700 block mt-0.5">{card.expiry}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* TRANSACTION HISTORY */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <h3 className="font-bold text-sm text-gray-800 mb-6">{t.transactionsTitle}</h3>

        {loading ? (
          <div className="text-center py-12 text-sm text-gray-400">Loading ledger entries...</div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-xs font-semibold">{t.noTransactions}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-150 text-gray-400 font-bold uppercase text-[9px]">
                  <th className="py-3 px-4 text-start">Transaction ID</th>
                  <th className="py-3 px-4 text-start">Date</th>
                  <th className="py-3 px-4 text-start">Type & Description</th>
                  <th className="py-3 px-4 text-start">Status</th>
                  <th className="py-3 px-4 text-end">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {transactions.map((tx) => {
                  const isNegative = tx.amount < 0 || tx.type.toLowerCase().includes("payment");
                  return (
                    <tr key={tx.id} className="hover:bg-gray-50 transition-colors duration-150">
                      <td className="py-4 px-4 font-bold text-gray-800">{tx.id}</td>
                      <td className="py-4 px-4 text-gray-500 font-semibold">
                        {new Date(tx.created_at).toLocaleDateString("en-GB", { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="py-4 px-4 text-gray-600">
                        <span className="font-bold text-gray-800 block">{tx.type}</span>
                        <span className="text-[10px] text-gray-400 block mt-0.5">{tx.description}</span>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`px-2.5 py-1 rounded-full font-bold text-[9px] border uppercase ${getStatusStyle(tx.status)}`}>
                          {tx.status}
                        </span>
                      </td>
                      <td className={`py-4 px-4 text-end font-bold ${isNegative ? "text-gray-900" : "text-green-700"}`}>
                        {isNegative ? "-" : "+"}{Math.abs(tx.amount)} {t.currency}
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
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-200 space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <h3 className="font-bold text-base text-gray-900 flex items-center gap-2">
                <span>🎁</span>
                <span>{locale === "ar" ? "إهداء موعد أو بطاقة هدية" : "Send a Gift Card"}</span>
              </h3>
              <button
                onClick={() => setShowGiftModal(false)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                ✕
              </button>
            </div>

            {giftSuccessMsg ? (
              <div className="space-y-4 py-4 text-center">
                <div className="w-12 h-12 bg-green-100 text-green-700 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
                  ✓
                </div>
                <p className="text-sm font-bold text-green-800">{giftSuccessMsg}</p>
                <p className="text-xs text-gray-500">
                  {locale === "ar" 
                    ? "تم إرسال إشعار الهدية للمستلم عبر واتساب مباشرة." 
                    : "A WhatsApp gift notification has been queued for the recipient."}
                </p>
                <button
                  onClick={() => setShowGiftModal(false)}
                  className="w-full py-2.5 bg-stone-900 text-white font-bold text-xs rounded-xl"
                >
                  {locale === "ar" ? "إغلاق" : "Close"}
                </button>
              </div>
            ) : (
              <form onSubmit={handlePurchaseGift} className="space-y-3 text-xs">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">
                    {locale === "ar" ? "اسم المستلم" : "Recipient Name"} *
                  </label>
                  <input
                    type="text"
                    required
                    value={giftForm.recipientName}
                    onChange={(e) => setGiftForm({ ...giftForm, recipientName: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900 outline-none focus:border-stone-900"
                    placeholder={locale === "ar" ? "مثال: سارة أو محمد" : "e.g. Sara or Mohammed"}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">
                    {locale === "ar" ? "رقم جوال المستلم (سعودي)" : "Recipient Saudi Mobile"} *
                  </label>
                  <input
                    type="tel"
                    required
                    value={giftForm.recipientPhone}
                    onChange={(e) => setGiftForm({ ...giftForm, recipientPhone: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900 outline-none focus:border-stone-900"
                    placeholder="05XXXXXXXX"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">
                    {locale === "ar" ? "قيمة بطاقة الهدية (ريال)" : "Gift Amount (SAR)"} *
                  </label>
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    {["50", "100", "200", "500"].map((preset) => (
                      <button
                        key={preset}
                        type="button"
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
                    type="number"
                    min="50"
                    step="10"
                    required
                    value={giftForm.amount}
                    onChange={(e) => setGiftForm({ ...giftForm, amount: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900 outline-none focus:border-stone-900"
                    placeholder="Custom amount (min 50)"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">
                    {locale === "ar" ? "رسالة إهداء شخصية (اختياري)" : "Custom Message (Optional)"}
                  </label>
                  <textarea
                    rows={2}
                    value={giftForm.message}
                    onChange={(e) => setGiftForm({ ...giftForm, message: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900 outline-none focus:border-stone-900 text-xs"
                    placeholder={locale === "ar" ? "هدية خاصة من القلب..." : "A special treat for you..."}
                  />
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowGiftModal(false)}
                    className="flex-1 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold rounded-xl transition"
                  >
                    {locale === "ar" ? "إلغاء" : "Cancel"}
                  </button>
                  <button
                    type="submit"
                    disabled={giftSubmitting}
                    className="flex-1 py-2.5 bg-stone-900 hover:bg-stone-800 text-white font-bold rounded-xl disabled:opacity-50 transition"
                  >
                    {giftSubmitting ? "..." : (locale === "ar" ? "إصدار وإرسال الهدية" : "Send Gift Card")}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
