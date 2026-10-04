"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

interface Conversation {
  id: string;
  name: string;
  lastMessage: string;
  lastAt: string | null;
  unread: boolean;
}

interface Message {
  id: string;
  sender: "customer" | "provider" | "system";
  text: string;
  createdAt: string;
}

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("") || "?";

function useDocumentRtl() {
  const [isRTL, setIsRTL] = useState(false);
  useEffect(() => {
    setIsRTL(document.documentElement.dir === "rtl");
    const observer = new MutationObserver(() => setIsRTL(document.documentElement.dir === "rtl"));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["dir"] });
    return () => observer.disconnect();
  }, []);
  return isRTL;
}

const copy = {
  en: {
    conversations: "Conversations",
    loading: "Loading conversations...",
    loadFailed: "Could not load your messages",
    retry: "Try again",
    signIn: "Sign in to see your messages.",
    empty: "No conversations yet. Use \"Message\" on a shop's page to start one.",
    select: "Select a conversation",
    newConversation: "New conversation",
    noMessages: "No messages yet. Say hello.",
    placeholder: (name: string) => `Type a message to ${name}...`,
    send: "Send",
    sending: "Sending...",
    sendFailed: "Message not sent",
    bookings: "My bookings",
  },
  ar: {
    conversations: "المحادثات",
    loading: "جارٍ تحميل المحادثات...",
    loadFailed: "تعذر تحميل رسائلك",
    retry: "إعادة المحاولة",
    signIn: "سجّل الدخول لعرض رسائلك.",
    empty: "لا توجد محادثات بعد. استخدم زر \"مراسلة\" في صفحة المركز لبدء محادثة.",
    select: "اختر محادثة",
    newConversation: "محادثة جديدة",
    noMessages: "لا توجد رسائل بعد. ابدأ بالتحية.",
    placeholder: (name: string) => `اكتب رسالة إلى ${name}...`,
    send: "إرسال",
    sending: "جارٍ الإرسال...",
    sendFailed: "لم يتم إرسال الرسالة",
    bookings: "حجوزاتي",
  },
};

export default function CustomerMessages() {
  const isRTL = useDocumentRtl();
  const t = copy[isRTL ? "ar" : "en"];
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [signedOut, setSignedOut] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const formatTime = (value: string) =>
    new Date(value).toLocaleString(isRTL ? "ar-SA" : "en-US", {
      hour: "2-digit", minute: "2-digit", day: "numeric", month: "short", timeZone: "Asia/Riyadh",
    });

  const loadThreads = useCallback(async () => {
    setLoadError("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setSignedOut(true);
        return;
      }
      setCurrentUserId(user.id);
      const { data, error } = await supabase
        .from("conversations")
        .select("id, subject, last_message_preview, last_message_at, unread_for_customer, providers!conversations_provider_id_fkey(business_name_en, business_name_ar)")
        .eq("customer_id", user.id)
        .order("last_message_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const next: Conversation[] = (data || []).map((item: any) => ({
        id: item.id,
        name: (isRTL ? item.providers?.business_name_ar : item.providers?.business_name_en)
          || item.providers?.business_name_en || item.providers?.business_name_ar || item.subject || "",
        lastMessage: item.last_message_preview || "",
        lastAt: item.last_message_at,
        unread: Boolean(item.unread_for_customer),
      }));
      setConversations(next);
      setSelectedId((current) => current && next.some((c) => c.id === current) ? current : next[0]?.id ?? null);
    } catch (err: unknown) {
      setConversations([]);
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [isRTL]);

  const loadMessages = useCallback(async (conversationId: string) => {
    const { data, error } = await supabase
      .from("messages")
      .select("id, sender_role, body, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) {
      setLoadError(error.message);
      return;
    }
    setMessages((data || []).map((m: any) => ({ id: m.id, sender: m.sender_role, text: m.body, createdAt: m.created_at })));
  }, []);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    loadMessages(selectedId);
    const conv = conversations.find((c) => c.id === selectedId);
    if (conv?.unread) {
      supabase.from("conversations").update({ unread_for_customer: false }).eq("id", selectedId).then(() => {
        setConversations((prev) => prev.map((c) => (c.id === selectedId ? { ...c, unread: false } : c)));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, loadMessages]);

  // Live updates: RLS limits the change feed to this customer's conversations.
  useEffect(() => {
    if (!currentUserId) return;
    const channel = supabase
      .channel("customer-messages-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload: any) => {
        loadThreads();
        if (selectedId && payload.new?.conversation_id === selectedId) loadMessages(selectedId);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, selectedId, loadThreads, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const selectedConv = conversations.find((c) => c.id === selectedId) || null;

  const handleSend = async () => {
    const body = inputMessage.trim();
    if (!body || !selectedConv || !currentUserId || sending) return;
    setSending(true);
    setSendError("");
    try {
      const { error } = await supabase.from("messages").insert({
        conversation_id: selectedConv.id,
        sender_id: currentUserId,
        sender_role: "customer",
        body,
      });
      if (error) throw error;
      setInputMessage("");
      await loadMessages(selectedConv.id);
      loadThreads();
    } catch (err: unknown) {
      // The typed text stays in the box so nothing is lost.
      setSendError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-sm text-stone-400">{t.loading}</div>;
  }
  if (signedOut) {
    return <div className="text-center py-12 text-sm text-stone-500">{t.signIn}</div>;
  }
  if (loadError && conversations.length === 0) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-4 space-y-2">
        <p className="font-bold">{t.loadFailed}</p>
        <p>{loadError}</p>
        <button onClick={() => { setLoading(true); loadThreads(); }} className="px-3 py-1.5 bg-white border border-red-200 rounded-lg font-bold">{t.retry}</button>
      </div>
    );
  }
  if (conversations.length === 0) {
    return <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center text-sm text-stone-500">{t.empty}</div>;
  }

  return (
    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm flex flex-col md:flex-row h-[calc(100vh-12rem)] min-h-[500px]">

      {/* 1. CHATS SIDEBAR PANEL */}
      <div className="md:w-80 border-b md:border-b-0 md:border-e border-stone-200 flex flex-col bg-stone-50/50 flex-shrink-0 max-h-56 md:max-h-none">
        <div className="p-4 border-b border-stone-200">
          <h3 className="font-extrabold text-sm text-stone-900 uppercase tracking-wider">{t.conversations}</h3>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.map((conv) => {
            const isSelected = selectedId === conv.id;
            return (
              <button
                key={conv.id}
                type="button"
                onClick={() => setSelectedId(conv.id)}
                className={`w-full text-start p-3.5 rounded-xl transition flex items-start gap-3 border ${
                  isSelected
                    ? "bg-white border-stone-200 shadow-sm"
                    : "border-transparent hover:bg-stone-100/60"
                }`}
              >
                <span className="w-10 h-10 rounded-full bg-stone-200 text-stone-600 text-xs font-bold flex items-center justify-center flex-shrink-0">
                  {initials(conv.name)}
                </span>
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-bold text-xs text-stone-900 truncate">{conv.name}</h4>
                    <span className="text-[9px] font-semibold text-stone-400 flex-shrink-0">{conv.lastAt ? formatTime(conv.lastAt) : ""}</span>
                  </div>
                  <p className="text-[10px] text-stone-500 truncate mt-0.5">{conv.lastMessage || t.newConversation}</p>
                </div>
                {conv.unread && <span className="w-2.5 h-2.5 bg-amber-500 rounded-full mt-1.5 flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. CHAT CONSOLE PANEL */}
      <div className="flex-1 flex flex-col justify-between bg-white min-w-0">
        {!selectedConv ? (
          <div className="flex-1 flex items-center justify-center text-sm text-stone-400">{t.select}</div>
        ) : (
          <>
            <div className="h-16 px-6 border-b border-stone-200 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-full bg-stone-200 text-stone-600 text-xs font-bold flex items-center justify-center">
                  {initials(selectedConv.name)}
                </span>
                <h4 className="font-bold text-xs text-stone-900">{selectedConv.name}</h4>
              </div>
              <Link href="/customer/bookings" className="px-3.5 py-1.5 border border-stone-200 hover:border-stone-400 rounded-lg text-[10px] font-bold uppercase tracking-wider transition">
                {t.bookings}
              </Link>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-stone-50/20">
              {messages.length === 0 && <p className="text-center text-xs text-stone-400 py-8">{t.noMessages}</p>}
              {messages.map((msg) => {
                const isCustomer = msg.sender === "customer";
                return (
                  <div key={msg.id} className={`flex w-full ${isCustomer ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[70%] rounded-2xl px-4 py-3 border shadow-sm ${
                        isCustomer ? "bg-stone-900 text-stone-50 border-stone-800" : "bg-white text-stone-800 border-stone-200"
                      }`}
                    >
                      <p className="text-xs leading-relaxed font-light whitespace-pre-wrap">{msg.text}</p>
                      <span className="text-[8px] block mt-1.5 text-end font-medium text-stone-400">{formatTime(msg.createdAt)}</span>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t border-stone-200 bg-white flex-shrink-0 space-y-2">
              {sendError && <p className="text-[11px] text-red-600">{t.sendFailed}: {sendError}</p>}
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  maxLength={2000}
                  placeholder={t.placeholder(selectedConv.name)}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-xs outline-none focus:border-stone-400 font-semibold text-stone-700 placeholder-stone-400"
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !inputMessage.trim()}
                  className="px-5 py-2.5 bg-stone-900 hover:bg-stone-800 text-stone-50 rounded-xl text-xs font-bold uppercase tracking-wider transition shadow-sm disabled:opacity-50"
                >
                  {sending ? t.sending : t.send}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

    </div>
  );
}
