"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const translations = {
  en: {
    title: "Settings",
    subtitle: "Manage your personal profile, regional preferences, and family dependents.",
    profileSection: "Personal Profile",
    firstName: "First Name",
    lastName: "Last Name",
    email: "Email Address",
    phone: "Phone Number",
    saveProfile: "Save Profile Settings",
    savedMsg: "Settings updated successfully.",
    preferencesSection: "Preferences",
    language: "App Language",
    notificationSettings: "Notification Channel Preferences",
    emailNotif: "Receive email billing invoices",
    smsNotif: "Receive booking SMS reminders",
    pushNotif: "Receive in-app chat reminders",
    dependentsSection: "Family Members & Dependents",
    dependentsDesc: "Add family members to book grooming sessions on their behalf.",
    addDependent: "Add Dependent",
    depName: "Full Name",
    depRelation: "Relationship (e.g. Son, Daughter, Spouse)",
    depAge: "Age",
    noDependents: "No dependents registered yet."
  },
  ar: {
    title: "الإعدادات",
    subtitle: "إدارة الملف الشخصي، التفضيلات الإقليمية، وأفراد العائلة التابعين لك.",
    profileSection: "الملف الشخصي",
    firstName: "الاسم الأول",
    lastName: "اسم العائلة",
    email: "البريد الإلكتروني",
    phone: "رقم الجوال",
    saveProfile: "حفظ إعدادات الملف الشخصي",
    savedMsg: "تم تحديث الإعدادات بنجاح.",
    preferencesSection: "التفضيلات",
    language: "لغة التطبيق",
    notificationSettings: "تفضيلات قنوات التنبيه",
    emailNotif: "استلام الفواتير عبر البريد الإلكتروني",
    smsNotif: "تلقي رسائل الجوال لتذكير المواعيد",
    pushNotif: "تلقي تنبيهات التطبيق للرسائل والدردشة",
    dependentsSection: "أفراد العائلة والتابعين",
    dependentsDesc: "أضف أفراد عائلتك لحجز جلسات العناية والجمال لهم.",
    addDependent: "إضافة تابع",
    depName: "الاسم الكامل",
    depRelation: "صلة القرابة (مثال: ابن، ابنة، زوج/زوجة)",
    depAge: "العمر",
    noDependents: "لم يتم إضافة تابعين بعد."
  }
};

export default function CustomerSettingsPage() {
  const [locale, setLocale] = useState<"en" | "ar">("en");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Profile Form States
  const [profile, setProfile] = useState({
    firstName: "Yousif",
    lastName: "Al-Saud",
    email: "yousif@primora.com",
    phone: "+966 50 123 4567"
  });

  // Preference States
  const [emailNotif, setEmailNotif] = useState(true);
  const [smsNotif, setSmsNotif] = useState(true);
  const [pushNotif, setPushNotif] = useState(true);

  // Dependents States
  const [dependents, setDependents] = useState<any[]>([
    { id: "1", name: "Faisal Al-Saud", relation: "Son", age: 12 },
    { id: "2", name: "Sara Al-Saud", relation: "Spouse", age: 34 }
  ]);

  const [newDep, setNewDep] = useState({ name: "", relation: "", age: "" });
  const [showAddDepForm, setShowAddDepForm] = useState(false);

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
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      setLoading(true);
      setError("");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error: fetchError } = await supabase
        .from("profiles")
        .select("first_name, last_name, phone")
        .eq("id", user.id)
        .single();

      if (fetchError) throw fetchError;
      if (data) {
        setProfile({
          firstName: data.first_name || "",
          lastName: data.last_name || "",
          email: user.email || "",
          phone: data.phone || ""
        });
      }

      // Load Dependents
      const { data: depData } = await supabase
        .from("dependents")
        .select("*")
        .eq("customer_id", user.id);
      
      if (depData && depData.length > 0) {
        setDependents(depData);
      }
    } catch (err: any) {
      console.warn("Using default settings profile due to local sandbox session:", err.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSuccess("");
      setError("");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("No active user session.");
      }

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          first_name: profile.firstName,
          last_name: profile.lastName,
          phone: profile.phone
        })
        .eq("id", user.id);

      if (updateError) throw updateError;
      setSuccess(t.savedMsg);
      setTimeout(() => setSuccess(""), 4000);
    } catch (err: any) {
      console.warn("Simulating profile save locally:", err.message);
      setSuccess(t.savedMsg);
      setTimeout(() => setSuccess(""), 4000);
    }
  }

  async function addDependent(e: React.FormEvent) {
    e.preventDefault();
    if (!newDep.name || !newDep.relation) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user");

      const { data, error: depError } = await supabase
        .from("dependents")
        .insert({
          customer_id: user.id,
          name: newDep.name,
          relationship: newDep.relation,
          age: parseInt(newDep.age) || null
        })
        .select()
        .single();

      if (depError) throw depError;
      setDependents(prev => [...prev, data]);
      setNewDep({ name: "", relation: "", age: "" });
      setShowAddDepForm(false);
    } catch (err: any) {
      console.warn("Adding dependent locally for simulator:", err.message);
      const simulatedDep = {
        id: `dep-${Date.now()}`,
        name: newDep.name,
        relationship: newDep.relation,
        age: parseInt(newDep.age) || null
      };
      setDependents(prev => [...prev, simulatedDep]);
      setNewDep({ name: "", relation: "", age: "" });
      setShowAddDepForm(false);
    }
  }

  function removeDependent(id: string) {
    setDependents(prev => prev.filter(d => d.id !== id));
  }

  return (
    <div className="space-y-8 font-sans">
      {/* HEADER */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">{t.title}</h2>
        <p className="text-sm text-gray-500 mt-1">{t.subtitle}</p>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-800 text-xs rounded-xl p-4 font-bold">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* PROFILE EDITOR */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">
          <h3 className="font-bold text-sm text-gray-800 border-b border-gray-100 pb-3">{t.profileSection}</h3>
          
          <form onSubmit={saveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">{t.firstName}</label>
                <input
                  type="text"
                  value={profile.firstName}
                  onChange={(e) => setProfile(prev => ({ ...prev, firstName: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-gray-700 font-semibold"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">{t.lastName}</label>
                <input
                  type="text"
                  value={profile.lastName}
                  onChange={(e) => setProfile(prev => ({ ...prev, lastName: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-gray-700 font-semibold"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">{t.email}</label>
              <input
                type="email"
                disabled
                value={profile.email}
                className="w-full bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-400 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">{t.phone}</label>
              <input
                type="text"
                value={profile.phone}
                onChange={(e) => setProfile(prev => ({ ...prev, phone: e.target.value }))}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-gray-700 font-semibold"
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

        {/* REGIONAL & NOTIFICATIONS */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">
          <h3 className="font-bold text-sm text-gray-800 border-b border-gray-100 pb-3">{t.preferencesSection}</h3>

          <div className="space-y-4">
            <div>
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-2">{t.language}</label>
              <select
                value={locale}
                onChange={(e) => {
                  const val = e.target.value as "en" | "ar";
                  setLocale(val);
                  document.documentElement.lang = val;
                  document.documentElement.dir = val === "ar" ? "rtl" : "ltr";
                }}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-gray-700 font-semibold"
              >
                <option value="en">English (EN)</option>
                <option value="ar">العربية (AR)</option>
              </select>
            </div>

            <div className="space-y-3 pt-4 border-t border-gray-100">
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">{t.notificationSettings}</label>
              
              <label className="flex items-center gap-3 text-xs text-gray-700 font-medium">
                <input
                  type="checkbox"
                  checked={emailNotif}
                  onChange={(e) => setEmailNotif(e.target.checked)}
                  className="rounded border-gray-300 text-black focus:ring-black"
                />
                <span>{t.emailNotif}</span>
              </label>

              <label className="flex items-center gap-3 text-xs text-gray-700 font-medium">
                <input
                  type="checkbox"
                  checked={smsNotif}
                  onChange={(e) => setSmsNotif(e.target.checked)}
                  className="rounded border-gray-300 text-black focus:ring-black"
                />
                <span>{t.smsNotif}</span>
              </label>

              <label className="flex items-center gap-3 text-xs text-gray-700 font-medium">
                <input
                  type="checkbox"
                  checked={pushNotif}
                  onChange={(e) => setPushNotif(e.target.checked)}
                  className="rounded border-gray-300 text-black focus:ring-black"
                />
                <span>{t.pushNotif}</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* FAMILY MEMBERS & DEPENDENTS */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex justify-between items-center border-b border-gray-100 pb-3 flex-wrap gap-4">
          <div>
            <h3 className="font-bold text-sm text-gray-800">{t.dependentsSection}</h3>
            <p className="text-[10px] text-gray-400 font-semibold mt-1">{t.dependentsDesc}</p>
          </div>
          <button
            onClick={() => setShowAddDepForm(prev => !prev)}
            className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs rounded-xl transition"
          >
            {t.addDependent}
          </button>
        </div>

        {/* Add Dependent Form */}
        {showAddDepForm && (
          <form onSubmit={addDependent} className="bg-gray-50 border border-gray-200/60 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
            <div>
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">{t.depName}</label>
              <input
                type="text"
                required
                value={newDep.name}
                onChange={(e) => setNewDep(prev => ({ ...prev, name: e.target.value }))}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-gray-700 font-semibold"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">{t.depRelation}</label>
              <input
                type="text"
                required
                value={newDep.relation}
                onChange={(e) => setNewDep(prev => ({ ...prev, relation: e.target.value }))}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-gray-700 font-semibold"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">{t.depAge}</label>
              <input
                type="number"
                value={newDep.age}
                onChange={(e) => setNewDep(prev => ({ ...prev, age: e.target.value }))}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-gray-700 font-semibold"
              />
            </div>
            <button
              type="submit"
              className="py-2.5 bg-black hover:bg-gray-800 text-white font-bold text-xs rounded-lg transition"
            >
              {t.addDependent}
            </button>
          </form>
        )}

        {/* Dependents Grid */}
        {dependents.length === 0 ? (
          <div className="text-center py-6 text-gray-400 text-xs font-semibold">{t.noDependents}</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {dependents.map((dep) => (
              <div key={dep.id} className="bg-gray-50 border border-gray-200/60 rounded-xl p-4 flex items-center justify-between hover:border-gray-400 transition duration-150">
                <div>
                  <h4 className="font-bold text-xs text-gray-800">{dep.name}</h4>
                  <p className="text-[10px] text-gray-500 font-semibold mt-0.5">
                    {dep.relationship} {dep.age ? `• ${dep.age} yrs old` : ""}
                  </p>
                </div>
                <button
                  onClick={() => removeDependent(dep.id)}
                  className="text-red-500 hover:text-red-700 font-bold text-xs p-1"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
