import React, { useCallback, useEffect, useState } from "react";
import { useLocale } from "@/lib/locale";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ShopDetailsModal } from "@/components/shop-details-modal";
import { Category, MarketplaceProvider, formatSar, loadCategories, searchProviders } from "@/lib/marketplace";
import { errorMessage } from "@/lib/error-message";

type LoadState = "loading" | "ready" | "error";

export default function HomeScreen() {
  const { lang, setLang } = useLocale();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [categories, setCategories] = useState<Category[]>([]);
  const [providers, setProviders] = useState<MarketplaceProvider[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState<MarketplaceProvider | null>(null);

  const toggleLanguage = () => setLang((prev) => (prev === "en" ? "ar" : "en"));

  // Bilingual UI Dictionary
  const t = {
    en: {
      brand: "Beauty & Grooming",
      city: "Saudi Arabia",
      searchPlaceholder: "Search salons, services or districts...",
      allCategories: "All",
      topSalons: "Recommended Near You",
      reviews: "reviews",
      newShop: "New - no reviews yet",
      startingFrom: "Starting from",
      bookNow: "Book Slot",
      empty: "No shops match your search yet.",
      emptyAll: "No shops are listed yet.",
      loadFailed: "Could not load shops",
      retry: "Try again",
      verifiedCr: "Verified CR"
    },
    ar: {
      brand: "الجمال والعناية",
      city: "المملكة العربية السعودية",
      searchPlaceholder: "ابحث عن صالون أو خدمة أو حي...",
      allCategories: "الكل",
      topSalons: "الموصى بها بالقرب منك",
      reviews: "تقييمات",
      newShop: "جديد - لا توجد تقييمات بعد",
      startingFrom: "يبدأ من",
      bookNow: "احجز الموعد",
      empty: "لا توجد صالونات مطابقة لبحثك حالياً.",
      emptyAll: "لا توجد صالونات مدرجة بعد.",
      loadFailed: "تعذر تحميل الصالونات",
      retry: "إعادة المحاولة",
      verifiedCr: "سجل تجاري موثق"
    }
  }[lang];

  useEffect(() => {
    loadCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  const runSearch = useCallback(async (signal: { cancelled: boolean }) => {
    setLoadState("loading");
    try {
      const result = await searchProviders({ query, category });
      if (signal.cancelled) return;
      setProviders(result.providers);
      setLoadState("ready");
    } catch (err) {
      if (signal.cancelled) return;
      setLoadError(errorMessage(err));
      setLoadState("error");
    }
  }, [query, category]);

  useEffect(() => {
    const signal = { cancelled: false };
    const timer = setTimeout(() => runSearch(signal), 300);
    return () => {
      signal.cancelled = true;
      clearTimeout(timer);
    };
  }, [runSearch, reloadKey]);

  const isAr = lang === "ar";

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* HEADER */}
        <View style={[styles.header, isAr && styles.rtlRow]}>
          <View>
            <Text style={styles.brandText}>{t.brand}</Text>
            <Text style={styles.subBrandText}>{t.city}</Text>
          </View>
          <TouchableOpacity onPress={toggleLanguage} style={styles.langBtn}>
            <Text style={styles.langBtnText}>{isAr ? "English" : "العربية"}</Text>
          </TouchableOpacity>
        </View>

        {/* SEARCH BAR */}
        <View style={[styles.searchContainer, isAr && styles.rtlRow]}>
          <TextInput
            placeholder={t.searchPlaceholder}
            placeholderTextColor="hsl(210,8%,65%)"
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            style={[styles.searchInput, isAr && styles.rtlText, { paddingHorizontal: 12 }]}
          />
        </View>

        {/* CATEGORIES (from the categories table) */}
        {categories.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={isAr && styles.rtlRow}>
            {[{ id: "all", slug: "all", name: { en: t.allCategories, ar: t.allCategories } }, ...categories].map((cat) => (
              <TouchableOpacity
                key={cat.id}
                onPress={() => setCategory(cat.slug)}
                style={[styles.catCard, category === cat.slug && styles.catCardActive]}
              >
                <Text style={[styles.catName, category === cat.slug && styles.catNameActive]}>{cat.name[lang]}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* RECOMMENDED FEED */}
        <Text style={[styles.sectionTitle, isAr && styles.rtlText]}>{t.topSalons}</Text>
        {loadState === "loading" && <ActivityIndicator color="hsl(45,60%,55%)" style={styles.stateBox} />}
        {loadState === "error" && (
          <View style={styles.stateBox}>
            <Text style={styles.stateTitle}>{t.loadFailed}</Text>
            <Text style={styles.stateText}>{loadError}</Text>
            <TouchableOpacity onPress={() => setReloadKey((k) => k + 1)} style={styles.bookBtn}>
              <Text style={styles.bookBtnText}>{t.retry}</Text>
            </TouchableOpacity>
          </View>
        )}
        {loadState === "ready" && providers.length === 0 && (
          <View style={styles.stateBox}>
            <Text style={styles.stateText}>{query.trim() || category !== "all" ? t.empty : t.emptyAll}</Text>
          </View>
        )}
        {loadState === "ready" && providers.length > 0 && (
          <View style={styles.providerGrid}>
            {providers.map((provider) => (
              <View key={provider.branchId} style={styles.providerCard}>
                <View style={styles.cardDetails}>
                  <Text style={[styles.cardName, isAr && styles.rtlText]}>{provider.name[lang]}</Text>
                  <Text style={[styles.cardLoc, isAr && styles.rtlText]}>
                    {[provider.district, provider.city].filter(Boolean).join(isAr ? "، " : ", ")}
                    {provider.distanceKm !== null ? ` • ${provider.distanceKm} km` : ""}
                  </Text>
                  <Text style={[styles.cardRating, isAr && styles.rtlText]}>
                    {provider.rating !== null ? `★ ${provider.rating} (${provider.reviews} ${t.reviews})` : t.newShop}
                    {provider.crVerified ? ` • ${t.verifiedCr}` : ""}
                  </Text>

                  <View style={[styles.cardFooter, isAr && styles.rtlRow]}>
                    {provider.startingPrice !== null ? (
                      <Text style={styles.cardPrice}>{t.startingFrom}: <Text style={styles.priceHighlight}>{formatSar(provider.startingPrice, lang)}</Text></Text>
                    ) : <View />}
                    <TouchableOpacity
                      onPress={() => setSelectedProvider(provider)}
                      style={styles.bookBtn}
                    >
                      <Text style={styles.bookBtnText}>{t.bookNow}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

      </ScrollView>

      {/* SHOP DETAILS & BOOKING MODAL */}
      {selectedProvider && (
        <ShopDetailsModal
          shop={selectedProvider}
          locale={lang}
          onClose={() => setSelectedProvider(null)}
        />
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  catCardActive: {
    backgroundColor: "hsl(45,60%,55%)"
  },
  catNameActive: {
    color: "hsl(220,15%,8%)",
    fontWeight: "700"
  },
  stateBox: {
    paddingVertical: 32,
    alignItems: "center",
    gap: 12
  },
  stateTitle: {
    color: "hsl(0,0%,98%)",
    fontSize: 14,
    fontWeight: "700"
  },
  stateText: {
    color: "hsl(210,8%,65%)",
    fontSize: 12,
    textAlign: "center"
  },
  container: {
    flex: 1,
    backgroundColor: "hsl(220,15%,8%)",
    paddingHorizontal: 16
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 16,
    width: "100%"
  },
  rtlRow: {
    flexDirection: "row-reverse"
  },
  brandText: {
    fontSize: 22,
    fontWeight: "bold",
    color: "hsl(0,0%,98%)"
  },
  subBrandText: {
    fontSize: 12,
    color: "hsl(210,8%,65%)",
    marginTop: 4
  },
  langBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "hsla(0,0%,100%,0.08)",
    backgroundColor: "hsla(0,0%,100%,0.02)"
  },
  langBtnText: {
    color: "hsl(45,60%,55%)",
    fontSize: 12,
    fontWeight: "bold"
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "hsla(0,0%,100%,0.03)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "hsla(0,0%,100%,0.05)",
    marginBottom: 20
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8
  },
  searchInput: {
    flex: 1,
    color: "hsl(0,0%,98%)",
    fontSize: 14,
    textAlign: "left"
  },
  rtlText: {
    textAlign: "right"
  },
  toggleWrapper: {
    flexDirection: "row",
    backgroundColor: "hsl(220,12%,14%)",
    borderRadius: 10,
    padding: 4,
    marginBottom: 24
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 8
  },
  toggleActive: {
    backgroundColor: "hsl(45,60%,55%)"
  },
  toggleText: {
    color: "hsl(210,8%,65%)",
    fontWeight: "600",
    fontSize: 14
  },
  toggleTextActive: {
    color: "hsl(220,15%,8%)"
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "hsl(0,0%,98%)",
    marginBottom: 12,
    textAlign: "left"
  },
  catScroll: {
    marginBottom: 24
  },
  catCard: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "hsl(220,12%,14%)",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    borderWidth: 1,
    borderColor: "hsla(0,0%,100%,0.05)"
  },
  catName: {
    fontSize: 11,
    color: "hsl(210,8%,65%)",
    fontWeight: "500"
  },
  providerGrid: {
    gap: 16,
    paddingBottom: 40
  },
  providerCard: {
    backgroundColor: "hsl(220,12%,14%)",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "hsla(0,0%,100%,0.05)"
  },
  cardImg: {
    width: "100%",
    height: 140
  },
  cardDetails: {
    padding: 16
  },
  cardName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "hsl(0,0%,98%)"
  },
  cardLoc: {
    fontSize: 12,
    color: "hsl(210,8%,65%)",
    marginTop: 6
  },
  cardRating: {
    fontSize: 12,
    color: "hsl(210,8%,65%)",
    marginTop: 4
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
    width: "100%"
  },
  cardPrice: {
    fontSize: 12,
    color: "hsl(210,8%,65%)"
  },
  priceHighlight: {
    color: "hsl(0,0%,98%)",
    fontWeight: "bold",
    fontSize: 14
  },
  bookBtn: {
    backgroundColor: "hsl(45,60%,55%)",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8
  },
  bookBtnText: {
    color: "hsl(220,15%,8%)",
    fontWeight: "bold",
    fontSize: 12
  }
});
