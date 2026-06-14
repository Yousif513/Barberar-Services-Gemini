"use client";

import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Dimensions,
  Alert
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { Toast } from "../components/toast";

const { width } = Dimensions.get("window");

interface SavedCard {
  id: string;
  brand: "mada" | "visa" | "mastercard";
  last4: string;
  holder: string;
  expiry: string;
}

interface EscrowHolding {
  id: string;
  provider: { en: string; ar: string };
  amount: number;
  platformFee: number;
  providerPayout: number;
  status: "held" | "released" | "refunded";
  date: string;
}

export default function ProfileScreen() {
  const [lang, setLang] = useState<"en" | "ar">("ar");
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState<"success" | "info" | "error">("success");
  const [toastVisible, setToastVisible] = useState(false);

  const [showAddCard, setShowAddCard] = useState(false);
  const [newCardNumber, setNewCardNumber] = useState("");
  const [newCardHolder, setNewCardHolder] = useState("");
  const [newCardExpiry, setNewCardExpiry] = useState("");

  const [savedCards, setSavedCards] = useState<SavedCard[]>([
    {
      id: "c1",
      brand: "mada",
      last4: "4021",
      holder: "Faisal Al-Otaibi",
      expiry: "09/28"
    },
    {
      id: "c2",
      brand: "visa",
      last4: "9812",
      holder: "Faisal Al-Otaibi",
      expiry: "12/29"
    }
  ]);

  interface UserPackageItem {
    id: string;
    packageName: { en: string; ar: string };
    shopName: { en: string; ar: string };
    remainingSessions: number;
    expiresAt: string;
  }

  const [userPackages, setUserPackages] = useState<UserPackageItem[]>([
    {
      id: "up-1",
      packageName: { en: "Elite Hair & Beard Grooming Multi-Pass", ar: "بطاقة قص الشعر واللحية الممتازة" },
      shopName: { en: "Elite Grooming Lounge", ar: "صالون إيليت الرجالي" },
      remainingSessions: 10,
      expiresAt: "2026-12-14"
    },
    {
      id: "up-2",
      packageName: { en: "Moroccan Hammam Spa package", ar: "باقة الحمام المغربي الاسترخائي" },
      shopName: { en: "Riyadh Premium Spa & Wellness", ar: "سبا الرياض الفاخر للعناية" },
      remainingSessions: 5,
      expiresAt: "2027-06-14"
    }
  ]);

  const loadUserPackages = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from("user_packages")
          .select(`
            id,
            remaining_sessions,
            expires_at,
            packages (
              name_en,
              name_ar,
              providers (
                business_name_en,
                business_name_ar
              )
            )
          `)
          .eq("customer_id", user.id);
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          const formatted: UserPackageItem[] = data.map((item: any) => ({
            id: item.id,
            packageName: {
              en: item.packages?.name_en || "",
              ar: item.packages?.name_ar || ""
            },
            shopName: {
              en: item.packages?.providers?.business_name_en || "",
              ar: item.packages?.providers?.business_name_ar || ""
            },
            remainingSessions: item.remaining_sessions,
            expiresAt: item.expires_at ? item.expires_at.split("T")[0] : ""
          }));
          setUserPackages(formatted);
        }
      }
    } catch (err) {
      console.log("Supabase packages fetch failed, falling back to mock:", err);
    }
  };

  useEffect(() => {
    loadUserPackages();
  }, [lang]);

  const handleRedeemSession = async (pkgId: string) => {
    const pkg = userPackages.find(p => p.id === pkgId);
    if (!pkg || pkg.remainingSessions <= 0) return;

    const newSessions = pkg.remainingSessions - 1;

    try {
      const { error } = await supabase
        .from("user_packages")
        .update({ remaining_sessions: newSessions })
        .eq("id", pkgId);

      if (error) throw error;
    } catch (err) {
      console.log("Supabase update failed, running offline update:", err);
    }

    setUserPackages(prev =>
      prev.map(p => (p.id === pkgId ? { ...p, remainingSessions: newSessions } : p))
    );

    setToastMessage(`${t.redeemSuccessMsg} (${pkg.packageName[lang]})`);
    setToastType("success");
    setToastVisible(true);
  };

  const [escrowHoldings, setEscrowHoldings] = useState<EscrowHolding[]>([
    {
      id: "esc-100",
      provider: {
        en: "Elite Grooming Lounge",
        ar: "صالون إيليت الرجالي"
      },
      amount: 220,
      platformFee: 33, // 15%
      providerPayout: 187, // 85%
      status: "held",
      date: "2026-06-15"
    },
    {
      id: "esc-98",
      provider: {
        en: "Riyadh Premium Spa & Wellness",
        ar: "سبا الرياض الفاخر للعناية"
      },
      amount: 350,
      platformFee: 52.5,
      providerPayout: 297.5,
      status: "released",
      date: "2026-06-08"
    }
  ]);

  // Translations
  const t = {
    en: {
      profileTitle: "Client Profile",
      walletTitle: "Split Ledger Wallet",
      walletDesc: "Funds are securely routed via Tap Connect smart escrow.",
      balance: "Escrow Holdings",
      currency: "SAR",
      customerDetails: "Customer Information",
      nameLabel: "Full Name",
      phoneLabel: "Phone Number",
      emailLabel: "Email Address",
      savedCardsTitle: "Payment Cards",
      addCard: "Add Mada Card",
      close: "Close",
      save: "Save Card",
      cardPlaceholder: "Card Number (16 digits)",
      holderPlaceholder: "Holder Name",
      expiryPlaceholder: "MM/YY",
      escrowListTitle: "Escrow Split Status",
      totalCaptured: "Captured",
      providerShare: "Provider (85%)",
      platformShare: "Platform (15%)",
      statusHeld: "HELD IN ESCROW",
      statusReleased: "RELEASED TO MERCHANT",
      statusRefunded: "REFUNDED TO CLIENT",
      packagesTitle: "My Active Packages & Passes",
      sessionsLeft: "sessions left",
      expires: "Expires:",
      redeemBtn: "Redeem Session",
      fullyConsumed: "Fully Consumed",
      emptyPackages: "No active packages found.",
      redeemSuccessTitle: "Session Redeemed",
      redeemSuccessMsg: "You have successfully redeemed one session from your package."
    },
    ar: {
      profileTitle: "الملف الشخصي",
      walletTitle: "محفظة الحساب المشترك",
      walletDesc: "يتم توجيه الأموال بشكل آمن عبر نظام الضمان الذكي من Tap Connect.",
      balance: "حيازات الضمان المعلقة",
      currency: "ريال",
      customerDetails: "بيانات العميل",
      nameLabel: "الاسم الكامل",
      phoneLabel: "رقم الجوال",
      emailLabel: "البريد الإلكتروني",
      savedCardsTitle: "البطاقات المخزنة",
      addCard: "إضافة بطاقة مدى",
      close: "إغلاق",
      save: "حفظ البطاقة",
      cardPlaceholder: "رقم البطاقة (16 رقم)",
      holderPlaceholder: "اسم حامل البطاقة",
      expiryPlaceholder: "شهر / سنة",
      escrowListTitle: "حالة تقسيمات الضمان",
      totalCaptured: "المبلغ المقبوض",
      providerShare: "حصة المزود (85%)",
      platformShare: "حصة المنصة (15%)",
      statusHeld: "معلق في الضمان",
      statusReleased: "تم الإفراج للمزود",
      statusRefunded: "تمت الاستعادة للعميل",
      packagesTitle: "الباقات والعضويات الفعالة",
      sessionsLeft: "جلسات متبقية",
      expires: "ينتهي في:",
      redeemBtn: "استخدام جلسة",
      fullyConsumed: "مستهلكة بالكامل",
      emptyPackages: "لا توجد عضويات نشطة حالياً.",
      redeemSuccessTitle: "تم استخدام الجلسة بنجاح",
      redeemSuccessMsg: "لقد قمت باستخدام جلسة واحدة من باقتك الفعالة."
    }
  }[lang];

  const handleAddCard = () => {
    if (!newCardNumber.trim() || !newCardHolder.trim() || !newCardExpiry.trim()) return;

    const cleanNum = newCardNumber.replace(/\s?/g, "");
    const last4 = cleanNum.slice(-4) || "0000";

    const newCard: SavedCard = {
      id: `c-${Date.now()}`,
      brand: cleanNum.startsWith("4") ? "visa" : "mada",
      last4,
      holder: newCardHolder,
      expiry: newCardExpiry
    };

    setSavedCards(prev => [...prev, newCard]);
    setShowAddCard(false);
    setNewCardNumber("");
    setNewCardHolder("");
    setNewCardExpiry("");
  };

  const isRTL = lang === "ar";

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      {/* HEADER */}
      <View style={[styles.header, isRTL && styles.rtlRow]}>
        <View>
          <Text style={[styles.titleText, isRTL && styles.textRight]}>{t.profileTitle}</Text>
        </View>
        <TouchableOpacity style={styles.langBadge} onPress={() => setLang(l => (l === "en" ? "ar" : "en"))}>
          <Text style={styles.langText}>{lang === "en" ? "العربية" : "EN"}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* CLIENT INFO CARD */}
        <View style={styles.card}>
          <Text style={[styles.sectionTitle, isRTL && styles.textRight]}>{t.customerDetails}</Text>
          <View style={styles.cardDivider} />
          
          <View style={[styles.infoRow, isRTL && styles.rtlRow]}>
            <Text style={styles.infoLabel}>{t.nameLabel}</Text>
            <Text style={styles.infoValue}>فيصل العتيبي / Faisal Al-Otaibi</Text>
          </View>
          <View style={[styles.infoRow, isRTL && styles.rtlRow]}>
            <Text style={styles.infoLabel}>{t.phoneLabel}</Text>
            <Text style={styles.infoValue}>+966 50 123 4567</Text>
          </View>
          <View style={[styles.infoRow, isRTL && styles.rtlRow]}>
            <Text style={styles.infoLabel}>{t.emailLabel}</Text>
            <Text style={styles.infoValue}>faisal.otaibi@primora.sa</Text>
          </View>
        </View>

        {/* LEDGER SPLIT WALLET SECTION */}
        <View style={[styles.card, styles.walletCard]}>
          <Text style={[styles.sectionTitle, styles.textWhite, isRTL && styles.textRight]}>{t.walletTitle}</Text>
          <Text style={[styles.walletDesc, isRTL && styles.textRight]}>{t.walletDesc}</Text>
          
          <View style={styles.cardDividerLight} />
          
          <View style={[styles.balanceRow, isRTL && styles.rtlRow]}>
            <Text style={styles.balanceLabel}>{t.balance}</Text>
            <Text style={styles.balanceValue}>220.00 {t.currency}</Text>
          </View>
        </View>

        {/* ESCROW HOLDINGS LIST */}
        <View style={styles.card}>
          <Text style={[styles.sectionTitle, isRTL && styles.textRight]}>{t.escrowListTitle}</Text>
          <View style={styles.cardDivider} />

          {escrowHoldings.map((hold) => (
            <View key={hold.id} style={styles.holdRow}>
              <View style={[styles.holdHeader, isRTL && styles.rtlRow]}>
                <Text style={styles.holdProvider}>{hold.provider[lang]}</Text>
                <Text style={styles.holdDate}>{hold.date}</Text>
              </View>

              <View style={[styles.holdSplits, isRTL && styles.rtlRow]}>
                <View style={styles.splitCol}>
                  <Text style={styles.splitLabel}>{t.totalCaptured}</Text>
                  <Text style={styles.splitValue}>{hold.amount} {t.currency}</Text>
                </View>
                <View style={styles.splitCol}>
                  <Text style={styles.splitLabel}>{t.providerShare}</Text>
                  <Text style={styles.splitValue}>{hold.providerPayout} {t.currency}</Text>
                </View>
                <View style={styles.splitCol}>
                  <Text style={styles.splitLabel}>{t.platformShare}</Text>
                  <Text style={styles.splitValue}>{hold.platformFee} {t.currency}</Text>
                </View>
              </View>

              <View style={[
                styles.holdStatusContainer,
                isRTL && styles.rtlRow
              ]}>
                <View style={[
                  styles.statusDot,
                  hold.status === "released" && styles.statusDotReleased
                ]} />
                <Text style={[
                  styles.holdStatusText,
                  hold.status === "released" && styles.holdStatusTextReleased
                ]}>
                  {hold.status === "held" ? t.statusHeld : t.statusReleased}
                </Text>
              </View>

              <View style={styles.holdDivider} />
            </View>
          ))}
        </View>

        {/* WELLNESS PACKAGES & PASSES SECTION */}
        <View style={styles.card}>
          <Text style={[styles.sectionTitle, isRTL && styles.textRight]}>{t.packagesTitle}</Text>
          <View style={styles.cardDivider} />
          
          <View style={styles.packagesList}>
            {userPackages.map((pkg) => (
              <View key={pkg.id} style={styles.packageItem}>
                <View style={[styles.packageHeader, isRTL && styles.rtlRow]}>
                  <View style={styles.pkgInfoCol}>
                    <Text style={[styles.pkgName, isRTL && styles.textRight]}>{pkg.packageName[lang]}</Text>
                    <Text style={[styles.pkgShop, isRTL && styles.textRight]}>{pkg.shopName[lang]}</Text>
                  </View>
                  <Text style={styles.pkgSessionsCount}>
                    {pkg.remainingSessions} {t.sessionsLeft}
                  </Text>
                </View>
                
                <View style={[styles.packageFooter, isRTL && styles.rtlRow]}>
                  <Text style={styles.pkgExpiry}>
                    {t.expires} {pkg.expiresAt}
                  </Text>
                  
                  {pkg.remainingSessions > 0 ? (
                    <TouchableOpacity 
                      style={styles.btnRedeem} 
                      onPress={() => handleRedeemSession(pkg.id)}
                    >
                      <Text style={styles.btnRedeemText}>{t.redeemBtn}</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.consumedBadge}>
                      <Text style={styles.consumedText}>{t.fullyConsumed}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.pkgDivider} />
              </View>
            ))}
            {userPackages.length === 0 && (
              <Text style={[styles.emptyPkgText, isRTL && styles.textRight]}>
                {t.emptyPackages}
              </Text>
            )}
          </View>
        </View>

        {/* SAVED CARDS SECTION */}
        <View style={styles.card}>
          <View style={[styles.sectionHeaderRow, isRTL && styles.rtlRow]}>
            <Text style={styles.sectionTitle}>{t.savedCardsTitle}</Text>
            <TouchableOpacity style={styles.btnAddCard} onPress={() => setShowAddCard(true)}>
              <Text style={styles.btnAddCardText}>+ {t.addCard}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.cardDivider} />

          <View style={styles.cardsList}>
            {savedCards.map((card) => (
              <View key={card.id} style={styles.cardItem}>
                <View style={[styles.cardItemTop, isRTL && styles.rtlRow]}>
                  <Text style={styles.cardBrand}>{card.brand.toUpperCase()}</Text>
                  <Text style={styles.cardExpiry}>{card.expiry}</Text>
                </View>
                <Text style={[styles.cardNumber, isRTL && styles.textRight]}>•••• •••• •••• {card.last4}</Text>
                <Text style={[styles.cardHolder, isRTL && styles.textRight]}>{card.holder}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* ADD CARD MODAL */}
      {showAddCard && (
        <Modal transparent animationType="fade" visible={showAddCard}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{t.addCard}</Text>

              <TextInput
                style={[styles.modalInput, isRTL && styles.textRight]}
                placeholder={t.cardPlaceholder}
                placeholderTextColor="#a8a29e"
                keyboardType="numeric"
                maxLength={16}
                value={newCardNumber}
                onChangeText={setNewCardNumber}
              />

              <TextInput
                style={[styles.modalInput, isRTL && styles.textRight]}
                placeholder={t.holderPlaceholder}
                placeholderTextColor="#a8a29e"
                value={newCardHolder}
                onChangeText={setNewCardHolder}
              />

              <TextInput
                style={[styles.modalInput, isRTL && styles.textRight]}
                placeholder={t.expiryPlaceholder}
                placeholderTextColor="#a8a29e"
                maxLength={5}
                value={newCardExpiry}
                onChangeText={setNewCardExpiry}
              />

              <View style={styles.modalActionRow}>
                <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setShowAddCard(false)}>
                  <Text style={styles.modalBtnCancelLabel}>{t.close}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalBtnConfirm} onPress={handleAddCard}>
                  <Text style={styles.modalBtnConfirmLabel}>{t.save}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
      {/* Toast Overlay */}
      <Toast
        message={toastMessage}
        type={toastType}
        visible={toastVisible}
        onClose={() => setToastVisible(false)}
      />
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
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 40,
    gap: 20
  },
  card: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e7e5e4",
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2
  },
  walletCard: {
    backgroundColor: "#1c1917" // Deep Charcoal
  },
  textWhite: {
    color: "#ffffff"
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#1c1917",
    letterSpacing: 0.5
  },
  walletDesc: {
    fontSize: 11,
    color: "#a8a29e",
    marginTop: 4,
    lineHeight: 16
  },
  cardDivider: {
    height: 1,
    backgroundColor: "#f5f5f4",
    marginVertical: 14
  },
  cardDividerLight: {
    height: 1,
    backgroundColor: "#2e2a27",
    marginVertical: 14
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8
  },
  infoLabel: {
    fontSize: 12,
    color: "#78716c"
  },
  infoValue: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#1c1917"
  },
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  balanceLabel: {
    fontSize: 12,
    color: "#fafaf9",
    fontWeight: "bold"
  },
  balanceValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: "hsl(38, 40%, 45%)" // Premium Gold
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  btnAddCard: {
    backgroundColor: "#fafaf9",
    borderWidth: 1,
    borderColor: "#e7e5e4",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8
  },
  btnAddCardText: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#1c1917"
  },
  cardsList: {
    gap: 12
  },
  cardItem: {
    backgroundColor: "#fafaf9",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e7e5e4"
  },
  cardItemTop: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  cardBrand: {
    fontSize: 11,
    fontWeight: "bold",
    color: "hsl(38, 40%, 45%)",
    letterSpacing: 1
  },
  cardExpiry: {
    fontSize: 11,
    color: "#78716c"
  },
  cardNumber: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1c1917",
    marginVertical: 10,
    letterSpacing: 2
  },
  cardHolder: {
    fontSize: 11,
    color: "#78716c",
    textTransform: "uppercase"
  },
  holdRow: {
    marginBottom: 16
  },
  holdHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  holdProvider: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#1c1917"
  },
  holdDate: {
    fontSize: 10,
    color: "#a8a29e"
  },
  holdSplits: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 10,
    backgroundColor: "#fafaf9",
    padding: 10,
    borderRadius: 8
  },
  splitCol: {
    alignItems: "center"
  },
  splitLabel: {
    fontSize: 8,
    color: "#a8a29e",
    fontWeight: "bold",
    textTransform: "uppercase"
  },
  splitValue: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#44403c",
    marginTop: 2
  },
  holdStatusContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "hsl(38, 40%, 45%)" // Gold for Escrow
  },
  statusDotReleased: {
    backgroundColor: "#166534" // Green for Released
  },
  holdStatusText: {
    fontSize: 9,
    fontWeight: "bold",
    color: "hsl(38, 40%, 45%)"
  },
  holdStatusTextReleased: {
    color: "#166534"
  },
  holdDivider: {
    height: 1,
    backgroundColor: "#f5f5f4",
    marginTop: 14
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(28, 25, 23, 0.4)",
    justifyContent: "center",
    alignItems: "center"
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 24,
    width: width * 0.85,
    borderWidth: 1,
    borderColor: "#e7e5e4",
    gap: 14
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1c1917",
    marginBottom: 6
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#e7e5e4",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: "#1c1917"
  },
  modalActionRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 10
  },
  modalBtnCancel: {
    flex: 1,
    backgroundColor: "#fafaf9",
    borderWidth: 1,
    borderColor: "#e7e5e4",
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 10
  },
  modalBtnCancelLabel: {
    color: "#1c1917",
    fontWeight: "bold",
    fontSize: 12
  },
  modalBtnConfirm: {
    flex: 1,
    backgroundColor: "#1c1917",
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 10
  },
  modalBtnConfirmLabel: {
    color: "#fafaf9",
    fontWeight: "bold",
    fontSize: 12
  },
  packagesList: {
    gap: 12
  },
  packageItem: {
    gap: 8
  },
  packageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12
  },
  pkgInfoCol: {
    flex: 1,
    gap: 2
  },
  pkgName: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#1c1917"
  },
  pkgShop: {
    fontSize: 10,
    color: "#78716c"
  },
  pkgSessionsCount: {
    fontSize: 11,
    fontWeight: "bold",
    color: "hsl(38, 40%, 45%)"
  },
  packageFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  pkgExpiry: {
    fontSize: 9,
    color: "#a8a29e"
  },
  btnRedeem: {
    backgroundColor: "#1c1917",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8
  },
  btnRedeemText: {
    color: "#fafaf9",
    fontSize: 10,
    fontWeight: "bold"
  },
  consumedBadge: {
    backgroundColor: "#f5f5f4",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6
  },
  consumedText: {
    color: "#a8a29e",
    fontSize: 9,
    fontWeight: "bold"
  },
  pkgDivider: {
    height: 1,
    backgroundColor: "#f5f5f4",
    marginTop: 10
  },
  emptyPkgText: {
    fontSize: 11,
    color: "#a8a29e",
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 12
  }
});
