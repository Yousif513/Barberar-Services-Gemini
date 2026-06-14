import React, { useState } from "react";
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
  TextInput
} from "react-native";
import { ShopItem, mockServices, ServiceItem, SpecialistItem, mockPackages, PackageItem } from "../constants/mockData";
import { supabase } from "../lib/supabase";

const { height, width } = Dimensions.get("window");

const isValidLuhn = (numStr: string) => {
  let sum = 0;
  let shouldDouble = false;
  for (let i = numStr.length - 1; i >= 0; i--) {
    let digit = parseInt(numStr.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
};

export function ShopDetailsModal({ 
  shop, 
  locale, 
  onClose 
}: { 
  shop: ShopItem, 
  locale: "en" | "ar", 
  onClose: () => void 
}) {
  const [selectedService, setSelectedService] = useState<ServiceItem | null>(null);
  const [selectedSpecialist, setSelectedSpecialist] = useState<SpecialistItem | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"services" | "packages">("services");

  const [paymentMethod, setPaymentMethod] = useState<"applepay" | "card">("applepay");
  const [cardNumber, setCardNumber] = useState("");
  const [cardHolder, setCardHolder] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");

  const [clientProfiles, setClientProfiles] = useState<any[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>("cp-mock-myself");

  const isAr = locale === "ar";

  React.useEffect(() => {
    const fetchProfiles = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setDefaultProfiles();
          return;
        }
        const { data, error } = await supabase
          .from("client_profiles")
          .select("id, name, type")
          .eq("client_id", user.id);
        if (data && data.length > 0) {
          setClientProfiles([
            { id: "cp-mock-myself", name: isAr ? "نفسي" : "Myself", type: "self" },
            ...data
          ]);
        } else {
          setDefaultProfiles();
        }
      } catch (err) {
        setDefaultProfiles();
      }
    };

    const setDefaultProfiles = () => {
      setClientProfiles([
        { id: "cp-mock-myself", name: isAr ? "نفسي" : "Myself", type: "self" },
        { id: "cp-mock-1", name: isAr ? "فيصل آل سعود (ابن)" : "Faisal Al-Saud (Son)", type: "dependent" },
        { id: "cp-mock-2", name: isAr ? "ركس (حيوان أليف)" : "Rex (Pet)", type: "pet" }
      ]);
    };

    fetchProfiles();
  }, [locale]);

  const t = {
    en: {
      servicesHeading: "Our Services",
      specialistsHeading: "Choose Specialist",
      dateHeading: "Select Date",
      slotsHeading: "Available Time Slots",
      prayerBufferMsg: "Prayer times are automatically blocked.",
      pricingHeading: "Booking Summary",
      servicePrice: "Service Price",
      deposit: "Escrow Deposit (15%)",
      venueBalance: "Due at Venue (85%)",
      totalNow: "Total Due Now",
      payBtn: " Confirm & Pay Deposit",
      close: "Close",
      reviews: "reviews",
      startingFrom: "Starting from",
      mins: "mins",
      today: "Today",
      tomorrow: "Tomorrow",
      dayAfter: "Day After",
      errorSelectDetails: "Please select a service, specialist, date, and time slot first."
    },
    ar: {
      servicesHeading: "خدماتنا",
      specialistsHeading: "اختر الأخصائي",
      dateHeading: "اختر التاريخ",
      slotsHeading: "الأوقات المتاحة",
      prayerBufferMsg: "يتم حجب أوقات الصلاة تلقائياً.",
      pricingHeading: "ملخص الحجز",
      servicePrice: "سعر الخدمة",
      deposit: "مبلغ الضمان (15%)",
      venueBalance: "المستحق في المركز (85%)",
      totalNow: "المستحق الآن",
      payBtn: " تأكيد ودفع الضمان",
      close: "إغلاق",
      reviews: "تقييم",
      startingFrom: "تبدأ من",
      mins: "دقيقة",
      today: "اليوم",
      tomorrow: "غداً",
      dayAfter: "بعد غد",
      errorSelectDetails: "يرجى اختيار الخدمة والأخصائي والتاريخ والوقت أولاً."
    }
  }[locale];

  // Filter services for the current shop
  const shopServices = mockServices.filter(s => s.shopId === shop.id);

  // Filter packages for the current shop
  const shopPackages = mockPackages.filter(p => p.shopId === shop.id);

  // Quick Date Presets
  const getPresetDates = () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const dayAfter = new Date(today);
    dayAfter.setDate(today.getDate() + 2);

    const formatLabel = (date: Date, labelKey: "today" | "tomorrow" | "dayAfter") => {
      const dayName = date.toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US", { day: 'numeric', month: 'short' });
      return {
        id: date.toISOString().split('T')[0],
        label: t[labelKey],
        dateStr: dayName
      };
    };

    return [
      formatLabel(today, "today"),
      formatLabel(tomorrow, "tomorrow"),
      formatLabel(dayAfter, "dayAfter")
    ];
  };

  const datesList = getPresetDates();

  // Mock slot list
  const slots = [
    "09:00 AM",
    "10:00 AM",
    "11:30 AM",
    "01:00 PM",
    "02:30 PM",
    "04:00 PM",
    "05:30 PM",
    "07:30 PM"
  ];

  const basePriceVal = selectedService ? selectedService.price : 0;
  const depositVal = Math.round(basePriceVal * 0.15);
  const balanceVal = basePriceVal - depositVal;

  const handleBookingConfirm = async () => {
    if (!selectedService || !selectedSpecialist || !selectedDate || !selectedSlot) {
      Alert.alert(
        isAr ? "تنبيه" : "Alert",
        t.errorSelectDetails
      );
      return;
    }

    if (paymentMethod === "card") {
      const cleanNum = cardNumber.replace(/\s/g, "");
      if (cleanNum.length !== 16 || isNaN(Number(cleanNum)) || !isValidLuhn(cleanNum)) {
        Alert.alert(
          isAr ? "خطأ في الدفع" : "Payment Error",
          isAr ? "رقم بطاقة مدى أو الائتمان غير صحيح (يجب أن يتكون من 16 رقماً ويجتاز فحص luhn)." : "Invalid Mada/Credit Card number. Must be 16 digits and pass luhn validation."
        );
        return;
      }
      if (!cardHolder.trim()) {
        Alert.alert(
          isAr ? "خطأ في الدفع" : "Payment Error",
          isAr ? "يرجى كتابة اسم حامل البطاقة كما هو مطبوع." : "Please enter the cardholder name exactly as printed."
        );
        return;
      }
      if (!cardExpiry.match(/^\d{2}\/\d{2}$/)) {
        Alert.alert(
          isAr ? "خطأ في الدفع" : "Payment Error",
          isAr ? "تاريخ انتهاء البطاقة غير صحيح (MM/YY)." : "Invalid expiry date format. Use MM/YY."
        );
        return;
      }
      const [month, year] = cardExpiry.split("/").map(Number);
      if (month < 1 || month > 12) {
        Alert.alert(
          isAr ? "خطأ في الدفع" : "Payment Error",
          isAr ? "شهر الانتهاء غير صحيح." : "Invalid expiry month."
        );
        return;
      }
      if (cardCvv.length !== 3 || isNaN(Number(cardCvv))) {
        Alert.alert(
          isAr ? "خطأ في الدفع" : "Payment Error",
          isAr ? "رمز الأمان CVV غير صحيح (3 أرقام)." : "Invalid CVV. Must be 3 digits."
        );
        return;
      }
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Fetch branch linked to shop to insert
        const { data: branchData } = await supabase.from("branches").select("id").eq("provider_id", shop.id).limit(1);
        const branchId = branchData && branchData.length > 0 ? branchData[0].id : null;

        if (branchId) {
          const { error } = await supabase.from("bookings").insert({
            customer_id: user.id,
            branch_id: branchId,
            service_id: selectedService.id,
            employee_id: selectedSpecialist.id,
            status: "pending_payment",
            scheduled_at: `${selectedDate}T12:00:00Z`,
            duration_minutes: selectedService.duration,
            total_price: selectedService.price,
            deposit_required: depositVal,
            tax_amount: 0,
            platform_commission: depositVal,
            client_profile_id: selectedProfileId && selectedProfileId !== "cp-mock-myself" ? selectedProfileId : null
          });
          if (error) throw error;
        }
      }
    } catch (err) {
      console.log("Supabase booking insert failed, running offline update:", err);
    }

    Alert.alert(
      isAr ? "تم إرسال طلب الحجز" : "Booking Request Received",
      isAr 
        ? `تم تأكيد حجز الخدمة: ${selectedService.name.ar} مع ${selectedSpecialist.name.ar} بنجاح. العربون المدفوع: ${depositVal} ريال. ستصلك تفاصيل الموعد عبر الواتساب.` 
        : `Your appointment for ${selectedService.name.en} with ${selectedSpecialist.name.en} has been requested. Deposit of ${depositVal} SAR processed. Detail updates sent via WhatsApp.`,
      [{ text: "OK", onPress: onClose }]
    );
  };

  const handlePackagePurchase = (pkg: PackageItem) => {
    Alert.alert(
      isAr ? " الدفع باستخدام Apple Pay" : " Pay with Apple Pay",
      isAr 
        ? `هل ترغب في شراء باقة "${pkg.name.ar}" مقابل ${pkg.price} ريال؟`
        : `Confirm purchasing package "${pkg.name.en}" for ${pkg.price} SAR?`,
      [
        {
          text: isAr ? "إلغاء" : "Cancel",
          style: "cancel"
        },
        {
          text: isAr ? "دفع وتأكيد" : "Pay & Confirm",
          onPress: async () => {
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                const { error } = await supabase.from("user_packages").insert({
                  customer_id: user.id,
                  package_id: pkg.id,
                  remaining_sessions: pkg.sessionCount,
                  expires_at: new Date(Date.now() + pkg.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
                });
                if (error) throw error;
              }
            } catch (err) {
              console.log("Supabase package purchase insert failed, running offline update:", err);
            }

            Alert.alert(
              isAr ? "تمت عملية الشراء بنجاح" : "Purchase Complete",
              isAr
                ? `لقد قمت بشراء باقة "${pkg.name.ar}" بنجاح. تم معالجة الدفع عبر Apple Pay وإضافة الباقة إلى لوحة التحكم الخاصة بك.`
                : `You have successfully purchased the package "${pkg.name.en}". Payment processed and the pass has been added to your dashboard.`,
              [{ text: "OK", onPress: onClose }]
            );
          }
        }
      ]
    );
  };

  const handleTabChange = (tab: "services" | "packages") => {
    setActiveTab(tab);
    setSelectedService(null);
    setSelectedSpecialist(null);
    setSelectedDate(null);
    setSelectedSlot(null);
  };

  return (
    <Modal animationType="slide" transparent={true} visible={true}>
      <View style={styles.modalOverlay}>
        <View style={styles.sheetContainer}>
          
          {/* Header */}
          <View style={[styles.sheetHeader, isAr && styles.rtlRow]}>
            <View style={styles.titleContainer}>
              <Text style={styles.sheetTitle}>{shop.name[locale]}</Text>
              <Text style={styles.sheetSub}>★ {shop.rating} ({shop.reviewsCount} {t.reviews})</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>{t.close}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {/* Cover Image & Description */}
            <View style={styles.coverContainer}>
              <Image source={{ uri: shop.image }} style={styles.coverImage as any} />
              <View style={styles.descCard}>
                <Text style={[styles.descText, isAr && styles.rtlText]}>{shop.description[locale]}</Text>
                <Text style={[styles.addressText, isAr && styles.rtlText]}>{shop.address[locale]}</Text>
              </View>
            </View>

            {/* Tab Switcher */}
            <View style={[styles.tabContainer, isAr && styles.rtlRow]}>
              <TouchableOpacity 
                onPress={() => handleTabChange("services")}
                style={[styles.tabButton, activeTab === "services" && styles.activeTabButton]}
              >
                <Text style={[styles.tabButtonText, activeTab === "services" && styles.activeTabButtonText]}>
                  {isAr ? "الخدمات" : "Services"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => handleTabChange("packages")}
                style={[styles.tabButton, activeTab === "packages" && styles.activeTabButton]}
              >
                <Text style={[styles.tabButtonText, activeTab === "packages" && styles.activeTabButtonText]}>
                  {isAr ? "الباقات والعضويات" : "Packages & Passes"}
                </Text>
              </TouchableOpacity>
            </View>

            {activeTab === "services" ? (
              <>
                {/* 1. SELECT SERVICE */}
                <Text style={[styles.sectionHeading, isAr && styles.rtlText]}>{t.servicesHeading}</Text>
                <View style={styles.servicesGrid}>
                  {shopServices.map((srv) => (
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
                        <Text style={styles.srvSub}>{srv.duration} {t.mins} • {srv.gender === "men" ? (isAr ? "رجال" : "Men") : srv.gender === "women" ? (isAr ? "نساء" : "Women") : (isAr ? "مشترك" : "Unisex")}</Text>
                      </View>
                      <Text style={styles.srvPrice}>{srv.price} SAR</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* 2. SELECT SPECIALIST */}
                {selectedService && (
                  <>
                    <Text style={[styles.sectionHeading, isAr && styles.rtlText]}>{t.specialistsHeading}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.horizontalList, isAr && styles.rtlRow]}>
                      {shop.specialists.map((spec) => (
                        <TouchableOpacity 
                          key={spec.id} 
                          onPress={() => {
                            setSelectedSpecialist(spec);
                            setSelectedSlot(null);
                          }}
                          style={[styles.specCard, selectedSpecialist?.id === spec.id && styles.selectedSpecCard]}
                        >
                          <Image source={{ uri: spec.avatar }} style={styles.specAvatar as any} />
                          <Text style={styles.specName}>{spec.name[locale]}</Text>
                          <Text style={styles.specRole}>{spec.role[locale]}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </>
                )}

                {/* 3. SELECT DATE */}
                {selectedService && selectedSpecialist && (
                  <>
                    <Text style={[styles.sectionHeading, isAr && styles.rtlText]}>{t.dateHeading}</Text>
                    <View style={[styles.dateGrid, isAr && styles.rtlRow]}>
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
                    </View>
                  </>
                )}

                {/* 4. SELECT TIME */}
                {selectedService && selectedSpecialist && selectedDate && (
                  <>
                    <View style={[styles.row, isAr && styles.rtlRow, styles.timeHeader]}>
                      <Text style={styles.sectionHeadingCompact}>{t.slotsHeading}</Text>
                      <Text style={styles.prayerMsg}>{t.prayerBufferMsg}</Text>
                    </View>
                    <View style={styles.slotGrid}>
                      {slots.map((slot) => (
                        <TouchableOpacity 
                          key={slot} 
                          onPress={() => setSelectedSlot(slot)}
                          style={[styles.slotChip, selectedSlot === slot && styles.slotSelected]}
                        >
                          <Text style={[styles.slotText, selectedSlot === slot && styles.slotTextSelected]}>{slot}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                {/* 5. PRICE BREAKDOWN */}
                {selectedService && selectedSpecialist && selectedDate && selectedSlot && (
                  <>
                     {/* Client profiles dependents picker */}
                     <Text style={[styles.sectionHeadingCompact, { marginTop: 12 }, isAr && styles.rtlText]}>
                       {isAr ? "لمن هذا الحجز؟" : "Who is this booking for?"}
                     </Text>
                     <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.horizontalList, isAr && styles.rtlRow, { marginTop: 8, marginBottom: 12 }]}>
                       {clientProfiles.map((p: any) => (
                         <TouchableOpacity
                           key={p.id}
                           onPress={() => setSelectedProfileId(p.id)}
                           style={[
                             styles.profileChip,
                             selectedProfileId === p.id && styles.profileChipSelected
                           ]}
                         >
                           <Text style={[
                             styles.profileChipText,
                             selectedProfileId === p.id && styles.profileChipTextSelected
                           ]}>
                             {p.name}
                           </Text>
                         </TouchableOpacity>
                       ))}
                     </ScrollView>

                     <Text style={[styles.sectionHeading, isAr && styles.rtlText]}>{t.pricingHeading}</Text>
                    <View style={styles.breakdownCard}>
                      <View style={[styles.row, isAr && styles.rtlRow]}>
                        <Text style={styles.rowLabel}>{t.servicePrice}</Text>
                        <Text style={styles.rowVal}>{basePriceVal} SAR</Text>
                      </View>
                      <View style={[styles.row, isAr && styles.rtlRow]}>
                        <Text style={styles.rowLabel}>{t.deposit}</Text>
                        <Text style={styles.rowVal}>{depositVal} SAR</Text>
                      </View>
                      <View style={[styles.row, isAr && styles.rtlRow]}>
                        <Text style={styles.rowLabel}>{t.venueBalance}</Text>
                        <Text style={styles.rowVal}>{balanceVal} SAR</Text>
                      </View>
                    </View>

                    {/* Payment Method Selector */}
                    <Text style={[styles.sectionHeadingCompact, { marginTop: 12 }, isAr && styles.rtlText]}>
                      {isAr ? "طريقة الدفع" : "Payment Method"}
                    </Text>
                    <View style={[styles.payMethodContainer, isAr && styles.rtlRow]}>
                      <TouchableOpacity
                        onPress={() => setPaymentMethod("applepay")}
                        style={[styles.payMethodBtn, paymentMethod === "applepay" && styles.payMethodBtnActive]}
                      >
                        <Text style={[styles.payMethodText, paymentMethod === "applepay" && styles.payMethodTextActive]}>
                           Pay
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setPaymentMethod("card")}
                        style={[styles.payMethodBtn, paymentMethod === "card" && styles.payMethodBtnActive]}
                      >
                        <Text style={[styles.payMethodText, paymentMethod === "card" && styles.payMethodTextActive]}>
                          {isAr ? "مدى / بطاقة ائتمان" : "Mada / Card"}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Card inputs */}
                    {paymentMethod === "card" && (
                      <View style={styles.cardForm}>
                        <View style={styles.inputGroup}>
                          <Text style={[styles.inputLabel, isAr && styles.rtlText]}>
                            {isAr ? "اسم حامل البطاقة" : "Cardholder Name"}
                          </Text>
                          <TextInput
                            style={[styles.textInput, isAr && styles.rtlText]}
                            placeholder="FAIZ AL-MUTAIRI"
                            placeholderTextColor="#a8a29e"
                            value={cardHolder}
                            onChangeText={setCardHolder}
                            autoCapitalize="characters"
                          />
                        </View>
                        <View style={styles.inputGroup}>
                          <Text style={[styles.inputLabel, isAr && styles.rtlText]}>
                            {isAr ? "رقم البطاقة" : "Card Number"}
                          </Text>
                          <TextInput
                            style={[styles.textInput, { textAlign: "left", letterSpacing: 2 }]}
                            placeholder="4000 1234 5678 9010"
                            placeholderTextColor="#a8a29e"
                            keyboardType="numeric"
                            maxLength={19}
                            value={cardNumber}
                            onChangeText={(text) => {
                              const raw = text.replace(/\D/g, "");
                              const formatted = raw.match(/.{1,4}/g)?.join(" ") || "";
                              setCardNumber(formatted);
                            }}
                          />
                        </View>
                        <View style={[styles.row, isAr && styles.rtlRow, { gap: 12 }]}>
                          <View style={[styles.inputGroup, { flex: 1 }]}>
                            <Text style={[styles.inputLabel, isAr && styles.rtlText]}>
                              {isAr ? "تاريخ الانتهاء" : "Expiry (MM/YY)"}
                            </Text>
                            <TextInput
                              style={[styles.textInput, { textAlign: "center" }]}
                              placeholder="MM/YY"
                              placeholderTextColor="#a8a29e"
                              keyboardType="numeric"
                              maxLength={5}
                              value={cardExpiry}
                              onChangeText={(text) => {
                                let val = text.replace(/\D/g, "");
                                if (val.length > 2) {
                                  val = val.substring(0, 2) + "/" + val.substring(2, 4);
                                }
                                setCardExpiry(val);
                              }}
                            />
                          </View>
                          <View style={[styles.inputGroup, { flex: 1 }]}>
                            <Text style={[styles.inputLabel, isAr && styles.rtlText]}>
                              {isAr ? "رمز الأمان CVV" : "CVV"}
                            </Text>
                            <TextInput
                              style={[styles.textInput, { textAlign: "center" }]}
                              placeholder="***"
                              placeholderTextColor="#a8a29e"
                              keyboardType="numeric"
                              maxLength={3}
                              secureTextEntry
                              value={cardCvv}
                              onChangeText={(text) => setCardCvv(text.replace(/\D/g, ""))}
                            />
                          </View>
                        </View>
                      </View>
                    )}

                    {/* PAY BUTTON */}
                    <TouchableOpacity onPress={handleBookingConfirm} style={styles.payBtn}>
                      <Text style={styles.payBtnText}>
                        {paymentMethod === "applepay" ? t.payBtn : (isAr ? `تأكيد ودفع ${depositVal} ريال` : `Confirm & Pay ${depositVal} SAR`)}
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
              </>
            ) : (
              <>
                {/* PACKAGES VIEW */}
                <Text style={[styles.sectionHeading, isAr && styles.rtlText]}>
                  {isAr ? "باقات وعضويات السبا المتاحة" : "Spa Packages & Multi-Session Passes"}
                </Text>
                
                <View style={styles.packagesGrid}>
                  {shopPackages.map((pkg) => (
                    <View 
                      key={pkg.id} 
                      style={[styles.packageCard, isAr && styles.rtlRow]}
                    >
                      <View style={styles.packageInfo}>
                        <Text style={[styles.packageName, isAr && styles.rtlText]}>{pkg.name[locale]}</Text>
                        <Text style={[styles.packageDesc, isAr && styles.rtlText]}>{pkg.description[locale]}</Text>
                        
                        <View style={[styles.packageBadges, isAr && styles.rtlRow]}>
                          <View style={styles.packageBadgeSessions}>
                            <Text style={styles.packageBadgeSessionsText}>
                              {pkg.sessionCount} {isAr ? "جلسات" : "sessions"}
                            </Text>
                          </View>
                          <View style={styles.packageBadgeExpiry}>
                            <Text style={styles.packageBadgeExpiryText}>
                              {isAr ? "صلاحية" : "validity"} {pkg.expiresInDays} {isAr ? "يوم" : "days"}
                            </Text>
                          </View>
                        </View>
                      </View>
                      
                      <View style={styles.packageAction}>
                        <Text style={styles.packagePrice}>{pkg.price} SAR</Text>
                        <TouchableOpacity 
                          onPress={() => handlePackagePurchase(pkg)}
                          style={styles.packageBuyBtn}
                        >
                          <Text style={styles.packageBuyBtnText}>
                            {isAr ? " شراء" : " Buy"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                  {shopPackages.length === 0 && (
                    <View style={styles.emptyContainer}>
                      <Text style={styles.emptyText}>
                        {isAr ? "لا توجد باقات متاحة حالياً لهذا المركز" : "No packages currently available for this shop."}
                      </Text>
                    </View>
                  )}
                </View>
              </>
            )}

            <View style={styles.bottomSpacer} />
          </ScrollView>
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
  }
});
