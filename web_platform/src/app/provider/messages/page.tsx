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
    inbox: "Client Inbox",
    search: "Search clients...",
    loading: "Loading conversations...",
    loadFailed: "Could not load client messages",
    retry: "Try again",
    noProvider: "No business is linked to this account.",
    empty: "No client conversations yet. Clients start conversations from your shop page.",
    noMatches: "No conversations match your search.",
    select: "Select a conversation",
    newConversation: "New conversation",
    noMessages: "No messages yet.",
    client: "Client",
    placeholder: (name: string) => `Type a message to ${name}...`,
    send: "Send",
    sending: "Sending...",
    sendFailed: "Message not sent",
    clients: "Clients",
  },
  ar: {
    inbox: "صندوق رسائل العملاء",
    search: "ابحث عن عميل...",
    loading: "جارٍ تحميل المحادثات...",
    loadFailed: "تعذر تحميل رسائل العملاء",
    retry: "إعادة المحاولة",
    noProvider: "لا توجد منشأة مرتبطة بهذا الحساب.",
    empty: "لا توجد محادثات مع العملاء بعد. يبدأ العملاء المحادثات من صفحة مركزك.",
    noMatches: "لا توجد محادثات مطابقة لبحثك.",
    select: "اختر محادثة",
    newConversation: "محادثة جديدة",
    noMessages: "لا توجد رسائل بعد.",
    client: "عميل",
    placeholder: (name: string) => `اكتب رسالة إلى ${name}...`,
    send: "إرسال",
    sending: "جارٍ الإرسال...",
    sendFailed: "لم يتم إرسال الرسالة",
    clients: "العملاء",
  },
};

export default function ProviderMessages() {
  const isRTL = useDocumentRtl();
  const t = copy[isRTL ? "ar" : "en"];
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [noProvider, setNoProvider] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
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
      if (!user) return;
      setCurrentUserId(user.id);

      const { data: provider, error: providerError } = await supabase
        .from("providers")
        .select("id")
        .eq("owner_id", user.id)
        .maybeSingle();
      if (providerError) throw providerError;
      if (!provider) {
        setNoProvider(true);
        return;
      }

      const { data, error } = await supabase
        .from("conversations")
        .select("id, subject, last_message_preview, last_message_at, unread_for_provider, profiles!conversations_customer_id_fkey(first_name, last_name)")
        .eq("provider_id", provider.id)
        .order("last_message_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const next: Conversation[] = (data || []).map((item: any) => ({
        id: item.id,
        name: [item.profiles?.first_name, item.profiles?.last_name].filter(Boolean).join(" ") || t.client,
        lastMessage: item.last_message_preview || "",
        lastAt: item.last_message_at,
        unread: Boolean(item.unread_for_provider),
      }));
      setConversations(next);
      setSelectedId((current) => current && next.some((c) => c.id === current) ? current : next[0]?.id ?? null);
    } catch (err: unknown) {
      setConversations([]);
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [t.client]);

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
      supabase.from("conversations").update({ unread_for_provider: false }).eq("id", selectedId).then(() => {
        setConversations((prev) => prev.map((c) => (c.id === selectedId ? { ...c, unread: false } : c)));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, loadMessages]);

  useEffect(() => {
    if (!currentUserId) return;
    const channel = supabase
      .channel("provider-messages-live")
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

  const activeConv = conversations.find((c) => c.id === selectedId) || null;
  const filteredConversations = conversations.filter((conv) =>
    conv.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSend = async () => {
    const body = inputMessage.trim();
    if (!body || !activeConv || !currentUserId || sending) return;
    setSending(true);
    setSendError("");
    try {
      const { error } = await supabase.from("messages").insert({
        conversation_id: activeConv.id,
        sender_id: currentUserId,
        sender_role: "provider",
        body,
      });
      if (error) throw error;
      setInputMessage("");
      await loadMessages(activeConv.id);
      loadThreads();
    } catch (err: unknown) {
      setSendError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-sm text-[#667085]">{t.loading}</div>;
  }
  if (noProvider) {
    return <div className="bg-white border border-[#ECECEC] rounded-[20px] p-8 text-center text-sm text-[#344054]">{t.noProvider}</div>;
  }
  if (loadError && conversations.length === 0) {
    return (
      <div className="bg-[#FF5D73]/10 border border-[#FF5D73]/20 text-[#EF4444] text-sm rounded-[20px] p-5 space-y-2">
        <p className="font-bold">{t.loadFailed}</p>
        <p className="text-xs">{loadError}</p>
        <button onClick={() => { setLoading(true); loadThreads(); }} className="px-3 py-1.5 bg-white border border-[#FF5D73]/30 rounded-lg text-xs font-bold">{t.retry}</button>
      </div>
    );
  }
  if (conversations.length === 0) {
    return <div className="bg-white border border-[#ECECEC] rounded-[20px] p-10 text-center text-sm text-[#667085]">{t.empty}</div>;
  }

  return (
    <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] rounded-[28px] overflow-hidden flex flex-col md:flex-row h-[calc(100vh-12rem)] min-h-[550px] text-[#101828]">

      {/* 1. CHATS SIDEBAR PANEL */}
      <div className="md:w-80 border-b md:border-b-0 md:border-e border-[#ECECEC] flex flex-col bg-white flex-shrink-0 max-h-64 md:max-h-none">
        <div className="p-5 border-b border-[#ECECEC] space-y-4">
          <h3 className="font-extrabold text-[10px] text-[#D1AF47] uppercase tracking-[0.2em]">{t.inbox}</h3>
          <input
            type="text"
            placeholder={t.search}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-[#ECECEC] rounded-xl px-4 py-2.5 text-xs text-[#101828] placeholder-[#7B859C] outline-none focus:border-[#D1AF47]/40 transition-all duration-300"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filteredConversations.length === 0 && (
            <p className="text-xs text-[#667085] text-center py-8">{t.noMatches}</p>
          )}
          {filteredConversations.map((conv) => {
            const isSelected = selectedId === conv.id;
            return (
              <button
                key={conv.id}
                type="button"
                onClick={() => setSelectedId(conv.id)}
                className={`w-full text-start relative p-3.5 rounded-2xl transition-all duration-300 flex items-center gap-3 border ${
                  isSelected
                    ? "bg-[#D1AF47]/5 border-[#D1AF47]/20"
                    : "border-transparent hover:bg-gray-50/50 hover:border-[#ECECEC]"
                }`}
              >
                <span className="w-10 h-10 rounded-full bg-[#FBFAF7] border border-[#ECECEC] text-[#D1AF47] text-xs font-bold flex items-center justify-center flex-shrink-0">
                  {initials(conv.name)}
                </span>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <h4 className="font-bold text-xs truncate text-[#101828]">{conv.name}</h4>
                    <span className="text-[9px] font-semibold text-[#667085] flex-shrink-0">{conv.lastAt ? formatTime(conv.lastAt) : ""}</span>
                  </div>
                  <p className={`text-[10.5px] truncate ${conv.unread ? "text-[#101828] font-medium" : "text-[#667085]"}`}>
                    {conv.lastMessage || t.newConversation}
                  </p>
                </div>
                {conv.unread && <span className="w-2.5 h-2.5 bg-[#D1AF47] rounded-full flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. CHAT CONSOLE PANEL */}
      <div className="flex-1 flex flex-col justify-between bg-white min-w-0">
        {!activeConv ? (
          <div className="flex-1 flex items-center justify-center text-sm text-[#667085]">{t.select}</div>
        ) : (
          <>
            <div className="h-20 px-6 border-b border-[#ECECEC] flex items-center justify-between bg-white flex-shrink-0">
              <div className="flex items-center gap-4">
                <span className="w-10 h-10 rounded-full bg-[#FBFAF7] border border-[#ECECEC] text-[#D1AF47] text-xs font-bold flex items-center justify-center">
                  {initials(activeConv.name)}
                </span>
                <h4 className="font-bold text-sm text-[#101828] tracking-wide">{activeConv.name}</h4>
              </div>
              <Link href="/provider/customers" className="px-4 py-2 border border-[#D1AF47]/30 hover:border-[#D1AF47] text-[#D1AF47] hover:bg-[#D1AF47]/10 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all duration-300">
                {t.clients}
              </Link>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#FBFAF9]">
              {messages.length === 0 && <p className="text-center text-xs text-[#667085] py-8">{t.noMessages}</p>}
              {messages.map((msg) => {
                const isProvider = msg.sender === "provider";
                return (
                  <div key={msg.id} className={`flex w-full ${isProvider ? "justify-end" : "justify-start"}`}>
                    <div className={`flex flex-col ${isProvider ? "items-end" : "items-start"} max-w-[70%]`}>
                      <div
                        className={`rounded-[20px] px-5 py-3.5 border ${
                          isProvider
                            ? "bg-gradient-to-r from-[#D1AF47] to-[#B8952E] text-slate-950 border-transparent font-medium"
                            : "bg-white border-[#ECECEC] text-[#101828]"
                        }`}
                      >
                        <p className="text-xs leading-relaxed tracking-wide font-light whitespace-pre-wrap">{msg.text}</p>
                      </div>
                      <span className="text-[9px] mt-1.5 font-medium tracking-wider text-[#667085]">{formatTime(msg.createdAt)}</span>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-5 border-t border-[#ECECEC] bg-white flex-shrink-0 space-y-2">
              {sendError && <p className="text-[11px] text-[#EF4444]">{t.sendFailed}: {sendError}</p>}
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  maxLength={2000}
                  placeholder={t.placeholder(activeConv.name)}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  className="flex-1 bg-white border border-[#ECECEC] rounded-2xl px-5 py-3.5 text-xs outline-none focus:border-[#D1AF47]/40 text-[#101828] placeholder-[#7B859C]"
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !inputMessage.trim()}
                  className="px-6 py-3.5 bg-gradient-to-r from-[#D1AF47] to-[#B8952E] hover:from-[#E0C46A] hover:to-[#D1AF47] text-slate-950 rounded-2xl text-xs font-extrabold uppercase tracking-wider transition-all duration-300 disabled:opacity-50"
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
