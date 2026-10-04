"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

const translations = {
  en: {
    backHome: "Back to Home",
    privacy: "Privacy Policy",
    title: "Privacy & Data Protection",
    subtitle: "Commitment to Saudi Personal Data Protection Law (PDPL) principles",
    section1Title: "1. Data Collection",
    section1Desc: "We collect customer contact information, appointment preferences, in-app messages, and service address details. Card details are entered on Tap Payments' hosted page and are never received or stored by Primora.",
    section2Title: "2. Personal Data Protection Principles",
    section2Desc: "Primora is committed to data protection principles under the Saudi PDPL. We process personal data transparently based on user consent and legitimate service delivery needs. Users may contact our team to exercise data subject rights including access, correction, or deletion requests.",
    section3Title: "3. Share & Disclosure",
    section3Desc: "Client location and contact numbers are only shared with the selected service specialist once a booking is confirmed, and are protected through secure platform access. We never sell or distribute your personal records to third-party marketing companies.",
    dsrTitle: "Exercise Your PDPL Data Rights",
    dsrDesc: "Submit a statutory Data Subject Request. In accordance with the Saudi PDPL, our team fulfills verified requests within a 30-day statutory deadline.",
    reqTypeLabel: "Request Type",
    reqAccess: "Access to Personal Records (حق الوصول)",
    reqRectify: "Rectify / Update Information (حق التصحيح)",
    reqErase: "Erasure / Destruction of Data (حق الإتلاف / المحو)",
    reqExport: "Data Portability / Export (حق نقل البيانات)",
    detailsLabel: "Request Details & Context",
    detailsPlaceholder: "Describe your request or specify records you wish to access or update...",
    submitBtn: "Submit Statutory Request",
    submittingBtn: "Submitting...",
    loginPrompt: "Please sign in to your Primora account before submitting a Data Subject Request.",
    loginBtn: "Sign In to Submit",
    dsrSuccess: "Your request has been officially recorded with a 30-day statutory due date. Reference: ",
    footerText: "Built for Riyadh, Saudi Arabia. All rights reserved."
  },
  ar: {
    backHome: "العودة للرئيسية",
    privacy: "سياسة الخصوصية",
    title: "الخصوصية وحماية البيانات",
    subtitle: "الالتزام بمبادئ نظام حماية البيانات الشخصية السعودي (PDPL)",
    section1Title: "1. جمع البيانات",
    section1Desc: "نجمع معلومات الاتصال وتفضيلات المواعيد والرسائل داخل المنصة وتفاصيل عنوان تقديم الخدمة. تُدخل بيانات البطاقة في صفحة Tap Payments المستضافة ولا تستلمها بريمورا ولا تخزنها.",
    section2Title: "2. مبادئ حماية البيانات الشخصية",
    section2Desc: "تلتزم بريمورا بتطبيق مبادئ حماية البيانات الشخصية وفقاً للأنظمة المعمول بها في المملكة. تتم معالجة بياناتك بشفافية لتقديم خدمات المنصة وبناءً على موافقتك. يمكنك التواصل مع فريقنا لممارسة حقوق صاحب البيانات بما في ذلك طلب الوصول أو التصحيح أو الحذف.",
    section3Title: "3. المشاركة والإفصاح",
    section3Desc: "يتم مشاركة موقع العميل وبيانات الاتصال فقط مع الأخصائي المختار بعد تأكيد الحجز وحمايتها عبر قنوات وصول آمنة. نحن لا نبيع أو نشارك سجلاتك الشخصية لشركات التسويق الخارجية.",
    dsrTitle: "ممارسة حقوق صاحب البيانات (نظام PDPL)",
    dsrDesc: "يمكنك تقديم طلب رسمي لممارسة حقوقك النظامية. تلتزم المنصة بالاستجابة للطلبات المعتمدة خلال المهلة النظامية المحددة بـ 30 يوماً.",
    reqTypeLabel: "نوع الطلب",
    reqAccess: "حق الوصول والاطلاع على البيانات الشخصية",
    reqRectify: "حق تصحيح وتحديث البيانات",
    reqErase: "حق الإتلاف / محو البيانات الشخصية",
    reqExport: "حق نقل البيانات الشخصية (Portability)",
    detailsLabel: "تفاصيل ومبررات الطلب",
    detailsPlaceholder: "اذكر تفاصيل طلبك أو السجلات المحددة المطلوب الاطلاع عليها أو معالجتها...",
    submitBtn: "إرسال الطلب النظامي",
    submittingBtn: "جاري الإرسال...",
    loginPrompt: "يرجى تسجيل الدخول بحسابك في بريمورا لتقديم طلب ممارسة حقوق صاحب البيانات.",
    loginBtn: "تسجيل الدخول للتقديم",
    dsrSuccess: "تم تسجيل طلبك رسمياً وتعيين مهلة الرد النظامية (30 يوماً). رقم الطلب: ",
    footerText: "صمم خصيصاً للرياض، المملكة العربية السعودية. جميع الحقوق محفوظة."
  }
};

export default function PrivacyPage() {
  const [locale, setLocale] = useState<"en" | "ar">("ar");
  const [requestType, setRequestType] = useState<"access" | "rectification" | "erasure" | "export">("access");
  const [details, setDetails] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState("");
  const [submissionError, setSubmissionError] = useState("");
  const [user, setUser] = useState<any>(null);
  const t = translations[locale];

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
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user || null);
    });
  }, []);

  const handleDsrSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setSubmissionError(t.loginPrompt);
      return;
    }
    setIsSubmitting(true);
    setSubmissionSuccess("");
    setSubmissionError("");

    try {
      const { data, error } = await supabase
        .from("data_subject_requests")
        .insert({
          user_id: user.id,
          request_type: requestType,
          details: details.trim() || null,
          status: "pending"
        })
        .select("id")
        .single();

      if (error) throw error;

      setSubmissionSuccess(`${t.dsrSuccess} ${data.id}`);
      setDetails("");
    } catch (err: unknown) {
      setSubmissionError(err instanceof Error ? err.message : "Failed to record request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      className="min-h-screen bg-stone-50 text-stone-900 font-sans antialiased flex flex-col justify-between"
      dir={locale === "ar" ? "rtl" : "ltr"}
    >
      
      {/* Mini Header */}
      <header className="bg-white border-b border-stone-200/80 py-5 px-6 sm:px-12 flex items-center justify-between sticky top-0 z-50">
        <Link href="/" className="text-xl font-serif font-black tracking-widest text-stone-900">
          PRIMORA
        </Link>
        <Link href="/" className="text-xs font-bold uppercase tracking-wider text-stone-500 hover:text-stone-950 transition">
          {t.backHome}
        </Link>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto py-16 px-6 sm:px-8 space-y-12 flex-1 w-full">
        
        {/* Title Section */}
        <div className="space-y-4">
          <span className="text-[10px] tracking-widest uppercase font-extrabold text-[#A57C32]">{t.privacy}</span>
          <h1 className="text-3xl sm:text-4xl font-serif text-stone-950 tracking-tight">{t.title}</h1>
          <p className="text-xs sm:text-sm text-stone-500 leading-relaxed font-light">
            {t.subtitle}
          </p>
        </div>

        <hr className="border-stone-200" />

        {/* Sections */}
        <div className="space-y-8">
          <div className="space-y-3">
            <h2 className="text-base font-bold text-stone-950 uppercase tracking-wide">{t.section1Title}</h2>
            <p className="text-xs sm:text-sm text-stone-600 leading-relaxed font-light">{t.section1Desc}</p>
          </div>

          <div className="space-y-3">
            <h2 className="text-base font-bold text-stone-950 uppercase tracking-wide">{t.section2Title}</h2>
            <p className="text-xs sm:text-sm text-stone-600 leading-relaxed font-light">{t.section2Desc}</p>
          </div>

          <div className="space-y-3">
            <h2 className="text-base font-bold text-stone-950 uppercase tracking-wide">{t.section3Title}</h2>
            <p className="text-xs sm:text-sm text-stone-600 leading-relaxed font-light">{t.section3Desc}</p>
          </div>
        </div>

        {/* DSR Interactive Form (G13) */}
        <div className="rounded-2xl border border-[#A57C32]/30 bg-white p-6 sm:p-8 shadow-sm space-y-6">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-[#A57C32]">Saudi PDPL Compliance</span>
            <h3 className="text-lg font-serif font-bold text-stone-900 mt-1">{t.dsrTitle}</h3>
            <p className="text-xs text-stone-600 leading-relaxed mt-1">{t.dsrDesc}</p>
          </div>

          {submissionSuccess && (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800">
              {submissionSuccess}
            </div>
          )}

          {submissionError && (
            <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-xs font-semibold text-red-800">
              {submissionError}
            </div>
          )}

          {!user ? (
            <div className="rounded-xl bg-stone-100 p-4 text-center space-y-3">
              <p className="text-xs text-stone-600 font-medium">{t.loginPrompt}</p>
              <Link
                href="/login?returnUrl=/privacy"
                className="inline-block rounded-xl bg-stone-900 px-5 py-2.5 text-xs font-bold text-[#D1AF47] shadow hover:bg-stone-800 transition"
              >
                {t.loginBtn}
              </Link>
            </div>
          ) : (
            <form onSubmit={handleDsrSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-stone-700 uppercase tracking-wider mb-2">
                  {t.reqTypeLabel}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {[
                    ["access", t.reqAccess],
                    ["rectification", t.reqRectify],
                    ["erasure", t.reqErase],
                    ["export", t.reqExport],
                  ].map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setRequestType(val as any)}
                      className={`rounded-xl border px-3.5 py-2.5 text-right font-medium transition ${
                        requestType === val
                          ? "border-[#A57C32] bg-[#A57C32]/10 text-stone-900 font-bold"
                          : "border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-700 uppercase tracking-wider mb-2">
                  {t.detailsLabel}
                </label>
                <textarea
                  rows={3}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder={t.detailsPlaceholder}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs outline-none focus:border-[#A57C32] focus:bg-white text-stone-900"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-xl bg-stone-900 py-3 text-xs font-black uppercase tracking-wider text-[#D1AF47] shadow transition hover:bg-stone-800 disabled:opacity-50"
              >
                {isSubmitting ? t.submittingBtn : t.submitBtn}
              </button>
            </form>
          )}
        </div>

        {/* Contact DPO Callout */}
        <div className="bg-stone-100 border border-stone-200 p-6 rounded-2xl text-xs text-stone-600 font-light leading-relaxed">
          If you have questions regarding your personal logs or wish to speak with our compliance team, please contact our Riyadh Data Protection Officer at <span className="font-bold text-stone-900">privacy@primora.com</span>.
        </div>

      </main>

      {/* Footer */}
      <footer className="bg-stone-100 border-t border-stone-200 py-6 text-center text-xs text-stone-500 font-medium">
        <p>© {new Date().getFullYear()} PRIMORA. {t.footerText}</p>
      </footer>

    </div>
  );
}
