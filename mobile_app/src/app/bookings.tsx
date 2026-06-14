"use client";

import React, { useState } from "react";
import { 
  StyleSheet, 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  Modal, 
  Dimensions 
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");

export default function BookingsScreen() {
  const [lang, setLang] = useState<"en" | "ar">("ar");
  const [activeTab, setActiveTab] = useState<"upcoming" | "past">("upcoming");
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);

  const t = {
    en: {
      title: "My Appointments",
      subtitle: "Track your active, past, and cancelled sessions",
      upcoming: "Upcoming",
      past: "History",
      noBookings: "No appointments scheduled under this tab.",
      details: "View Info",
      cancel: "Cancel Booking",
      rebook: "Book Again",
      close: "Close",
      confirmCancelTitle: "Cancel Booking?",
      confirmCancelDesc: "Are you sure you want to cancel this booking? This action cannot be undone.",
      yesCancel: "Yes, Cancel",
      provider: "Provider",
      service: "Service",
      stylist: "Stylist",
      dateTime: "Date & Time",
      price: "Total Price",
      status: "Status",
      currency: "SAR"
    },
    ar: {
      title: "مواعيدي وحجوزاتي",
      subtitle: "تابع مواعيدك القادمة، السجل، وطلبات الإلغاء",
      upcoming: "القادمة",
      past: "السابق",
      noBookings: "لا توجد حجوزات مجدولة في هذا التبويب.",
      details: "التفاصيل",
      cancel: "إلغاء الحجز",
      rebook: "احجز مجدداً",
      close: "إغلاق",
      confirmCancelTitle: "إلغاء الحجز؟",
      confirmCancelDesc: "هل أنت متأكد من رغبتك في إلغاء هذا الموعد؟ لا يمكن التراجع عن هذا الإجراء.",
      yesCancel: "نعم، إلغاء الموعد",
      provider: "مزود الخدمة",
      service: "الخدمة",
      stylist: "الأخصائي",
      dateTime: "التاريخ والوقت",
      price: "السعر الإجمالي",
      status: "الحالة",
      currency: "ريال"
    }
  }[lang];

  // Mock Bookings
  const [bookings, setBookings] = useState<any[]>([
    {
      id: "bk-100",
      scheduled_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days later
      status: "CONFIRMED",
      total_price: 220,
      service: lang === "ar" ? "حلاقة اللحية الفاخرة بالمنشفة الساخنة" : "Luxury Beard Grooming & Hot Towel Shave",
      stylist: lang === "ar" ? "ماركوس فانس" : "Marcus Vance",
      provider: lang === "ar" ? "صالون إيليت الرجالي" : "Elite Grooming Lounge"
    },
    {
      id: "bk-200",
      scheduled_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
      status: "COMPLETED",
      total_price: 350,
      service: lang === "ar" ? "علاج ترطيب البشرة وتدليك الرأس" : "Deep Hydrating Facial & Scalp Therapy",
      stylist: lang === "ar" ? "إيلينا روستوفا" : "Elena Rostova",
      provider: lang === "ar" ? "سبا الرياض الفاخر للعناية" : "Riyadh Premium Spa & Wellness"
    }
  ]);

  const handleCancelBooking = (id: string) => {
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status: "CANCELLED" } : b));
    setShowCancelModal(false);
    setSelectedBooking(null);
  };

  const filtered = bookings.filter(b => {
    if (activeTab === "upcoming") {
      return b.status === "CONFIRMED" || b.status === "PENDING";
    }
    return b.status === "COMPLETED" || b.status === "CANCELLED";
  });

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      {/* HEADER */}
      <View style={styles.header}>
        <View>
          <Text style={styles.titleText}>{t.title}</Text>
          <Text style={styles.subtitleText}>{t.subtitle}</Text>
        </View>
        <TouchableOpacity style={styles.langBadge} onPress={() => setLang(l => l === "en" ? "ar" : "en")}>
          <Text style={styles.langText}>{lang === "en" ? "العربية" : "EN"}</Text>
        </TouchableOpacity>
      </View>

      {/* TABS */}
      <View style={styles.tabContainer}>
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
        {filtered.length === 0 ? (
          <View style={styles.emptyView}>
            <Text style={styles.emptyText}>{t.noBookings}</Text>
          </View>
        ) : (
          filtered.map((item) => (
            <View key={item.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.cardProvider}>{item.provider}</Text>
                  <Text style={styles.cardService}>{item.service}</Text>
                </View>
                <View style={[
                  styles.statusBadge,
                  item.status === "COMPLETED" && styles.statusCompleted,
                  item.status === "CANCELLED" && styles.statusCancelled
                ]}>
                  <Text style={[
                    styles.statusLabel,
                    item.status === "COMPLETED" && styles.statusLabelCompleted,
                    item.status === "CANCELLED" && styles.statusLabelCancelled
                  ]}>{item.status}</Text>
                </View>
              </View>

              <View style={styles.cardDivider} />

              <View style={styles.cardDetailsRow}>
                <View>
                  <Text style={styles.detailTitle}>{t.dateTime}</Text>
                  <Text style={styles.detailVal}>
                    {new Date(item.scheduled_at).toLocaleDateString("en-GB", { day: 'numeric', month: 'short' })} • {new Date(item.scheduled_at).toLocaleTimeString("en-GB", { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                <View style={styles.alignEnd}>
                  <Text style={styles.detailTitle}>{t.price}</Text>
                  <Text style={styles.detailVal}>{item.total_price} {t.currency}</Text>
                </View>
              </View>

              <View style={styles.cardActions}>
                <TouchableOpacity 
                  style={styles.btnSecondary} 
                  onPress={() => setSelectedBooking(item)}
                >
                  <Text style={styles.btnSecondaryLabel}>{t.details}</Text>
                </TouchableOpacity>

                {item.status === "CONFIRMED" && (
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

                {(item.status === "COMPLETED" || item.status === "CANCELLED") && (
                  <TouchableOpacity 
                    style={styles.btnDark} 
                    onPress={() => {}}
                  >
                    <Text style={styles.btnDarkLabel}>{t.rebook}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* DETAIL MODAL */}
      {selectedBooking && !showCancelModal && (
        <Modal transparent animationType="fade" visible>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{selectedBooking.provider}</Text>
              
              <View style={styles.modalMeta}>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>{t.service}</Text>
                  <Text style={styles.metaValue}>{selectedBooking.service}</Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>{t.stylist}</Text>
                  <Text style={styles.metaValue}>{selectedBooking.stylist}</Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>{t.dateTime}</Text>
                  <Text style={styles.metaValue}>{new Date(selectedBooking.scheduled_at).toLocaleString()}</Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>{t.price}</Text>
                  <Text style={[styles.metaValue, styles.metaValuePrice]}>{selectedBooking.total_price} {t.currency}</Text>
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
        <Modal transparent animationType="fade" visible>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{t.confirmCancelTitle}</Text>
              <Text style={styles.modalDesc}>{t.confirmCancelDesc}</Text>

              <View style={styles.modalActionRow}>
                <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setShowCancelModal(false)}>
                  <Text style={styles.modalBtnCancelLabel}>{t.close}</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.modalBtnConfirm} 
                  onPress={() => handleCancelBooking(selectedBooking.id)}
                >
                  <Text style={styles.modalBtnConfirmLabel}>{t.yesCancel}</Text>
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
