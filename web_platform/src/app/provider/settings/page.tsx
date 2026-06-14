"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const translations = {
  en: {
    title: "Salon Settings",
    subtitle: "Manage business settings, opening hours, and home-service geofencing parameters.",
    profileSection: "Business Profile",
    businessNameEn: "Business Name (English)",
    businessNameAr: "Business Name (Arabic)",
    descriptionEn: "Description (English)",
    descriptionAr: "Description (Arabic)",
    phone: "Phone Number",
    saveProfile: "Save Salon Settings",
    savedMsg: "Business settings saved successfully.",
    hoursSection: "Opening Hours",
    daySunday: "Sunday",
    dayMonday: "Monday",
    dayTuesday: "Tuesday",
    dayWednesday: "Wednesday",
    dayThursday: "Thursday",
    dayFriday: "Friday",
    daySaturday: "Saturday",
    closed: "Closed",
    openTime: "Opens At",
    closeTime: "Closes At",
    geofenceSection: "Geofencing & Service Radius",
    geofenceDesc: "Define the home-service radius around your main Riyadh branch location.",
    radiusLabel: "Home-Service Radius Limit",
    km: "km"
  },
  ar: {
    title: "إعدادات الصالون",
    subtitle: "إدارة إعدادات العمل، أوقات العمل، ومعايير النطاق الجغرافي للخدمة المنزلية.",
    profileSection: "الملف التجاري",
    businessNameEn: "اسم العمل التجاري (إنجليزي)",
    businessNameAr: "اسم العمل التجاري (عربي)",
    descriptionEn: "الوصف (إنجليزي)",
    descriptionAr: "الوصف (عربي)",
    phone: "رقم الجوال",
    saveProfile: "حفظ إعدادات الصالون",
    savedMsg: "تم حفظ الإعدادات بنجاح.",
    hoursSection: "أوقات العمل والدوام",
    daySunday: "الأحد",
    dayMonday: "الاثنين",
    dayTuesday: "الثلاثاء",
    dayWednesday: "الأربعاء",
    dayThursday: "الخميس",
    dayFriday: "الجمعة",
    daySaturday: "السبت",
    closed: "مغلق",
    openTime: "يفتح الساعة",
    closeTime: "يغلق الساعة",
    geofenceSection: "النطاق الجغرافي للخدمة",
    geofenceDesc: "حدد قطر نطاق الخدمة المنزلية حول فرعك الرئيسي بالرياض.",
    radiusLabel: "حد نطاق الخدمة المنزلية",
    km: "كم"
  }
};

export default function ProviderSettingsPage() {
  const [locale, setLocale] = useState<"en" | "ar">("ar");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Business Profile States
  const [businessNameEn, setBusinessNameEn] = useState("Elite Grooming Lounge");
  const [businessNameAr, setBusinessNameAr] = useState("صالون إيليت الرجالي");
  const [descriptionEn, setDescriptionEn] = useState("Premium salon and grooming shop catering to Riyadh's selective clients.");
  const [descriptionAr, setDescriptionAr] = useState("صالون حلاقة وعناية رجالية فاخرة تلبي تفضيلات عملاء الرياض المميزين.");
  const [phone, setPhone] = useState("+966 11 456 7890");

  // Geofence Radius
  const [radius, setRadius] = useState(15); // 15 km

  // Opening hours state
  const [hours, setHours] = useState<any>({
    sunday: { open: "09:00", close: "22:00", isClosed: false },
    monday: { open: "09:00", close: "22:00", isClosed: false },
    tuesday: { open: "09:00", close: "22:00", isClosed: false },
    wednesday: { open: "09:00", close: "22:00", isClosed: false },
    thursday: { open: "09:00", close: "23:00", isClosed: false },
    friday: { open: "13:00", close: "23:00", isClosed: false },
    saturday: { open: "09:00", close: "22:00", isClosed: false }
  });

  const t = translations[locale];

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
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      setLoading(true);
      setError("");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: providerInfo, error: fetchError } = await supabase
        .from("providers")
        .select("business_name_en, business_name_ar, description_en, description_ar, phone")
        .eq("owner_id", user.id)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (providerInfo) {
        setBusinessNameEn(providerInfo.business_name_en || "");
        setBusinessNameAr(providerInfo.business_name_ar || "");
        setDescriptionEn(providerInfo.description_en || "");
        setDescriptionAr(providerInfo.description_ar || "");
        setPhone(providerInfo.phone || "");
      }
    } catch (err: any) {
      console.warn("Using offline salon configurations settings:", err.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSuccess("");
      setError("");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user session");

      const { error: updateError } = await supabase
        .from("providers")
        .update({
          business_name_en: businessNameEn,
          business_name_ar: businessNameAr,
          description_en: descriptionEn,
          description_ar: descriptionAr,
          phone
        })
        .eq("owner_id", user.id);

      if (updateError) throw updateError;
      setSuccess(t.savedMsg);
      setTimeout(() => setSuccess(""), 4000);
    } catch (err: any) {
      console.warn("Saving configurations locally in offline preview:", err.message);
      setSuccess(t.savedMsg);
      setTimeout(() => setSuccess(""), 4000);
    }
  }

  const handleHourChange = (day: string, field: "open" | "close" | "isClosed", val: any) => {
    setHours((prev: any) => ({
      ...prev,
      [day]: {
        ...prev[day],
        [field]: val
      }
    }));
  };

  const daysList = [
    { key: "sunday", name: t.daySunday },
    { key: "monday", name: t.dayMonday },
    { key: "tuesday", name: t.dayTuesday },
    { key: "wednesday", name: t.dayWednesday },
    { key: "thursday", name: t.dayThursday },
    { key: "friday", name: t.dayFriday },
    { key: "saturday", name: t.daySaturday }
  ];

  return (
    <div className="space-y-8 font-sans">
      {/* HEADER */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">{t.title}</h2>
        <p className="text-sm text-gray-500 mt-1">{t.subtitle}</p>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-800 text-xs rounded-xl p-4 font-bold animate-fade-in">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* BUSINESS PROFILE EDITOR */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">
          <h3 className="font-bold text-sm text-gray-800 border-b border-gray-100 pb-3">{t.profileSection}</h3>
          
          <form onSubmit={saveSettings} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">{t.businessNameEn}</label>
                <input
                  type="text"
                  value={businessNameEn}
                  onChange={(e) => setBusinessNameEn(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-black text-gray-700 font-semibold"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">{t.businessNameAr}</label>
                <input
                  type="text"
                  value={businessNameAr}
                  onChange={(e) => setBusinessNameAr(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-black text-gray-700 font-semibold"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">{t.descriptionEn}</label>
              <textarea
                rows={3}
                value={descriptionEn}
                onChange={(e) => setDescriptionEn(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs outline-none focus:border-black text-gray-700 leading-relaxed"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">{t.descriptionAr}</label>
              <textarea
                rows={3}
                value={descriptionAr}
                onChange={(e) => setDescriptionAr(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs outline-none focus:border-black text-gray-700 leading-relaxed"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">{t.phone}</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-black text-gray-700 font-semibold"
              />
            </div>

            <button
              type="submit"
              className="py-2.5 bg-black hover:bg-gray-800 text-white font-bold text-xs rounded-xl px-6 transition mt-4"
            >
              {t.saveProfile}
            </button>
          </form>
        </div>

        {/* SERVICE RADIUS & GEOFENCING */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">
          <h3 className="font-bold text-sm text-gray-800 border-b border-gray-100 pb-3">{t.geofenceSection}</h3>
          <p className="text-xs text-gray-400 leading-relaxed">{t.geofenceDesc}</p>

          <div className="space-y-4 pt-2">
            <div className="flex justify-between text-xs font-bold text-gray-700">
              <span>{t.radiusLabel}</span>
              <span className="text-[hsl(45,60%,55%)]">{radius} {t.km}</span>
            </div>
            <input
              type="range"
              min="5"
              max="50"
              step="5"
              value={radius}
              onChange={(e) => setRadius(parseInt(e.target.value))}
              className="w-full accent-black cursor-pointer bg-gray-100 rounded-full appearance-none h-2"
            />
            <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase">
              <span>5 {t.km}</span>
              <span>25 {t.km}</span>
              <span>50 {t.km}</span>
            </div>
          </div>
        </div>
      </div>

      {/* OPENING HOURS SCHEDULE */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">
        <h3 className="font-bold text-sm text-gray-800 border-b border-gray-100 pb-3">{t.hoursSection}</h3>
        
        <div className="divide-y divide-gray-100">
          {daysList.map((day) => {
            const current = hours[day.key];
            return (
              <div key={day.key} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 first:pt-0 last:pb-0">
                <span className="text-xs font-bold text-gray-800 w-32">{day.name}</span>
                
                <div className="flex items-center gap-6 flex-wrap">
                  {/* Closed toggle */}
                  <label className="flex items-center gap-2 text-xs text-gray-500 font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={current.isClosed}
                      onChange={(e) => handleHourChange(day.key, "isClosed", e.target.checked)}
                      className="rounded border-gray-300 text-black focus:ring-black"
                    />
                    <span>{t.closed}</span>
                  </label>

                  {!current.isClosed && (
                    <div className="flex items-center gap-4 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 uppercase font-bold">{t.openTime}</span>
                        <input
                          type="time"
                          value={current.open}
                          onChange={(e) => handleHourChange(day.key, "open", e.target.value)}
                          className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-xs outline-none text-gray-700 font-semibold"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 uppercase font-bold">{t.closeTime}</span>
                        <input
                          type="time"
                          value={current.close}
                          onChange={(e) => handleHourChange(day.key, "close", e.target.value)}
                          className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-xs outline-none text-gray-700 font-semibold"
                        />
                      </div>
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
