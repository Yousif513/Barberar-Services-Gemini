"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

const translations = {
  en: {
    promoText: "Book Premier Home Service & Salon Appointments in Riyadh",
    home: "Home",
    discover: "Discover",
    serviceBoard: "Service Board",
    becomeProvider: "Become a Provider",
    aboutUs: "About Us",
    login: "Log in",
    signup: "Sign up",
    boardHeader: "On-Demand Service Board",
    boardSubtitle: "Clients post bespoke personal care requests. Registered Riyadh partners submit custom splits bids.",
    postBtn: "+ Post Service Request",
    budget: "Budget Max",
    location: "Location",
    date: "Target Date",
    status: "Status",
    statusOpen: "OPEN FOR BIDS",
    statusClosed: "MATCHED & LOCKED",
    bidsCount: "Bids Submitted",
    noBids: "No bids received yet.",
    placeBidBtn: "Submit Business Proposal",
    bidPrice: "Proposal Price",
    bidNotes: "Offer Details & Credentials",
    cancel: "Cancel",
    submit: "Submit",
    postRequestTitle: "Post New Care Request",
    reqTitleLabel: "What service do you need?",
    reqDescLabel: "Describe your requirements (e.g., hair lengths, styling preferences, home access)",
    reqBudgetLabel: "Maximum Budget (SAR)",
    reqLocationLabel: "District in Riyadh",
    reqDateLabel: "Scheduled Date",
    successPost: "Your service request has been published to the Riyadh collective board.",
    noPosts: "No active service board requests found.",
    footerDesc: "Luxury Beauty, Grooming & Wellness Marketplace. Connecting premier Riyadh artists with selective clients.",
    footerDiscover: "Discover",
    footerPartners: "For Partners",
    footerLegal: "Legal",
    allRightsReserved: "All rights reserved. Built for Riyadh, Saudi Arabia."
  },
  ar: {
    promoText: "احجز أفضل خدمات التجميل والعناية المنزلية والصالونات بالرياض",
    home: "الرئيسية",
    discover: "اكتشف",
    serviceBoard: "لوحة الخدمات",
    becomeProvider: "انضم كمزود خدمة",
    aboutUs: "من نحن",
    login: "تسجيل الدخول",
    signup: "تسجيل جديد",
    boardHeader: "لوحة الطلبات الخدمية بالرياض",
    boardSubtitle: "ينشر العملاء طلبات العناية الشخصية المخصصة، ويقدم شركاء بريمورا عروض أسعار تنافسية بالضمان.",
    postBtn: "+ نشر طلب خدمة جديد",
    budget: "الميزانية القصوى",
    location: "الموقع",
    date: "التاريخ المستهدف",
    status: "الحالة",
    statusOpen: "مفتوح للعروض",
    statusClosed: "تمت المطابقة والتعاقد",
    bidsCount: "العروض المقدمة",
    noBids: "لا توجد عروض مقدمة حالياً.",
    placeBidBtn: "تقديم عرض سعر تجاري",
    bidPrice: "قيمة العرض المقترح",
    bidNotes: "تفاصيل العرض والمؤهلات",
    cancel: "إلغاء",
    submit: "إرسال",
    postRequestTitle: "نشر طلب عناية جديد",
    reqTitleLabel: "ما هي الخدمة التي تحتاجها؟",
    reqDescLabel: "وصف المتطلبات (مثال: أطوال الشعر، نوع التصفيف، سهولة الوصول للموقع)",
    reqBudgetLabel: "الميزانية القصوى (ريال)",
    reqLocationLabel: "الحي بالرياض",
    reqDateLabel: "تاريخ الموعد",
    successPost: "تم نشر طلب الخدمة الخاص بك بنجاح على لوحة الرياض المشتركة.",
    noPosts: "لا توجد طلبات نشطة حالياً في لوحة الخدمات.",
    footerDesc: "منصة الجمال الفاخرة، والعناية والعافية. نصل بين أفضل فناني الرياض والعملاء المميزين.",
    footerDiscover: "استكشف",
    footerPartners: "للشركاء",
    footerLegal: "قانوني",
    allRightsReserved: "جميع الحقوق محفوظة. صمم خصيصاً للرياض، المملكة العربية السعودية."
  }
};

interface Bid {
  id: string;
  providerName: string;
  price: number;
  notes: string;
  status: string;
}

interface Post {
  id: string;
  title: string;
  description: string;
  location: string;
  date: string;
  budget: number;
  status: "open" | "closed";
  bids: Bid[];
}

export default function ServiceBoardRootPage() {
  const [locale, setLocale] = useState<"en" | "ar">("en");
  const t = translations[locale];

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedPostForBid, setSelectedPostForBid] = useState<Post | null>(null);

  // New Request Form state
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newBudget, setNewBudget] = useState(250);
  const [newLoc, setNewLoc] = useState("Al-Malqa");
  const [newDate, setNewDate] = useState("2026-06-18");

  // New Bid Form state
  const [bidPriceVal, setBidPriceVal] = useState(220);
  const [bidNotesVal, setBidNotesVal] = useState("");

  const toggleLanguage = () => {
    setLocale((prev) => (prev === "en" ? "ar" : "en"));
  };

  useEffect(() => {
    const savedLang = localStorage.getItem("primora_lang") as "en" | "ar";
    if (savedLang === "en" || savedLang === "ar") {
      setLocale(savedLang);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("primora_lang", locale);
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = locale;
  }, [locale]);

  // Mock Service Board Posts
  const [posts, setPosts] = useState<Post[]>([
    {
      id: "sb-1",
      title: locale === "ar" ? "تسريحة شعر زفاف كاملة ومكياج سينمائي بالمنزل" : "Full Wedding Hair Styling & Glam Event Makeup in Home",
      description: locale === "ar" ? "أبحث عن خبير تجميل ومصفف شعر لـ 3 أشخاص في المنزل بحي العليا. الموعد يوم الخميس القادم. الميزانية ممتازة." : "Looking for a premium makeup artist and hair stylist for 3 people in my home in Olaya. Next Thursday. High quality equipment required.",
      location: locale === "ar" ? "العليا، الرياض" : "Olaya, Riyadh",
      date: "2026-06-18",
      budget: 1200,
      status: "open",
      bids: [
        {
          id: "bid-1",
          providerName: locale === "ar" ? "صالون سارة للتجميل والسبا" : "Sara Beauty Salon & Spa",
          price: 1100,
          notes: locale === "ar" ? "لدينا طاقم متخصص من 3 خبيرات معقمات. سنصل مع كامل المعدات والحقائب الفاخرة." : "We have a dedicated crew of 3 sterilized experts. We will arrive with premium grooming trunks.",
          status: "pending"
        }
      ]
    },
    {
      id: "sb-2",
      title: locale === "ar" ? "حلاقة لحية فاخرة بالمنشفة الساخنة وتصفيف للعريس" : "Luxury Hot Towel Beard Grooming & Groom Styling",
      description: locale === "ar" ? "أحتاج أخصائي حلاقة مستقل لزيارة فندق في الملقا لتهيئة العريس ووالده قبل الحفل. الدفع بالضمان." : "Need an independent master barber to visit a hotel room in Al-Malqa to groom the groom and his father. Payments via escrow.",
      location: locale === "ar" ? "الملقا، الرياض" : "Al-Malqa, Riyadh",
      date: "2026-06-16",
      budget: 350,
      status: "open",
      bids: []
    }
  ]);

  const handleCreateRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDesc.trim()) return;

    const newPost: Post = {
      id: `sb-${Date.now()}`,
      title: newTitle,
      description: newDesc,
      location: newLoc + (locale === "ar" ? "، الرياض" : ", Riyadh"),
      date: newDate,
      budget: newBudget,
      status: "open",
      bids: []
    };

    setPosts(prev => [newPost, ...prev]);
    setShowAddModal(false);
    setNewTitle("");
    setNewDesc("");
  };

  const handleCreateBid = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPostForBid) return;

    const newBid: Bid = {
      id: `bid-${Date.now()}`,
      providerName: locale === "ar" ? "صالون إيليت الرجالي" : "Elite Grooming Lounge",
      price: bidPriceVal,
      notes: bidNotesVal || (locale === "ar" ? "تم تقديم العرض بناءً على تفضيلاتكم المعروضة." : "Proposal matches your requested criteria."),
      status: "pending"
    };

    setPosts(prev => prev.map(p => {
      if (p.id === selectedPostForBid.id) {
        return {
          ...p,
          bids: [...p.bids, newBid]
        };
      }
      return p;
    }));

    setSelectedPostForBid(null);
    setBidNotesVal("");
  };

  const isRTL = locale === "ar";

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 flex flex-col font-sans antialiased">
      {/* 1. TOP PROMO BAR */}
      <div className="w-full bg-stone-100 border-b border-stone-200 py-2.5 px-4 text-center text-[10px] sm:text-xs font-semibold tracking-wider text-stone-600 uppercase flex items-center justify-center gap-4">
        <span>{t.promoText}</span>
      </div>

      {/* 2. HEADER */}
      <header className="bg-white border-b border-stone-200/80 py-5 px-6 sm:px-12 flex items-center justify-between sticky top-0 z-50 shadow-sm backdrop-blur-md bg-white/95">
        <Link href="/" className="text-2xl font-serif font-black tracking-widest text-stone-900 hover:opacity-80 transition flex-shrink-0">
          PRIMORA
        </Link>
        <nav className="hidden lg:flex items-center justify-center gap-8 text-xs font-bold uppercase tracking-wider text-stone-500 flex-1 mx-8">
          <Link href="/" className="hover:text-stone-950 transition-colors">{t.home}</Link>
          <Link href="/store" className="hover:text-stone-950 transition-colors">{t.discover}</Link>
          <Link href="/service-board" className="text-stone-900 hover:text-stone-900 transition-colors">{t.serviceBoard}</Link>
          <Link href="/become-provider" className="hover:text-stone-950 transition-colors">{t.becomeProvider}</Link>
          <Link href="/about" className="hover:text-stone-950 transition-colors">{t.aboutUs}</Link>
        </nav>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
            <Link href="/store" className="text-stone-700 hover:text-stone-950 transition">
              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </Link>
            <Link href="/login" className="text-stone-700 hover:text-stone-950 transition">
              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </Link>
          </div>
          <div className="h-4 w-px bg-stone-200"></div>
          <button
            onClick={toggleLanguage}
            className="px-3.5 py-1.5 rounded-lg border border-stone-200 bg-stone-50 text-[10px] font-extrabold hover:border-black transition"
          >
            {locale === "en" ? "العربية" : "English"}
          </button>
        </div>
      </header>

      {/* 3. MAIN CONTENT */}
      <main className="max-w-4xl mx-auto py-12 px-6 sm:px-8 space-y-8 flex-grow w-full">
        {/* Title Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className={isRTL ? "text-right" : "text-left"}>
            <h1 className="text-3xl font-serif font-bold tracking-tight text-stone-950">{t.boardHeader}</h1>
            <p className="text-xs text-stone-500 mt-1">{t.boardSubtitle}</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-6 py-3 bg-stone-900 hover:bg-stone-850 text-stone-50 text-[10px] font-bold uppercase tracking-wider rounded-lg transition shadow-md whitespace-nowrap self-start sm:self-center"
          >
            {t.postBtn}
          </button>
        </div>

        {/* Requests List */}
        <div className="space-y-6">
          {posts.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-2xl p-16 text-center space-y-2">
              <p className="text-xs text-stone-400 font-semibold">{t.noPosts}</p>
            </div>
          ) : (
            posts.map(post => (
              <div key={post.id} className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm space-y-4">
                {/* Header */}
                <div className={`flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-stone-100 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                  <div className={`space-y-1 ${isRTL ? "text-right" : "text-left"}`}>
                    <h3 className="font-bold text-stone-950 text-base">{post.title}</h3>
                    <div className={`flex flex-wrap gap-3 text-[10px] text-stone-400 font-bold uppercase tracking-wider ${isRTL ? "justify-end" : "justify-start"}`}>
                      <span>{t.location}: <strong className="text-stone-700">{post.location}</strong></span>
                      <span>•</span>
                      <span>{t.date}: <strong className="text-stone-700">{post.date}</strong></span>
                    </div>
                  </div>

                  <span className={`px-2.5 py-1 rounded-md text-[8px] font-extrabold tracking-widest ${
                    post.status === "open"
                      ? "bg-green-50 text-green-700 border border-green-200"
                      : "bg-stone-100 text-stone-500 border border-stone-200"
                  }`}>
                    {post.status === "open" ? t.statusOpen : t.statusClosed}
                  </span>
                </div>

                {/* Description */}
                <p className={`text-xs text-stone-600 leading-relaxed font-light ${isRTL ? "text-right" : "text-left"}`}>
                  {post.description}
                </p>

                {/* Payout Metric Info */}
                <div className={`flex flex-wrap gap-6 p-4 bg-stone-50 rounded-xl border border-stone-200/80 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                  <div>
                    <span className="text-[8px] uppercase tracking-wider font-extrabold text-stone-400 block">{t.budget}</span>
                    <span className="text-sm font-black text-stone-950">{post.budget} SAR</span>
                  </div>
                  <div className="w-px bg-stone-200 self-stretch" />
                  <div>
                    <span className="text-[8px] uppercase tracking-wider font-extrabold text-stone-400 block">{t.bidsCount}</span>
                    <span className="text-sm font-black text-stone-950">{post.bids.length}</span>
                  </div>
                </div>

                {/* Bids Stream */}
                <div className="space-y-3 pt-2">
                  <h4 className={`text-xs font-bold text-stone-800 ${isRTL ? "text-right" : "text-left"}`}>{t.bidsCount}</h4>
                  {post.bids.length === 0 ? (
                    <p className={`text-[10px] text-stone-400 italic ${isRTL ? "text-right" : "text-left"}`}>{t.noBids}</p>
                  ) : (
                    <div className="space-y-3">
                      {post.bids.map(bid => (
                        <div key={bid.id} className={`p-4 rounded-xl border border-stone-200 bg-stone-50/50 flex flex-col sm:flex-row justify-between gap-4 ${isRTL ? "sm:flex-row-reverse" : "sm:flex-row"}`}>
                          <div className={`space-y-1 flex-1 ${isRTL ? "text-right" : "text-left"}`}>
                            <div className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                              <span className="font-bold text-xs text-stone-900">{bid.providerName}</span>
                              <span className="bg-stone-900 text-stone-50 text-[8px] font-extrabold uppercase tracking-widest px-1.5 py-0.5 rounded">
                                Bidded
                              </span>
                            </div>
                            <p className="text-[10px] text-stone-500 font-light leading-relaxed">{bid.notes}</p>
                          </div>

                          <div className={`text-right flex sm:flex-col justify-between items-center sm:items-end ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                            <span className="text-[8px] uppercase tracking-wider font-bold text-stone-400 block sm:hidden">{t.bidPrice}:</span>
                            <span className="text-xs font-black text-stone-900">{bid.price} SAR</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                {post.status === "open" && (
                  <div className={`flex justify-end pt-2 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                    <button
                      onClick={() => setSelectedPostForBid(post)}
                      className="px-5 py-2 bg-stone-900 hover:bg-stone-850 text-stone-50 text-[10px] font-bold uppercase tracking-wider rounded-lg transition shadow-sm"
                    >
                      {t.placeBidBtn}
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </main>

      {/* NEW REQUEST FORM MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-stone-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateRequest} className="bg-white border border-stone-200 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <h3 className={`font-bold text-base text-stone-950 ${isRTL ? "text-right" : "text-left"}`}>{t.postRequestTitle}</h3>

            <div className="space-y-1">
              <label className={`block text-[10px] font-bold uppercase text-stone-400 ${isRTL ? "text-right" : "text-left"}`}>{t.reqTitleLabel}</label>
              <input
                type="text"
                required
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="e.g. Wedding glam makeup or Barber haircut combo"
                className={`w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-xs text-stone-800 outline-none focus:border-stone-950 ${isRTL ? "text-right" : "text-left"}`}
              />
            </div>

            <div className="space-y-1">
              <label className={`block text-[10px] font-bold uppercase text-stone-400 ${isRTL ? "text-right" : "text-left"}`}>{t.reqDescLabel}</label>
              <textarea
                required
                rows={4}
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="e.g. Length requirements, styling details..."
                className={`w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-xs text-stone-800 outline-none focus:border-stone-950 ${isRTL ? "text-right" : "text-left"}`}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className={`block text-[10px] font-bold uppercase text-stone-400 ${isRTL ? "text-right" : "text-left"}`}>{t.reqBudgetLabel}</label>
                <input
                  type="number"
                  required
                  value={newBudget}
                  onChange={e => setNewBudget(Number(e.target.value))}
                  className={`w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-xs text-stone-800 outline-none focus:border-stone-950 ${isRTL ? "text-right" : "text-left"}`}
                />
              </div>

              <div className="space-y-1">
                <label className={`block text-[10px] font-bold uppercase text-stone-400 ${isRTL ? "text-right" : "text-left"}`}>{t.reqLocationLabel}</label>
                <select
                  value={newLoc}
                  onChange={e => setNewLoc(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-xs text-stone-800 outline-none focus:border-stone-950"
                >
                  <option value="Al-Malqa">Al-Malqa</option>
                  <option value="Olaya">Olaya</option>
                  <option value="Al-Yasmin">Al-Yasmin</option>
                  <option value="Al-Hamra">Al-Hamra</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className={`block text-[10px] font-bold uppercase text-stone-400 ${isRTL ? "text-right" : "text-left"}`}>{t.reqDateLabel}</label>
              <input
                type="date"
                required
                value={newDate}
                onChange={e => setNewDate(e.target.value)}
                className={`w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-xs text-stone-800 outline-none focus:border-stone-950 ${isRTL ? "text-right" : "text-left"}`}
              />
            </div>

            <div className={`flex justify-end gap-3 pt-2 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2.5 border border-stone-200 hover:bg-stone-50 rounded-lg text-[10px] font-bold uppercase tracking-wider text-stone-700"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 bg-stone-900 hover:bg-stone-850 text-stone-50 text-[10px] font-bold uppercase tracking-wider rounded-lg transition shadow-sm"
              >
                {t.submit}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SUBMIT BID FORM MODAL */}
      {selectedPostForBid && (
        <div className="fixed inset-0 bg-stone-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateBid} className="bg-white border border-stone-200 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <h3 className={`font-bold text-base text-stone-950 ${isRTL ? "text-right" : "text-left"}`}>{t.placeBidBtn}</h3>

            <div className="space-y-1">
              <label className={`block text-[10px] font-bold uppercase text-stone-400 ${isRTL ? "text-right" : "text-left"}`}>{t.bidPrice}</label>
              <input
                type="number"
                required
                value={bidPriceVal}
                onChange={e => setBidPriceVal(Number(e.target.value))}
                className={`w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-xs text-stone-800 outline-none focus:border-stone-950 ${isRTL ? "text-right" : "text-left"}`}
              />
            </div>

            <div className="space-y-1">
              <label className={`block text-[10px] font-bold uppercase text-stone-400 ${isRTL ? "text-right" : "text-left"}`}>{t.bidNotes}</label>
              <textarea
                required
                rows={4}
                value={bidNotesVal}
                onChange={e => setBidNotesVal(e.target.value)}
                placeholder="Details about your equipment, sterilization methods, travel, or experience..."
                className={`w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-xs text-stone-800 outline-none focus:border-stone-950 ${isRTL ? "text-right" : "text-left"}`}
              />
            </div>

            <div className={`flex justify-end gap-3 pt-2 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <button
                type="button"
                onClick={() => setSelectedPostForBid(null)}
                className="px-4 py-2.5 border border-stone-200 hover:bg-stone-50 rounded-lg text-[10px] font-bold uppercase tracking-wider text-stone-700"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 bg-stone-900 hover:bg-stone-850 text-stone-50 text-[10px] font-bold uppercase tracking-wider rounded-lg transition shadow-sm"
              >
                {t.submit}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 4. FOOTER */}
      <footer className="bg-stone-950 text-stone-400 py-12 px-6 sm:px-12 border-t border-stone-900 mt-auto">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          <div className="space-y-4">
            <h4 className="text-white font-serif font-black tracking-widest text-lg">PRIMORA</h4>
            <p className="text-xs text-stone-500 font-light leading-relaxed">
              {t.footerDesc}
            </p>
          </div>
          <div>
            <h5 className="text-white text-xs uppercase tracking-widest font-extrabold mb-4">{t.footerDiscover}</h5>
            <ul className="space-y-2 text-xs">
              <li><Link href="/categories/barber" className="hover:text-white transition">{locale === "ar" ? "قص الشعر والحلاقة" : "Haircuts & Barbering"}</Link></li>
              <li><Link href="/categories/hair" className="hover:text-white transition">{locale === "ar" ? "تصفيف وتلوين الشعر" : "Hair Styling & Color"}</Link></li>
              <li><Link href="/categories/spa" className="hover:text-white transition">{locale === "ar" ? "غرف السبا والعافية" : "Wellness & Spa Rooms"}</Link></li>
              <li><Link href="/categories/makeup" className="hover:text-white transition">{locale === "ar" ? "المكياج ومستحضرات التجميل" : "Makeup & Cosmetics"}</Link></li>
            </ul>
          </div>
          <div>
            <h5 className="text-white text-xs uppercase tracking-widest font-extrabold mb-4">{t.footerPartners}</h5>
            <ul className="space-y-2 text-xs">
              <li><Link href="/become-provider" className="hover:text-white transition">{t.becomeProvider}</Link></li>
              <li><Link href="/provider/staff-management" className="hover:text-white transition">{locale === "ar" ? "إدارة شؤون الموظفين" : "Staff Management"}</Link></li>
              <li><Link href="/provider/pricing" className="hover:text-white transition">{locale === "ar" ? "التسعير المشترك" : "Split Ledger Pricing"}</Link></li>
            </ul>
          </div>
          <div>
            <h5 className="text-white text-xs uppercase tracking-widest font-extrabold mb-4">{t.footerLegal}</h5>
            <ul className="space-y-2 text-xs">
              <li><Link href="/privacy" className="hover:text-white transition">{locale === "ar" ? "سياسة الخصوصية" : "Privacy Policy"}</Link></li>
              <li><Link href="/terms" className="hover:text-white transition">{locale === "ar" ? "شروط الخدمة" : "Terms of Service"}</Link></li>
              <li><Link href="/security" className="hover:text-white transition">{locale === "ar" ? "هيئة الزكاة والمدفوعات" : "ZATCA & Payments"}</Link></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto pt-8 border-t border-stone-900 text-center text-xs text-stone-600 font-medium">
          <p>© {new Date().getFullYear()} PRIMORA. {t.allRightsReserved}</p>
        </div>
      </footer>
    </div>
  );
}
