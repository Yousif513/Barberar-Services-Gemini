import React, { useEffect, useMemo, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  Image,
  Alert,
  Dimensions,
  Linking,
  ActivityIndicator
} from "react-native";
import { supabase } from "../lib/supabase";
import {
  MarketplaceProvider,
  ShopDetails,
  ShopPackage,
  ShopService,
  VAT_RATE,
  formatSar,
  formatSlotLabel,
  loadAvailableSlots,
  loadShopDetails,
  riyadhDate
} from "../lib/marketplace";

const { height } = Dimensions.get("window");

const ANY_SPECIALIST = "any";
const BOOKING_DAYS = 7;

type ClientProfile = { id: string | null; name: string };

export function ShopDetailsModal({
  shop,
  locale,
  onClose
}: {
  shop: MarketplaceProvider,
  locale: "en" | "ar",
  onClose: () => void
}) {
  const isAr = locale === "ar";
  const [details, setDetails] = useState<ShopDetails | null>(null);
  const [detailsError, setDetailsError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [selectedService, setSelectedService] = useState<ShopService | null>(null);
  const [selectedSpecialist, setSelectedSpecialist] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"services" | "packages">("services");

  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState("");

  const [clientProfiles, setClientProfiles] = useState<ClientProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const t = {
    en: {
      servicesHeading: "Our Services",
      specialistsHeading: "Choose Specialist",
      anySpecialist: "Any professional",
      dateHeading: "Select Date",
      slotsHeading: "Available Time Slots",
      prayerBufferMsg: "Prayer times are excluded from the schedule.",
      noSlots: "No free times on this day. Try another date.",
      slotsFailed: "Could not load available times",
      pricingHeading: "Booking Summary",
      servicePrice: "Service price",
      vat: "VAT (15%)",
      total: "Estimated total",
      depositNow: "Deposit due now",
      venueBalance: "Due at the venue",
      estimateNote: "Final amount is confirmed by the server at checkout.",
      policyHeading: "Cancellation policy",
      policy: (h: number, late: number, noShow: number) =>
        `Free cancellation up to ${h} hours before the appointment. Later cancellations: ${late}% of the price. No-show: ${noShow}% of the price.`,
      payBtn: "Confirm & continue to payment",
      confirmBtn: "Confirm booking",
      close: "Close",
      reviews: "reviews",
      newShop: "New - no reviews yet",
      mins: "mins",
      today: "Today",
      tomorrow: "Tomorrow",
      forWhom: "Who is this booking for?",
      myself: "Myself",
      signIn: "Please sign in from the Profile tab before booking.",
      bookingFailed: "Booking failed",
      bookingConfirmed: "Booking confirmed",
      bookingConfirmedText: "Nothing is due online. Details are in your bookings.",
      paymentFailed: "Your time is held, but the payment page could not be opened. Open it again from your bookings before the hold expires.",
      loadFailed: "Could not load this shop",
      retry: "Try again",
      noServices: "This shop has not listed any services yet.",
      noSpecialists: "No professionals are listed for this branch yet.",
      packagesHeading: "Packages & Passes",
      sessions: "sessions",
      validity: "valid for",
      days: "days",
      buy: "Buy",
      noPackages: "No packages currently available for this shop.",
      packageFailed: "Could not open the payment page. The package was not activated and nothing was charged.",
      reviewsHeading: "Customer Reviews",
      noReviews: "No written reviews for this shop yet.",
      ownerReply: "Reply from the shop",
      messageShop: "Message this shop",
      conversationReady: "Your conversation with this shop is in the Messages tab."
    },
    ar: {
      servicesHeading: "خدماتنا",
      specialistsHeading: "اختر الأخصائي",
      anySpecialist: "أي أخصائي متاح",
      dateHeading: "اختر التاريخ",
      slotsHeading: "الأوقات المتاحة",
      prayerBufferMsg: "أوقات الصلاة مستثناة من الجدول.",
      noSlots: "لا توجد أوقات متاحة في هذا اليوم. جرّب تاريخاً آخر.",
      slotsFailed: "تعذر تحميل الأوقات المتاحة",
      pricingHeading: "ملخص الحجز",
      servicePrice: "سعر الخدمة",
      vat: "ضريبة القيمة المضافة (15%)",
      total: "الإجمالي التقديري",
      depositNow: "العربون المستحق الآن",
      venueBalance: "المتبقي في المركز",
      estimateNote: "يؤكد الخادم المبلغ النهائي عند الدفع.",
      policyHeading: "سياسة الإلغاء",
      policy: (h: number, late: number, noShow: number) =>
        `الإلغاء مجاني حتى ${h} ساعة قبل الموعد. الإلغاء المتأخر: ${late}% من السعر. عدم الحضور: ${noShow}% من السعر.`,
      payBtn: "تأكيد والمتابعة للدفع",
      confirmBtn: "تأكيد الحجز",
      close: "إغلاق",
      reviews: "تقييم",
      newShop: "جديد - لا توجد تقييمات بعد",
      mins: "دقيقة",
      today: "اليوم",
      tomorrow: "غداً",
      forWhom: "لمن هذا الحجز؟",
      myself: "نفسي",
      signIn: "يرجى تسجيل الدخول من تبويب الملف الشخصي قبل الحجز.",
      bookingFailed: "تعذر إتمام الحجز",
      bookingConfirmed: "تم تأكيد الحجز",
      bookingConfirmedText: "لا يوجد مبلغ مستحق عبر الإنترنت. التفاصيل في حجوزاتك.",
      paymentFailed: "تم حجز الموعد مؤقتاً، لكن تعذر فتح صفحة الدفع. افتحها من حجوزاتك قبل انتهاء مهلة الحجز.",
      loadFailed: "تعذر تحميل بيانات المركز",
      retry: "إعادة المحاولة",
      noServices: "لم يضف هذا المركز أي خدمات بعد.",
      noSpecialists: "لا يوجد أخصائيون مدرجون لهذا الفرع بعد.",
      packagesHeading: "الباقات والعضويات",
      sessions: "جلسات",
      validity: "صلاحية",
      days: "يوم",
      buy: "شراء",
      noPackages: "لا توجد باقات متاحة حالياً لهذا المركز",
      packageFailed: "تعذر فتح صفحة الدفع. لم يتم تفعيل الباقة ولم يُخصم أي مبلغ.",
      reviewsHeading: "تقييمات وآراء العملاء",
      noReviews: "لا توجد تقييمات مكتوبة لهذا المركز بعد.",
      ownerReply: "رد المركز",
      messageShop: "راسل هذا المركز",
      conversationReady: "محادثتك مع هذا المركز موجودة في تبويب الرسائل."
    }
  }[locale];

  useEffect(() => {
    let cancelled = false;
    setDetails(null);
    setDetailsError("");
    loadShopDetails(shop.providerId, shop.branchId)
      .then((d) => { if (!cancelled) setDetails(d); })
      .catch((err) => { if (!cancelled) setDetailsError(err instanceof Error ? err.message : String(err)); });
    return () => { cancelled = true; };
  }, [shop.providerId, shop.branchId, reloadKey]);

  useEffect(() => {
    const fetchProfiles = async () => {
      const myself = { id: null, name: t.myself };
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setClientProfiles([myself]);
        return;
      }
      const { data } = await supabase.from("client_profiles").select("id, name").eq("client_id", user.id);
      setClientProfiles([myself, ...((data || []) as ClientProfile[])]);
    };
    fetchProfiles().catch(() => setClientProfiles([{ id: null, name: t.myself }]));
  }, [locale]);

  // Real availability from the database for the chosen service, professional and day.
  useEffect(() => {
    if (!details || !selectedService || !selectedSpecialist || !selectedDate) {
      setSlots([]);
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
    setSlotsError("");
    loadAvailableSlots({
      branchId: shop.branchId,
      serviceId: selectedService.id,
      employeeId: selectedSpecialist === ANY_SPECIALIST ? null : selectedSpecialist,
      durationMinutes: selectedService.duration,
      date: selectedDate,
      lat: details.latitude,
      lng: details.longitude,
    })
      .then((rows) => { if (!cancelled) setSlots(rows.filter((iso) => new Date(iso).getTime() > Date.now())); })
      .catch((err) => {
        if (cancelled) return;
        setSlots([]);
        setSlotsError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => { if (!cancelled) setSlotsLoading(false); });
    return () => { cancelled = true; };
  }, [details, selectedService, selectedSpecialist, selectedDate, shop.branchId]);

  const datesList = useMemo(() => Array.from({ length: BOOKING_DAYS }, (_, offset) => {
    const id = riyadhDate(offset);
    const dateStr = new Date(`${id}T12:00:00+03:00`).toLocaleDateString(isAr ? "ar-SA" : "en-US", {
      weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Riyadh"
    });
    return { id, label: offset === 0 ? t.today : offset === 1 ? t.tomorrow : dateStr, dateStr };
  }), [locale]);

  // Estimate only; create_booking prices the visit (fees, VAT, deposit) on the server.
  const estimate = useMemo(() => {
    if (!selectedService || !details) return null;
    const price = selectedService.price;
    const vat = Math.round(price * VAT_RATE * 100) / 100;
    const total = Math.round((price + vat) * 100) / 100;
    const deposit = Math.round(total * details.depositPercentage) / 100;
    return { price, vat, total, deposit, balance: Math.round((total - deposit) * 100) / 100 };
  }, [selectedService, details]);

  const requireUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      Alert.alert(t.bookingFailed, t.signIn);
      return null;
    }
    return user;
  };

  const handleBookingConfirm = async () => {
    if (!selectedService || !selectedSpecialist || !selectedSlot || submitting) return;
    setSubmitting(true);
    try {
      if (!(await requireUser())) return;

      const { data: booking, error: bookingError } = await supabase.rpc("create_booking", {
        target_employee_id: selectedSpecialist === ANY_SPECIALIST ? null : selectedSpecialist,
        target_service_id: selectedService.id,
        target_scheduled_at: selectedSlot,
        request_branch_id: shop.branchId,
        request_client_profile_id: selectedProfileId,
        request_source: "marketplace",
      });
      if (bookingError || !booking?.id) {
        throw bookingError ?? new Error("Unable to reserve the selected time.");
      }

      if (booking.status === "confirmed") {
        Alert.alert(t.bookingConfirmed, t.bookingConfirmedText, [{ text: "OK", onPress: onClose }]);
        return;
      }

      const { data: checkout, error: checkoutError } = await supabase.functions.invoke("payment-checkout", {
        body: { bookingId: booking.id },
      });
      if (checkoutError || !checkout?.checkoutUrl) {
        Alert.alert(t.bookingFailed, t.paymentFailed);
        return;
      }
      await Linking.openURL(checkout.checkoutUrl);
      onClose();
    } catch (err) {
      Alert.alert(t.bookingFailed, err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handlePackagePurchase = async (pkg: ShopPackage) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (!(await requireUser())) return;
      const { data, error } = await supabase.rpc("purchase_service_package", { p_package_id: pkg.id, p_payment_method: "card" });
      if (error) throw error;
      const { data: checkout, error: checkoutError } = await supabase.functions.invoke("payment-checkout", {
        body: { purchaseType: "package", purchaseId: data.purchase_id },
      });
      if (checkoutError || !checkout?.checkoutUrl) throw new Error(t.packageFailed);
      await Linking.openURL(checkout.checkoutUrl);
      onClose();
    } catch (err) {
      Alert.alert(t.bookingFailed, err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  // Opens (or reuses) the single conversation between this customer and the provider.
  const handleMessageShop = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const user = await requireUser();
      if (!user) return;
      const { data: existing, error: findError } = await supabase
        .from("conversations").select("id").eq("customer_id", user.id).eq("provider_id", shop.providerId).maybeSingle();
      if (findError) throw findError;
      if (!existing) {
        const { error } = await supabase.from("conversations").insert({
          customer_id: user.id,
          provider_id: shop.providerId,
          subject: shop.name[locale],
        });
        if (error) throw error;
      }
      Alert.alert(t.messageShop, t.conversationReady);
    } catch (err) {
      Alert.alert(t.bookingFailed, err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleTabChange = (tab: "services" | "packages") => {
    setActiveTab(tab);
    setSelectedService(null);
    setSelectedSpecialist(null);
    setSelectedDate(null);
    setSelectedSlot(null);
  };

  const specialistOptions = details
    ? [{ id: ANY_SPECIALIST, name: { en: t.anySpecialist, ar: t.anySpecialist }, role: { en: "", ar: "" }, avatar: "" }, ...details.specialists]
    : [];

  return (
    <Modal animationType="slide" transparent={true} visible={true} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.sheetContainer}>

          {/* Header */}
          <View style={[styles.sheetHeader, isAr && styles.rtlRow]}>
            <View style={styles.titleContainer}>
              <Text style={[styles.sheetTitle, isAr && styles.rtlText]}>{shop.name[locale]}</Text>
              <Text style={[styles.sheetSub, isAr && styles.rtlText]}>
                {shop.rating !== null ? `★ ${shop.rating} (${shop.reviews} ${t.reviews})` : t.newShop}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>{t.close}</Text>
            </TouchableOpacity>
          </View>

          {!details && !detailsError && <ActivityIndicator color="hsl(45,60%,55%)" style={{ marginTop: 40 }} />}
          {detailsError !== "" && (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>{t.loadFailed}: {detailsError}</Text>
              <TouchableOpacity onPress={() => setReloadKey((k) => k + 1)} style={[styles.payBtn, { marginTop: 12 }]}>
                <Text style={styles.payBtnText}>{t.retry}</Text>
              </TouchableOpacity>
            </View>
          )}

          {details && (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {/* Cover Image & Description */}
            <View style={styles.coverContainer}>
              {details.coverImage !== "" && <Image source={{ uri: details.coverImage }} style={styles.coverImage as any} />}
              <View style={styles.descCard}>
                {details.description[locale] !== "" && (
                  <Text style={[styles.descText, isAr && styles.rtlText]}>{details.description[locale]}</Text>
                )}
                <Text style={[styles.addressText, isAr && styles.rtlText]}>
                  {details.address[locale] || [shop.district, shop.city].filter(Boolean).join(isAr ? "، " : ", ")}
                </Text>
                <TouchableOpacity onPress={handleMessageShop} disabled={submitting} style={[styles.closeBtn, { alignSelf: isAr ? "flex-end" : "flex-start" }]}>
                  <Text style={styles.closeBtnText}>{t.messageShop}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Tab Switcher */}
            <View style={[styles.tabContainer, isAr && styles.rtlRow]}>
              <TouchableOpacity
                onPress={() => handleTabChange("services")}
                style={[styles.tabButton, activeTab === "services" && styles.activeTabButton]}
              >
                <Text style={[styles.tabButtonText, activeTab === "services" && styles.activeTabButtonText]}>
                  {t.servicesHeading}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleTabChange("packages")}
                style={[styles.tabButton, activeTab === "packages" && styles.activeTabButton]}
              >
                <Text style={[styles.tabButtonText, activeTab === "packages" && styles.activeTabButtonText]}>
                  {t.packagesHeading}
                </Text>
              </TouchableOpacity>
            </View>

            {activeTab === "services" ? (
              <>
                {/* 1. SELECT SERVICE */}
                <Text style={[styles.sectionHeading, isAr && styles.rtlText]}>{t.servicesHeading}</Text>
                <View style={styles.servicesGrid}>
                  {details.services.map((srv) => (
                    <TouchableOpacity
                      key={srv.id}
                      onPress={() => {
                        setSelectedService(srv);
                        setSelectedSpecialist(null);
                        setSelectedSlot(null);
                      }}
                      style={[
                        styles.serviceCard,
                        selectedService?.id === srv.id && styles.selectedBorder,
                        isAr && styles.rtlRow
                      ]}
                    >
                      <View style={[styles.srvInfo, isAr && styles.rtlText]}>
                        <Text style={styles.srvName}>{srv.name[locale]}</Text>
                        <Text style={styles.srvSub}>
                          {srv.duration} {t.mins}{srv.category[locale] ? ` • ${srv.category[locale]}` : ""}
                        </Text>
                      </View>
                      <Text style={styles.srvPrice}>{formatSar(srv.price, locale)}</Text>
                    </TouchableOpacity>
                  ))}
                  {details.services.length === 0 && (
                    <View style={styles.emptyContainer}>
                      <Text style={styles.emptyText}>{t.noServices}</Text>
                    </View>
                  )}
                </View>

                {/* 2. SELECT SPECIALIST */}
                {selectedService && (
                  <>
                    <Text style={[styles.sectionHeading, isAr && styles.rtlText]}>{t.specialistsHeading}</Text>
                    {details.specialists.length === 0 ? (
                      <Text style={[styles.emptyText, { paddingVertical: 8 }]}>{t.noSpecialists}</Text>
                    ) : (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.horizontalList, isAr && styles.rtlRow]}>
                        {specialistOptions.map((spec) => (
                          <TouchableOpacity
                            key={spec.id}
                            onPress={() => {
                              setSelectedSpecialist(spec.id);
                              setSelectedSlot(null);
                            }}
                            style={[styles.specCard, selectedSpecialist === spec.id && styles.selectedSpecCard]}
                          >
                            {spec.avatar !== "" && <Image source={{ uri: spec.avatar }} style={styles.specAvatar as any} />}
                            <Text style={styles.specName}>{spec.name[locale]}</Text>
                            {spec.role[locale] !== "" && <Text style={styles.specRole}>{spec.role[locale]}</Text>}
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    )}
                  </>
                )}

                {/* 3. SELECT DATE */}
                {selectedService && selectedSpecialist && (
                  <>
                    <Text style={[styles.sectionHeading, isAr && styles.rtlText]}>{t.dateHeading}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.dateGrid, isAr && styles.rtlRow]}>
                      {datesList.map((dt) => (
                        <TouchableOpacity
                          key={dt.id}
                          onPress={() => {
                            setSelectedDate(dt.id);
                            setSelectedSlot(null);
                          }}
                          style={[styles.dateChip, selectedDate === dt.id && styles.activeDateChip]}
                        >
                          <Text style={[styles.dateLabel, selectedDate === dt.id && styles.activeDateText]}>{dt.label}</Text>
                          <Text style={[styles.dateSub, selectedDate === dt.id && styles.activeDateSub]}>{dt.dateStr}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </>
                )}

                {/* 4. SELECT TIME */}
                {selectedService && selectedSpecialist && selectedDate && (
                  <>
                    <View style={[styles.row, isAr && styles.rtlRow, styles.timeHeader]}>
                      <Text style={styles.sectionHeadingCompact}>{t.slotsHeading}</Text>
                      <Text style={styles.prayerMsg}>{t.prayerBufferMsg}</Text>
                    </View>
                    {slotsLoading && <ActivityIndicator color="hsl(45,60%,55%)" />}
                    {!slotsLoading && slotsError !== "" && (
                      <Text style={[styles.emptyText, { paddingVertical: 8 }]}>{t.slotsFailed}: {slotsError}</Text>
                    )}
                    {!slotsLoading && slotsError === "" && slots.length === 0 && (
                      <Text style={[styles.emptyText, { paddingVertical: 8 }]}>{t.noSlots}</Text>
                    )}
                    {!slotsLoading && slots.length > 0 && (
                      <View style={styles.slotGrid}>
                        {slots.map((slot) => (
                          <TouchableOpacity
                            key={slot}
                            onPress={() => setSelectedSlot(slot)}
                            style={[styles.slotChip, selectedSlot === slot && styles.slotSelected]}
                          >
                            <Text style={[styles.slotText, selectedSlot === slot && styles.slotTextSelected]}>{formatSlotLabel(slot, locale)}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </>
                )}

                {/* 5. SUMMARY & CONFIRM */}
                {selectedService && selectedSpecialist && selectedDate && selectedSlot && estimate && (
                  <>
                    {clientProfiles.length > 1 && (
                      <>
                        <Text style={[styles.sectionHeadingCompact, { marginTop: 12 }, isAr && styles.rtlText]}>{t.forWhom}</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.horizontalList, isAr && styles.rtlRow, { marginTop: 8, marginBottom: 12 }]}>
                          {clientProfiles.map((p) => (
                            <TouchableOpacity
                              key={p.id ?? "self"}
                              onPress={() => setSelectedProfileId(p.id)}
                              style={[styles.profileChip, selectedProfileId === p.id && styles.profileChipSelected]}
                            >
                              <Text style={[styles.profileChipText, selectedProfileId === p.id && styles.profileChipTextSelected]}>
                                {p.name}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </>
                    )}

                    <Text style={[styles.sectionHeading, isAr && styles.rtlText]}>{t.pricingHeading}</Text>
                    <View style={styles.breakdownCard}>
                      {[
                        [t.servicePrice, estimate.price],
                        [t.vat, estimate.vat],
                        [t.total, estimate.total],
                        [t.depositNow, estimate.deposit],
                        [t.venueBalance, estimate.balance],
                      ].map(([label, value]) => (
                        <View key={label as string} style={[styles.row, isAr && styles.rtlRow]}>
                          <Text style={styles.rowLabel}>{label}</Text>
                          <Text style={styles.rowVal}>{formatSar(value as number, locale)}</Text>
                        </View>
                      ))}
                      <Text style={[styles.addressText, isAr && styles.rtlText]}>{t.estimateNote}</Text>
                    </View>

                    <Text style={[styles.sectionHeadingCompact, { marginTop: 12 }, isAr && styles.rtlText]}>{t.policyHeading}</Text>
                    <Text style={[styles.descText, isAr && styles.rtlText]}>
                      {t.policy(details.freeCancellationHours, details.lateCancellationFeePercent, details.noShowFeePercent)}
                    </Text>

                    <TouchableOpacity onPress={handleBookingConfirm} disabled={submitting} style={[styles.payBtn, submitting && { opacity: 0.6 }]}>
                      {submitting
                        ? <ActivityIndicator color="hsl(220,15%,8%)" />
                        : <Text style={styles.payBtnText}>{estimate.deposit > 0 ? t.payBtn : t.confirmBtn}</Text>}
                    </TouchableOpacity>
                  </>
                )}
              </>
            ) : (
              <>
                {/* PACKAGES VIEW */}
                <Text style={[styles.sectionHeading, isAr && styles.rtlText]}>{t.packagesHeading}</Text>

                <View style={styles.packagesGrid}>
                  {details.packages.map((pkg) => (
                    <View key={pkg.id} style={[styles.packageCard, isAr && styles.rtlRow]}>
                      <View style={styles.packageInfo}>
                        <Text style={[styles.packageName, isAr && styles.rtlText]}>{pkg.name[locale]}</Text>
                        {pkg.description[locale] !== "" && (
                          <Text style={[styles.packageDesc, isAr && styles.rtlText]}>{pkg.description[locale]}</Text>
                        )}
                        <View style={[styles.packageBadges, isAr && styles.rtlRow]}>
                          <View style={styles.packageBadgeSessions}>
                            <Text style={styles.packageBadgeSessionsText}>{pkg.sessionCount} {t.sessions}</Text>
                          </View>
                          <View style={styles.packageBadgeExpiry}>
                            <Text style={styles.packageBadgeExpiryText}>{t.validity} {pkg.expiresInDays} {t.days}</Text>
                          </View>
                        </View>
                      </View>

                      <View style={styles.packageAction}>
                        <Text style={styles.packagePrice}>{formatSar(pkg.price, locale)}</Text>
                        <TouchableOpacity onPress={() => handlePackagePurchase(pkg)} disabled={submitting} style={styles.packageBuyBtn}>
                          <Text style={styles.packageBuyBtnText}>{t.buy}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                  {details.packages.length === 0 && (
                    <View style={styles.emptyContainer}>
                      <Text style={styles.emptyText}>{t.noPackages}</Text>
                    </View>
                  )}
                </View>
              </>
            )}

            {/* Customer Reviews (published only) */}
            <View style={styles.reviewsSection}>
              <Text style={[styles.sectionHeading, isAr && styles.rtlText, { marginBottom: 10 }]}>{t.reviewsHeading}</Text>
              <View style={styles.reviewsList}>
                {details.reviews.map((rev) => (
                  <View key={rev.id} style={styles.reviewCard}>
                    <View style={[styles.reviewCardTop, isAr && styles.rtlRow]}>
                      <Text style={styles.reviewCardName}>{rev.authorName}</Text>
                      <Text style={styles.reviewCardDate}>
                        {new Date(rev.createdAt).toLocaleDateString(isAr ? "ar-SA" : "en-US", { timeZone: "Asia/Riyadh" })}
                      </Text>
                    </View>
                    <View style={[styles.reviewStars, isAr && styles.rtlRow]}>
                      {Array.from({ length: Math.round(rev.rating) }).map((_, sIdx) => (
                        <Text key={sIdx} style={styles.starText}>★</Text>
                      ))}
                    </View>
                    {rev.comment !== "" && <Text style={[styles.reviewCardText, isAr && styles.rtlText]}>{rev.comment}</Text>}
                    {rev.reply !== "" && (
                      <Text style={[styles.reviewCardText, isAr && styles.rtlText, { opacity: 0.8 }]}>{t.ownerReply}: {rev.reply}</Text>
                    )}
                  </View>
                ))}
                {details.reviews.length === 0 && (
                  <Text style={[styles.emptyText, { paddingVertical: 12 }]}>{t.noReviews}</Text>
                )}
              </View>
            </View>

            <View style={styles.bottomSpacer} />
          </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles: any = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end"
  },
  sheetContainer: {
    backgroundColor: "hsl(220,15%,8%)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: height * 0.9,
    paddingHorizontal: 20,
    paddingTop: 20,
    borderWidth: 1,
    borderColor: "hsla(0,0%,100%,0.08)"
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "hsla(0,0%,100%,0.05)",
    width: "100%"
  },
  rtlRow: {
    flexDirection: "row-reverse"
  },
  titleContainer: {
    flex: 1
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "hsl(0,0%,98%)"
  },
  sheetSub: {
    fontSize: 11,
    color: "hsl(45,60%,55%)",
    marginTop: 2,
    fontWeight: "600"
  },
  closeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "hsla(0,0%,100%,0.04)"
  },
  closeBtnText: {
    color: "hsl(210,8%,65%)",
    fontSize: 12,
    fontWeight: "bold"
  },
  scrollContent: {
    paddingTop: 16
  },
  coverContainer: {
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "hsl(220,12%,14%)",
    borderWidth: 1,
    borderColor: "hsla(0,0%,100%,0.05)",
    marginBottom: 20
  },
  coverImage: {
    width: "100%",
    height: 140
  },
  descCard: {
    padding: 14,
    gap: 8
  },
  descText: {
    fontSize: 12,
    color: "hsl(210,8%,65%)",
    lineHeight: 16,
    textAlign: "left"
  },
  addressText: {
    fontSize: 10,
    color: "hsl(210,8%,45%)",
    textAlign: "left"
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: "bold",
    color: "hsl(45,60%,55%)",
    marginBottom: 12,
    marginTop: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    textAlign: "left"
  },
  sectionHeadingCompact: {
    fontSize: 13,
    fontWeight: "bold",
    color: "hsl(45,60%,55%)",
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  rtlText: {
    textAlign: "right"
  },
  servicesGrid: {
    gap: 8,
    marginBottom: 20
  },
  serviceCard: {
    backgroundColor: "hsla(0,0%,100%,0.02)",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "hsla(0,0%,100%,0.04)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  selectedBorder: {
    borderColor: "hsl(45,60%,55%)",
    backgroundColor: "hsla(45,60%,55%,0.04)"
  },
  srvInfo: {
    flex: 1,
    gap: 4
  },
  srvName: {
    fontSize: 13,
    fontWeight: "700",
    color: "hsl(0,0%,98%)"
  },
  srvSub: {
    fontSize: 10,
    color: "hsl(210,8%,55%)"
  },
  srvPrice: {
    fontSize: 13,
    fontWeight: "800",
    color: "hsl(0,0%,98%)"
  },
  horizontalList: {
    gap: 10,
    paddingBottom: 4,
    marginBottom: 20
  },
  specCard: {
    width: 100,
    backgroundColor: "hsla(0,0%,100%,0.02)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "hsla(0,0%,100%,0.04)",
    padding: 10,
    alignItems: "center",
    gap: 4
  },
  selectedSpecCard: {
    borderColor: "hsl(45,60%,55%)",
    backgroundColor: "hsla(45,60%,55%,0.04)"
  },
  specAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "hsla(0,0%,100%,0.1)"
  },
  specName: {
    fontSize: 11,
    fontWeight: "700",
    color: "hsl(0,0%,98%)",
    textAlign: "center"
  },
  specRole: {
    fontSize: 9,
    color: "hsl(210,8%,55%)",
    textAlign: "center"
  },
  dateGrid: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 20
  },
  dateChip: {
    flex: 1,
    backgroundColor: "hsla(0,0%,100%,0.02)",
    borderWidth: 1,
    borderColor: "hsla(0,0%,100%,0.04)",
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: "center",
    gap: 2
  },
  activeDateChip: {
    backgroundColor: "hsl(45,60%,55%)",
    borderColor: "hsl(45,60%,55%)"
  },
  dateLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "hsl(210,8%,65%)"
  },
  dateSub: {
    fontSize: 11,
    fontWeight: "800",
    color: "hsl(0,0%,98%)"
  },
  activeDateText: {
    color: "hsl(220,15%,8%)"
  },
  activeDateSub: {
    color: "hsl(220,15%,8%)"
  },
  timeHeader: {
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10
  },
  prayerMsg: {
    fontSize: 9,
    color: "hsl(0,80%,60%)",
    fontWeight: "600"
  },
  slotGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 20
  },
  slotChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "hsla(0,0%,100%,0.02)",
    borderWidth: 1,
    borderColor: "hsla(0,0%,100%,0.04)"
  },
  slotSelected: {
    backgroundColor: "hsl(45,60%,55%)",
    borderColor: "hsl(45,60%,55%)"
  },
  slotText: {
    color: "hsl(210,8%,65%)",
    fontSize: 11,
    fontWeight: "700"
  },
  slotTextSelected: {
    color: "hsl(220,15%,8%)"
  },
  breakdownCard: {
    backgroundColor: "hsla(0,0%,100%,0.02)",
    borderWidth: 1,
    borderColor: "hsla(0,0%,100%,0.04)",
    borderRadius: 14,
    padding: 16,
    gap: 8,
    marginBottom: 20
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  rowLabel: {
    color: "hsl(210,8%,65%)",
    fontSize: 12
  },
  rowVal: {
    color: "hsl(0,0%,98%)",
    fontSize: 12,
    fontWeight: "600"
  },
  divider: {
    height: 1,
    backgroundColor: "hsla(0,0%,100%,0.08)",
    marginVertical: 4
  },
  rowLabelTotal: {
    color: "hsl(0,0%,98%)",
    fontSize: 13,
    fontWeight: "bold"
  },
  rowValTotal: {
    color: "hsl(45,60%,55%)",
    fontSize: 14,
    fontWeight: "bold"
  },
  payBtn: {
    backgroundColor: "hsl(45,60%,55%)",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20
  },
  payBtnText: {
    color: "hsl(220,15%,8%)",
    fontWeight: "800",
    fontSize: 13,
    letterSpacing: 0.5
  },
  bottomSpacer: {
    height: 40
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "hsla(0,0%,100%,0.02)",
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "hsla(0,0%,100%,0.04)"
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 8
  },
  activeTabButton: {
    backgroundColor: "hsla(45,60%,55%,0.08)"
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: "bold",
    color: "hsl(210,8%,65%)"
  },
  activeTabButtonText: {
    color: "hsl(45,60%,55%)"
  },
  packagesGrid: {
    gap: 12,
    marginBottom: 20
  },
  packageCard: {
    backgroundColor: "hsla(0,0%,100%,0.02)",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "hsla(0,0%,100%,0.04)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12
  },
  packageInfo: {
    flex: 1,
    gap: 6
  },
  packageName: {
    fontSize: 13,
    fontWeight: "bold",
    color: "hsl(0,0%,98%)"
  },
  packageDesc: {
    fontSize: 10,
    color: "hsl(210,8%,55%)",
    lineHeight: 14
  },
  packageBadges: {
    flexDirection: "row",
    gap: 6,
    marginTop: 4
  },
  packageBadgeSessions: {
    backgroundColor: "hsla(45,60%,55%,0.15)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  packageBadgeSessionsText: {
    fontSize: 9,
    fontWeight: "bold",
    color: "hsl(45,60%,55%)"
  },
  packageBadgeExpiry: {
    backgroundColor: "hsla(0,0%,100%,0.06)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  packageBadgeExpiryText: {
    fontSize: 9,
    fontWeight: "bold",
    color: "hsl(210,8%,65%)"
  },
  packageAction: {
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 8
  },
  packagePrice: {
    fontSize: 14,
    fontWeight: "800",
    color: "hsl(0,0%,98%)"
  },
  packageBuyBtn: {
    backgroundColor: "hsl(45,60%,55%)",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8
  },
  packageBuyBtnText: {
    color: "hsl(220,15%,8%)",
    fontSize: 11,
    fontWeight: "800"
  },
  emptyContainer: {
    paddingVertical: 30,
    alignItems: "center"
  },
  emptyText: {
    fontSize: 12,
    color: "hsl(210,8%,45%)",
    fontStyle: "italic"
  },
  payMethodContainer: {
    flexDirection: "row",
    gap: 8,
    marginVertical: 10,
  },
  payMethodBtn: {
    flex: 1,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "hsla(0,0%,100%,0.08)",
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "hsla(0,0%,100%,0.02)",
  },
  payMethodBtnActive: {
    borderColor: "hsl(45,60%,55%)",
    backgroundColor: "hsla(45,60%,55%,0.05)",
  },
  payMethodText: {
    fontSize: 12,
    fontWeight: "bold",
    color: "hsl(210,8%,65%)",
  },
  payMethodTextActive: {
    color: "hsl(45,60%,55%)",
  },
  cardForm: {
    gap: 12,
    backgroundColor: "hsla(0,0%,100%,0.01)",
    borderWidth: 1,
    borderColor: "hsla(0,0%,100%,0.04)",
    borderRadius: 16,
    padding: 14,
    marginVertical: 12,
  },
  inputGroup: {
    gap: 4,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: "bold",
    color: "hsl(210,8%,55%)",
    textTransform: "uppercase",
  },
  textInput: {
    backgroundColor: "hsl(220,12%,14%)",
    borderWidth: 1,
    borderColor: "hsla(0,0%,100%,0.08)",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: "#ffffff",
    fontSize: 12,
  },
  profileChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "hsla(0,0%,100%,0.02)",
    borderWidth: 1,
    borderColor: "hsla(0,0%,100%,0.04)",
    marginRight: 8,
    alignItems: "center"
  },
  profileChipSelected: {
    backgroundColor: "hsl(45,60%,55%)",
    borderColor: "hsl(45,60%,55%)"
  },
  profileChipText: {
    color: "hsl(210,8%,65%)",
    fontSize: 11,
    fontWeight: "700"
  },
  profileChipTextSelected: {
    color: "hsl(220,15%,8%)"
  },
  reviewsSection: {
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: "hsla(0,0%,100%,0.05)",
    paddingTop: 16
  },
  highlightsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
    marginBottom: 16
  },
  highlightBadge: {
    backgroundColor: "hsla(0,0%,100%,0.03)",
    borderWidth: 1,
    borderColor: "hsla(0,0%,100%,0.05)",
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10
  },
  highlightBadgeText: {
    color: "hsl(45,60%,55%)",
    fontSize: 9,
    fontWeight: "bold"
  },
  reviewsList: {
    gap: 12
  },
  reviewCard: {
    backgroundColor: "hsla(0,0%,100%,0.02)",
    borderWidth: 1,
    borderColor: "hsla(0,0%,100%,0.04)",
    borderRadius: 14,
    padding: 14,
    gap: 6
  },
  reviewCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  reviewCardName: {
    color: "hsl(0,0%,98%)",
    fontSize: 11,
    fontWeight: "bold"
  },
  reviewCardDate: {
    color: "hsl(210,8%,45%)",
    fontSize: 9
  },
  reviewStars: {
    flexDirection: "row",
    gap: 2
  },
  starText: {
    color: "hsl(45,60%,55%)",
    fontSize: 10
  },
  reviewCardText: {
    color: "hsl(210,8%,75%)",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "300"
  }
});
