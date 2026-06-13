"use client";

import React, { useState, useEffect } from "react";

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
    statusPending: "Pending"
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
    statusPending: "قيد الانتظار"
  }
};

export default function ProviderWalletPage() {
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

  // Mock ledger splits list (15% marketplace commission split)
  const ledgerEntries = [
    {
      id: "BK-8891",
      date: "2026-06-13 03:30 PM",
      total: "250.00 SAR",
      platform: "37.50 SAR",
      salon: "212.50 SAR",
      status: t.statusPaid,
      statusColor: "text-[hsl(150,60%,40%)] bg-[hsla(150,60%,40%,0.08)]"
    },
    {
      id: "BK-8892",
      date: "2026-06-13 04:15 PM",
      total: "450.00 SAR",
      platform: "67.50 SAR",
      salon: "382.50 SAR",
      status: t.statusPaid,
      statusColor: "text-[hsl(150,60%,40%)] bg-[hsla(150,60%,40%,0.08)]"
    },
    {
      id: "BK-8893",
      date: "2026-06-13 06:00 PM",
      total: "80.00 SAR",
      platform: "12.00 SAR",
      salon: "68.00 SAR",
      status: t.statusPending,
      statusColor: "text-[hsl(45,60%,55%)] bg-[hsla(45,60%,55%,0.08)]"
    }
  ];

  return (
    <div className="space-y-8">
      {/* Title Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-[hsl(45,60%,55%)]">{t.walletTitle}</h2>
        <p className="text-sm text-[hsl(210,8%,65%)] mt-1">{t.subtitle}</p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Available Balance */}
        <div className="bg-[hsl(220,12%,14%)] border border-[hsla(0,0%,100%,0.08)] rounded-xl p-6 relative">
          <p className="text-xs font-semibold text-[hsl(210,8%,65%)] mb-2">{t.availableBalance}</p>
          <p className="text-3xl font-bold text-[hsl(45,60%,55%)]">6,240.00 SAR</p>
          <button className="mt-6 w-full py-2.5 bg-[hsl(45,60%,55%)] text-[hsl(220,15%,8%)] font-bold text-xs rounded-lg hover:bg-[hsl(45,60%,45%)] transition duration-200">
            {t.requestPayout}
          </button>
        </div>

        {/* Pending Payout */}
        <div className="bg-[hsl(220,12%,14%)] border border-[hsla(0,0%,100%,0.08)] rounded-xl p-6 flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold text-[hsl(210,8%,65%)] mb-2">{t.pendingPayout}</p>
            <p className="text-3xl font-bold">1,820.00 SAR</p>
          </div>
          <p className="text-[10px] text-[hsl(210,8%,65%)] mt-4">Transfers occur weekly on Sunday mornings.</p>
        </div>

        {/* Escrow Held */}
        <div className="bg-[hsl(220,12%,14%)] border border-[hsla(0,0%,100%,0.08)] rounded-xl p-6 flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold text-[hsl(210,8%,65%)] mb-2">{t.escrowHeld}</p>
            <p className="text-3xl font-bold">530.00 SAR</p>
          </div>
          <p className="text-[10px] text-[hsl(210,8%,65%)] mt-4">Deposit funds held securely until client checkout is completed.</p>
        </div>
      </div>

      {/* Linked Bank details */}
      <div className="bg-[hsl(220,12%,14%)] border border-[hsla(0,0%,100%,0.08)] rounded-xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-sm mb-2">{t.payoutBank}</h3>
          <p className="text-xs text-[hsl(0,0%,98%)] font-bold">{t.bankName}</p>
          <p className="text-xs text-[hsl(210,8%,65%)] mt-1">{t.iban}</p>
        </div>
        <span className="px-3 py-1 bg-[hsla(150,60%,40%,0.08)] text-[hsl(150,60%,40%)] rounded-full text-xs font-bold flex items-center gap-1.5 border border-[hsla(150,60%,40%,0.2)]">
          ✔ {t.verified}
        </span>
      </div>

      {/* Transactions Splits Ledger */}
      <div className="bg-[hsl(220,12%,14%)] border border-[hsla(0,0%,100%,0.08)] rounded-xl p-6">
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
    </div>
  );
}
