"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { errorMessage } from "@/lib/error-message";
import { useOperationsLocale } from "@/components/operations-ui";

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
    whatsappConsent: "WhatsApp appointment reminders & booking updates",
    marketingConsent: "Promotional beauty offers and exclusive discounts",
    photosConsent: "Before & after styling photos in provider portfolio",
    pdplConsents: "Saudi PDPL Consents",
    consentGranted: "Consent recorded.",
    consentWithdrawn: "Consent withdrawn.",
    consentFailed: "Your consent choice was not saved and has been reverted:",
    consentsLoadFailed: "Your saved consent choices could not be loaded, so they cannot be changed right now:",
    consentsLoading: "Loading your consent choices...",
    phoneVerified: "Verified",
    phoneUnverified: "Unverified",
    dataRightsTitle: "Saudi PDPL Data Subject Rights",
    dataRightsDesc: "Submit an official statutory request to access, rectify, erase, or export your personal records within 30 days.",
    dataRightsBtn: "Exercise Data Rights",
    advancedSection: "Advanced & Family Profiles",
    dependentsCardTitle: "Dependents & Pets Manager",
    dependentsCardDesc: "Add and manage profiles for family members, patients, or pets to book services on their behalf.",
    dependentsCardBtn: "Manage Profiles",
    developerCardTitle: "Developer API Console",
    developerCardDesc: "Register sandbox applications, generate client access tokens, and configure Webhook subscriptions.",
    developerCardBtn: "Open Console"
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
    whatsappConsent: "تنبيهات وتذكير المواعيد عبر واتساب",
    marketingConsent: "استلام العروض الخاصة والتخفيضات الترويجية",
    photosConsent: "الموافقة على عرض صور النتائج في معرض أعمال المزود",
    pdplConsents: "الموافقات وفق نظام حماية البيانات الشخصية",
    consentGranted: "تم تسجيل الموافقة.",
    consentWithdrawn: "تم سحب الموافقة.",
    consentFailed: "لم يُحفظ اختيارك للموافقة وتمت إعادته إلى حالته السابقة:",
    consentsLoadFailed: "تعذر تحميل اختياراتك المحفوظة للموافقة، لذلك لا يمكن تغييرها الآن:",
    consentsLoading: "جارٍ تحميل اختيارات الموافقة...",
    phoneVerified: "موثق",
    phoneUnverified: "غير موثق",
    dataRightsTitle: "حقوق صاحب البيانات (نظام حماية البيانات الشخصية PDPL)",
    dataRightsDesc: "تقديم طلب نظامي للوصول إلى بياناتك الشخصية، تصحيحها، إتلافها، أو نقلها خلال مهلة 30 يوماً.",
    dataRightsBtn: "ممارسة حقوق البيانات",
    advancedSection: "الملفات العائلية والخدمات المتقدمة",
    dependentsCardTitle: "إدارة التابعين والأليفة",
    dependentsCardDesc: "إضافة وإدارة الملفات الشخصية لأفراد عائلتك أو الحيوانات الأليفة للحجز نيابة عنهم.",
    dependentsCardBtn: "إدارة الملفات الشخصية",
    developerCardTitle: "منصة المطورين (API)",
    developerCardDesc: "تسجيل تطبيقات الاختبار، إنشاء رموز الوصول (Tokens)، وإعداد اشتراكات الويب هوك (Webhooks).",
    developerCardBtn: "فتح منصة المطورين"
  }
};

export default function CustomerSettingsPage() {
  const locale = useOperationsLocale();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Profile Form States
  const [profile, setProfile] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    phoneVerified: false
  });

  // Consents states (G13). The toggles stay locked until the saved choices are read, so an unread state is never shown as "off".
  const [whatsappConsent, setWhatsappConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [photosConsent, setPhotosConsent] = useState(false);
  const [consentsReady, setConsentsReady] = useState(false);
  const [consentsError, setConsentsError] = useState("");
  const [consentBusy, setConsentBusy] = useState<string | null>(null);

  // Preference States
  const [emailNotif, setEmailNotif] = useState(true);
  const [smsNotif, setSmsNotif] = useState(true);
  const [pushNotif, setPushNotif] = useState(true);

  const t = translations[locale];

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
        .select("first_name, last_name, phone_number, phone_verified")
        .eq("id", user.id)
        .single();

      if (fetchError) throw fetchError;
      if (data) {
        setProfile({
          firstName: data.first_name || "",
          lastName: data.last_name || "",
          email: user.email || "",
          phone: data.phone_number || "",
          phoneVerified: !!data.phone_verified
        });
      }

      // Load Consents: a failed read locks the toggles instead of showing every purpose as withdrawn.
      const { data: consentsData, error: consentsReadError } = await supabase
        .from("consents")
        .select("purpose, status")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (consentsReadError) {
        setConsentsReady(false);
        setConsentsError(errorMessage(consentsReadError));
      } else {
        const latest = (purpose: string) => consentsData?.find(c => c.purpose === purpose);
        setWhatsappConsent(latest("whatsapp")?.status === "granted");
        setMarketingConsent(latest("marketing")?.status === "granted");
        setPhotosConsent(latest("photos_portfolio")?.status === "granted");
        setConsentsError("");
        setConsentsReady(true);
      }
    } catch (err: any) {
      console.warn("Failed to load account settings:", err.message);
      setError(err?.message || "Failed to load your account settings.");
      // The consent toggles stay locked and say why, instead of waiting for a read that will not happen.
      setConsentsError((previous: string) => previous || errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const setConsentValue = (purpose: "whatsapp" | "marketing" | "photos_portfolio", value: boolean) => {
    if (purpose === "whatsapp") setWhatsappConsent(value);
    if (purpose === "marketing") setMarketingConsent(value);
    if (purpose === "photos_portfolio") setPhotosConsent(value);
  };

  // record_consent returns { error } instead of throwing, so the result is read before anything is reported: a refused
  // withdrawal must not look withdrawn (PDPL), so the toggle goes back and the reason is shown.
  const handleConsentToggle = async (purpose: "whatsapp" | "marketing" | "photos_portfolio", currentVal: boolean) => {
    if (consentBusy) return;
    const nextVal = !currentVal;
    setConsentBusy(purpose);
    setSuccess("");
    setError("");
    setConsentValue(purpose, nextVal);
    try {
      const { error: consentError } = await supabase.rpc("record_consent", {
        p_purpose: purpose,
        p_status: nextVal ? "granted" : "withdrawn",
        p_method: "settings_toggle",
      });
      if (consentError) throw consentError;
      setSuccess(nextVal ? t.consentGranted : t.consentWithdrawn);
    } catch (e) {
      setConsentValue(purpose, currentVal);
      setError(`${t.consentFailed} ${errorMessage(e)}`);
    } finally {
      setConsentBusy(null);
    }
  };

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
          phone_number: profile.phone
        })
        .eq("id", user.id);

      if (updateError) throw updateError;
      setSuccess(t.savedMsg);
      setTimeout(() => setSuccess(""), 4000);
    } catch (err: any) {
      console.warn("Failed to save profile settings:", err.message);
      setError(err.message || "Failed to update settings.");
    }
  }

  return (
    <div className="space-y-8 font-sans">
      {/* HEADER */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">{t.title}</h2>
        <p className="text-sm text-gray-500 mt-1">{t.subtitle}</p>
      </div>

      {success && (
        <div role="status" className="bg-green-50 border border-green-200 text-green-800 text-xs rounded-xl p-4 font-bold">
          {success}
        </div>
      )}

      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl p-4 font-bold">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* PROFILE EDITOR */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">
          <h3 className="font-bold text-sm text-gray-800 border-b border-gray-100 pb-3">{t.profileSection}</h3>
          
          <form onSubmit={saveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="settings-first-name" className="text-[10px] uppercase font-bold text-gray-400 block mb-1">{t.firstName}</label>
                <input
                  id="settings-first-name"
                  type="text"
                  value={profile.firstName}
                  onChange={(e) => setProfile(prev => ({ ...prev, firstName: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-gray-700 font-semibold"
                />
              </div>
              <div>
                <label htmlFor="settings-last-name" className="text-[10px] uppercase font-bold text-gray-400 block mb-1">{t.lastName}</label>
                <input
                  id="settings-last-name"
                  type="text"
                  value={profile.lastName}
                  onChange={(e) => setProfile(prev => ({ ...prev, lastName: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-gray-700 font-semibold"
                />
              </div>
            </div>

            <div>
              <label htmlFor="settings-email" className="text-[10px] uppercase font-bold text-gray-400 block mb-1">{t.email}</label>
              <input
                id="settings-email"
                type="email"
                disabled
                value={profile.email}
                className="w-full bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-400 cursor-not-allowed"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="settings-phone" className="text-[10px] uppercase font-bold text-gray-400 block">{t.phone}</label>
                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                  profile.phoneVerified ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                }`}>
                  {profile.phoneVerified ? t.phoneVerified : t.phoneUnverified}
                </span>
              </div>
              <input
                id="settings-phone"
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
              <label htmlFor="settings-language" className="text-[10px] uppercase font-bold text-gray-400 block mb-2">{t.language}</label>
              <select
                id="settings-language"
                value={locale}
                onChange={(e) => {
                  const val = e.target.value as "en" | "ar";
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

              <div className="pt-3 border-t border-gray-100 space-y-3">
                <span className="text-[10px] uppercase font-bold text-[#A57C32] block">{t.pdplConsents}</span>
                {!consentsReady && !consentsError && <p className="text-[11px] text-gray-500">{t.consentsLoading}</p>}
                {consentsError && <p role="alert" className="text-[11px] font-semibold text-red-700">{t.consentsLoadFailed} {consentsError}</p>}

                <label className="flex items-start gap-2.5 text-xs text-gray-700 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={whatsappConsent}
                    disabled={!consentsReady || consentBusy !== null}
                    onChange={() => handleConsentToggle("whatsapp", whatsappConsent)}
                    className="mt-0.5 rounded border-gray-300 text-[#A57C32] focus:ring-0"
                  />
                  <span>{t.whatsappConsent}</span>
                </label>

                <label className="flex items-start gap-2.5 text-xs text-gray-700 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={marketingConsent}
                    disabled={!consentsReady || consentBusy !== null}
                    onChange={() => handleConsentToggle("marketing", marketingConsent)}
                    className="mt-0.5 rounded border-gray-300 text-[#A57C32] focus:ring-0"
                  />
                  <span>{t.marketingConsent}</span>
                </label>

                <label className="flex items-start gap-2.5 text-xs text-gray-700 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={photosConsent}
                    disabled={!consentsReady || consentBusy !== null}
                    onChange={() => handleConsentToggle("photos_portfolio", photosConsent)}
                    className="mt-0.5 rounded border-gray-300 text-[#A57C32] focus:ring-0"
                  />
                  <span>{t.photosConsent}</span>
                </label>
              </div>

              <div className="pt-3 border-t border-gray-100">
                <Link
                  href="/privacy"
                  className="block text-center rounded-xl bg-stone-100 hover:bg-stone-200 p-2.5 text-[11px] font-bold text-stone-800 transition"
                >
                  {t.dataRightsBtn} →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ADVANCED & FAMILY PORTALS */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">
        <div>
          <h3 className="font-bold text-sm text-gray-800 border-b border-gray-100 pb-3 text-start">
            {t.advancedSection}
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* DEPENDENTS MANAGER CARD */}
          <div className="border border-stone-200 hover:border-[hsl(45,60%,55%)] rounded-xl p-5 bg-stone-50/50 hover:bg-stone-50/20 transition duration-300 flex flex-col justify-between">
            <div className="text-start">
              <h4 className="font-bold text-xs text-stone-900 tracking-wide uppercase">
                {t.dependentsCardTitle}
              </h4>
              <p className="text-[10px] text-stone-500 mt-2 font-normal leading-relaxed">
                {t.dependentsCardDesc}
              </p>
            </div>
            <div className="mt-6 pt-3 border-t border-stone-100 flex justify-end">
              <Link
                href="/customer/dependents"
                className="px-4 py-2 bg-stone-900 hover:bg-stone-850 text-white font-bold text-[10px] uppercase tracking-wider rounded-lg transition"
              >
                {t.dependentsCardBtn}
              </Link>
            </div>
          </div>

          {/* DEVELOPER API CONSOLE CARD */}
          <div className="border border-stone-200 hover:border-[hsl(45,60%,55%)] rounded-xl p-5 bg-stone-50/50 hover:bg-stone-50/20 transition duration-300 flex flex-col justify-between">
            <div className="text-start">
              <h4 className="font-bold text-xs text-stone-900 tracking-wide uppercase">
                {t.developerCardTitle}
              </h4>
              <p className="text-[10px] text-stone-500 mt-2 font-normal leading-relaxed">
                {t.developerCardDesc}
              </p>
            </div>
            <div className="mt-6 pt-3 border-t border-stone-100 flex justify-end">
              <Link
                href="/developer"
                className="px-4 py-2 bg-[hsl(45,60%,45%)] hover:bg-[hsl(45,60%,40%)] text-white font-bold text-[10px] uppercase tracking-wider rounded-lg transition"
              >
                {t.developerCardBtn}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
