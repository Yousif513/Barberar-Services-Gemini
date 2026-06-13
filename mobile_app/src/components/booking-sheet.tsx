import React, { useState } from "react";
import { 
  StyleSheet, 
  View, 
  Text, 
  TouchableOpacity, 
  Modal, 
  ScrollView, 
  Alert 
} from "react-native";

export function BookingSheet({ 
  provider, 
  locale, 
  onClose 
}: { 
  provider: any, 
  locale: "en" | "ar", 
  onClose: () => void 
}) {
  const [selectedStylist, setSelectedStylist] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const isAr = locale === "ar";

  const t = {
    en: {
      selectStylist: "Select Service Provider",
      selectTime: "Select Time Slot",
      anyStaff: "Any Available Stylist",
      priceBreakdown: "Pricing Details",
      subtotal: "Service Price",
      travelFee: "Home Dispatch Fee",
      vat: "VAT (15%)",
      total: "Total Cost",
      deposit: "Deposit Required (20%)",
      confirmPay: "Pay Deposit via Apple Pay",
      close: "Close"
    },
    ar: {
      selectStylist: "اختر مقدم الخدمة",
      selectTime: "اختر وقت الموعد",
      anyStaff: "أي مصفف متاح",
      priceBreakdown: "تفاصيل السعر",
      subtotal: "سعر الخدمة",
      travelFee: "رسوم الخدمة المنزلية",
      vat: "ضريبة القيمة المضافة (15%)",
      total: "المجموع الكلي",
      deposit: "العربون المطلوب (20%)",
      confirmPay: "دفع العربون بواسطة Apple Pay",
      close: "إغلاق"
    }
  }[locale];

  // Mock staff list
  const staffList = [
    { id: "s1", name: isAr ? "إيلينا (أخصائي شعر)" : "Elena (Senior)", rating: "4.9" },
    { id: "s2", name: isAr ? "طارق (مصفف شعر)" : "Tariq (Stylist)", rating: "4.7" },
    { id: "s3", name: isAr ? "علي (مصفف شعر)" : "Ali (Barber)", rating: "4.8" },
  ];

  // Mock available slots
  const slots = ["03:30 PM", "04:15 PM", "05:00 PM", "06:30 PM"];

  // Calculation parameters
  const basePriceVal = parseInt(provider.price.replace(" SAR", ""));
  const travelFeeVal = provider.eligibleForHome ? 15 : 0;
  const vatVal = Math.round((basePriceVal + travelFeeVal) * 0.15 * 100) / 100;
  const totalVal = basePriceVal + travelFeeVal + vatVal;
  const depositVal = Math.round(totalVal * 0.20 * 100) / 100;

  const handleBookingConfirm = () => {
    if (!selectedStylist || !selectedTime) {
      Alert.alert(
        isAr ? "تنبيه" : "Alert",
        isAr ? "يرجى اختيار مقدم الخدمة والوقت أولاً." : "Please select both a stylist and a time slot."
      );
      return;
    }

    Alert.alert(
      isAr ? "تم حجز الموعد بنجاح" : "Booking Confirmed",
      isAr 
        ? `تم حجز موعدك بنجاح في صالون ${provider.name}. رمز الدخول وتفاصيل الفاتورة ستصلك على الواتساب.` 
        : `Your appointment at ${provider.name} has been booked. Confirmation details have been sent via WhatsApp.`,
      [{ text: "OK", onPress: onClose }]
    );
  };

  return (
    <Modal animationType="slide" transparent={true} visible={true}>
      <View style={styles.modalOverlay}>
        <View style={styles.sheetContainer}>
          
          {/* Header */}
          <View style={[styles.sheetHeader, isAr && styles.rtlRow]}>
            <Text style={styles.sheetTitle}>{provider.name}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>{t.close}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* 1. SELECT STYLIST */}
            <Text style={[styles.sectionHeading, isAr && styles.rtlText]}>{t.selectStylist}</Text>
            <View style={styles.optionGrid}>
              {staffList.map((staff) => (
                <TouchableOpacity 
                  key={staff.id} 
                  onPress={() => setSelectedStylist(staff.id)}
                  style={[styles.optionCard, selectedStylist === staff.id && styles.optionSelected]}
                >
                  <Text style={styles.optionName}>{staff.name}</Text>
                  <Text style={styles.optionSub}>⭐ {staff.rating}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 2. SELECT TIME */}
            <Text style={[styles.sectionHeading, isAr && styles.rtlText]}>{t.selectTime}</Text>
            <View style={styles.slotGrid}>
              {slots.map((slot) => (
                <TouchableOpacity 
                  key={slot} 
                  onPress={() => setSelectedTime(slot)}
                  style={[styles.slotChip, selectedTime === slot && styles.slotSelected]}
                >
                  <Text style={[styles.slotText, selectedTime === slot && styles.slotTextSelected]}>{slot}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 3. PRICE BREAKDOWN */}
            <Text style={[styles.sectionHeading, isAr && styles.rtlText]}>{t.priceBreakdown}</Text>
            <View style={styles.breakdownCard}>
              <View style={[styles.row, isAr && styles.rtlRow]}>
                <Text style={styles.rowLabel}>{t.subtotal}</Text>
                <Text style={styles.rowVal}>{basePriceVal} SAR</Text>
              </View>
              {travelFeeVal > 0 && (
                <View style={[styles.row, isAr && styles.rtlRow]}>
                  <Text style={styles.rowLabel}>{t.travelFee}</Text>
                  <Text style={styles.rowVal}>{travelFeeVal} SAR</Text>
                </View>
              )}
              <View style={[styles.row, isAr && styles.rtlRow]}>
                <Text style={styles.rowLabel}>{t.vat}</Text>
                <Text style={styles.rowVal}>{vatVal} SAR</Text>
              </View>
              <View style={[styles.divider]} />
              <View style={[styles.row, isAr && styles.rtlRow]}>
                <Text style={styles.rowLabelTotal}>{t.total}</Text>
                <Text style={styles.rowValTotal}>{totalVal} SAR</Text>
              </View>
              <View style={[styles.row, styles.depositRow, isAr && styles.rtlRow]}>
                <Text style={styles.depositLabel}>{t.deposit}</Text>
                <Text style={styles.depositVal}>{depositVal} SAR</Text>
              </View>
            </View>

            {/* PAY BUTTON */}
            <TouchableOpacity onPress={handleBookingConfirm} style={styles.payBtn}>
              <Text style={styles.payBtnText}> {t.confirmPay}</Text>
            </TouchableOpacity>

          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end"
  },
  sheetContainer: {
    backgroundColor: "hsl(220,12%,14%)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
    padding: 24,
    borderWidth: 1,
    borderColor: "hsla(0,0%,100%,0.08)"
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "between",
    alignItems: "center",
    marginBottom: 24,
    width: "100%"
  },
  rtlRow: {
    flexDirection: "row-reverse"
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "hsl(0,0%,98%)"
  },
  closeBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8
  },
  closeBtnText: {
    color: "hsl(210,8%,65%)",
    fontSize: 14
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: "bold",
    color: "hsl(45,60%,55%)",
    marginBottom: 12,
    marginTop: 16,
    textAlign: "left"
  },
  rtlText: {
    textAlign: "right"
  },
  optionGrid: {
    gap: 8
  },
  optionCard: {
    backgroundColor: "hsla(0,0%,100%,0.03)",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "hsla(0,0%,100%,0.05)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  optionSelected: {
    borderColor: "hsl(45,60%,55%)",
    backgroundColor: "hsla(45,60%,55%,0.05)"
  },
  optionName: {
    color: "hsl(0,0%,98%)",
    fontWeight: "600",
    fontSize: 14
  },
  optionSub: {
    color: "hsl(210,8%,65%)",
    fontSize: 12
  },
  slotGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  slotChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: "hsla(0,0%,100%,0.03)",
    borderWidth: 1,
    borderColor: "hsla(0,0%,100%,0.05)"
  },
  slotSelected: {
    backgroundColor: "hsl(45,60%,55%)",
    borderColor: "hsl(45,60%,55%)"
  },
  slotText: {
    color: "hsl(210,8%,65%)",
    fontSize: 12,
    fontWeight: "bold"
  },
  slotTextSelected: {
    color: "hsl(220,15%,8%)"
  },
  breakdownCard: {
    backgroundColor: "hsla(0,0%,100%,0.02)",
    borderWidth: 1,
    borderColor: "hsla(0,0%,100%,0.05)",
    borderRadius: 12,
    padding: 16,
    gap: 8
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
    fontSize: 14,
    fontWeight: "bold"
  },
  rowValTotal: {
    color: "hsl(45,60%,55%)",
    fontSize: 16,
    fontWeight: "bold"
  },
  depositRow: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: "hsla(0,0%,100%,0.05)"
  },
  depositLabel: {
    color: "hsl(150,60%,40%)",
    fontSize: 12,
    fontWeight: "bold"
  },
  depositVal: {
    color: "hsl(150,60%,40%)",
    fontSize: 14,
    fontWeight: "bold"
  },
  payBtn: {
    backgroundColor: "hsl(0,0%,98%)",
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 12,
    marginTop: 24,
    marginBottom: 16
  },
  payBtnText: {
    color: "hsl(220,15%,8%)",
    fontWeight: "800",
    fontSize: 14
  }
});
