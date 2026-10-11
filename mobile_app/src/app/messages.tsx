import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppPressable } from "@/components/app-pressable";
import { useLocale } from "@/lib/locale";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  ScrollView,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ActivityIndicator,
  Alert
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { errorMessage } from "@/lib/error-message";

interface Message {
  id: string;
  sender: "customer" | "provider" | "system";
  text: string;
  createdAt: string;
}

interface Thread {
  id: string;
  name: { en: string; ar: string };
  lastMessage: string;
  lastAt: string;
  unread: boolean;
}

export default function MessagesScreen() {
  const { lang, setLang } = useLocale();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [inputText, setInputText] = useState("");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const isRTL = lang === "ar";

  // Translations
  const t = {
    en: {
      title: "Messages",
      subtitle: "Chat with the shops you book with",
      searchPlaceholder: "Search conversations...",
      typePlaceholder: "Type a message...",
      send: "Send",
      noThreads: "No conversations yet. Start one from a shop's page.",
      noMatches: "No conversations match your search.",
      signIn: "Sign in from the Profile tab to see your messages.",
      loadFailed: "Could not load your messages",
      retry: "Try again",
      sendFailed: "Message not sent",
      back: "Back",
      newConversation: "New conversation"
    },
    ar: {
      title: "الرسائل",
      subtitle: "تواصل مع المراكز التي تحجز لديها",
      searchPlaceholder: "البحث في المحادثات...",
      typePlaceholder: "اكتب رسالة...",
      send: "إرسال",
      noThreads: "لا توجد محادثات بعد. ابدأ محادثة من صفحة المركز.",
      noMatches: "لا توجد محادثات مطابقة لبحثك.",
      signIn: "سجّل الدخول من تبويب الملف الشخصي لعرض رسائلك.",
      loadFailed: "تعذر تحميل رسائلك",
      retry: "إعادة المحاولة",
      sendFailed: "لم يتم إرسال الرسالة",
      back: "رجوع",
      newConversation: "محادثة جديدة"
    }
  }[lang];

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const sameDay = d.toDateString() === new Date().toDateString();
    return sameDay
      ? d.toLocaleTimeString(isRTL ? "ar-SA" : "en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" })
      : d.toLocaleDateString(isRTL ? "ar-SA" : "en-GB", { day: "numeric", month: "short", timeZone: "Asia/Riyadh" });
  };

  const loadThreads = useCallback(async () => {
    setLoadError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      setUserId(user?.id ?? null);
      if (!user) {
        setThreads([]);
        return;
      }
      const { data, error } = await supabase
        .from("conversations")
        .select("id, subject, last_message_preview, last_message_at, unread_for_customer, providers!conversations_provider_id_fkey(business_name_en, business_name_ar)")
        .eq("customer_id", user.id)
        .order("last_message_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      setThreads((data || []).map((c: any) => ({
        id: c.id,
        name: {
          en: c.providers?.business_name_en || c.providers?.business_name_ar || c.subject || "",
          ar: c.providers?.business_name_ar || c.providers?.business_name_en || c.subject || ""
        },
        lastMessage: c.last_message_preview || "",
        lastAt: c.last_message_at,
        unread: Boolean(c.unread_for_customer),
      })));
    } catch (err) {
      setThreads([]);
      setLoadError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (threadId: string) => {
    const { data, error } = await supabase
      .from("messages")
      .select("id, sender_role, body, created_at")
      .eq("conversation_id", threadId)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) {
      Alert.alert(t.loadFailed, error.message);
      return;
    }
    setMessages((data || []).map((m: any) => ({ id: m.id, sender: m.sender_role, text: m.body, createdAt: m.created_at })));
  }, [t.loadFailed]);

  useEffect(() => {
    loadThreads();
    const { data: sub } = supabase.auth.onAuthStateChange(() => loadThreads());
    return () => sub.subscription.unsubscribe();
  }, [loadThreads]);

  // Live updates: RLS limits the change feed to this customer's conversations.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("mobile-customer-messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload: any) => {
        loadThreads();
        if (selectedThread && payload.new?.conversation_id === selectedThread.id) {
          loadMessages(selectedThread.id);
        }
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, selectedThread, loadThreads, loadMessages]);

  const openThread = async (thread: Thread) => {
    setSelectedThread(thread);
    setMessages([]);
    await loadMessages(thread.id);
    if (thread.unread) {
      await supabase.from("conversations").update({ unread_for_customer: false }).eq("id", thread.id);
      setThreads(prev => prev.map(x => (x.id === thread.id ? { ...x, unread: false } : x)));
    }
  };

  const handleSendMessage = async () => {
    const body = inputText.trim();
    if (!body || !selectedThread || !userId || sending) return;
    setSending(true);
    try {
      const { error } = await supabase.from("messages").insert({
        conversation_id: selectedThread.id,
        sender_id: userId,
        sender_role: "customer",
        body,
      });
      if (error) throw error;
      setInputText("");
      await loadMessages(selectedThread.id);
      loadThreads();
    } catch (err) {
      // The text stays in the input so nothing the customer typed is lost.
      Alert.alert(t.sendFailed, errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const filteredThreads = threads.filter(x =>
    x.name[lang].toLowerCase().includes(searchQuery.toLowerCase()) ||
    x.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Scroll chat list to end on new message
  useEffect(() => {
    if (selectedThread && flatListRef.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages, selectedThread]);

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      {/* HEADER */}
      <View style={[styles.header, isRTL && styles.rtlRow]}>
        <View>
          <Text style={[styles.titleText, isRTL && styles.textRight]}>{t.title}</Text>
          <Text style={[styles.subtitleText, isRTL && styles.textRight]}>{t.subtitle}</Text>
        </View>
        <AppPressable label={lang === "en" ? "Switch to Arabic" : "التبديل إلى الإنجليزية"} style={styles.langBadge} onPress={() => setLang(l => (l === "en" ? "ar" : "en"))}>
          <Text style={styles.langText}>{lang === "en" ? "العربية" : "EN"}</Text>
        </AppPressable>
      </View>

      {/* SEARCH */}
      {userId && threads.length > 0 && (
        <View style={styles.searchContainer}>
          <TextInput
            style={[styles.searchInput, isRTL && styles.textRight]}
            placeholder={t.searchPlaceholder}
            placeholderTextColor="#a8a29e"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      )}

      {/* THREADS LIST */}
      <ScrollView contentContainerStyle={styles.listContainer} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} />
        ) : !userId ? (
          <View style={styles.emptyView}>
            <Text style={styles.emptyText}>{t.signIn}</Text>
          </View>
        ) : loadError ? (
          <View style={styles.emptyView}>
            <Text style={styles.emptyText}>{t.loadFailed}: {loadError}</Text>
            <AppPressable style={styles.chatSendBtn} onPress={() => { setLoading(true); loadThreads(); }}>
              <Text style={styles.chatSendBtnText}>{t.retry}</Text>
            </AppPressable>
          </View>
        ) : filteredThreads.length === 0 ? (
          <View style={styles.emptyView}>
            <Text style={styles.emptyText}>{threads.length === 0 ? t.noThreads : t.noMatches}</Text>
          </View>
        ) : (
          filteredThreads.map(item => (
            <AppPressable
              key={item.id}
              style={styles.threadCard}
              onPress={() => openThread(item)}
            >
              <View style={[styles.threadHeader, isRTL && styles.rtlRow]}>
                <View style={styles.threadInfo}>
                  <Text style={[styles.threadName, isRTL && styles.textRight]}>{item.name[lang]}</Text>
                  <Text
                    style={[
                      styles.threadLastMsg,
                      item.unread && styles.threadLastMsgUnread,
                      isRTL && styles.textRight
                    ]}
                    numberOfLines={1}
                  >
                    {item.lastMessage || t.newConversation}
                  </Text>
                </View>

                <View style={styles.metaCol}>
                  <Text style={styles.threadTime}>{item.lastAt ? formatTime(item.lastAt) : ""}</Text>
                  {item.unread && <View style={styles.unreadDot} />}
                </View>
              </View>
            </AppPressable>
          ))
        )}
      </ScrollView>

      {/* CHAT DETAIL MODAL */}
      {selectedThread && (
        <Modal transparent={false} animationType="slide" visible={!!selectedThread} onRequestClose={() => setSelectedThread(null)}>
          <SafeAreaView style={styles.chatContainer}>
            {/* CHAT HEADER */}
            <View style={[styles.chatHeader, isRTL && styles.rtlRow]}>
              <AppPressable
                label={t.back}
                style={[styles.chatHeaderBtn, isRTL && styles.rtlRow]}
                onPress={() => setSelectedThread(null)}
              >
                <Text style={styles.chatHeaderBtnLabel}>{isRTL ? "→" : "←"} {t.back}</Text>
              </AppPressable>

              <View style={styles.chatHeaderTitleContainer}>
                <Text style={styles.chatHeaderName}>{selectedThread.name[lang]}</Text>
              </View>

              <View style={styles.chatHeaderPlaceholder} />
            </View>

            {/* MESSAGE STREAM */}
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.chatMessageStream}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const isCustomer = item.sender === "customer";
                return (
                  <View
                    style={[
                      styles.messageBubbleContainer,
                      isCustomer ? styles.msgAlignRight : styles.msgAlignLeft
                    ]}
                  >
                    <View
                      style={[
                        styles.messageBubble,
                        isCustomer ? styles.msgBubbleCustomer : styles.msgBubbleProvider
                      ]}
                    >
                      <Text
                        style={[
                          styles.messageText,
                          isCustomer ? styles.msgTextCustomer : styles.msgTextProvider
                        ]}
                      >
                        {item.text}
                      </Text>
                      <Text
                        style={[
                          styles.messageTime,
                          isCustomer ? styles.msgTimeCustomer : styles.msgTimeProvider
                        ]}
                      >
                        {formatTime(item.createdAt)}
                      </Text>
                    </View>
                  </View>
                );
              }}
            />

            {/* INPUT PANEL */}
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
            >
              <View style={[styles.chatInputPanel, isRTL && styles.rtlRow]}>
                <TextInput
                  style={[styles.chatInput, isRTL && styles.textRight]}
                  placeholder={t.typePlaceholder}
                  placeholderTextColor="#a8a29e"
                  value={inputText}
                  onChangeText={setInputText}
                  maxLength={2000}
                  multiline
                />
                <AppPressable label={t.send} busy={sending} style={styles.chatSendBtn} disabled={sending} onPress={handleSendMessage}>
                  {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.chatSendBtnText}>{t.send}</Text>}
                </AppPressable>
              </View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fafaf9" // Warm Sand
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 10
  },
  rtlRow: {
    flexDirection: "row-reverse"
  },
  textRight: {
    textAlign: "right"
  },
  titleText: {
    fontFamily: "System",
    fontWeight: "bold",
    fontSize: 22,
    color: "#1c1917"
  },
  subtitleText: {
    fontFamily: "System",
    fontSize: 12,
    color: "#78716c",
    marginTop: 2
  },
  langBadge: {
    backgroundColor: "#1c1917",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8
  },
  langText: {
    color: "#fafaf9",
    fontWeight: "bold",
    fontSize: 10
  },
  searchContainer: {
    paddingHorizontal: 20,
    marginTop: 15,
    marginBottom: 10
  },
  searchInput: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e7e5e4",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: "#1c1917"
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 40,
    gap: 12
  },
  emptyView: {
    paddingVertical: 60,
    alignItems: "center"
  },
  emptyText: {
    color: "#a8a29e",
    fontSize: 12,
    fontWeight: "600"
  },
  threadCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e7e5e4",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1
  },
  threadHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  threadInfo: {
    flex: 1,
    marginHorizontal: 4
  },
  threadName: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#1c1917"
  },
  threadLastMsg: {
    fontSize: 12,
    color: "#78716c",
    marginTop: 4
  },
  threadLastMsgUnread: {
    fontWeight: "bold",
    color: "#1c1917"
  },
  metaCol: {
    alignItems: "flex-end",
    gap: 6
  },
  threadTime: {
    fontSize: 10,
    color: "#a8a29e"
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "hsl(38, 40%, 45%)" // Premium Gold
  },
  chatContainer: {
    flex: 1,
    backgroundColor: "#fafaf9"
  },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e7e5e4",
    backgroundColor: "#ffffff"
  },
  chatHeaderBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8
  },
  chatHeaderBtnLabel: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#1c1917"
  },
  chatHeaderTitleContainer: {
    alignItems: "center"
  },
  chatHeaderName: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#1c1917"
  },
  chatHeaderStatus: {
    fontSize: 10,
    color: "hsl(38, 40%, 45%)",
    fontWeight: "bold",
    marginTop: 2
  },
  chatHeaderPlaceholder: {
    width: 60
  },
  chatMessageStream: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12
  },
  messageBubbleContainer: {
    flexDirection: "row",
    width: "100%"
  },
  msgAlignRight: {
    justifyContent: "flex-end"
  },
  msgAlignLeft: {
    justifyContent: "flex-start"
  },
  messageBubble: {
    maxWidth: "80%",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.01,
    shadowRadius: 2
  },
  msgBubbleCustomer: {
    backgroundColor: "#1c1917", // Charcoal
    borderTopRightRadius: 4
  },
  msgBubbleProvider: {
    backgroundColor: "#ffffff", // Pure White
    borderWidth: 1,
    borderColor: "#e7e5e4",
    borderTopLeftRadius: 4
  },
  messageText: {
    fontSize: 13,
    lineHeight: 18
  },
  msgTextCustomer: {
    color: "#ffffff"
  },
  msgTextProvider: {
    color: "#1c1917"
  },
  messageTime: {
    fontSize: 8,
    marginTop: 4,
    alignSelf: "flex-end"
  },
  msgTimeCustomer: {
    color: "#a8a29e"
  },
  msgTimeProvider: {
    color: "#a8a29e"
  },
  typingIndicatorContainer: {
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  typingIndicatorText: {
    fontSize: 10,
    fontStyle: "italic",
    color: "#78716c"
  },
  chatInputPanel: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#e7e5e4",
    backgroundColor: "#ffffff",
    gap: 12
  },
  chatInput: {
    flex: 1,
    backgroundColor: "#fafaf9",
    borderWidth: 1,
    borderColor: "#e7e5e4",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 13,
    color: "#1c1917",
    maxHeight: 80
  },
  chatSendBtn: {
    backgroundColor: "#1c1917",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center"
  },
  chatSendBtnText: {
    color: "#fafaf9",
    fontWeight: "bold",
    fontSize: 12
  }
});
