"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";

const translations = {
  en: {
    title: "Help Center",
    subtitle: "Support channels, operational guides, and answers for platform administrators.",
    contactTitle: "Support Channels",
    whatsapp: "WhatsApp Business",
    whatsappDesc: "Priority line for operational incidents",
    email: "Email Support",
    emailDesc: "Response within 24 hours",
    docs: "Admin Guides",
    docsDesc: "Console manuals & runbooks",
    open: "Open",
    faqTitle: "Frequently Asked Questions",
    faqs: [
      { q: "How do I verify a new provider?", a: "Open Providers from the sidebar, review the trade license link on the provider row, then press the Verify action. Verified providers become visible in customer search immediately." },
      { q: "How are payment splits calculated?", a: "Each captured deposit is split automatically: the platform commission (per-provider percentage set on the provider record) goes to the platform ledger and the remainder to the provider. Review and release payouts from the Splits Ledger page." },
      { q: "How do I resolve a customer dispute?", a: "Open Disputes from the sidebar, review the case evidence and booking details, then apply a partial or full refund. Every arbitration action is written to the audit log." },
      { q: "How do I change platform commission for one provider?", a: "Open Commissions (or the provider's row in Providers) and set the override percentage. New bookings use the new rate; existing bookings keep the rate captured at booking time." },
      { q: "Why is a provider not appearing in search?", a: "Only verified providers with at least one active service and one active employee appear. Check verification status, then the provider's services and staff." }
    ]
  },
  ar: {
    title: "مركز المساعدة",
    subtitle: "قنوات الدعم، الأدلة التشغيلية، وإجابات مشرفي المنصة.",
    contactTitle: "قنوات الدعم",
    whatsapp: "واتساب الأعمال",
    whatsappDesc: "خط أولوية للحوادث التشغيلية",
    email: "الدعم عبر البريد",
    emailDesc: "الرد خلال ٢٤ ساعة",
    docs: "أدلة المشرف",
    docsDesc: "كتيبات لوحة التحكم وإجراءات التشغيل",
    open: "فتح",
    faqTitle: "الأسئلة الشائعة",
    faqs: [
      { q: "كيف أوثق مزوداً جديداً؟", a: "افتح «المزودون» من القائمة الجانبية، راجع رابط السجل التجاري في صف المزود، ثم اضغط زر التوثيق. يظهر المزود الموثق في بحث العملاء فوراً." },
      { q: "كيف تُحسب تقسيمات المدفوعات؟", a: "يُقسم كل عربون محصّل تلقائياً: عمولة المنصة (نسبة محددة لكل مزود) تذهب لدفتر المنصة والباقي للمزود. راجع واصرف المستحقات من صفحة دفتر التقسيمات." },
      { q: "كيف أحل نزاع عميل؟", a: "افتح «النزاعات» من القائمة، راجع أدلة الحالة وتفاصيل الحجز، ثم طبّق استرداداً جزئياً أو كاملاً. يُسجل كل إجراء تحكيم في سجل التدقيق." },
      { q: "كيف أغيّر عمولة المنصة لمزود واحد؟", a: "افتح «العمولات» (أو صف المزود في «المزودون») وحدد نسبة الاستثناء. تستخدم الحجوزات الجديدة النسبة الجديدة بينما تحتفظ الحجوزات القائمة بنسبتها وقت الحجز." },
      { q: "لماذا لا يظهر مزود في البحث؟", a: "يظهر فقط المزودون الموثقون الذين لديهم خدمة نشطة وموظف نشط على الأقل. تحقق من حالة التوثيق ثم من خدمات وموظفي المزود." }
    ]
  }
};

export default function AdminHelpPage() {
  const [lang, setLang] = useState<"en" | "ar">("ar");
  const [openFaq, setOpenFaq] = useState<number | null>(0);

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

  const t = translations[lang];
  const isRTL = lang === "ar";
  const flip = isRTL ? "flex-row-reverse" : "flex-row";
  const cardBase = "rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)] transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.035)] hover:border-[#D1AF47]/20";

  const channels = [
    {
      label: t.whatsapp, desc: t.whatsappDesc, href: "https://wa.me/966500000000",
      icon: <svg className="w-5 h-5 text-[#16A34A]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
    },
    {
      label: t.email, desc: t.emailDesc, href: "mailto:support@primora.sa",
      icon: <svg className="w-5 h-5 text-[#3B82F6]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
    },
    {
      label: t.docs, desc: t.docsDesc, href: "/developer",
      icon: <svg className="w-5 h-5 text-[#D1AF47]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
    }
  ];

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-6 ${isRTL ? "text-right" : "text-left"}`}>
      <div>
        <h2 className="text-2xl font-serif font-black text-gray-900 leading-tight">{t.title}</h2>
        <p className="text-xs text-gray-500 font-semibold mt-1">{t.subtitle}</p>
      </div>

      <div>
        <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#667085] mb-3">{t.contactTitle}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {channels.map((c) => (
            <Link key={c.label} href={c.href} className={`${cardBase} group flex items-center justify-between gap-3 ${flip}`}>
              <div className={`flex min-w-0 items-center gap-3 ${flip}`}>
                <div className="w-10 h-10 rounded-xl bg-gray-50 border border-[#ECECEC] flex items-center justify-center flex-shrink-0 group-hover:bg-white transition">
                  {c.icon}
                </div>
                <div className="min-w-0">
                  <strong className="block truncate text-sm font-black text-gray-900">{c.label}</strong>
                  <span className="block truncate text-[10px] font-semibold text-[#667085]">{c.desc}</span>
                </div>
              </div>
              <span className="flex-shrink-0 text-[10px] font-black text-[#D1AF47] group-hover:underline">{t.open}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className={cardBase}>
        <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#667085] mb-3">{t.faqTitle}</h3>
        <div className="divide-y divide-[#F5F5F5]">
          {t.faqs.map((f, i) => (
            <div key={f.q}>
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className={`flex w-full items-center justify-between gap-3 py-3.5 text-start ${flip}`}
              >
                <span className="text-sm font-bold text-gray-900">{f.q}</span>
                <svg className={`h-4 w-4 flex-shrink-0 text-[#D1AF47] transition-transform ${openFaq === i ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {openFaq === i && <p className="pb-4 text-xs font-semibold leading-6 text-[#667085]">{f.a}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
