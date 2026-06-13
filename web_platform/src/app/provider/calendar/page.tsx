"use client";

import React, { useState, useEffect } from "react";

const translations = {
  en: {
    calendarTitle: "Appointment Calendar",
    subtitle: "Manage your daily bookings, shifts, and prayer time buffers",
    today: "Today",
    weekView: "Week View",
    dayView: "Day View",
    stylistFilter: "All Stylists",
    blockedBuffer: "Prayer Time Buffer (Locked)",
    fajr: "Fajr Buffer",
    dhuhr: "Dhuhr Buffer",
    asr: "Asr Buffer",
    maghrib: "Maghrib Buffer",
    isha: "Isha Buffer",
    customer: "Customer",
    stylist: "Stylist",
    service: "Service",
    time: "Time",
    price: "Price",
    addAppointment: "+ Book Walk-in",
    duration: "Duration"
  },
  ar: {
    calendarTitle: "جدول المواعيد",
    subtitle: "إدارة الحجوزات اليومية والمناوبات وأوقات فترات الصلاة",
    today: "اليوم",
    weekView: "عرض الأسبوع",
    dayView: "عرض اليوم",
    stylistFilter: "جميع المصففين",
    blockedBuffer: "فترة الصلاة (مغلق)",
    fajr: "صلاة الفجر",
    dhuhr: "صلاة الظهر",
    asr: "صلاة العصر",
    maghrib: "صلاة المغرب",
    isha: "صلاة العشاء",
    customer: "العميل",
    stylist: "المصفف",
    service: "الخدمة",
    time: "الوقت",
    price: "السعر",
    addAppointment: "+ حجز عميل حضور",
    duration: "المدة"
  }
};

export default function ProviderCalendarPage() {
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

  // Mock schedule times (08:00 AM to 09:00 PM)
  const timeSlots = [
    { label: "08:00 AM", isPrayer: false },
    { label: "09:00 AM", isPrayer: false },
    { label: "10:00 AM", isPrayer: false },
    { label: "11:00 AM", isPrayer: false },
    { label: "12:00 PM", isPrayer: true, prayerName: t.dhuhr },
    { label: "01:00 PM", isPrayer: false },
    { label: "02:00 PM", isPrayer: false },
    { label: "03:30 PM", isPrayer: true, prayerName: t.asr },
    { label: "04:00 PM", isPrayer: false },
    { label: "05:00 PM", isPrayer: false },
    { label: "06:00 PM", isPrayer: false },
    { label: "07:00 PM", isPrayer: true, prayerName: t.maghrib },
    { label: "08:00 PM", isPrayer: false },
    { label: "08:30 PM", isPrayer: true, prayerName: t.isha },
    { label: "09:00 PM", isPrayer: false }
  ];

  // Mock scheduled appointments
  const appointments = [
    {
      id: "1",
      customer: "Faisal Al-Otaibi",
      service: "Premium Grooming Pack",
      time: "03:00 PM - 04:00 PM",
      slotIndex: 6, // 03:00 PM region
      staff: "Ali (Master)",
      price: "250 SAR",
      duration: "60 mins"
    },
    {
      id: "2",
      customer: "Sara Al-Mansoori",
      service: "Hair Styling & Silk Treatment",
      time: "04:15 PM - 05:15 PM",
      slotIndex: 8, // 04:00 PM region
      staff: "Elena (Senior)",
      price: "450 SAR",
      duration: "60 mins"
    },
    {
      id: "3",
      customer: "Bandar Bin-Khalid",
      service: "Kids Haircut & Styling",
      time: "06:00 PM - 06:40 PM",
      slotIndex: 10, // 06:00 PM region
      staff: "Tariq (Stylist)",
      price: "80 SAR",
      duration: "40 mins"
    }
  ];

  return (
    <div className="space-y-8">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[hsl(45,60%,55%)]">{t.calendarTitle}</h2>
          <p className="text-sm text-[hsl(210,8%,65%)] mt-1">{t.subtitle}</p>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 bg-[hsla(0,0%,100%,0.03)] border border-[hsla(0,0%,100%,0.08)] text-sm rounded-lg hover:border-[hsl(45,60%,55%)] transition duration-200">
            {t.today}
          </button>
          <button className="px-4 py-2 bg-[hsl(45,60%,55%)] text-[hsl(220,15%,8%)] font-bold text-sm rounded-lg hover:bg-[hsl(45,60%,45%)] transition duration-200">
            {t.addAppointment}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-[hsl(220,12%,14%)] border border-[hsla(0,0%,100%,0.08)] rounded-xl p-4 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex gap-4">
          <select className="bg-[hsl(220,15%,8%)] border border-[hsla(0,0%,100%,0.08)] text-sm rounded-lg px-4 py-2 text-[hsl(0,0%,98%)] outline-none focus:border-[hsl(45,60%,55%)]">
            <option>{t.stylistFilter}</option>
            <option>Ali (Master Barber)</option>
            <option>Elena (Senior Stylist)</option>
            <option>Tariq (Stylist)</option>
          </select>
        </div>
        <div className="flex bg-[hsl(220,15%,8%)] border border-[hsla(0,0%,100%,0.08)] rounded-lg p-1">
          <button className="px-3 py-1.5 text-xs font-semibold rounded-md bg-[hsl(220,12%,14%)] text-[hsl(45,60%,55%)]">
            {t.dayView}
          </button>
          <button className="px-3 py-1.5 text-xs font-semibold rounded-md text-[hsl(210,8%,65%)] hover:text-[hsl(0,0%,98%)]">
            {t.weekView}
          </button>
        </div>
      </div>

      {/* Schedule Planner Grid */}
      <div className="bg-[hsl(220,12%,14%)] border border-[hsla(0,0%,100%,0.08)] rounded-xl overflow-hidden">
        <div className="p-6 border-b border-[hsla(0,0%,100%,0.08)] bg-[hsla(0,0%,100%,0.02)]">
          <h3 className="font-semibold text-lg">
            {lang === "ar" ? "جدول اليوم - السبت، 13 يونيو" : "Today's Schedule - Saturday, June 13"}
          </h3>
        </div>

        <div className="divide-y divide-[hsla(0,0%,100%,0.05)]">
          {timeSlots.map((slot, index) => {
            // Check if there is an appointment starting in this slot range
            const appt = appointments.find(a => a.slotIndex === index);

            return (
              <div key={index} className="flex min-h-[76px] items-stretch">
                {/* Time Indicator */}
                <div className="w-24 px-6 py-4 border-r border-[hsla(0,0%,100%,0.05)] flex items-center justify-center text-xs font-medium text-[hsl(210,8%,65%)] bg-[hsla(0,0%,100%,0.01)] select-none">
                  {slot.label}
                </div>

                {/* Slot Content Area */}
                <div className="flex-1 p-2 relative flex items-center">
                  {slot.isPrayer ? (
                    // Display Prayer Time Buffer Lockout
                    <div className="w-full h-full bg-[hsla(355,75%,50%,0.08)] border border-[hsla(355,75%,50%,0.2)] rounded-lg flex items-center px-4 gap-3 text-[hsl(355,75%,60%)]">
                      <span className="text-lg">🕌</span>
                      <div>
                        <p className="text-xs font-bold">{slot.prayerName} - {t.blockedBuffer}</p>
                        <p className="text-[10px] text-[hsl(355,75%,70%)]">20-minute gap auto-reserved</p>
                      </div>
                    </div>
                  ) : appt ? (
                    // Display Active Booked Appointment
                    <div className="w-full bg-[hsla(45,60%,55%,0.08)] border-l-4 border-[hsl(45,60%,55%)] rounded-r-lg p-3 flex flex-wrap gap-4 items-center justify-between group hover:bg-[hsla(45,60%,55%,0.12)] transition duration-200">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm text-[hsl(0,0%,98%)]">{appt.customer}</h4>
                          <span className="text-[10px] bg-[hsla(0,0%,100%,0.05)] text-[hsl(210,8%,65%)] px-2 py-0.5 rounded-full">{appt.duration}</span>
                        </div>
                        <p className="text-xs text-[hsl(210,8%,65%)] mt-1">
                          {t.service}: <span className="text-[hsl(0,0%,98%)]">{appt.service}</span>
                        </p>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-[10px] text-[hsl(210,8%,65%)]">{t.stylist}</p>
                          <p className="text-xs font-semibold text-[hsl(45,60%,55%)]">{appt.staff}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-[hsl(210,8%,65%)]">{t.price}</p>
                          <p className="text-sm font-bold">{appt.price}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    // Empty, bookable slot
                    <div className="w-full h-full rounded-lg border border-dashed border-[hsla(0,0%,100%,0.08)] hover:border-[hsl(45,60%,55%)] hover:bg-[hsla(45,60%,55%,0.02)] transition duration-150 cursor-pointer flex items-center justify-center text-[hsl(210,8%,65%)] hover:text-[hsl(45,60%,55%)] group">
                      <span className="text-xs font-medium opacity-0 group-hover:opacity-100 transition duration-150">
                        {lang === "ar" ? "اضغط لجدولة موعد" : "Click to schedule slot"}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
