"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const translations = {
  en: {
    title: "Wallet & Payments",
    subtitle: "Manage your secure payments, escrow status, and invoice history.",
    balanceTitle: "Available Balance",
    escrowTitle: "Escrow Holds",
    escrowSubtitle: "Held safely until services are rendered",
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
    currency: "SAR"
  },
  ar: {
    title: "المحفظة والمدفوعات",
    subtitle: "إدارة مدفوعاتك الآمنة، وحالات الضمان، وسجل الفواتير.",
    balanceTitle: "الرصيد المتاح",
    escrowTitle: "المبالغ المحتجزة بالضمان",
    escrowSubtitle: "تُحفظ بأمان لحين اكتمال تقديم الخدمة",
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
    currency: "ريال"
  }
};

export default function CustomerWalletPage() {
  const [locale, setLocale] = useState<"en" | "ar">("ar");
  const [balance, setBalance] = useState(0.0);
  const [escrowBalance, setEscrowBalance] = useState(0.0);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const t = translations[locale];
  const walletActions = {
    bookingDeposit: locale === "ar" ? "Ø¹Ø±Ø¨ÙˆÙ† Ø­Ø¬Ø²" : "Booking Deposit",
    cardNotice: locale === "ar"
      ? "ØªØªÙ… Ø¥Ø¶Ø§ÙØ© Ø§Ù„Ø¨Ø·Ø§Ù‚Ø§Øª Ø¨Ø£Ù…Ø§Ù† Ø£Ø«Ù†Ø§Ø¡ Ø§Ù„Ø¯ÙØ¹."
      : "Cards are added securely during checkout.",
    topUpNotice: locale === "ar"
      ? "Ø´Ø­Ù† Ø§Ù„Ù…Ø­ÙØ¸Ø© ØºÙŠØ± Ù…ÙØ¹Ù„ Ø­Ø§Ù„ÙŠØ§Ù‹. ØªØ¯ÙØ¹ Ø¹Ø±Ø¨ÙˆÙ†Ø§Øª Ø§Ù„Ø­Ø¬Ø² Ø£Ø«Ù†Ø§Ø¡ Ø§Ù„Ø¯ÙØ¹."
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

      const { data, error: txError } = await supabase
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

      if (txError) throw txError;

      const formatted = (data || []).map((entry: any) => {
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
      setBalance(0);
    } catch (err: any) {
      console.warn("Failed to load customer wallet ledger:", err.message);
      setError(err.message || "Failed to load wallet ledger.");
      setTransactions([]);
      setEscrowBalance(0);
      setBalance(0);
    } finally {
      setLoading(false);
    }
  }

  const showWalletNotice = (message: string) => {
    setError(message);
  };

  const getStatusStyle = (status: string) => {
    switch (status.toLowerCase()) {
      case "completed":
      case "success":
        return "bg-green-50 text-green-700 border-green-150";
      case "held":
      case "escrow":
        return "bg-amber-50 text-amber-700 border-amber-150";
      case "refunded":
        return "bg-blue-50 text-blue-700 border-blue-150";
      default:
        return "bg-gray-50 text-gray-700 border-gray-150";
    }
  };

  const savedCards = [
    { brand: "Mada", last4: "4920", expiry: "12/28", holder: "YOUSIF AL-SAUD" },
    { brand: "Visa / Apple Pay", last4: "7701", expiry: "09/27", holder: "YOUSIF AL-SAUD" }
  ];

  return (
    <div className="space-y-8 font-sans">
      {/* HEADER */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">{t.title}</h2>
        <p className="text-sm text-gray-500 mt-1">{t.subtitle}</p>
      </div>

      {error && (
        <div className="bg-stone-50 border border-stone-200 text-stone-700 text-xs rounded-xl p-4">
          Notice: {error}
        </div>
      )}

      {/* BALANCE SECTION */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Available Wallet Balance */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between hover:border-black transition duration-200">
          <div>
            <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">{t.balanceTitle}</span>
            <h3 className="text-3xl font-bold text-gray-900 mt-2">
              {balance.toFixed(2)} <span className="text-xs font-semibold text-gray-400">{t.currency}</span>
            </h3>
          </div>
          <div className="flex gap-3 mt-6">
            <button
              onClick={() => showWalletNotice(walletActions.topUpNotice)}
              className="flex-1 py-2.5 bg-black hover:bg-gray-800 text-white font-bold text-xs rounded-xl transition"
            >
              {t.topUp}
            </button>
          </div>
        </div>

        {/* Escrow Holds Card */}
        <div className="bg-black text-white border border-gray-900 rounded-2xl p-6 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[hsla(45,60%,55%,0.04)] rounded-full blur-3xl" />
          <div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] uppercase font-bold text-stone-400 block tracking-wider">{t.escrowTitle}</span>
              <span className="px-2 py-0.5 border border-stone-850 rounded text-[9px] font-bold text-[hsl(45,60%,55%)] bg-stone-950 uppercase">Secured</span>
            </div>
            <h3 className="text-3xl font-bold text-white mt-2">
              {escrowBalance.toFixed(2)} <span className="text-xs font-semibold text-stone-500">{t.currency}</span>
            </h3>
            <p className="text-[10px] text-stone-400 mt-3 leading-relaxed">{t.escrowSubtitle}</p>
          </div>
        </div>
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
    </div>
  );
}
