"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Modal
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const { width, height } = Dimensions.get("window");

interface Message {
  id: string;
  sender: "customer" | "provider";
  text: string;
  timestamp: string;
}

interface Thread {
  id: string;
  name: { en: string; ar: string };
  lastMessage: { en: string; ar: string };
  time: { en: string; ar: string };
  unread: boolean;
  status: { en: string; ar: string };
}

export default function MessagesScreen() {
  const [lang, setLang] = useState<"en" | "ar">("ar");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Translations
  const t = {
    en: {
      title: "Messages",
      subtitle: "Chat with your luxury service providers",
      searchPlaceholder: "Search conversations...",
      online: "Online",
      typePlaceholder: "Type a message...",
      send: "Send",
      noThreads: "No conversations found.",
      typing: "Salon is typing...",
      back: "Back",
      details: "Details"
    },
    ar: {
      title: "الرسائل",
      subtitle: "تواصل مع مقدمي الخدمات الفاخرة",
      searchPlaceholder: "البحث في المحادثات...",
      online: "متصل",
      typePlaceholder: "اكتب رسالة...",
      send: "إرسال",
      noThreads: "لم يتم العثور على محادثات.",
      typing: "الصالون يكتب الآن...",
      back: "رجوع",
      details: "التفاصيل"
    }
  }[lang];

  // Mock Threads
  const [threads, setThreads] = useState<Thread[]>([
    {
      id: "t-1",
      name: {
        en: "Elite Grooming Lounge",
        ar: "صالون إيليت الرجالي"
      },
      lastMessage: {
        en: "Your appointment is confirmed for Tuesday.",
        ar: "تم تأكيد موعدك يوم الثلاثاء."
      },
      time: {
        en: "2m ago",
        ar: "قبل دقيقتين"
      },
      unread: true,
      status: {
        en: "Online",
        ar: "متصل"
      }
    },
    {
      id: "t-2",
      name: {
        en: "Riyadh Premium Spa & Wellness",
        ar: "سبا الرياض الفاخر للعناية"
      },
      lastMessage: {
        en: "We offer custom organic oils for the therapy session.",
        ar: "نحن نوفر زيوتًا عضوية مخصصة لجلسة العلاج."
      },
      time: {
        en: "1h ago",
        ar: "قبل ساعة"
      },
      unread: false,
      status: {
        en: "Away",
        ar: "بالخارج"
      }
    },
    {
      id: "t-3",
      name: {
        en: "Sara Beauty Salon & Spa",
        ar: "صالون سارة للتجميل والسبا"
      },
      lastMessage: {
        en: "Looking forward to your visit. Let us know if you need to reschedule.",
        ar: "نتطلع لزيارتك. أخبرنا إذا كنت ترغب في إعادة الجدولة."
      },
      time: {
        en: "Yesterday",
        ar: "بالأمس"
      },
      unread: false,
      status: {
        en: "Online",
        ar: "متصل"
      }
    }
  ]);

  // Mock Messages Store grouped by Thread ID
  const [messagesStore, setMessagesStore] = useState<Record<string, Message[]>>({
    "t-1": [
      {
        id: "m1",
        sender: "provider",
        text: lang === "ar" ? "مرحباً بك في صالون إيليت. كيف يمكننا مساعدتك اليوم؟" : "Welcome to Elite Lounge. How can we assist you today?",
        timestamp: "10:15 AM"
      },
      {
        id: "m2",
        sender: "customer",
        text: lang === "ar" ? "أهلاً بك، أردت التأكيد على موعدي لحلاقة اللحية الفاخرة." : "Hello, I wanted to confirm my appointment for the luxury beard grooming.",
        timestamp: "10:20 AM"
      },
      {
        id: "m3",
        sender: "provider",
        text: lang === "ar" ? "تم تأكيد موعدك يوم الثلاثاء. الأخصائي ماركوس بانتظارك." : "Your appointment is confirmed for Tuesday. Stylist Marcus is looking forward to seeing you.",
        timestamp: "10:22 AM"
      }
    ],
    "t-2": [
      {
        id: "m4",
        sender: "customer",
        text: lang === "ar" ? "هل تشمل الجلسة السويدية المساج بالزيوت العطرية؟" : "Does the Swedish session include aromatherapy oils?",
        timestamp: "Yesterday"
      },
      {
        id: "m5",
        sender: "provider",
        text: lang === "ar" ? "نعم بالتأكيد، نحن نوفر زيوتًا عضوية مخصصة لجلسة العلاج." : "Yes absolutely, we offer custom organic oils for the therapy session.",
        timestamp: "Yesterday"
      }
    ],
    "t-3": [
      {
        id: "m6",
        sender: "provider",
        text: lang === "ar" ? "مرحباً سيدي، تم تأكيد حجز الماكياج والمكياج السينمائي الخاص بك." : "Hello, your booking for the event makeup has been verified.",
        timestamp: "3 days ago"
      },
      {
        id: "m7",
        sender: "customer",
        text: lang === "ar" ? "رائع جداً، شكراً لكم!" : "Wonderful, thank you!",
        timestamp: "3 days ago"
      },
      {
        id: "m8",
        sender: "provider",
        text: lang === "ar" ? "نتطلع لزيارتك. أخبرنا إذا كنت ترغب في إعادة الجدولة." : "Looking forward to your visit. Let us know if you need to reschedule.",
        timestamp: "Yesterday"
      }
    ]
  });

  const handleSendMessage = () => {
    if (!inputText.trim() || !selectedThread) return;

    const threadId = selectedThread.id;
    const newMsg: Message = {
      id: `m-${Date.now()}`,
      sender: "customer",
      text: inputText,
      timestamp: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    };

    // Update message log
    setMessagesStore(prev => ({
      ...prev,
      [threadId]: [...(prev[threadId] || []), newMsg]
    }));

    // Update thread last message
    setThreads(prev =>
      prev.map(t =>
        t.id === threadId
          ? {
              ...t,
              lastMessage: { en: inputText, ar: inputText },
              time: { en: "Just now", ar: "الآن" }
            }
          : t
      )
    );

    const userQuery = inputText;
    setInputText("");

    // Simulate Salon Auto Response
    setTimeout(() => {
      setIsTyping(true);
    }, 800);

    setTimeout(() => {
      setIsTyping(false);
      
      const responseTextAr = getSimulatedReplyAr(userQuery);
      const responseTextEn = getSimulatedReplyEn(userQuery);

      const replyMsg: Message = {
        id: `m-${Date.now() + 1}`,
        sender: "provider",
        text: lang === "ar" ? responseTextAr : responseTextEn,
        timestamp: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
      };

      setMessagesStore(prev => ({
        ...prev,
        [threadId]: [...(prev[threadId] || []), replyMsg]
      }));

      setThreads(prev =>
        prev.map(t =>
          t.id === threadId
            ? {
                ...t,
                lastMessage: { en: responseTextEn, ar: responseTextAr },
                time: { en: "Just now", ar: "الآن" }
              }
            : t
        )
      );
    }, 2200);
  };

  const getSimulatedReplyAr = (query: string): string => {
    const q = query.toLowerCase();
    if (q.includes("سعر") || q.includes("بكم") || q.includes("تكلفة")) {
      return "الأسعار موضحة بالتفصيل في لوحة الخدمات على التطبيق، وتخضع لنظام الحساب المشترك والضريبة.";
    }
    if (q.includes("وقت") || q.includes("موعد") || q.includes("ساعة")) {
      return "نحن نلتزم بفترات الصلاة في الرياض. سيتم حجار حجزك مع توفير منظم الحجز التلقائي.";
    }
    return "بكل سرور! نحن نثمن تواصلكم. هل تود الاستفسار عن تفاصيل إضافية بشأن الخدمة أو الأخصائي؟";
  };

  const getSimulatedReplyEn = (query: string): string => {
    const q = query.toLowerCase();
    if (q.includes("price") || q.includes("cost") || q.includes("how much")) {
      return "Pricing is strictly split-routed as detailed in the service card details, complying with local VAT.";
    }
    if (q.includes("time") || q.includes("when") || q.includes("hour")) {
      return "Our schedules are locked dynamically with Riyadh prayer buffers. You can view open times on the Booking Sheet.";
    }
    return "Understood. Our team will verify this request and match it to your designated stylist.";
  };

  const filteredThreads = threads.filter(t =>
    t.name[lang].toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.lastMessage[lang].toLowerCase().includes(searchQuery.toLowerCase())
  );

  const openThread = (thread: Thread) => {
    // Clear unread
    setThreads(prev => prev.map(t => (t.id === thread.id ? { ...t, unread: false } : t)));
    setSelectedThread(thread);
  };

  // Scroll chat list to end on new message
  useEffect(() => {
    if (selectedThread && flatListRef.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messagesStore, selectedThread, isTyping]);

  const isRTL = lang === "ar";

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      {/* HEADER */}
      <View style={[styles.header, isRTL && styles.rtlRow]}>
        <View>
          <Text style={[styles.titleText, isRTL && styles.textRight]}>{t.title}</Text>
          <Text style={[styles.subtitleText, isRTL && styles.textRight]}>{t.subtitle}</Text>
        </View>
        <TouchableOpacity style={styles.langBadge} onPress={() => setLang(l => (l === "en" ? "ar" : "en"))}>
          <Text style={styles.langText}>{lang === "en" ? "العربية" : "EN"}</Text>
        </TouchableOpacity>
      </View>

      {/* SEARCH */}
      <View style={styles.searchContainer}>
        <TextInput
          style={[styles.searchInput, isRTL && styles.textRight]}
          placeholder={t.searchPlaceholder}
          placeholderTextColor="#a8a29e"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* THREADS LIST */}
      <ScrollView contentContainerStyle={styles.listContainer} showsVerticalScrollIndicator={false}>
        {filteredThreads.length === 0 ? (
          <View style={styles.emptyView}>
            <Text style={styles.emptyText}>{t.noThreads}</Text>
          </View>
        ) : (
          filteredThreads.map(item => (
            <TouchableOpacity
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
                    {item.lastMessage[lang]}
                  </Text>
                </View>

                <View style={styles.metaCol}>
                  <Text style={styles.threadTime}>{item.time[lang]}</Text>
                  {item.unread && <View style={styles.unreadDot} />}
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* CHAT DETAIL MODAL */}
      {selectedThread && (
        <Modal transparent={false} animationType="slide" visible={!!selectedThread}>
          <SafeAreaView style={styles.chatContainer}>
            {/* CHAT HEADER */}
            <View style={[styles.chatHeader, isRTL && styles.rtlRow]}>
              <TouchableOpacity
                style={[styles.chatHeaderBtn, isRTL && styles.rtlRow]}
                onPress={() => setSelectedThread(null)}
              >
                <Text style={styles.chatHeaderBtnLabel}>← {t.back}</Text>
              </TouchableOpacity>

              <View style={styles.chatHeaderTitleContainer}>
                <Text style={styles.chatHeaderName}>{selectedThread.name[lang]}</Text>
                <Text style={styles.chatHeaderStatus}>{t.online}</Text>
              </View>

              <View style={styles.chatHeaderPlaceholder} />
            </View>

            {/* MESSAGE STREAM */}
            <FlatList
              ref={flatListRef}
              data={messagesStore[selectedThread.id] || []}
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
                        {item.timestamp}
                      </Text>
                    </View>
                  </View>
                );
              }}
              ListFooterComponent={
                isTyping ? (
                  <View style={styles.typingIndicatorContainer}>
                    <Text style={styles.typingIndicatorText}>{t.typing}</Text>
                  </View>
                ) : null
              }
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
                  multiline
                />
                <TouchableOpacity style={styles.chatSendBtn} onPress={handleSendMessage}>
                  <Text style={styles.chatSendBtnText}>{t.send}</Text>
                </TouchableOpacity>
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
