import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Alert,
  Dimensions,
  ActivityIndicator
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

const { width, height } = Dimensions.get("window");

interface Bid {
  id: string;
  providerName: string;
  price: number;
  notes: string;
  status: "pending" | "accepted" | "rejected" | "withdrawn";
}

interface Post {
  id: string;
  customerId: string;
  title: string;
  description: string;
  location: string;
  date: string;
  budgetMax: number | null;
  status: "open" | "assigned" | "completed" | "cancelled";
  bids: Bid[];
}

type Category = { id: string; name_en: string; name_ar: string };

export default function ServiceBoardScreen() {
  const [lang, setLang] = useState<"en" | "ar">("ar");
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showPostModal, setShowPostModal] = useState(false);
  const [showBidModal, setShowBidModal] = useState(false);
  const [activePost, setActivePost] = useState<Post | null>(null);

  // New Request Form state
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newBudget, setNewBudget] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newCategoryId, setNewCategoryId] = useState("");

  // New Bid Form state
  const [bidPrice, setBidPrice] = useState("");
  const [bidNotes, setBidNotes] = useState("");

  const isRTL = lang === "ar";

  const t = {
    en: {
      title: "On-Demand Service Board",
      subtitle: "Bespoke beauty requests & custom bids",
      postBtn: "+ Post Care Request",
      budget: "Budget Max",
      location: "Location",
      date: "Target Date",
      statusOpen: "OPEN FOR BIDS",
      statusClosed: "MATCHED & LOCKED",
      bidsLabel: "Bids Submitted",
      noBids: "No bids received yet.",
      submitBidBtn: "Submit Business Proposal",
      acceptBidBtn: "Accept Offer",
      close: "Close",
      submit: "Submit",
      cancel: "Cancel",
      postRequestTitle: "Post New Care Request",
      reqTitleLabel: "What service do you need?",
      reqDescLabel: "Describe your requirements",
      reqBudgetLabel: "Maximum Budget (SAR)",
      reqLocationLabel: "Address (district, city)",
      reqCategoryLabel: "Service category",
      signIn: "Sign in from the Profile tab to post requests or send offers.",
      empty: "No requests to show yet.",
      loadFailed: "Could not load requests",
      retry: "Try again",
      futureDate: "Use a future date in the format YYYY-MM-DD.",
      providerOnly: "Only provider accounts can send offers.",
      cancelRequest: "Cancel request",
      statusCancelled: "CANCELLED",
      yourOffer: "Your offer was sent",
      reqDateLabel: "Scheduled Date (YYYY-MM-DD)",
      bidPriceLabel: "Proposal Price (SAR)",
      bidNotesLabel: "Offer Details",
      placeBidTitle: "Submit Proposal",
      successPost: "Request published. Verified providers can now send offers.",
      successBid: "Proposal submitted successfully.",
      acceptedSuccess: "Offer accepted. The other offers were declined.",
      errorFill: "Please fill in all fields."
    },
    ar: {
      title: "لوحة الطلبات الخدمية",
      subtitle: "طلبات العناية المخصصة وعروض الأسعار",
      postBtn: "+ نشر طلب عناية",
      budget: "الميزانية القصوى",
      location: "الموقع",
      date: "التاريخ المستهدف",
      statusOpen: "مفتوح للعروض",
      statusClosed: "تمت المطابقة والتعاقد",
      bidsLabel: "العروض المقدمة",
      noBids: "لا توجد عروض مقدمة حالياً.",
      submitBidBtn: "تقديم عرض سعر تجاري",
      acceptBidBtn: "قبول العرض",
      close: "إغلاق",
      submit: "إرسال",
      cancel: "إلغاء",
      postRequestTitle: "نشر طلب عناية جديد",
      reqTitleLabel: "ما هي الخدمة التي تحتاجها؟",
      reqDescLabel: "وصف المتطلبات والتفاصيل",
      reqBudgetLabel: "الميزانية القصوى (ريال)",
      reqLocationLabel: "العنوان (الحي، المدينة)",
      reqCategoryLabel: "فئة الخدمة",
      signIn: "سجّل الدخول من تبويب الملف الشخصي لنشر الطلبات أو إرسال العروض.",
      empty: "لا توجد طلبات لعرضها بعد.",
      loadFailed: "تعذر تحميل الطلبات",
      retry: "إعادة المحاولة",
      futureDate: "استخدم تاريخاً مستقبلياً بصيغة YYYY-MM-DD.",
      providerOnly: "يمكن لحسابات مقدمي الخدمة فقط إرسال العروض.",
      cancelRequest: "إلغاء الطلب",
      statusCancelled: "ملغى",
      yourOffer: "تم إرسال عرضك",
      reqDateLabel: "تاريخ الموعد (YYYY-MM-DD)",
      bidPriceLabel: "قيمة العرض المقترح (ريال)",
      bidNotesLabel: "تفاصيل العرض والمؤهلات",
      placeBidTitle: "تقديم عرض سعر",
      successPost: "تم نشر طلب الخدمة بنجاح.",
      successBid: "تم تقديم عرض السعر بنجاح.",
      acceptedSuccess: "تم قبول العرض والتعاقد بنجاح.",
      errorFill: "يرجى تعبئة جميع الحقول المطلوبة."
    }
  }[lang];

  // Requests visible to this account: a customer's own posts, or open posts for providers (RLS).
  const loadServiceRequests = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
      if (!user) {
        setPosts([]);
        return;
      }

      const [{ data: provider }, { data: cats }] = await Promise.all([
        supabase.from("providers").select("id").eq("owner_id", user.id).maybeSingle(),
        supabase.from("categories").select("id, name_en, name_ar").eq("is_active", true).order("name_en"),
      ]);
      setProviderId(provider?.id ?? null);
      setCategories((cats || []) as Category[]);

      const { data, error } = await supabase
        .from("job_posts")
        .select(`
          id, customer_id, title, description, address_text, target_date, budget_max, status,
          job_bids ( id, bid_price, proposal_notes, status, providers ( business_name_en, business_name_ar ) )
        `)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;

      setPosts((data || []).map((jp: any) => ({
        id: jp.id,
        customerId: jp.customer_id,
        title: jp.title,
        description: jp.description,
        location: jp.address_text,
        date: String(jp.target_date).split("T")[0],
        budgetMax: jp.budget_max === null ? null : Number(jp.budget_max),
        status: jp.status,
        bids: (jp.job_bids || []).map((b: any) => ({
          id: b.id,
          providerName: (lang === "ar" ? b.providers?.business_name_ar : b.providers?.business_name_en) || b.providers?.business_name_en || "",
          price: Number(b.bid_price),
          notes: b.proposal_notes || "",
          status: b.status,
        })),
      })));
    } catch (err) {
      setPosts([]);
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadServiceRequests();
  }, [lang]);

  const fail = (err: unknown) =>
    Alert.alert(isRTL ? "خطأ" : "Error", err instanceof Error ? err.message : String(err));

  // Handle Post Care Request
  const handlePostRequest = async () => {
    if (!userId) {
      Alert.alert(isRTL ? "خطأ" : "Error", t.signIn);
      return;
    }
    if (!newTitle.trim() || !newDesc.trim() || !newLocation.trim() || !newDate.trim() || !newCategoryId) {
      Alert.alert(isRTL ? "خطأ" : "Error", t.errorFill);
      return;
    }
    const target = new Date(`${newDate.trim()}T12:00:00+03:00`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate.trim()) || Number.isNaN(target.getTime()) || target.getTime() <= Date.now()) {
      Alert.alert(isRTL ? "خطأ" : "Error", t.futureDate);
      return;
    }
    const budgetVal = newBudget.trim() ? Number(newBudget) : null;
    if (budgetVal !== null && !(budgetVal > 0)) {
      Alert.alert(isRTL ? "خطأ" : "Error", t.errorFill);
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from("job_posts").insert({
        customer_id: userId,
        category_id: newCategoryId,
        title: newTitle.trim(),
        description: newDesc.trim(),
        address_text: newLocation.trim(),
        target_date: target.toISOString(),
        budget_max: budgetVal,
      });
      if (error) throw error;

      setShowPostModal(false);
      setNewTitle("");
      setNewDesc("");
      setNewBudget("");
      setNewLocation("");
      setNewDate("");
      setNewCategoryId("");
      Alert.alert(isRTL ? "تأكيد" : "Success", t.successPost);
      loadServiceRequests();
    } catch (err) {
      fail(err);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Submit Bid (provider owners only; the bid carries the business name from the database)
  const handleSubmitBid = async () => {
    if (!activePost) return;
    if (!providerId) {
      Alert.alert(isRTL ? "خطأ" : "Error", t.providerOnly);
      return;
    }
    const priceVal = Number(bidPrice);
    if (!bidPrice.trim() || !(priceVal > 0)) {
      Alert.alert(isRTL ? "خطأ" : "Error", t.errorFill);
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from("job_bids").insert({
        job_post_id: activePost.id,
        provider_id: providerId,
        bid_price: priceVal,
        proposal_notes: bidNotes.trim() || null,
      });
      if (error) throw error;

      setShowBidModal(false);
      setBidPrice("");
      setBidNotes("");
      Alert.alert(isRTL ? "تأكيد" : "Success", t.successBid);
      loadServiceRequests();
    } catch (err) {
      fail(err);
    } finally {
      setSubmitting(false);
    }
  };

  // Accepting is one server command: the chosen bid is accepted, the rest declined, the post assigned.
  const handleAcceptBid = async (bidId: string) => {
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("accept_job_bid", { p_bid_id: bidId });
      if (error) throw error;
      Alert.alert(isRTL ? "تم القبول" : "Accepted", t.acceptedSuccess);
      loadServiceRequests();
    } catch (err) {
      fail(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelPost = async (postId: string) => {
    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from("job_posts").update({ status: "cancelled" }).eq("id", postId).eq("status", "open").select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error(t.loadFailed);
      loadServiceRequests();
    } catch (err) {
      fail(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      {/* HEADER */}
      <View style={[styles.header, isRTL && styles.rtlRow]}>
        <View style={styles.titleContainer}>
          <Text style={[styles.titleText, isRTL && styles.textRight]}>{t.title}</Text>
          <Text style={[styles.subText, isRTL && styles.textRight]}>{t.subtitle}</Text>
        </View>
        <TouchableOpacity style={styles.langBadge} onPress={() => setLang(l => (l === "en" ? "ar" : "en"))}>
          <Text style={styles.langText}>{lang === "en" ? "العربية" : "EN"}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* POST CARE BUTTON */}
        {userId && !providerId && (
          <TouchableOpacity style={styles.postBtn} onPress={() => setShowPostModal(true)} disabled={categories.length === 0}>
            <Text style={styles.postBtnText}>{t.postBtn}</Text>
          </TouchableOpacity>
        )}

        {loading ? (
          <ActivityIndicator color="hsl(45,60%,55%)" size="large" style={styles.loader} />
        ) : !userId ? (
          <Text style={[styles.noBidsText, { textAlign: "center", paddingVertical: 32 }]}>{t.signIn}</Text>
        ) : loadError ? (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 12 }}>
            <Text style={[styles.noBidsText, { textAlign: "center" }]}>{t.loadFailed}: {loadError}</Text>
            <TouchableOpacity style={styles.submitBidBtn} onPress={loadServiceRequests}>
              <Text style={styles.submitBidBtnText}>{t.retry}</Text>
            </TouchableOpacity>
          </View>
        ) : posts.length === 0 ? (
          <Text style={[styles.noBidsText, { textAlign: "center", paddingVertical: 32 }]}>{t.empty}</Text>
        ) : (
          <View style={styles.listContainer}>
            {posts.map(post => (
              <View key={post.id} style={styles.postCard}>
                <View style={[styles.cardHeader, isRTL && styles.rtlRow]}>
                  <Text style={styles.cardTitle}>{post.title}</Text>
                  <View style={[
                    styles.statusBadge,
                    post.status !== "open" && styles.statusBadgeClosed
                  ]}>
                    <Text style={[
                      styles.statusBadgeText,
                      post.status !== "open" && styles.statusBadgeTextClosed
                    ]}>
                      {post.status === "open" ? t.statusOpen : post.status === "cancelled" ? t.statusCancelled : t.statusClosed}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.cardDesc, isRTL && styles.textRight]}>{post.description}</Text>

                <View style={[styles.cardMetrics, isRTL && styles.rtlRow]}>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>{t.budget}</Text>
                    <Text style={styles.metricVal}>{post.budgetMax !== null ? `${post.budgetMax} ${isRTL ? "ريال" : "SAR"}` : "-"}</Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>{t.location}</Text>
                    <Text style={styles.metricVal}>{post.location}</Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>{t.date}</Text>
                    <Text style={styles.metricVal}>{post.date}</Text>
                  </View>
                </View>

                <View style={styles.cardDivider} />

                {/* BIDS SECTION */}
                <Text style={[styles.sectionHeading, isRTL && styles.textRight]}>
                  {t.bidsLabel} ({post.bids.length})
                </Text>

                {post.bids.map(bid => (
                  <View key={bid.id} style={styles.bidRow}>
                    <View style={[styles.bidHeader, isRTL && styles.rtlRow]}>
                      <Text style={styles.bidProviderName}>{bid.providerName}</Text>
                      <Text style={styles.bidPrice}>{bid.price} {isRTL ? "ريال" : "SAR"}</Text>
                    </View>
                    <Text style={[styles.bidNotes, isRTL && styles.textRight]}>{bid.notes}</Text>
                    
                    {post.status === "open" && bid.status === "pending" && post.customerId === userId && (
                      <TouchableOpacity
                        style={styles.acceptBidBtn}
                        disabled={submitting}
                        onPress={() => handleAcceptBid(bid.id)}
                      >
                        <Text style={styles.acceptBidBtnText}>{t.acceptBidBtn}</Text>
                      </TouchableOpacity>
                    )}

                    {bid.status === "accepted" && (
                      <View style={[styles.acceptedBadge, isRTL && styles.rtlRow]}>
                        <Text style={styles.acceptedBadgeText}>✓ {isRTL ? "مقبول" : "Accepted"}</Text>
                      </View>
                    )}
                  </View>
                ))}

                {post.bids.length === 0 && (
                  <Text style={[styles.noBidsText, isRTL && styles.textRight]}>{t.noBids}</Text>
                )}

                {post.status === "open" && providerId && post.customerId !== userId && post.bids.length === 0 && (
                  <TouchableOpacity
                    style={styles.submitBidBtn}
                    onPress={() => {
                      setActivePost(post);
                      setShowBidModal(true);
                    }}
                  >
                    <Text style={styles.submitBidBtnText}>{t.submitBidBtn}</Text>
                  </TouchableOpacity>
                )}

                {post.status === "open" && providerId && post.bids.length > 0 && (
                  <Text style={[styles.noBidsText, isRTL && styles.textRight]}>{t.yourOffer}</Text>
                )}

                {post.status === "open" && post.customerId === userId && (
                  <TouchableOpacity style={styles.submitBidBtn} disabled={submitting} onPress={() => handleCancelPost(post.id)}>
                    <Text style={styles.submitBidBtnText}>{t.cancelRequest}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* POST REQUEST MODAL */}
      <Modal visible={showPostModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={[styles.modalTitle, isRTL && styles.textRight]}>{t.postRequestTitle}</Text>
            
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.inputLabel, isRTL && styles.textRight]}>{t.reqTitleLabel}</Text>
              <TextInput
                style={[styles.modalInput, isRTL && styles.textRight]}
                value={newTitle}
                onChangeText={setNewTitle}
                placeholder="e.g. Silk Blowdry"
                placeholderTextColor="#a8a29e"
              />

              <Text style={[styles.inputLabel, isRTL && styles.textRight]}>{t.reqDescLabel}</Text>
              <TextInput
                style={[styles.modalTextArea, isRTL && styles.textRight]}
                value={newDesc}
                onChangeText={setNewDesc}
                multiline
                numberOfLines={3}
                placeholder="e.g. Need mobile service at home..."
                placeholderTextColor="#a8a29e"
              />

              <Text style={[styles.inputLabel, isRTL && styles.textRight]}>{t.reqBudgetLabel}</Text>
              <TextInput
                style={[styles.modalInput, isRTL && styles.textRight]}
                value={newBudget}
                onChangeText={setNewBudget}
                keyboardType="numeric"
                placeholder="500"
                placeholderTextColor="#a8a29e"
              />

              <Text style={[styles.inputLabel, isRTL && styles.textRight]}>{t.reqCategoryLabel}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[{ gap: 8, paddingVertical: 4 }, isRTL && styles.rtlRow]}>
                {categories.map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    onPress={() => setNewCategoryId(cat.id)}
                    style={[styles.modalBtnCancel, newCategoryId === cat.id && styles.modalBtnConfirm, { flex: 0, paddingHorizontal: 12 }]}
                  >
                    <Text style={newCategoryId === cat.id ? styles.modalBtnConfirmLabel : styles.modalBtnCancelLabel}>
                      {isRTL ? cat.name_ar : cat.name_en}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={[styles.inputLabel, isRTL && styles.textRight]}>{t.reqLocationLabel}</Text>
              <TextInput
                style={[styles.modalInput, isRTL && styles.textRight]}
                value={newLocation}
                onChangeText={setNewLocation}
                placeholder={isRTL ? "الحي، المدينة" : "District, city"}
                placeholderTextColor="#a8a29e"
              />

              <Text style={[styles.inputLabel, isRTL && styles.textRight]}>{t.reqDateLabel}</Text>
              <TextInput
                style={[styles.modalInput, isRTL && styles.textRight]}
                value={newDate}
                onChangeText={setNewDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#a8a29e"
              />

              <View style={[styles.modalActionRow, isRTL && styles.rtlRow]}>
                <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setShowPostModal(false)}>
                  <Text style={styles.modalBtnCancelLabel}>{t.cancel}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalBtnConfirm} disabled={submitting} onPress={handlePostRequest}>
                  <Text style={styles.modalBtnConfirmLabel}>{t.submit}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* SUBMIT BID MODAL */}
      <Modal visible={showBidModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={[styles.modalTitle, isRTL && styles.textRight]}>{t.placeBidTitle}</Text>
            
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.inputLabel, isRTL && styles.textRight]}>{t.bidPriceLabel}</Text>
              <TextInput
                style={[styles.modalInput, isRTL && styles.textRight]}
                value={bidPrice}
                onChangeText={setBidPrice}
                keyboardType="numeric"
                placeholder="e.g. 450"
                placeholderTextColor="#a8a29e"
              />

              <Text style={[styles.inputLabel, isRTL && styles.textRight]}>{t.bidNotesLabel}</Text>
              <TextInput
                style={[styles.modalTextArea, isRTL && styles.textRight]}
                value={bidNotes}
                onChangeText={setBidNotes}
                multiline
                numberOfLines={3}
                placeholder="Describe your qualifications & package offer..."
                placeholderTextColor="#a8a29e"
              />

              <View style={[styles.modalActionRow, isRTL && styles.rtlRow]}>
                <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setShowBidModal(false)}>
                  <Text style={styles.modalBtnCancelLabel}>{t.cancel}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalBtnConfirm} disabled={submitting} onPress={handleSubmitBid}>
                  <Text style={styles.modalBtnConfirmLabel}>{t.submit}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles: any = StyleSheet.create({
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
  titleContainer: {
    flex: 1
  },
  titleText: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1c1917" // Charcoal
  },
  subText: {
    fontSize: 11,
    color: "#78716c", // Stone
    marginTop: 2
  },
  langBadge: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#1c1917"
  },
  langText: {
    color: "#fafaf9",
    fontSize: 10,
    fontWeight: "bold"
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40
  },
  postBtn: {
    backgroundColor: "hsl(45,60%,55%)",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "hsla(45,60%,55%,0.1)"
  },
  postBtnText: {
    color: "#1c1917",
    fontWeight: "bold",
    fontSize: 13,
    letterSpacing: 0.5
  },
  loader: {
    marginTop: 40
  },
  listContainer: {
    gap: 16
  },
  postCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "hsla(0,0%,0%,0.05)"
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 8
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#1c1917",
    flex: 1
  },
  statusBadge: {
    backgroundColor: "hsla(142,70%,45%,0.1)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  statusBadgeClosed: {
    backgroundColor: "hsla(0,0%,0%,0.06)"
  },
  statusBadgeText: {
    fontSize: 8,
    fontWeight: "bold",
    color: "hsl(142,70%,35%)"
  },
  statusBadgeTextClosed: {
    color: "#78716c"
  },
  cardDesc: {
    fontSize: 12,
    color: "#78716c",
    lineHeight: 16,
    marginBottom: 12
  },
  cardMetrics: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#fafaf9",
    padding: 10,
    borderRadius: 10,
    marginBottom: 12
  },
  metricItem: {
    alignItems: "center",
    flex: 1
  },
  metricLabel: {
    fontSize: 8,
    color: "#a8a29e",
    textTransform: "uppercase",
    marginBottom: 2
  },
  metricVal: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#1c1917"
  },
  cardDivider: {
    height: 1,
    backgroundColor: "hsla(0,0%,0%,0.06)",
    marginVertical: 12
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: "bold",
    color: "hsl(45,60%,45%)",
    marginBottom: 8,
    textTransform: "uppercase"
  },
  bidRow: {
    backgroundColor: "#fafaf9",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "hsla(0,0%,0%,0.03)"
  },
  bidHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4
  },
  bidProviderName: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#1c1917"
  },
  bidPrice: {
    fontSize: 11,
    fontWeight: "800",
    color: "hsl(45,60%,40%)"
  },
  bidNotes: {
    fontSize: 10,
    color: "#78716c",
    lineHeight: 14,
    marginBottom: 8
  },
  acceptBidBtn: {
    backgroundColor: "#1c1917",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    alignSelf: "flex-start"
  },
  acceptBidBtnText: {
    color: "#fafaf9",
    fontSize: 9,
    fontWeight: "bold"
  },
  acceptedBadge: {
    backgroundColor: "hsla(142,70%,45%,0.1)",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignSelf: "flex-start"
  },
  acceptedBadgeText: {
    color: "hsl(142,70%,35%)",
    fontSize: 9,
    fontWeight: "bold"
  },
  noBidsText: {
    fontSize: 10,
    color: "#a8a29e",
    fontStyle: "italic",
    marginBottom: 8
  },
  submitBidBtn: {
    borderWidth: 1,
    borderColor: "#1c1917",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8
  },
  submitBidBtnText: {
    color: "#1c1917",
    fontSize: 11,
    fontWeight: "bold"
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 20,
    width: "100%",
    maxHeight: height * 0.8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1c1917",
    marginBottom: 16
  },
  inputLabel: {
    fontSize: 10,
    color: "#78716c",
    marginBottom: 4,
    fontWeight: "600"
  },
  modalInput: {
    backgroundColor: "#fafaf9",
    borderWidth: 1,
    borderColor: "hsla(0,0%,0%,0.08)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    color: "#1c1917",
    marginBottom: 12
  },
  modalTextArea: {
    backgroundColor: "#fafaf9",
    borderWidth: 1,
    borderColor: "hsla(0,0%,0%,0.08)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    color: "#1c1917",
    marginBottom: 12,
    height: 60,
    textAlignVertical: "top"
  },
  modalActionRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8
  },
  modalBtnCancel: {
    flex: 1,
    backgroundColor: "#fafaf9",
    borderWidth: 1,
    borderColor: "hsla(0,0%,0%,0.08)",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center"
  },
  modalBtnCancelLabel: {
    color: "#78716c",
    fontWeight: "bold",
    fontSize: 12
  },
  modalBtnConfirm: {
    flex: 1,
    backgroundColor: "#1c1917",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center"
  },
  modalBtnConfirmLabel: {
    color: "#fafaf9",
    fontWeight: "bold",
    fontSize: 12
  }
});
