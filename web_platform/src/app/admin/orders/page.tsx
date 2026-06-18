"use client";
import React, { useState, useEffect } from "react";

const translations = {
  en: {
    title: "Product Retail Orders",
    subtitle: "Monitor salon beauty product purchases, manage deliveries, and track shipping pipelines.",
    totalOrders: "Total Orders",
    pendingShipment: "Pending Shipment",
    completedSales: "Completed Sales",
    orderId: "Order ID",
    customer: "Customer",
    items: "Purchased Items",
    amount: "Amount",
    status: "Delivery Status",
    actions: "Actions",
    shipBtn: "Ship Order",
    pending: "PENDING",
    shipped: "SHIPPED",
    delivered: "DELIVERED",
    successMsg: "Order status updated successfully!"
  },
  ar: {
    title: "طلبات بيع المنتجات",
    subtitle: "متابعة مشتريات منتجات التجميل والعناية، تنظيم عمليات الشحن، وتتبع خطوط التوصيل.",
    totalOrders: "إجمالي الطلبات",
    pendingShipment: "قيد الشحن",
    completedSales: "مبيعات مكتملة",
    orderId: "رقم الطلب",
    customer: "العميل",
    items: "المنتجات المشتراة",
    amount: "المبلغ الإجمالي",
    status: "حالة التوصيل",
    actions: "الإجراءات",
    shipBtn: "شحن الطلب",
    pending: "قيد الانتظار",
    shipped: "تم الشحن",
    delivered: "تم التوصيل",
    successMsg: "تم تحديث حالة الطلب بنجاح!"
  }
};

export default function AdminOrders() {
  const [orders, setOrders] = useState<any[]>([]);
  const [success, setSuccess] = useState("");
  const [lang, setLang] = useState<"en" | "ar">("ar");

  useEffect(() => {
    const checkLang = () => {
      const currentLang = document.documentElement.lang as "en" | "ar";
      if (currentLang && currentLang !== lang) setLang(currentLang);
    };
    checkLang();
    const observer = new MutationObserver(checkLang);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, [lang]);

  useEffect(() => {
    setOrders([
      { id: "ord-881", customer: "أنس القرني", items: "Premium Styling Pomade x2", price: 160, status: "PENDING" },
      { id: "ord-882", customer: "Amal Salem", items: "Argan Oil Hair Treatment Glow", price: 320, status: "SHIPPED" },
      { id: "ord-883", customer: "سلطان العتيبي", items: "Beard Beard Wash & Balm Kit", price: 195, status: "DELIVERED" }
    ]);
  }, []);

  const handleShip = (id: string) => {
    setSuccess("");
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: "SHIPPED" } : o));
    setSuccess(translations[lang].successMsg);
  };

  const t = translations[lang];
  const isRTL = lang === "ar";
  const flip = isRTL ? "flex-row-reverse" : "flex-row";
  const cardBase = "rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)] transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.035)] hover:border-[#D1AF47]/20";

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-6 ${isRTL ? "text-right" : "text-left"}`}>
      <div>
        <h2 className="text-2xl font-serif font-black text-gray-900 leading-tight">{t.title}</h2>
        <p className="text-xs text-gray-500 font-semibold mt-1">{t.subtitle}</p>
      </div>

      {success && <div className="bg-[#ECFDF3] border border-[#D1FADF] text-[#027A48] text-xs rounded-xl p-4 font-bold">{success}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.totalOrders}</span>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">{orders.length}</strong>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.pendingShipment}</span>
          <strong className="block text-2xl font-serif font-black text-amber-700 mt-2.5">{orders.filter(o => o.status === "PENDING").length}</strong>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.completedSales}</span>
          <strong className="block text-2xl font-serif font-black text-emerald-700 mt-2.5">5,640 {lang === "ar" ? "ريال" : "SAR"}</strong>
        </div>
      </div>

      <div className="bg-white border border-[#ECECEC] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className={`border-b border-[#ECECEC] text-[#667085] bg-gray-50/50 uppercase tracking-widest font-extrabold text-[9px] ${isRTL ? "text-right" : ""}`}>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.orderId}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.customer}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.items}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.amount}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.status}</th>
                <th className="py-4 px-6 text-right"></th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-[#F5F5F5] font-semibold text-gray-700 ${isRTL ? "text-right" : "text-left"}`}>
              {orders.map(o => (
                <tr key={o.id} className="hover:bg-gray-50/40 transition duration-150">
                  <td className="py-4 px-6 font-bold text-gray-900">#{o.id}</td>
                  <td className="py-4 px-6">{o.customer}</td>
                  <td className="py-4 px-6">{o.items}</td>
                  <td className="py-4 px-6 font-serif font-black text-gray-900">{o.price} {lang === "ar" ? "ريال" : "SAR"}</td>
                  <td className="py-4 px-6">
                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider inline-block ${
                      o.status === "DELIVERED" ? "bg-[#ECFDF3] text-[#16A34A]" : o.status === "SHIPPED" ? "bg-[#EFF8FF] text-[#175CD3]" : "bg-[#FFFAEB] text-[#F59E0B]"
                    }`}>{o.status === "DELIVERED" ? t.delivered : o.status === "SHIPPED" ? t.shipped : t.pending}</span>
                  </td>
                  <td className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>
                    {o.status === "PENDING" && <button onClick={() => handleShip(o.id)} className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-[10px] uppercase font-black tracking-wider hover:bg-gray-800 transition">{t.shipBtn}</button>}
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
