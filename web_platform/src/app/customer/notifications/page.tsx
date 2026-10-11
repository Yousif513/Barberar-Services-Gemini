"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const translations = {
  en: {
    title: "Notifications",
    subtitle: "Stay updated on your upcoming appointments, service changes, and offers.",
    all: "All Alerts",
    unread: "Unread Only",
    markAllRead: "Mark all as read",
    noNotifications: "Your inbox is clear. No new notifications.",
    delete: "Remove",
    markRead: "Mark Read",
    markUnread: "Mark Unread",
    typeBooking: "Booking Alert",
    typePromo: "Offer / Promo",
    typeSystem: "System Update",
    typeChat: "New Message"
  },
  ar: {
    title: "التنبيهات",
    subtitle: "تابع مواعيدك القادمة، وتحديثات الخدمات، والعروض الترويجية الحصرية.",
    all: "جميع التنبيهات",
    unread: "غير المقروءة فقط",
    markAllRead: "تحديد الكل كمقروء",
    noNotifications: "صندوق الوارد فارغ. لا توجد تنبيهات جديدة.",
    delete: "إزالة",
    markRead: "تحديد كمقروء",
    markUnread: "تحديد كغير مقروء",
    typeBooking: "حالة الحجز",
    typePromo: "عروض ترويجية",
    typeSystem: "تحديث النظام",
    typeChat: "رسالة جديدة"
  }
};

export default function CustomerNotificationsPage() {
  const [locale, setLocale] = useState<"en" | "ar">("ar");
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [error, setError] = useState("");

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
    loadNotifications();
  }, []);

  async function loadNotifications() {
    try {
      setLoading(true);
      setError("");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error: notifyError } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (notifyError) throw notifyError;
      const mapped = (data || []).map((n: any) => ({
        id: n.id,
        type: n.type || "booking",
        title_en: n.title_en,
        title_ar: n.title_ar,
        content_en: n.body_en || n.content_en,
        content_ar: n.body_ar || n.content_ar,
        is_read: n.read ?? n.is_read ?? false,
        created_at: n.created_at
      }));
      setNotifications(mapped);
    } catch (err: any) {
      console.warn("Failed to load notifications:", err.message);
      setError(err?.message || "Failed to sync notifications from server.");
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }

  const markAllAsRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("notifications")
          .update({ read: true })
          .eq("user_id", user.id);
      }
    } catch (e) {
      console.warn("Failed to mark all as read:", e);
    }
  };

  const toggleReadStatus = async (id: string) => {
    const target = notifications.find(n => n.id === id);
    if (!target) return;
    const newStatus = !target.is_read;
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: newStatus } : n));
    try {
      await supabase
        .from("notifications")
        .update({ read: newStatus })
        .eq("id", id);
    } catch (e) {
      console.warn("Failed to update notification status:", e);
    }
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const filtered = notifications.filter(n => {
    if (filter === "unread") return !n.is_read;
    return true;
  });

  const getIcon = (type: string) => {
    switch (type) {
      case "booking":
        return (
          <div className="w-10 h-10 rounded-full bg-green-50 border border-green-200 flex items-center justify-center text-green-700 font-bold text-xs">
            B
          </div>
        );
      case "chat":
        return (
          <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700 font-bold text-xs">
            C
          </div>
        );
      case "promo":
        return (
          <div className="w-10 h-10 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 font-bold text-xs">
            P
          </div>
        );
      default:
        return (
          <div className="w-10 h-10 rounded-full bg-stone-50 border border-stone-200 flex items-center justify-center text-stone-700 font-bold text-xs">
            S
          </div>
        );
    }
  };

  const getTypeName = (type: string) => {
    switch (type) {
      case "booking": return t.typeBooking;
      case "chat": return t.typeChat;
      case "promo": return t.typePromo;
      default: return t.typeSystem;
    }
  };

  return (
    <div className="space-y-8 font-sans">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">{t.title}</h2>
          <p className="text-sm text-gray-500 mt-1">{t.subtitle}</p>
        </div>
        <button
          onClick={markAllAsRead}
          className="self-start sm:self-center px-4 py-2 border border-gray-200 bg-white hover:border-black text-xs font-bold rounded-xl transition"
        >
          {t.markAllRead}
        </button>
      </div>

      {error && (
        <div className="bg-stone-50 border border-stone-200 text-stone-700 text-xs rounded-xl p-4">
          Notice: {error}
        </div>
      )}

      {/* FILTER BUTTONS */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setFilter("all")}
          className={`pb-4 px-6 text-xs font-bold uppercase tracking-wider transition-all border-b-2 -mb-px ${
            filter === "all" ? "border-black text-black" : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          {t.all}
        </button>
        <button
          onClick={() => setFilter("unread")}
          className={`pb-4 px-6 text-xs font-bold uppercase tracking-wider transition-all border-b-2 -mb-px ${
            filter === "unread" ? "border-black text-black" : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          {t.unread}
        </button>
      </div>

      {/* LIST OF NOTIFICATIONS */}
      {loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Loading alerts...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center text-gray-400 shadow-sm">
          <p className="text-sm font-semibold">{t.noNotifications}</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100 overflow-hidden shadow-sm">
          {filtered.map((notif) => (
            <div
              key={notif.id}
              className={`p-6 flex items-start justify-between gap-4 transition hover:bg-gray-50/50 ${
                !notif.is_read ? "bg-[hsla(45,60%,55%,0.02)]" : ""
              }`}
            >
              <div className="flex gap-4 items-start">
                {getIcon(notif.type)}
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] uppercase font-bold text-gray-400 tracking-wider">
                      {getTypeName(notif.type)}
                    </span>
                    {!notif.is_read && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[hsl(45,60%,55%)] block" />
                    )}
                  </div>
                  <h4 className="font-bold text-xs text-gray-900">
                    {locale === "ar" ? notif.title_ar : notif.title_en}
                  </h4>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    {locale === "ar" ? notif.content_ar : notif.content_en}
                  </p>
                  <span className="text-[10px] text-gray-400 block font-semibold pt-1">
                    {new Date(notif.created_at).toLocaleTimeString(locale === "ar" ? "ar-SA" : "en-GB", { hour: '2-digit', minute: '2-digit', timeZone: "Asia/Riyadh" })} - {new Date(notif.created_at).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-GB", { day: 'numeric', month: 'short', timeZone: "Asia/Riyadh" })}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => toggleReadStatus(notif.id)}
                  className="px-3 py-1.5 border border-gray-250 bg-white text-gray-600 text-[10px] font-bold rounded-lg hover:border-black transition"
                >
                  {notif.is_read ? t.markUnread : t.markRead}
                </button>
                <button
                  onClick={() => removeNotification(notif.id)}
                  className="px-3 py-1.5 border border-red-200 bg-red-50 text-red-700 text-[10px] font-bold rounded-lg hover:bg-red-100 transition"
                >
                  {t.delete}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
