import React, { useCallback, useEffect, useState } from "react";
import { AppPressable } from "@/components/app-pressable";
import { useLocale } from "@/lib/locale";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TextInput,
  Switch,
  ActivityIndicator,
  Dimensions
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { consentsToRecord } from "@/lib/consent";
import { Toast } from "../components/toast";
import { errorMessage } from "@/lib/error-message";

const { width } = Dimensions.get("window");

interface UserPackageItem {
  id: string;
  packageName: { en: string; ar: string };
  shopName: { en: string; ar: string };
  remainingSessions: number;
  expiresAt: string;
}

interface ProfileRow {
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
}

// Same normalisation as the web login: Saudi mobiles in E.164 (+9665XXXXXXXX).
const normalizeSaudiPhone = (raw: string): string => {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+966")) return digits;
  if (digits.startsWith("00966")) return "+" + digits.slice(2);
  if (digits.startsWith("966")) return "+" + digits;
  if (digits.startsWith("05")) return "+966" + digits.slice(1);
  if (digits.startsWith("5")) return "+966" + digits;
  return "+966" + digits;
};

export default function ProfileScreen() {
  const { lang, setLang } = useLocale();
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState<"success" | "info" | "error">("success");
  const [toastVisible, setToastVisible] = useState(false);

  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [userPackages, setUserPackages] = useState<UserPackageItem[]>([]);
  const [packagesError, setPackagesError] = useState("");

  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [whatsappConsent, setWhatsappConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  const isRTL = lang === "ar";

  // Translations
  const t = {
    en: {
      profileTitle: "Client Profile",
      signInTitle: "Sign in",
      signInDesc: "Sign in with your Saudi mobile number to book, buy packages and post requests.",
      phoneLabel: "Mobile number",
      phonePlaceholder: "05XXXXXXXX",
      sendCode: "Send code",
      codeLabel: "6-digit code",
      verify: "Verify and sign in",
      changeNumber: "Use another number",
      terms: "I accept the Terms of Service and the Privacy Notice.",
      whatsapp: "Send booking updates on WhatsApp (optional).",
      termsRequired: "Please accept the Terms of Service and Privacy Notice to continue.",
      invalidPhone: "Please enter a valid Saudi mobile number (05XXXXXXXX).",
      invalidCode: "Please enter the 6-digit code.",
      codeSent: "Verification code sent by SMS.",
      signedIn: "Signed in.",
      offline: "No connection. Your account will appear when you are back online.",
      consentNotSaved: "Signed in, but your consent could not be saved. It will be asked for again at your next sign-in.",
      serviceUnavailable: "The service is not configured. Sign-in is unavailable.",
      signOut: "Sign out",
      customerDetails: "Customer Information",
      nameLabel: "Full Name",
      emailLabel: "Email Address",
      notSet: "Not set",
      paymentsTitle: "Payments",
      paymentsDesc: "Payments are taken on Tap's secure payment page. Card details are never stored in this app.",
      packagesTitle: "My Active Packages & Passes",
      sessionsLeft: "sessions left",
      expires: "Expires:",
      redeemNote: "Show this package at your visit; the shop's staff record each session.",
      fullyConsumed: "Fully Consumed",
      emptyPackages: "No active packages found.",
      packagesFailed: "Could not load your packages"
    },
    ar: {
      profileTitle: "الملف الشخصي",
      signInTitle: "تسجيل الدخول",
      signInDesc: "سجّل الدخول برقم جوالك السعودي للحجز وشراء الباقات ونشر الطلبات.",
      phoneLabel: "رقم الجوال",
      phonePlaceholder: "05XXXXXXXX",
      sendCode: "إرسال الرمز",
      codeLabel: "رمز من 6 أرقام",
      verify: "تحقق وسجّل الدخول",
      changeNumber: "استخدام رقم آخر",
      terms: "أوافق على شروط الخدمة وإشعار الخصوصية.",
      whatsapp: "إرسال تحديثات الحجز عبر واتساب (اختياري).",
      termsRequired: "يرجى الموافقة على شروط الخدمة وإشعار الخصوصية للمتابعة.",
      invalidPhone: "يرجى إدخال رقم جوال سعودي صالح (05XXXXXXXX).",
      invalidCode: "يرجى إدخال الرمز المكون من 6 أرقام.",
      codeSent: "تم إرسال رمز التحقق برسالة نصية.",
      signedIn: "تم تسجيل الدخول.",
      offline: "لا يوجد اتصال. سيظهر حسابك عند عودة الاتصال.",
      consentNotSaved: "تم تسجيل الدخول، لكن تعذر حفظ موافقتك. سنطلبها منك عند تسجيل الدخول التالي.",
      serviceUnavailable: "الخدمة غير مهيأة. تسجيل الدخول غير متاح.",
      signOut: "تسجيل الخروج",
      customerDetails: "بيانات العميل",
      nameLabel: "الاسم الكامل",
      emailLabel: "البريد الإلكتروني",
      notSet: "غير محدد",
      paymentsTitle: "المدفوعات",
      paymentsDesc: "تتم المدفوعات عبر صفحة الدفع الآمنة من Tap. لا تُحفظ بيانات البطاقة في هذا التطبيق.",
      packagesTitle: "الباقات والعضويات الفعالة",
      sessionsLeft: "جلسات متبقية",
      expires: "ينتهي في:",
      redeemNote: "اعرض هذه الباقة عند زيارتك؛ يسجّل فريق المركز كل جلسة.",
      fullyConsumed: "مستهلكة بالكامل",
      emptyPackages: "لا توجد عضويات نشطة حالياً.",
      packagesFailed: "تعذر تحميل باقاتك"
    }
  }[lang];

  const showToast = (message: string, type: "success" | "info" | "error") => {
    setToastMessage(message);
    setToastType(type);
    setToastVisible(true);
  };

  const loadAccount = useCallback(async (current: User | null) => {
    setUser(current);
    setAuthChecked(true);
    if (!current) {
      setProfile(null);
      setUserPackages([]);
      return;
    }
    const [{ data: profileRow }, packagesRes] = await Promise.all([
      supabase.from("profiles").select("first_name, last_name, phone_number").eq("id", current.id).maybeSingle(),
      supabase
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
        .eq("customer_id", current.id)
        .eq("status", "active")
        .order("expires_at", { ascending: true }),
    ]);
    setProfile((profileRow as ProfileRow) ?? null);
    if (packagesRes.error) {
      setPackagesError(packagesRes.error.message);
      setUserPackages([]);
      return;
    }
    setPackagesError("");
    setUserPackages((packagesRes.data || []).map((item: any) => ({
      id: item.id,
      packageName: { en: item.packages?.name_en || "", ar: item.packages?.name_ar || item.packages?.name_en || "" },
      shopName: {
        en: item.packages?.providers?.business_name_en || "",
        ar: item.packages?.providers?.business_name_ar || item.packages?.providers?.business_name_en || ""
      },
      remainingSessions: Number(item.remaining_sessions),
      expiresAt: item.expires_at ? String(item.expires_at).split("T")[0] : ""
    })));
  }, []);

  useEffect(() => {
    // getSession() reads the stored session without the network, so a launch with no signal still shows the signed-in account.
    supabase.auth.getSession().then(({ data, error }) => {
      if (!data.session && error?.name === "AuthRetryableFetchError") showToast(t.offline, "info");
      loadAccount(data.session?.user ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      loadAccount(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadAccount]);

  const handleSendCode = async () => {
    if (!isSupabaseConfigured) {
      showToast(t.serviceUnavailable, "error");
      return;
    }
    const formatted = normalizeSaudiPhone(phone);
    if (!formatted.startsWith("+9665") || formatted.length !== 13) {
      showToast(t.invalidPhone, "error");
      return;
    }
    if (!termsAccepted) {
      showToast(t.termsRequired, "error");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ phone: formatted, options: { channel: "sms" } });
      if (error) throw error;
      setOtpSent(true);
      showToast(t.codeSent, "info");
    } catch (err) {
      showToast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    if (otpCode.trim().length !== 6) {
      showToast(t.invalidCode, "error");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        phone: normalizeSaudiPhone(phone),
        token: otpCode.trim(),
        type: "sms",
      });
      if (error || !data.user) throw error ?? new Error(t.invalidCode);

      // The customer is signed in from here on, so a consent that cannot be saved is reported, not thrown: the next sign-in
      // asks again because nothing granted is on record. The server stamps the published terms version itself.
      const { data: existing } = await supabase.from("consents").select("purpose, status, created_at").eq("user_id", data.user.id);
      const purposes = consentsToRecord(existing ?? [], whatsappConsent);
      let consentSaved = true;
      if (purposes.length > 0) {
        const { error: consentError } = await supabase.rpc("record_consents", {
          p_purposes: purposes,
          p_status: "granted",
          p_method: "mobile_auth_form",
        });
        consentSaved = !consentError;
      }

      setOtpCode("");
      setOtpSent(false);
      showToast(consentSaved ? t.signedIn : t.consentNotSaved, consentSaved ? "success" : "info");
    } catch (err) {
      showToast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) showToast(error.message, "error");
  };

  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ");

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      {/* HEADER */}
      <View style={[styles.header, isRTL && styles.rtlRow]}>
        <View>
          <Text style={[styles.titleText, isRTL && styles.textRight]}>{t.profileTitle}</Text>
        </View>
        <AppPressable label={lang === "en" ? "Switch to Arabic" : "التبديل إلى الإنجليزية"} style={styles.langBadge} onPress={() => setLang(l => (l === "en" ? "ar" : "en"))}>
          <Text style={styles.langText}>{lang === "en" ? "العربية" : "EN"}</Text>
        </AppPressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {!authChecked && <ActivityIndicator style={{ marginTop: 40 }} />}

        {authChecked && !user && (
          <View style={styles.card}>
            <Text style={[styles.sectionTitle, isRTL && styles.textRight]}>{t.signInTitle}</Text>
            <Text style={[styles.walletDesc, { color: "#78716c" }, isRTL && styles.textRight]}>{t.signInDesc}</Text>
            {!isSupabaseConfigured && (
              <Text style={[styles.walletDesc, { color: "#b91c1c" }, isRTL && styles.textRight]}>{t.serviceUnavailable}</Text>
            )}
            <View style={styles.cardDivider} />

            <Text style={[styles.infoLabel, isRTL && styles.textRight]}>{t.phoneLabel}</Text>
            <TextInput
              style={[styles.modalInput, { textAlign: "left" }]}
              placeholder={t.phonePlaceholder}
              placeholderTextColor="#a8a29e"
              keyboardType="phone-pad"
              autoComplete="tel"
              editable={!otpSent}
              value={phone}
              onChangeText={setPhone}
            />

            {!otpSent && (
              <>
                <View style={[styles.infoRow, isRTL && styles.rtlRow]}>
                  <Text style={[styles.infoLabel, { flex: 1 }, isRTL && styles.textRight]}>{t.terms}</Text>
                  <Switch value={termsAccepted} onValueChange={setTermsAccepted} />
                </View>
                <View style={[styles.infoRow, isRTL && styles.rtlRow]}>
                  <Text style={[styles.infoLabel, { flex: 1 }, isRTL && styles.textRight]}>{t.whatsapp}</Text>
                  <Switch value={whatsappConsent} onValueChange={setWhatsappConsent} />
                </View>
                <AppPressable label={t.sendCode} busy={busy} style={styles.modalBtnConfirm} disabled={busy} onPress={handleSendCode}>
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalBtnConfirmLabel}>{t.sendCode}</Text>}
                </AppPressable>
              </>
            )}

            {otpSent && (
              <>
                <Text style={[styles.infoLabel, isRTL && styles.textRight]}>{t.codeLabel}</Text>
                <TextInput
                  style={[styles.modalInput, { textAlign: "center", letterSpacing: 6 }]}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={otpCode}
                  onChangeText={(v) => setOtpCode(v.replace(/\D/g, ""))}
                />
                <View style={[styles.modalActionRow, isRTL && styles.rtlRow]}>
                  <AppPressable style={styles.modalBtnCancel} disabled={busy} onPress={() => { setOtpSent(false); setOtpCode(""); }}>
                    <Text style={styles.modalBtnCancelLabel}>{t.changeNumber}</Text>
                  </AppPressable>
                  <AppPressable label={t.verify} busy={busy} style={styles.modalBtnConfirm} disabled={busy} onPress={handleVerify}>
                    {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalBtnConfirmLabel}>{t.verify}</Text>}
                  </AppPressable>
                </View>
              </>
            )}
          </View>
        )}

        {user && (
          <>
            {/* CLIENT INFO CARD */}
            <View style={styles.card}>
              <View style={[styles.sectionHeaderRow, isRTL && styles.rtlRow]}>
                <Text style={styles.sectionTitle}>{t.customerDetails}</Text>
                <AppPressable style={styles.btnAddCard} onPress={handleSignOut}>
                  <Text style={styles.btnAddCardText}>{t.signOut}</Text>
                </AppPressable>
              </View>
              <View style={styles.cardDivider} />

              <View style={[styles.infoRow, isRTL && styles.rtlRow]}>
                <Text style={styles.infoLabel}>{t.nameLabel}</Text>
                <Text style={styles.infoValue}>{fullName || t.notSet}</Text>
              </View>
              <View style={[styles.infoRow, isRTL && styles.rtlRow]}>
                <Text style={styles.infoLabel}>{t.phoneLabel}</Text>
                <Text style={styles.infoValue}>{profile?.phone_number || user.phone || t.notSet}</Text>
              </View>
              <View style={[styles.infoRow, isRTL && styles.rtlRow]}>
                <Text style={styles.infoLabel}>{t.emailLabel}</Text>
                <Text style={styles.infoValue}>{user.email || t.notSet}</Text>
              </View>
            </View>

            {/* PAYMENTS */}
            <View style={[styles.card, styles.walletCard]}>
              <Text style={[styles.sectionTitle, styles.textWhite, isRTL && styles.textRight]}>{t.paymentsTitle}</Text>
              <Text style={[styles.walletDesc, isRTL && styles.textRight]}>{t.paymentsDesc}</Text>
            </View>

            {/* PACKAGES & PASSES (read-only; staff redeem sessions at the visit) */}
            <View style={styles.card}>
              <Text style={[styles.sectionTitle, isRTL && styles.textRight]}>{t.packagesTitle}</Text>
              <View style={styles.cardDivider} />

              <View style={styles.packagesList}>
                {packagesError !== "" && (
                  <Text style={[styles.emptyPkgText, isRTL && styles.textRight]}>{t.packagesFailed}: {packagesError}</Text>
                )}
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
                      {pkg.remainingSessions <= 0 && (
                        <View style={styles.consumedBadge}>
                          <Text style={styles.consumedText}>{t.fullyConsumed}</Text>
                        </View>
                      )}
                    </View>
                    {pkg.remainingSessions > 0 && (
                      <Text style={[styles.pkgShop, isRTL && styles.textRight]}>{t.redeemNote}</Text>
                    )}
                    <View style={styles.pkgDivider} />
                  </View>
                ))}
                {packagesError === "" && userPackages.length === 0 && (
                  <Text style={[styles.emptyPkgText, isRTL && styles.textRight]}>
                    {t.emptyPackages}
                  </Text>
                )}
              </View>
            </View>
          </>
        )}
      </ScrollView>

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
