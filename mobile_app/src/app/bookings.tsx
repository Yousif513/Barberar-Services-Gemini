import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppPressable } from "@/components/app-pressable";
import { useLocale } from "@/lib/locale";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Modal,
  ActivityIndicator,
  Alert
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { requestCheckout } from "@/lib/payment-checkout.js";
import { loadPendingPackagePayments, resumePendingPackagePayment, PENDING_PACKAGE_PAGE_SIZE, type PendingPackagePayment } from "@/lib/pending-package-payments.js";
import { errorMessage } from "@/lib/error-message";
import { subscribeBookingsChanged, openCheckout, PAYMENT_RETURN_URL } from "@/lib/payment-return";

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
  const checkoutInFlight = useRef(false);
  const packageRead = useRef(0);
  const [packagePage, setPackagePage] = useState(0);
  const [pendingPackages, setPendingPackages] = useState<PendingPackagePayment[]>([]);
  const [packageTotal, setPackageTotal] = useState(0);
  const [packagesLoading, setPackagesLoading] = useState(true);
  const [packagesError, setPackagesError] = useState("");
  const [packagesSignedIn, setPackagesSignedIn] = useState(false);

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
      packagePayments: "Unfinished package payments",
      packagePaymentsHelp: "These are your recorded purchases, including offers no longer on sale. Payment confirmation is required before sessions can be used.",
      packagesLoading: "Loading your package payments…",
      packagesFailed: "Could not load your package payments",
      packagesEmpty: "No unfinished package payments.",
      packagesPageEmpty: "No unfinished payments on this page. Check the previous page.",
      packageReference: "Purchase reference",
      recordedPrice: "Recorded purchase price",
      packageSessions: "Sessions in this purchase",
      packageRecorded: "Purchase recorded",
      packageContinue: "Continue existing payment",
      packageAwaiting: "AWAITING CONFIRMATION",
      previousPage: "Previous",
      nextPage: "Next",
      refreshPackages: "Refresh package status",
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
      packagePayments: "مدفوعات الباقات غير المكتملة",
      packagePaymentsHelp: "هذه عمليات الشراء المسجلة لحسابك، بما فيها العروض التي لم تعد معروضة للبيع. يلزم تأكيد الدفع قبل استخدام الجلسات.",
      packagesLoading: "جارٍ تحميل مدفوعات الباقات…",
      packagesFailed: "تعذر تحميل مدفوعات الباقات",
      packagesEmpty: "لا توجد مدفوعات باقات غير مكتملة.",
      packagesPageEmpty: "لا توجد مدفوعات غير مكتملة في هذه الصفحة. تحقق من الصفحة السابقة.",
      packageReference: "مرجع عملية الشراء",
      recordedPrice: "سعر الشراء المسجل",
      packageSessions: "جلسات عملية الشراء",
      packageRecorded: "تاريخ تسجيل الشراء",
      packageContinue: "متابعة الدفع الحالي",
      packageAwaiting: "بانتظار تأكيد الدفع",
      previousPage: "السابق",
      nextPage: "التالي",
      refreshPackages: "تحديث حالة الباقات",
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

  const loadPackagePayments = useCallback(async () => {
    const requestId = ++packageRead.current;
    setPackagesLoading(true);
    setPackagesError("");
    setPendingPackages([]);
    try {
      const result = await loadPendingPackagePayments(supabase, packagePage, lang);
      if (requestId !== packageRead.current) return;
      setPackagesSignedIn(Boolean(result.actorId));
      setPendingPackages(result.items);
      setPackageTotal(result.total);
    } catch (failure) {
      if (requestId === packageRead.current) setPackagesError(errorMessage(failure));
    } finally {
      if (requestId === packageRead.current) setPackagesLoading(false);
    }
  }, [packagePage, lang]);

  const invalidatePackageRead = useCallback(() => { packageRead.current++; }, []);
  useEffect(() => {
    const initialLoad = setTimeout(() => { void loadPackagePayments(); }, 0);
    const { data: auth } = supabase.auth.onAuthStateChange(() => { setPackagePage(0); void loadPackagePayments(); });
    const stopWatching = subscribeBookingsChanged(() => { void loadPackagePayments(); });
    return () => { clearTimeout(initialLoad); invalidatePackageRead(); auth.subscription.unsubscribe(); stopWatching(); };
  }, [loadPackagePayments, invalidatePackageRead]);

  const handlePackagePayment = async (purchaseId: string) => {
    if (checkoutInFlight.current) return;
    checkoutInFlight.current = true;
    setBusy(true);
    try {
      await resumePendingPackagePayment(supabase, purchaseId, {
        locale: lang, returnUrl: PAYMENT_RETURN_URL, openCheckout, refresh: loadPackagePayments,
      });
    } catch (failure) {
      Alert.alert(t.packagePayments, errorMessage(failure));
    } finally {
      checkoutInFlight.current = false;
      setBusy(false);
    }
  };

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
    if (checkoutInFlight.current || busy) return;
    checkoutInFlight.current = true;
    setBusy(true);
    try {
      const receipt = await requestCheckout(supabase, { bookingId: id, returnUrl: PAYMENT_RETURN_URL }, isRTL ? "ar" : "en", { onCaptured: loadBookings });
      await openCheckout(receipt.checkoutUrl);
    } catch (err) {
      Alert.alert(t.payNow, errorMessage(err));
    } finally {
      checkoutInFlight.current = false;
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
        <AppPressable label={lang === "en" ? "Switch to Arabic" : "التبديل إلى الإنجليزية"} style={styles.langBadge} onPress={() => setLang(l => l === "en" ? "ar" : "en")}>
          <Text style={styles.langText}>{lang === "en" ? "العربية" : "EN"}</Text>
        </AppPressable>
      </View>

      {/* TABS */}
      <View style={[styles.tabContainer, isRTL && styles.rtlRow]}>
        <AppPressable
          role="tab"
          selected={activeTab === "upcoming"}
          style={[styles.tabButton, activeTab === "upcoming" && styles.tabActive]}
          onPress={() => setActiveTab("upcoming")}
        >
          <Text style={[styles.tabLabel, activeTab === "upcoming" && styles.tabLabelActive]}>{t.upcoming}</Text>
        </AppPressable>
        <AppPressable
          role="tab"
          selected={activeTab === "past"}
          style={[styles.tabButton, activeTab === "past" && styles.tabActive]}
          onPress={() => setActiveTab("past")}
        >
          <Text style={[styles.tabLabel, activeTab === "past" && styles.tabLabelActive]}>{t.past}</Text>
        </AppPressable>
      </View>

      {/* LIST */}
      <ScrollView contentContainerStyle={styles.listContainer} showsVerticalScrollIndicator={false}>
        <View accessibilityLabel={t.packagePayments} style={styles.packageSection}>
          <Text accessibilityRole="header" style={[styles.cardService, isRTL && styles.rtlText]}>{t.packagePayments}</Text>
          <Text style={[styles.subtitleText, isRTL && styles.rtlText]}>{t.packagePaymentsHelp}</Text>
          {packagesLoading ? <ActivityIndicator accessibilityLabel={t.packagesLoading} />
            : packagesError ? <View style={styles.card}>
              <Text accessibilityRole="alert" style={[styles.detailVal, isRTL && styles.rtlText]}>{t.packagesFailed}: {packagesError}</Text>
              <AppPressable style={styles.btnSecondary} onPress={() => void loadPackagePayments()}><Text style={styles.btnSecondaryLabel}>{t.retry}</Text></AppPressable>
            </View>
            : !packagesSignedIn ? <Text style={[styles.emptyText, isRTL && styles.rtlText]}>{t.signIn}</Text>
            : <>
              {pendingPackages.length === 0 && <Text style={[styles.emptyText, isRTL && styles.rtlText]}>{packageTotal > 0 ? t.packagesPageEmpty : t.packagesEmpty}</Text>}
              {pendingPackages.map((purchase) => <View key={purchase.id} style={styles.card}>
                <Text style={[styles.cardProvider, isRTL && styles.rtlText]}>{t.packageAwaiting}</Text>
                <Text style={[styles.cardService, isRTL && styles.rtlText]}>{purchase.name[lang]}</Text>
                <Text selectable style={[styles.subtitleText, isRTL && styles.rtlText]}>{t.packageReference}: {purchase.id}</Text>
                <View style={styles.cardDivider} />
                <View style={[styles.cardDetailsRow, isRTL && styles.rtlRow]}>
                  <View><Text style={[styles.detailTitle, isRTL && styles.rtlText]}>{t.recordedPrice}</Text><Text style={[styles.detailVal, isRTL && styles.rtlText]}>{new Intl.NumberFormat(locale, { style: "currency", currency: "SAR" }).format(purchase.amount)}</Text></View>
                  <View><Text style={[styles.detailTitle, isRTL && styles.rtlText]}>{t.packageSessions}</Text><Text style={[styles.detailVal, isRTL && styles.rtlText]}>{purchase.sessions}</Text></View>
                </View>
                <Text style={[styles.subtitleText, isRTL && styles.rtlText]}>{t.packageRecorded}: {new Date(purchase.createdAt).toLocaleDateString(locale, { timeZone: "Asia/Riyadh" })}</Text>
                <View style={[styles.cardActions, isRTL && styles.rtlRow]}>
                  <AppPressable disabled={busy} busy={busy} style={styles.btnDark} onPress={() => void handlePackagePayment(purchase.id)}><Text style={styles.btnDarkLabel}>{t.packageContinue}</Text></AppPressable>
                </View>
              </View>)}
              <View style={[styles.cardActions, isRTL && styles.rtlRow]}>
                <AppPressable disabled={busy} style={styles.btnSecondary} onPress={() => void loadPackagePayments()}><Text style={styles.btnSecondaryLabel}>{t.refreshPackages}</Text></AppPressable>
                {packagePage > 0 && <AppPressable disabled={busy} style={styles.btnSecondary} onPress={() => setPackagePage(page => page - 1)}><Text style={styles.btnSecondaryLabel}>{t.previousPage}</Text></AppPressable>}
                {(packagePage + 1) * PENDING_PACKAGE_PAGE_SIZE < packageTotal && <AppPressable disabled={busy} style={styles.btnSecondary} onPress={() => setPackagePage(page => page + 1)}><Text style={styles.btnSecondaryLabel}>{t.nextPage}</Text></AppPressable>}
              </View>
            </>}
        </View>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} />
        ) : !signedIn ? (
          <View style={styles.emptyView}>
            <Text style={styles.emptyText}>{t.signIn}</Text>
          </View>
        ) : loadError ? (
          <View style={styles.emptyView}>
            <Text style={styles.emptyText}>{t.loadFailed}: {loadError}</Text>
            <AppPressable style={styles.btnSecondary} onPress={loadBookings}>
              <Text style={styles.btnSecondaryLabel}>{t.retry}</Text>
            </AppPressable>
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
                <AppPressable style={styles.btnSecondary} onPress={() => setSelectedBooking(item)}>
                  <Text style={styles.btnSecondaryLabel}>{t.details}</Text>
                </AppPressable>

                {item.status === "pending_payment" && (
                  <AppPressable style={styles.btnDark} disabled={busy} onPress={() => handlePayNow(item.id)}>
                    <Text style={styles.btnDarkLabel}>{t.payNow}</Text>
                  </AppPressable>
                )}

                {UPCOMING.includes(item.status) && new Date(item.scheduledAt).getTime() > Date.now() && (
                  <AppPressable
                    style={styles.btnPrimary}
                    onPress={() => {
                      setSelectedBooking(item);
                      setShowCancelModal(true);
                    }}
                  >
                    <Text style={styles.btnPrimaryLabel}>{t.cancel}</Text>
                  </AppPressable>
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

              <AppPressable style={styles.modalBtnClose} onPress={() => setSelectedBooking(null)}>
                <Text style={styles.modalBtnCloseLabel}>{t.close}</Text>
              </AppPressable>
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
                <AppPressable style={styles.modalBtnCancel} disabled={busy} onPress={() => setShowCancelModal(false)}>
                  <Text style={styles.modalBtnCancelLabel}>{t.close}</Text>
                </AppPressable>
                <AppPressable
                  label={t.yesCancel}
                  busy={busy}
                  style={styles.modalBtnConfirm}
                  disabled={busy}
                  onPress={() => handleCancelBooking(selectedBooking.id)}
                >
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalBtnConfirmLabel}>{t.yesCancel}</Text>}
                </AppPressable>
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
  rtlText: { textAlign: "right", writingDirection: "rtl" },
  packageSection: { gap: 12 },
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
