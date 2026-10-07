import React, { useCallback, useEffect, useState } from "react";
import { useLocale } from "@/lib/locale";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  Linking,
  ActivityIndicator,
  Alert
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { errorMessage } from "@/lib/error-message";
import { subscribeBookingsChanged } from "@/lib/payment-return";

type BookingStatus = "pending_payment" | "confirmed" | "completed" | "cancelled" | "no_show";

interface BookingRow {
  id: string;
  scheduledAt: string;
  status: BookingStatus;
  totalPrice: number;
  service: { en: string; ar: string };
  stylist: { en: string; ar: string };
  provider: { en: string; ar: string };
}

const UPCOMING: BookingStatus[] = ["pending_payment", "confirmed"];

export default function BookingsScreen() {
  const { lang, setLang } = useLocale();
  const [activeTab, setActiveTab] = useState<"upcoming" | "past">("upcoming");
  const [selectedBooking, setSelectedBooking] = useState<BookingRow | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [signedIn, setSignedIn] = useState(true);
  const [busy, setBusy] = useState(false);

  const isRTL = lang === "ar";

  const t = {
    en: {
      title: "My Appointments",
      subtitle: "Track your active, past, and cancelled sessions",
      upcoming: "Upcoming",
      past: "History",
      noBookings: "No appointments scheduled under this tab.",
      signIn: "Sign in from the Profile tab to see your appointments.",
      loadFailed: "Could not load your appointments",
      retry: "Try again",
      details: "View Info",
      cancel: "Cancel Booking",
      payNow: "Complete Payment",
      close: "Close",
      confirmCancelTitle: "Cancel Booking?",
      confirmCancelDesc: "The shop's cancellation policy applies. Any refund due is sent back to your card.",
      yesCancel: "Yes, Cancel",
      cancelled: "Booking cancelled.",
      paymentFailed: "Could not open the payment page. Please try again.",
      provider: "Provider",
      service: "Service",
      stylist: "Stylist",
      dateTime: "Date & Time",
      price: "Total Price",
      status: "Status",
      currency: "SAR",
      statuses: {
        pending_payment: "AWAITING PAYMENT",
        confirmed: "CONFIRMED",
        completed: "COMPLETED",
        cancelled: "CANCELLED",
        no_show: "NO-SHOW"
      } as Record<BookingStatus, string>
    },
    ar: {
      title: "مواعيدي وحجوزاتي",
      subtitle: "تابع مواعيدك القادمة، السجل، وطلبات الإلغاء",
      upcoming: "القادمة",
      past: "السابق",
      noBookings: "لا توجد حجوزات مجدولة في هذا التبويب.",
      signIn: "سجّل الدخول من تبويب الملف الشخصي لعرض مواعيدك.",
      loadFailed: "تعذر تحميل مواعيدك",
      retry: "إعادة المحاولة",
      details: "التفاصيل",
      cancel: "إلغاء الحجز",
      payNow: "إكمال الدفع",
      close: "إغلاق",
      confirmCancelTitle: "إلغاء الحجز؟",
      confirmCancelDesc: "تُطبق سياسة الإلغاء الخاصة بالمركز. أي مبلغ مستحق للاسترداد يُعاد إلى بطاقتك.",
      yesCancel: "نعم، إلغاء الموعد",
      cancelled: "تم إلغاء الحجز.",
      paymentFailed: "تعذر فتح صفحة الدفع. يرجى المحاولة مرة أخرى.",
      provider: "مزود الخدمة",
      service: "الخدمة",
      stylist: "الأخصائي",
      dateTime: "التاريخ والوقت",
      price: "السعر الإجمالي",
      status: "الحالة",
      currency: "ريال",
      statuses: {
        pending_payment: "بانتظار الدفع",
        confirmed: "مؤكد",
        completed: "مكتمل",
        cancelled: "ملغى",
        no_show: "لم يحضر"
      } as Record<BookingStatus, string>
    }
  }[lang];

  const both = (en?: string | null, ar?: string | null) => ({ en: en || ar || "", ar: ar || en || "" });

  const loadBookings = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      setSignedIn(Boolean(user));
      if (!user) {
        setBookings([]);
        return;
      }
      const { data, error } = await supabase
        .from("bookings")
        .select(`
          id, scheduled_at, status, total_price,
          services ( name_en, name_ar ),
          employees ( name_en, name_ar ),
          branches ( providers ( business_name_en, business_name_ar ) )
        `)
        .eq("customer_id", user.id)
        .order("scheduled_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      setBookings((data || []).map((b: any) => ({
        id: b.id,
        scheduledAt: b.scheduled_at,
        status: b.status,
        totalPrice: Number(b.total_price),
        service: both(b.services?.name_en, b.services?.name_ar),
        stylist: both(b.employees?.name_en, b.employees?.name_ar),
        provider: both(b.branches?.providers?.business_name_en, b.branches?.providers?.business_name_ar),
      })));
    } catch (err) {
      setBookings([]);
      setLoadError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBookings();
    const { data: sub } = supabase.auth.onAuthStateChange(() => loadBookings());
    const stopWatching = subscribeBookingsChanged(() => loadBookings());
    return () => {
      sub.subscription.unsubscribe();
      stopWatching();
    };
  }, [loadBookings]);

  const handleCancelBooking = async (id: string) => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("cancel_booking", { target_booking_id: id, p_reason: "customer_mobile" });
      if (error) throw error;
      setShowCancelModal(false);
      setSelectedBooking(null);
      Alert.alert(t.confirmCancelTitle, t.cancelled);
      loadBookings();
    } catch (err) {
      Alert.alert(t.confirmCancelTitle, errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handlePayNow = async (id: string) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("payment-checkout", { body: { bookingId: id } });
      if (error || !data?.checkoutUrl) throw new Error(t.paymentFailed);
      await Linking.openURL(data.checkoutUrl);
    } catch (err) {
      Alert.alert(t.payNow, errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const filtered = bookings.filter(b =>
    activeTab === "upcoming"
      ? UPCOMING.includes(b.status) && new Date(b.scheduledAt).getTime() > Date.now() - 2 * 3600000
      : !UPCOMING.includes(b.status) || new Date(b.scheduledAt).getTime() <= Date.now() - 2 * 3600000
  );

  const locale = isRTL ? "ar-SA" : "en-GB";
  const formatWhen = (iso: string) =>
    `${new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "Asia/Riyadh" })} • ${new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" })}`;

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      {/* HEADER */}
      <View style={[styles.header, isRTL && styles.rtlRow]}>
        <View>
          <Text style={styles.titleText}>{t.title}</Text>
          <Text style={styles.subtitleText}>{t.subtitle}</Text>
        </View>
        <TouchableOpacity style={styles.langBadge} onPress={() => setLang(l => l === "en" ? "ar" : "en")}>
          <Text style={styles.langText}>{lang === "en" ? "العربية" : "EN"}</Text>
        </TouchableOpacity>
      </View>

      {/* TABS */}
      <View style={[styles.tabContainer, isRTL && styles.rtlRow]}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === "upcoming" && styles.tabActive]}
          onPress={() => setActiveTab("upcoming")}
        >
          <Text style={[styles.tabLabel, activeTab === "upcoming" && styles.tabLabelActive]}>{t.upcoming}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === "past" && styles.tabActive]}
          onPress={() => setActiveTab("past")}
        >
          <Text style={[styles.tabLabel, activeTab === "past" && styles.tabLabelActive]}>{t.past}</Text>
        </TouchableOpacity>
      </View>

      {/* LIST */}
      <ScrollView contentContainerStyle={styles.listContainer} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} />
        ) : !signedIn ? (
          <View style={styles.emptyView}>
            <Text style={styles.emptyText}>{t.signIn}</Text>
          </View>
        ) : loadError ? (
          <View style={styles.emptyView}>
            <Text style={styles.emptyText}>{t.loadFailed}: {loadError}</Text>
            <TouchableOpacity style={styles.btnSecondary} onPress={loadBookings}>
              <Text style={styles.btnSecondaryLabel}>{t.retry}</Text>
            </TouchableOpacity>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyView}>
            <Text style={styles.emptyText}>{t.noBookings}</Text>
          </View>
        ) : (
          filtered.map((item) => (
            <View key={item.id} style={styles.card}>
              <View style={[styles.cardHeader, isRTL && styles.rtlRow]}>
                <View>
                  <Text style={styles.cardProvider}>{item.provider[lang]}</Text>
                  <Text style={styles.cardService}>{item.service[lang]}</Text>
                </View>
                <View style={[
                  styles.statusBadge,
                  item.status === "completed" && styles.statusCompleted,
                  (item.status === "cancelled" || item.status === "no_show") && styles.statusCancelled
                ]}>
                  <Text style={[
                    styles.statusLabel,
                    item.status === "completed" && styles.statusLabelCompleted,
                    (item.status === "cancelled" || item.status === "no_show") && styles.statusLabelCancelled
                  ]}>{t.statuses[item.status] || item.status}</Text>
                </View>
              </View>

              <View style={styles.cardDivider} />

              <View style={[styles.cardDetailsRow, isRTL && styles.rtlRow]}>
                <View>
                  <Text style={styles.detailTitle}>{t.dateTime}</Text>
                  <Text style={styles.detailVal}>{formatWhen(item.scheduledAt)}</Text>
                </View>
                <View style={styles.alignEnd}>
                  <Text style={styles.detailTitle}>{t.price}</Text>
                  <Text style={styles.detailVal}>{item.totalPrice} {t.currency}</Text>
                </View>
              </View>

              <View style={[styles.cardActions, isRTL && styles.rtlRow]}>
                <TouchableOpacity style={styles.btnSecondary} onPress={() => setSelectedBooking(item)}>
                  <Text style={styles.btnSecondaryLabel}>{t.details}</Text>
                </TouchableOpacity>

                {item.status === "pending_payment" && (
                  <TouchableOpacity style={styles.btnDark} disabled={busy} onPress={() => handlePayNow(item.id)}>
                    <Text style={styles.btnDarkLabel}>{t.payNow}</Text>
                  </TouchableOpacity>
                )}

                {UPCOMING.includes(item.status) && new Date(item.scheduledAt).getTime() > Date.now() && (
                  <TouchableOpacity
                    style={styles.btnPrimary}
                    onPress={() => {
                      setSelectedBooking(item);
                      setShowCancelModal(true);
                    }}
                  >
                    <Text style={styles.btnPrimaryLabel}>{t.cancel}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* DETAIL MODAL */}
      {selectedBooking && !showCancelModal && (
        <Modal transparent animationType="fade" visible onRequestClose={() => setSelectedBooking(null)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{selectedBooking.provider[lang]}</Text>

              <View style={styles.modalMeta}>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>{t.service}</Text>
                  <Text style={styles.metaValue}>{selectedBooking.service[lang]}</Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>{t.stylist}</Text>
                  <Text style={styles.metaValue}>{selectedBooking.stylist[lang]}</Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>{t.dateTime}</Text>
                  <Text style={styles.metaValue}>{formatWhen(selectedBooking.scheduledAt)}</Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>{t.status}</Text>
                  <Text style={styles.metaValue}>{t.statuses[selectedBooking.status] || selectedBooking.status}</Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>{t.price}</Text>
                  <Text style={[styles.metaValue, styles.metaValuePrice]}>{selectedBooking.totalPrice} {t.currency}</Text>
                </View>
              </View>

              <TouchableOpacity style={styles.modalBtnClose} onPress={() => setSelectedBooking(null)}>
                <Text style={styles.modalBtnCloseLabel}>{t.close}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* CONFIRM CANCEL MODAL */}
      {showCancelModal && selectedBooking && (
        <Modal transparent animationType="fade" visible onRequestClose={() => setShowCancelModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{t.confirmCancelTitle}</Text>
              <Text style={styles.modalDesc}>{t.confirmCancelDesc}</Text>

              <View style={[styles.modalActionRow, isRTL && styles.rtlRow]}>
                <TouchableOpacity style={styles.modalBtnCancel} disabled={busy} onPress={() => setShowCancelModal(false)}>
                  <Text style={styles.modalBtnCancelLabel}>{t.close}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalBtnConfirm}
                  disabled={busy}
                  onPress={() => handleCancelBooking(selectedBooking.id)}
                >
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalBtnConfirmLabel}>{t.yesCancel}</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fafaf9", // Warm Sand
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 10,
  },
  rtlRow: {
    flexDirection: "row-reverse",
  },
  titleText: {
    fontFamily: "System",
    fontWeight: "bold",
    fontSize: 22,
    color: "#1c1917",
  },
  subtitleText: {
    fontFamily: "System",
    fontSize: 12,
    color: "#78716c",
    marginTop: 2,
  },
  langBadge: {
    backgroundColor: "#1c1917",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  langText: {
    color: "#fafaf9",
    fontWeight: "bold",
    fontSize: 10,
  },
  tabContainer: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e7e5e4",
    marginHorizontal: 20,
    marginTop: 15,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: "#1c1917",
  },
  tabLabel: {
    fontWeight: "bold",
    fontSize: 12,
    color: "#a8a29e",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  tabLabelActive: {
    color: "#1c1917",
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    gap: 16,
  },
  emptyView: {
    paddingVertical: 60,
    alignItems: "center",
  },
  emptyText: {
    color: "#a8a29e",
    fontSize: 12,
    fontWeight: "600",
  },
  card: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e7e5e4",
    borderRadius: 20,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  cardProvider: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#a8a29e",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  cardService: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#1c1917",
    marginTop: 4,
  },
  statusBadge: {
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusCompleted: {
    backgroundColor: "#f0fdf4",
    borderColor: "#bbf7d0",
  },
  statusCancelled: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
  },
  statusLabel: {
    fontSize: 8,
    fontWeight: "bold",
    color: "#166534",
  },
  statusLabelCompleted: {
    color: "#166534",
  },
  statusLabelCancelled: {
    color: "#991b1b",
  },
  cardDivider: {
    height: 1,
    backgroundColor: "#f5f5f4",
    marginVertical: 12,
  },
  cardDetailsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  alignEnd: {
    alignItems: "flex-end",
  },
  detailTitle: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#a8a29e",
    textTransform: "uppercase",
  },
  detailVal: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#44403c",
    marginTop: 2,
  },
  cardActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
  },
  btnPrimary: {
    flex: 1,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
  },
  btnPrimaryLabel: {
    color: "#991b1b",
    fontWeight: "bold",
    fontSize: 11,
  },
  btnSecondary: {
    flex: 1,
    backgroundColor: "#f5f5f4",
    borderWidth: 1,
    borderColor: "#e7e5e4",
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
  },
  btnSecondaryLabel: {
    color: "#44403c",
    fontWeight: "bold",
    fontSize: 11,
  },
  btnDark: {
    flex: 1,
    backgroundColor: "#1c1917",
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
  },
  btnDarkLabel: {
    color: "#fafaf9",
    fontWeight: "bold",
    fontSize: 11,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 24,
    width: "100%",
    maxWidth: 340,
    borderWidth: 1,
    borderColor: "#e7e5e4",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1c1917",
  },
  modalDesc: {
    fontSize: 12,
    color: "#78716c",
    marginTop: 10,
    lineHeight: 18,
  },
  modalMeta: {
    marginVertical: 20,
    gap: 12,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#a8a29e",
  },
  metaValue: {
    fontSize: 11,
    fontWeight: "600",
    color: "#44403c",
  },
  metaValuePrice: {
    fontWeight: "bold",
    color: "#1c1917",
  },
  modalBtnClose: {
    backgroundColor: "#1c1917",
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 12,
  },
  modalBtnCloseLabel: {
    color: "#fafaf9",
    fontWeight: "bold",
    fontSize: 12,
  },
  modalActionRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
  },
  modalBtnCancel: {
    flex: 1,
    backgroundColor: "#f5f5f4",
    borderWidth: 1,
    borderColor: "#e7e5e4",
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 12,
  },
  modalBtnCancelLabel: {
    color: "#44403c",
    fontWeight: "bold",
    fontSize: 12,
  },
  modalBtnConfirm: {
    flex: 1,
    backgroundColor: "#ef4444",
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 12,
  },
  modalBtnConfirmLabel: {
    color: "#ffffff",
    fontWeight: "bold",
    fontSize: 12,
  },
});
