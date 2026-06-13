"use client";

import React, { useState, useEffect } from "react";

const translations = {
  en: {
    dashboardTitle: "Dashboard Overview",
    subtitle: "Real-time statistics for your salon branches",
    totalBookings: "Total Bookings",
    netRevenue: "Net Revenue",
    averageRating: "Average Rating",
    activeStaff: "Active Stylists",
    upcomingBookings: "Upcoming Appointments (Today)",
    noUpcomingBookings: "No bookings scheduled for today.",
    customer: "Customer",
    service: "Service",
    time: "Scheduled Time",
    staff: "Stylist",
    price: "Price",
    status: "Payment Status",
    confirmed: "Confirmed",
    pending: "Pending Payment",
    depositPaid: "Deposit Paid",
    cashAtVenue: "Pay at Venue"
  },
  ar: {
    dashboardTitle: "نظرة عامة على لوحة التحكم",
    subtitle: "إحصائيات مباشرة لفروع الصالون الخاصة بك",
    totalBookings: "إجمالي الحجوزات",
    netRevenue: "صافي الأرباح",
    averageRating: "متوسط التقييم",
    activeStaff: "المصففين النشطين",
    upcomingBookings: "المواعيد القادمة (اليوم)",
    noUpcomingBookings: "لا توجد حجوزات مجدولة اليوم.",
    customer: "العميل",
    service: "الخدمة",
    time: "وقت الموعد",
    staff: "المصفف",
    price: "السعر",
    status: "حالة الدفع",
    confirmed: "مؤكد",
    pending: "في انتظار الدفع",
    depositPaid: "تم دفع العربون",
    cashAtVenue: "الدفع في الصالون"
  }
};

export default function ProviderDashboardPage() {
  const [lang, setLang] = useState<"en" | "ar">("ar");

  useEffect(() => {
    // Sync UI text direction
    const checkLang = () => {
      const currentLang = document.documentElement.lang as "en" | "ar";
      if (currentLang && currentLang !== lang) {
        setLang(currentLang);
      }
    };
    checkLang();
    
    // Listen for attribute mutations on HTML tag
    const observer = new MutationObserver(checkLang);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, [lang]);

  const t = translations[lang];

  // Mock statistics
  const stats = [
    { title: t.totalBookings, value: "148", change: "+12% vs last week", icon: "📈" },
    { title: t.netRevenue, value: "24,150 SAR", change: "+8% vs last week", icon: "💰" },
    { title: t.averageRating, value: "4.92 / 5.0", change: "Based on 320 reviews", icon: "⭐" },
    { title: t.activeStaff, value: "8 / 10", change: "2 currently off-duty", icon: "💇‍♂️" },
  ];

  // Mock today's bookings
  const bookings = [
    {
      id: "1",
      customer: "Faisal Al-Otaibi",
      service: "Premium Grooming & Facial Pack",
      time: "03:30 PM",
      staff: "Ali (Master Barber)",
      price: "250 SAR",
      status: t.depositPaid,
      statusColor: "text-[hsl(150,60%,40%)]",
      badgeBg: "bg-[hsla(150,60%,40%,0.08)]"
    },
    {
      id: "2",
      customer: "Sara Al-Mansoori",
      service: "Hair Styling & Silk Treatment",
      time: "04:15 PM",
      staff: "Elena (Senior Stylist)",
      price: "450 SAR",
      status: t.depositPaid,
      statusColor: "text-[hsl(150,60%,40%)]",
      badgeBg: "bg-[hsla(150,60%,40%,0.08)]"
    },
    {
      id: "3",
      customer: "Bandar Bin-Khalid",
      service: "Kids Haircut & Styling",
      time: "06:00 PM",
      staff: "Tariq (Stylist)",
      price: "80 SAR",
      status: t.cashAtVenue,
      statusColor: "text-[hsl(45,60%,55%)]",
      badgeBg: "bg-[hsla(45,60%,55%,0.08)]"
    }
  ];

  return (
    <div className="space-y-8">
      
      {/* Title Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-[hsl(45,60%,55%)]">{t.dashboardTitle}</h2>
        <p className="text-sm text-[hsl(210,8%,65%)] mt-1">{t.subtitle}</p>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <div key={i} className="bg-[hsl(220,12%,14%)] border border-[hsla(0,0%,100%,0.08)] rounded-xl p-6 relative overflow-hidden group hover:border-[hsl(45,60%,55%)] transition-all duration-300">
            <div className="flex justify-between items-start mb-4">
              <span className="text-xs font-semibold text-[hsl(210,8%,65%)]">{stat.title}</span>
              <span className="text-xl p-2 bg-[hsla(0,0%,100%,0.03)] rounded-lg">{stat.icon}</span>
            </div>
            <p className="text-2xl font-bold tracking-tight mb-1">{stat.value}</p>
            <p className="text-xs text-[hsl(150,60%,40%)]">{stat.change}</p>
          </div>
        ))}
      </div>

      {/* Bookings Tracker Table */}
      <div className="bg-[hsl(220,12%,14%)] border border-[hsla(0,0%,100%,0.08)] rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-6">{t.upcomingBookings}</h3>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-[hsla(0,0%,100%,0.08)] text-[hsl(210,8%,65%)] text-xs uppercase">
                <th className="py-4 px-4 text-start">{t.customer}</th>
                <th className="py-4 px-4 text-start">{t.service}</th>
                <th className="py-4 px-4 text-start">{t.time}</th>
                <th className="py-4 px-4 text-start">{t.staff}</th>
                <th className="py-4 px-4 text-start">{t.price}</th>
                <th className="py-4 px-4 text-start">{t.status}</th>
              </tr>
            </thead>
            <tbody>
              {bookings.length > 0 ? (
                bookings.map((booking) => (
                  <tr key={booking.id} className="border-b border-[hsla(0,0%,100%,0.03)] hover:bg-[hsla(0,0%,100%,0.01)] transition-colors duration-200">
                    <td className="py-4 px-4 font-medium">{booking.customer}</td>
                    <td className="py-4 px-4 text-[hsl(210,8%,65%)]">{booking.service}</td>
                    <td className="py-4 px-4">{booking.time}</td>
                    <td className="py-4 px-4 text-[hsl(45,60%,55%)]">{booking.staff}</td>
                    <td className="py-4 px-4 font-semibold">{booking.price}</td>
                    <td className="py-4 px-4">
                      <span className={`px-3 py-1.5 rounded-full text-xs font-semibold ${booking.badgeBg} ${booking.statusColor}`}>
                        {booking.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[hsl(210,8%,65%)]">
                    {t.noUpcomingBookings}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
