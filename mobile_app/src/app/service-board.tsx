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
  status: "pending" | "accepted" | "rejected";
}

interface Post {
  id: string;
  title: string;
  description: string;
  location: string;
  date: string;
  budgetMax: number;
  status: "open" | "assigned";
  bids: Bid[];
}

// Initial mock data if DB read fails
const initialMockPosts: Post[] = [
  {
    id: "post-1",
    title: "Bridal Hair Styling & Event Glam",
    description: "Looking for an expert makeup artist and hairstylist for a wedding party in Al-Yasmin. Need home service for 3 ladies. High quality premium products required.",
    location: "Al-Yasmin, Riyadh",
    date: "2026-06-18",
    budgetMax: 1500,
    status: "open",
    bids: [
      {
        id: "bid-11",
        providerName: "Sara Beauty Salon & Spa",
        price: 1350,
        notes: "We have 2 senior stylists available with premium French products. Fully equipped for home service.",
        status: "pending"
      }
    ]
  },
  {
    id: "post-2",
    title: "Royal Moroccan Bath & Massage Package",
    description: "Home service deep tissue Swedish therapy and organic bath scrub setup. Must bring portable steaming tent and natural argan scrubs.",
    location: "Al-Malqa, Riyadh",
    date: "2026-06-20",
    budgetMax: 800,
    status: "open",
    bids: []
  }
];

export default function ServiceBoardScreen() {
  const [lang, setLang] = useState<"en" | "ar">("ar");
  const [posts, setPosts] = useState<Post[]>(initialMockPosts);
  const [loading, setLoading] = useState(false);
  const [showPostModal, setShowPostModal] = useState(false);
  const [showBidModal, setShowBidModal] = useState(false);
  const [activePost, setActivePost] = useState<Post | null>(null);

  // New Request Form state
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newBudget, setNewBudget] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newDate, setNewDate] = useState("");

  // New Bid Form state
  const [bidPrice, setBidPrice] = useState("");
  const [bidNotes, setBidNotes] = useState("");
  const [bidProviderName, setBidProviderName] = useState("");

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
      reqLocationLabel: "District in Riyadh",
      reqDateLabel: "Scheduled Date (YYYY-MM-DD)",
      bidPriceLabel: "Proposal Price (SAR)",
      bidNotesLabel: "Offer Details",
      providerNameLabel: "Business / Artist Name",
      placeBidTitle: "Submit Proposal",
      successPost: "Request published successfully.",
      successBid: "Proposal submitted successfully.",
      acceptedSuccess: "Offer accepted! Request locked.",
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
      reqLocationLabel: "الحي بالرياض",
      reqDateLabel: "تاريخ الموعد (YYYY-MM-DD)",
      bidPriceLabel: "قيمة العرض المقترح (ريال)",
      bidNotesLabel: "تفاصيل العرض والمؤهلات",
      providerNameLabel: "اسم المركز أو مقدم الخدمة",
      placeBidTitle: "تقديم عرض سعر",
      successPost: "تم نشر طلب الخدمة بنجاح.",
      successBid: "تم تقديم عرض السعر بنجاح.",
      acceptedSuccess: "تم قبول العرض والتعاقد بنجاح.",
      errorFill: "يرجى تعبئة جميع الحقول المطلوبة."
    }
  }[lang];

  // Fetch job posts
  const loadServiceRequests = async () => {
    setLoading(true);
    try {
      // Fetch job posts from database
      const { data: jobPostsData, error: postsError } = await supabase
        .from("job_posts")
        .select(`
          id,
          title,
          description,
          address_text,
          target_date,
          budget_max,
          status
        `)
        .order("created_at", { ascending: false });

      if (postsError) throw postsError;

      if (jobPostsData && jobPostsData.length > 0) {
        // Fetch corresponding bids
        const formattedPosts: Post[] = await Promise.all(
          jobPostsData.map(async (jp: any) => {
            const { data: bidsData, error: bidsError } = await supabase
              .from("job_bids")
              .select(`
                id,
                bid_price,
                proposal_notes,
                status,
                provider_id,
                providers (
                  business_name_en,
                  business_name_ar
                )
              `)
              .eq("job_post_id", jp.id);

            const formattedBids: Bid[] = (bidsData || []).map((b: any) => ({
              id: b.id,
              providerName: lang === "ar" ? b.providers?.business_name_ar : b.providers?.business_name_en,
              price: Number(b.bid_price),
              notes: b.proposal_notes || "",
              status: b.status
            }));

            return {
              id: jp.id,
              title: jp.title,
              description: jp.description,
              location: jp.address_text,
              date: jp.target_date.split("T")[0],
              budgetMax: Number(jp.budget_max),
              status: jp.status === "open" ? "open" : "assigned",
              bids: formattedBids
            };
          })
        );
        setPosts(formattedPosts);
      } else {
        setPosts(initialMockPosts);
      }
    } catch (err) {
      console.log("Supabase fetch failed, falling back to mock data:", err);
      // Keep mock posts
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadServiceRequests();
  }, [lang]);

  // Handle Post Care Request
  const handlePostRequest = async () => {
    if (!newTitle.trim() || !newDesc.trim() || !newBudget.trim() || !newLocation.trim() || !newDate.trim()) {
      Alert.alert(isRTL ? "خطأ" : "Error", t.errorFill);
      return;
    }

    const budgetVal = parseFloat(newBudget);
    const newRequest: Post = {
      id: `post-${Date.now()}`,
      title: newTitle,
      description: newDesc,
      location: newLocation,
      date: newDate,
      budgetMax: budgetVal,
      status: "open",
      bids: []
    };

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Fetch a category ID to bypass NOT NULL constraint if available
        const { data: catData } = await supabase.from("categories").select("id").limit(1);
        const catId = catData && catData.length > 0 ? catData[0].id : null;

        if (catId) {
          const { error } = await supabase.from("job_posts").insert({
            customer_id: user.id,
            category_id: catId,
            title: newTitle,
            description: newDesc,
            address_text: newLocation,
            latitude: 24.7136, // Riyadh center fallback coords
            longitude: 46.6753,
            target_date: `${newDate}T12:00:00Z`,
            budget_max: budgetVal,
            status: "open"
          });
          if (error) throw error;
        }
      }
    } catch (err) {
      console.log("Supabase insert request failed, running offline update:", err);
    }

    setPosts(prev => [newRequest, ...prev]);
    setShowPostModal(false);
    // Reset form
    setNewTitle("");
    setNewDesc("");
    setNewBudget("");
    setNewLocation("");
    setNewDate("");
    Alert.alert(isRTL ? "تأكيد" : "Success", t.successPost);
  };

  // Handle Submit Bid
  const handleSubmitBid = async () => {
    if (!activePost || !bidPrice.trim() || !bidNotes.trim() || !bidProviderName.trim()) {
      Alert.alert(isRTL ? "خطأ" : "Error", t.errorFill);
      return;
    }

    const priceVal = parseFloat(bidPrice);
    const newBid: Bid = {
      id: `bid-${Date.now()}`,
      providerName: bidProviderName,
      price: priceVal,
      notes: bidNotes,
      status: "pending"
    };

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Fetch provider linked to active owner profile
        const { data: provData } = await supabase.from("providers").select("id").eq("owner_id", user.id).limit(1);
        const provId = provData && provData.length > 0 ? provData[0].id : null;

        if (provId) {
          const { error } = await supabase.from("job_bids").insert({
            job_post_id: activePost.id,
            provider_id: provId,
            bid_price: priceVal,
            proposal_notes: bidNotes,
            status: "pending"
          });
          if (error) throw error;
        }
      }
    } catch (err) {
      console.log("Supabase bid insert failed, running offline update:", err);
    }

    // Update locally
    setPosts(prev => prev.map(p => {
      if (p.id === activePost.id) {
        const updatedBids = [...p.bids, newBid];
        setActivePost({ ...p, bids: updatedBids });
        return { ...p, bids: updatedBids };
      }
      return p;
    }));

    setShowBidModal(false);
    setBidPrice("");
    setBidNotes("");
    setBidProviderName("");
    Alert.alert(isRTL ? "تأكيد" : "Success", t.successBid);
  };

  // Handle Accept Bid
  const handleAcceptBid = async (bidId: string) => {
    if (!activePost) return;

    try {
      // Update bid status and post status in Supabase
      const { error: bidErr } = await supabase.from("job_bids").update({ status: "accepted" }).eq("id", bidId);
      const { error: postErr } = await supabase.from("job_posts").update({ status: "assigned" }).eq("id", activePost.id);
      
      if (bidErr || postErr) throw bidErr || postErr;
    } catch (err) {
      console.log("Supabase accept update failed, running offline update:", err);
    }

    setPosts(prev => prev.map(p => {
      if (p.id === activePost.id) {
        const updatedBids = p.bids.map(b => b.id === bidId ? { ...b, status: "accepted" as const } : b);
        const updatedPost = { ...p, status: "assigned" as const, bids: updatedBids };
        setActivePost(updatedPost);
        return updatedPost;
      }
      return p;
    }));

    Alert.alert(isRTL ? "تم القبول" : "Accepted", t.acceptedSuccess);
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
        <TouchableOpacity style={styles.postBtn} onPress={() => setShowPostModal(true)}>
          <Text style={styles.postBtnText}>{t.postBtn}</Text>
        </TouchableOpacity>

        {loading ? (
          <ActivityIndicator color="hsl(45,60%,55%)" size="large" style={styles.loader} />
        ) : (
          <View style={styles.listContainer}>
            {posts.map(post => (
              <View key={post.id} style={styles.postCard}>
                <View style={[styles.cardHeader, isRTL && styles.rtlRow]}>
                  <Text style={styles.cardTitle}>{post.title}</Text>
                  <View style={[
                    styles.statusBadge,
                    post.status === "assigned" && styles.statusBadgeClosed
                  ]}>
                    <Text style={[
                      styles.statusBadgeText,
                      post.status === "assigned" && styles.statusBadgeTextClosed
                    ]}>
                      {post.status === "open" ? t.statusOpen : t.statusClosed}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.cardDesc, isRTL && styles.textRight]}>{post.description}</Text>

                <View style={[styles.cardMetrics, isRTL && styles.rtlRow]}>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>{t.budget}</Text>
                    <Text style={styles.metricVal}>{post.budgetMax} SAR</Text>
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
                      <Text style={styles.bidPrice}>{bid.price} SAR</Text>
                    </View>
                    <Text style={[styles.bidNotes, isRTL && styles.textRight]}>{bid.notes}</Text>
                    
                    {post.status === "open" && (
                      <TouchableOpacity 
                        style={styles.acceptBidBtn}
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

                {post.status === "open" && (
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
                placeholder="e.g. 500"
                placeholderTextColor="#a8a29e"
              />

              <Text style={[styles.inputLabel, isRTL && styles.textRight]}>{t.reqLocationLabel}</Text>
              <TextInput
                style={[styles.modalInput, isRTL && styles.textRight]}
                value={newLocation}
                onChangeText={setNewLocation}
                placeholder="e.g. Al-Malqa, Riyadh"
                placeholderTextColor="#a8a29e"
              />

              <Text style={[styles.inputLabel, isRTL && styles.textRight]}>{t.reqDateLabel}</Text>
              <TextInput
                style={[styles.modalInput, isRTL && styles.textRight]}
                value={newDate}
                onChangeText={setNewDate}
                placeholder="2026-06-18"
                placeholderTextColor="#a8a29e"
              />

              <View style={[styles.modalActionRow, isRTL && styles.rtlRow]}>
                <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setShowPostModal(false)}>
                  <Text style={styles.modalBtnCancelLabel}>{t.cancel}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalBtnConfirm} onPress={handlePostRequest}>
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
              <Text style={[styles.inputLabel, isRTL && styles.textRight]}>{t.providerNameLabel}</Text>
              <TextInput
                style={[styles.modalInput, isRTL && styles.textRight]}
                value={bidProviderName}
                onChangeText={setBidProviderName}
                placeholder="e.g. Elite Grooming Lounge"
                placeholderTextColor="#a8a29e"
              />

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
                <TouchableOpacity style={styles.modalBtnConfirm} onPress={handleSubmitBid}>
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
