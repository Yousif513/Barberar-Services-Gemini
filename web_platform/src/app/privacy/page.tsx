"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";

const translations = {
  en: {
    backHome: "Back to Home",
    privacy: "Privacy Policy",
    title: "Privacy & Data Protection",
    subtitle: "How Primora handles your personal data and how to exercise your data rights.",
    section1Title: "1. Data Collection",
    section1Desc: "We collect customer contact information, appointment preferences, in-app messages, and service address details. Card details are entered on Tap Payments' hosted page and are never received or stored by Primora.",
    section2Title: "2. How We Use Your Data",
    section2Desc: "We process personal data to deliver the booking service, and for optional purposes such as WhatsApp messages and offers only where you gave consent. You can ask for access, correction, export or erasure of your data with the request form below.",
    section3Title: "3. Share & Disclosure",
    section3Desc: "Your location and contact number are shared only with the specialist you selected, once a booking is confirmed. We do not sell your personal records to third-party marketing companies.",
    dsrBadge: "Data request",
    dsrTitle: "Exercise Your Data Rights",
    dsrDesc: "Submit a request about your personal data. A due date 30 days after you submit is recorded on the request, and our team reviews it.",
    reqTypeLabel: "Request Type",
    reqAccess: "Access to my personal records",
    reqRectify: "Correct or update my information",
    reqErase: "Erase my data",
    reqExport: "Export my data",
    detailsLabel: "Request Details & Context",
    detailsPlaceholder: "Describe your request or specify records you wish to access or update...",
    submitBtn: "Submit Request",
    submittingBtn: "Submitting...",
    loginPrompt: "Please sign in to your Primora account before submitting a data request.",
    loginBtn: "Sign In to Submit",
    dsrSuccess: "Your request was recorded. Due date:",
    dsrExisting: "You already have an open request of this kind. Its due date is",
    dsrReference: "Reference:",
    dsrFailed: "The request could not be recorded:",
    contact: "For questions about your personal data, use the request form above or write to",
    footerText: "Built for Riyadh, Saudi Arabia. All rights reserved."
  },
  ar: {
    backHome: "العودة للرئيسية",
    privacy: "سياسة الخصوصية",
    title: "الخصوصية وحماية البيانات",
    subtitle: "كيف تتعامل بريمورا مع بياناتك الشخصية وكيف تمارس حقوقك.",
    section1Title: "1. جمع البيانات",
    section1Desc: "نجمع معلومات الاتصال وتفضيلات المواعيد والرسائل داخل المنصة وتفاصيل عنوان تقديم الخدمة. تُدخل بيانات البطاقة في صفحة Tap Payments المستضافة ولا تستلمها بريمورا ولا تخزنها.",
    section2Title: "2. كيف نستخدم بياناتك",
    section2Desc: "نعالج بياناتك الشخصية لتقديم خدمة الحجز، ولأغراض اختيارية مثل رسائل واتساب والعروض فقط عند موافقتك. يمكنك طلب الاطلاع على بياناتك أو تصحيحها أو تصديرها أو محوها عبر نموذج الطلب أدناه.",
    section3Title: "3. المشاركة والإفصاح",
    section3Desc: "تُشارَك بيانات موقعك ورقم جوالك مع الأخصائي الذي اخترته فقط بعد تأكيد الحجز. نحن لا نبيع سجلاتك الشخصية لشركات التسويق الخارجية.",
    dsrBadge: "طلب بيانات",
    dsrTitle: "ممارسة حقوقك في بياناتك",
    dsrDesc: "قدّم طلباً بخصوص بياناتك الشخصية. يُسجَّل على الطلب موعد استحقاق بعد 30 يوماً من تقديمه، ويراجعه فريقنا.",
    reqTypeLabel: "نوع الطلب",
    reqAccess: "الاطلاع على بياناتي الشخصية",
    reqRectify: "تصحيح بياناتي أو تحديثها",
    reqErase: "محو بياناتي",
    reqExport: "تصدير بياناتي",
    detailsLabel: "تفاصيل ومبررات الطلب",
    detailsPlaceholder: "اذكر تفاصيل طلبك أو السجلات المحددة المطلوب الاطلاع عليها أو معالجتها...",
    submitBtn: "إرسال الطلب",
    submittingBtn: "جاري الإرسال...",
    loginPrompt: "يرجى تسجيل الدخول بحسابك في بريمورا لتقديم طلب بخصوص بياناتك.",
    loginBtn: "تسجيل الدخول للتقديم",
    dsrSuccess: "تم تسجيل طلبك. موعد الاستحقاق:",
    dsrExisting: "لديك طلب مفتوح من هذا النوع بالفعل. موعد استحقاقه",
    dsrReference: "المرجع:",
    dsrFailed: "تعذر تسجيل الطلب:",
    contact: "للاستفسار عن بياناتك الشخصية استخدم نموذج الطلب أعلاه أو راسلنا على",
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
  const [user, setUser] = useState<{ id: string } | null>(null);
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
      // The table refuses direct inserts: submit_data_request sets the owner, the status and the 30-day due date (Riyadh date)
      // on the server, and returns the request that is already open when the same kind was submitted before.
      const { data, error } = await supabase.rpc("submit_data_request", {
        p_request_type: requestType,
        p_details: details.trim() || null,
      });

      if (error) throw error;

      const result = data as { created?: boolean; id?: string; due_date?: string } | null;
      if (!result?.id) throw new Error(t.dsrFailed);
      const due = result.due_date
        ? new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-GB", { dateStyle: "long", timeZone: "Asia/Riyadh" }).format(new Date(`${result.due_date}T12:00:00+03:00`))
        : "";
      setSubmissionSuccess(`${result.created === false ? t.dsrExisting : t.dsrSuccess} ${due}. ${t.dsrReference} ${result.id}`);
      setDetails("");
    } catch (err: unknown) {
      setSubmissionError(`${t.dsrFailed} ${errorMessage(err)}`);
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
            <span className="text-[10px] font-black uppercase tracking-wider text-[#A57C32]">{t.dsrBadge}</span>
            <h3 className="text-lg font-serif font-bold text-stone-900 mt-1">{t.dsrTitle}</h3>
            <p className="text-xs text-stone-600 leading-relaxed mt-1">{t.dsrDesc}</p>
          </div>

          {submissionSuccess && (
            <div role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800">
              {submissionSuccess}
            </div>
          )}

          {submissionError && (
            <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-xs font-semibold text-red-800">
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
                <span id="dsr-type-label" className="block text-[11px] font-bold text-stone-700 uppercase tracking-wider mb-2">
                  {t.reqTypeLabel}
                </span>
                <div role="group" aria-labelledby="dsr-type-label" className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {[
                    ["access", t.reqAccess],
                    ["rectification", t.reqRectify],
                    ["erasure", t.reqErase],
                    ["export", t.reqExport],
                  ].map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      aria-pressed={requestType === val}
                      onClick={() => setRequestType(val as typeof requestType)}
                      className={`rounded-xl border px-3.5 py-2.5 text-start font-medium transition focus-visible:outline-2 focus-visible:outline-[#A57C32] ${
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
                <label htmlFor="dsr-details" className="block text-[11px] font-bold text-stone-700 uppercase tracking-wider mb-2">
                  {t.detailsLabel}
                </label>
                <textarea
                  id="dsr-details"
                  rows={3}
                  maxLength={2000}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder={t.detailsPlaceholder}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs outline-none focus:border-[#A57C32] focus:bg-white focus-visible:outline-2 focus-visible:outline-[#A57C32] text-stone-900"
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
          {t.contact} <span dir="ltr" className="font-bold text-stone-900">privacy@primora.com</span>.
        </div>

      </main>

      {/* Footer */}
      <footer className="bg-stone-100 border-t border-stone-200 py-6 text-center text-xs text-stone-500 font-medium">
        <p>© {new Date().getFullYear()} PRIMORA. {t.footerText}</p>
      </footer>

    </div>
  );
}
