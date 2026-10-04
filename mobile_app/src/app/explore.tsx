import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  FlatList,
  ActivityIndicator
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ShopDetailsModal } from "@/components/shop-details-modal";
import { supabase } from "@/lib/supabase";
import { Category, MarketplaceProvider, formatSar, loadCategories, searchProviders } from "@/lib/marketplace";

type LoadState = "loading" | "ready" | "error";
type Area = { city: string; districts: string[] };

// Places pins inside the bounding box of the shops being shown. Positions are relative to each
// other, not to a street map.
function projectPins(providers: MarketplaceProvider[]) {
  const located = providers.filter((p) => p.latitude !== null && p.longitude !== null);
  if (located.length === 0) return [];
  const lats = located.map((p) => p.latitude as number);
  const lngs = located.map((p) => p.longitude as number);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const spanLat = maxLat - minLat || 1;
  const spanLng = maxLng - minLng || 1;
  return located.map((p) => ({
    provider: p,
    left: `${10 + (((p.longitude as number) - minLng) / spanLng) * 80}%`,
    top: `${10 + ((maxLat - (p.latitude as number)) / spanLat) * 70}%`,
  }));
}

export default function ExploreScreen() {
  const [lang, setLang] = useState<"en" | "ar">("ar");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("all");
  const [selectedCity, setSelectedCity] = useState("all");
  const [selectedLocation, setSelectedLocation] = useState("all");
  const [selectedProvider, setSelectedProvider] = useState<MarketplaceProvider | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [selectedMapShop, setSelectedMapShop] = useState<MarketplaceProvider | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [providers, setProviders] = useState<MarketplaceProvider[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const toggleLanguage = () => setLang((prev) => (prev === "en" ? "ar" : "en"));
  const isAr = lang === "ar";

  const t = {
    en: {
      title: "Discover & Explore",
      subtitle: "Find verified beauty & grooming venues near you",
      searchPlaceholder: "Search salons, services or districts...",
      reviews: "reviews",
      newShop: "New",
      empty: "No results match your filters",
      langBtn: "العربية",
      listView: "List",
      mapView: "Map",
      allCategories: "All",
      allCities: "All cities",
      allDistricts: "All districts",
      mapTitle: "Shops on the map",
      mapInstructions: "Pins show where shops are relative to each other. Tap a pin to book.",
      noCoordinates: "None of these shops has a map location yet.",
      close: "Close",
      bookNow: "Book Now",
      loadFailed: "Could not load shops",
      retry: "Try again"
    },
    ar: {
      title: "البحث والاستكشاف",
      subtitle: "ابحث عن صالونات تجميل وعناية موثقة بالقرب منك",
      searchPlaceholder: "ابحث عن صالون أو خدمة أو حي...",
      reviews: "تقييم",
      newShop: "جديد",
      empty: "لم يتم العثور على أي نتائج مطابقة",
      langBtn: "English",
      listView: "قائمة",
      mapView: "خريطة",
      allCategories: "الكل",
      allCities: "كل المدن",
      allDistricts: "كل الأحياء",
      mapTitle: "الصالونات على الخريطة",
      mapInstructions: "تُظهر المؤشرات مواقع الصالونات بالنسبة لبعضها. انقر على مؤشر للحجز.",
      noCoordinates: "لا يوجد موقع على الخريطة لهذه الصالونات بعد.",
      close: "إغلاق",
      bookNow: "حجز الموعد",
      loadFailed: "تعذر تحميل الصالونات",
      retry: "إعادة المحاولة"
    }
  }[lang];

  // Filter options come from the database: active categories and the cities/districts of active branches.
  useEffect(() => {
    loadCategories().then(setCategories).catch(() => setCategories([]));
    supabase.from("branches").select("city, district").eq("is_active", true).then(({ data }) => {
      const byCity = new Map<string, Set<string>>();
      for (const row of (data || []) as { city: string | null; district: string | null }[]) {
        if (!row.city) continue;
        if (!byCity.has(row.city)) byCity.set(row.city, new Set());
        if (row.district) byCity.get(row.city)!.add(row.district);
      }
      setAreas([...byCity.entries()].map(([city, districts]) => ({ city, districts: [...districts].sort() })));
    });
  }, []);

  const runSearch = useCallback(async (signal: { cancelled: boolean }) => {
    setLoadState("loading");
    try {
      const result = await searchProviders({
        query: searchQuery,
        category: selectedFilter,
        city: selectedCity,
        district: selectedLocation,
        limit: 50,
      });
      if (signal.cancelled) return;
      const mapped = result.providers;
      setProviders(mapped);
      setLoadState("ready");
    } catch (err) {
      if (signal.cancelled) return;
      setLoadError(err instanceof Error ? err.message : String(err));
      setLoadState("error");
    }
  }, [searchQuery, selectedFilter, selectedCity, selectedLocation]);

  useEffect(() => {
    const signal = { cancelled: false };
    const timer = setTimeout(() => runSearch(signal), 300);
    return () => {
      signal.cancelled = true;
      clearTimeout(timer);
    };
  }, [runSearch, reloadKey]);

  const districtOptions = useMemo(
    () => (selectedCity === "all" ? [] : areas.find((a) => a.city === selectedCity)?.districts || []),
    [areas, selectedCity]
  );
  const pins = useMemo(() => projectPins(providers), [providers]);

  const chipRow = (
    items: { id: string; label: string }[],
    active: string,
    onSelect: (id: string) => void,
    variant: "filter" | "loc"
  ) => (
    <FlatList
      data={items}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <TouchableOpacity
          onPress={() => onSelect(item.id)}
          style={[variant === "filter" ? styles.filterChip : styles.locChip, active === item.id && (variant === "filter" ? styles.activeChip : styles.activeLocChip)]}
        >
          <Text style={[variant === "filter" ? styles.chipText : styles.locChipText, active === item.id && (variant === "filter" ? styles.activeChipText : styles.activeLocChipText)]}>
            {item.label}
          </Text>
        </TouchableOpacity>
      )}
      contentContainerStyle={[variant === "filter" ? styles.chipList : styles.locChipList, isAr && styles.rtlRow]}
    />
  );

  const ratingText = (p: MarketplaceProvider) =>
    p.rating !== null ? `★ ${p.rating} (${p.reviews} ${t.reviews})` : t.newShop;

  return (
    <SafeAreaView style={styles.container}>
      {/* Search Header */}
      <View style={styles.searchHeader}>
        <View style={{ flexDirection: isAr ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <Text style={[styles.title, isAr && styles.rtlText]}>{t.title}</Text>
            <Text style={[styles.subtitle, isAr && styles.rtlText]}>{t.subtitle}</Text>
          </View>
          <TouchableOpacity onPress={toggleLanguage} style={styles.langBtn}>
            <Text style={styles.langBtnText}>{t.langBtn}</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.searchContainer, isAr && styles.rtlRow]}>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t.searchPlaceholder}
            placeholderTextColor="hsl(210,8%,65%)"
            style={[styles.searchInput, isAr && styles.rtlText, { paddingHorizontal: 10 }]}
          />
        </View>

        {/* List/Map Selector */}
        <View style={{ flexDirection: isAr ? "row-reverse" : "row", marginTop: 12 }}>
          <View style={{ flexDirection: isAr ? "row-reverse" : "row", backgroundColor: "hsl(220,12%,14%)", borderRadius: 8, padding: 2 }}>
            {(["list", "map"] as const).map((mode) => (
              <TouchableOpacity
                key={mode}
                onPress={() => {
                  setViewMode(mode);
                  setSelectedMapShop(null);
                }}
                style={[{ paddingVertical: 6, paddingHorizontal: 16, borderRadius: 6 }, viewMode === mode && { backgroundColor: "hsl(45,60%,55%)" }]}
              >
                <Text style={{ fontSize: 11, fontWeight: "bold", color: viewMode === mode ? "hsl(220,15%,8%)" : "hsl(0,0%,80%)" }}>
                  {mode === "list" ? t.listView : t.mapView}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* Filters */}
      <View style={styles.filterSection}>
        {chipRow(
          [{ id: "all", label: t.allCategories }, ...categories.map((c) => ({ id: c.slug, label: c.name[lang] }))],
          selectedFilter,
          setSelectedFilter,
          "filter"
        )}
        {areas.length > 0 && chipRow(
          [{ id: "all", label: t.allCities }, ...areas.map((a) => ({ id: a.city, label: a.city }))],
          selectedCity,
          (id) => {
            setSelectedCity(id);
            setSelectedLocation("all");
          },
          "loc"
        )}
        {districtOptions.length > 0 && chipRow(
          [{ id: "all", label: t.allDistricts }, ...districtOptions.map((d) => ({ id: d, label: d }))],
          selectedLocation,
          setSelectedLocation,
          "loc"
        )}
      </View>

      {loadState === "loading" && <ActivityIndicator color="hsl(45,60%,55%)" style={styles.emptyContainer} />}
      {loadState === "error" && (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{t.loadFailed}: {loadError}</Text>
          <TouchableOpacity onPress={() => setReloadKey((k) => k + 1)} style={[styles.mapOverlayBookBtn, { marginTop: 12 }]}>
            <Text style={styles.mapOverlayBookText}>{t.retry}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Results List or Map */}
      {loadState === "ready" && (viewMode === "map" ? (
        <ScrollView style={styles.mapScroll} contentContainerStyle={styles.mapContainer}>
          <View style={styles.mapCard}>
            <View style={[styles.mapHeaderRow, isAr && styles.rtlRow]}>
              <View>
                <Text style={[styles.mapTitle, isAr && styles.rtlText]}>{t.mapTitle}</Text>
                <Text style={[styles.mapSubtitle, isAr && styles.rtlText]}>{t.mapInstructions}</Text>
              </View>
            </View>

            <View style={styles.mapCanvas}>
              <View style={styles.gridLineH1} />
              <View style={styles.gridLineH2} />
              <View style={styles.gridLineH3} />
              <View style={styles.gridLineV1} />
              <View style={styles.gridLineV2} />
              <View style={styles.gridLineV3} />

              {pins.length === 0 && (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>{providers.length === 0 ? t.empty : t.noCoordinates}</Text>
                </View>
              )}

              {pins.map((pin) => (
                <TouchableOpacity
                  key={pin.provider.branchId}
                  onPress={() => setSelectedMapShop(pin.provider)}
                  style={[styles.mapPinContainer, { left: pin.left as any, top: pin.top as any }]}
                >
                  <View style={styles.pinBubble}>
                    <Text style={styles.pinBubbleText} numberOfLines={1}>{pin.provider.name[lang]}</Text>
                  </View>
                  <View style={styles.pinPulseRing} />
                  <View style={styles.pinGlowInner} />
                  <View style={styles.pinDot} />
                </TouchableOpacity>
              ))}

              {selectedMapShop && (
                <View style={[styles.mapOverlayCard, isAr && styles.rtlRow]}>
                  <View style={{ flex: 1, paddingHorizontal: 10, justifyContent: "center" }}>
                    <Text style={[styles.mapOverlayName, isAr && styles.rtlText]} numberOfLines={1}>
                      {selectedMapShop.name[lang]}
                    </Text>
                    <Text style={[styles.mapOverlayAddress, isAr && styles.rtlText]} numberOfLines={1}>
                      {[selectedMapShop.district, selectedMapShop.city].filter(Boolean).join(isAr ? "، " : ", ")}
                    </Text>
                    <Text style={[styles.mapOverlayRating, isAr && styles.rtlText]}>{ratingText(selectedMapShop)}</Text>
                  </View>
                  <View style={{ gap: 6, justifyContent: "center" }}>
                    <TouchableOpacity onPress={() => setSelectedProvider(selectedMapShop)} style={styles.mapOverlayBookBtn}>
                      <Text style={styles.mapOverlayBookText}>{t.bookNow}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setSelectedMapShop(null)} style={styles.mapOverlayCloseBtn}>
                      <Text style={styles.mapOverlayCloseText}>{t.close}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={providers}
          keyExtractor={(item) => item.branchId}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => setSelectedProvider(item)}>
              <View style={styles.cardContent}>
                <View style={[styles.cardHeader, isAr && styles.rtlRow]}>
                  <Text style={styles.cardName}>{item.name[lang]}</Text>
                  {item.startingPrice !== null && (
                    <Text style={styles.cardPrice}>{formatSar(item.startingPrice, lang)}</Text>
                  )}
                </View>

                <View style={[styles.cardFooter, isAr && styles.rtlRow]}>
                  <Text style={styles.cardLoc}>{[item.district, item.city].filter(Boolean).join(isAr ? "، " : ", ")}</Text>
                  <Text style={styles.cardRating}>{ratingText(item)}</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>{t.empty}</Text>
            </View>
          }
          contentContainerStyle={styles.resultsList}
        />
      ))}

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

const styles: any = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "hsl(220,15%,8%)"
  },
  searchHeader: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    color: "hsl(0,0%,98%)",
    textAlign: "left"
  },
  subtitle: {
    fontSize: 11,
    color: "hsl(210,8%,65%)",
    marginTop: 6,
    textAlign: "left",
    marginBottom: 16
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
    backgroundColor: "hsl(220,12%,14%)",
    borderWidth: 1,
    borderColor: "hsla(0,0%,100%,0.05)",
    borderRadius: 12,
    height: 48,
    justifyContent: "center",
    paddingHorizontal: 16
  },
  searchInput: {
    color: "hsl(0,0%,98%)",
    fontSize: 14,
    textAlign: "left"
  },
  filterSection: {
    marginVertical: 12
  },
  chipList: {

    paddingHorizontal: 16,
    paddingBottom: 8,
    flexDirection: "row-reverse"
  },
  filterChip: {
    backgroundColor: "hsl(220,12%,14%)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: "hsla(0,0%,100%,0.05)"
  },
  activeChip: {
    backgroundColor: "hsl(45,60%,55%)",
    borderColor: "hsl(45,60%,55%)"
  },
  chipText: {
    fontSize: 12,
    color: "hsl(210,8%,65%)",
    fontWeight: "600"
  },
  activeChipText: {
    color: "hsl(220,15%,8%)"
  },
  locChipList: {
    paddingHorizontal: 16,
    paddingTop: 4,
    flexDirection: "row-reverse"
  },
  locChip: {
    backgroundColor: "transparent",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: "hsla(0,0%,100%,0.08)"
  },
  activeLocChip: {
    borderColor: "hsl(45,60%,55%)",
    backgroundColor: "hsla(45,60%,55%,0.08)"
  },
  locChipText: {
    fontSize: 11,
    color: "hsl(210,8%,65%)"
  },
  activeLocChipText: {
    color: "hsl(45,60%,55%)"
  },
  resultsList: {
    padding: 16
  },
  card: {
    backgroundColor: "hsl(220,12%,14%)",
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "hsla(0,0%,100%,0.05)"
  },
  cardImage: {
    width: "100%",
    height: 150
  },
  cardContent: {
    padding: 16
  },
  cardHeader: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center"
  },
  cardName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "hsl(0,0%,98%)"
  },
  cardPrice: {
    fontSize: 15,
    fontWeight: "bold",
    color: "hsl(45,60%,55%)"
  },
  cardFooter: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12
  },
  cardLoc: {
    fontSize: 12,
    color: "hsl(210,8%,65%)"
  },
  cardRating: {
    fontSize: 12,
    color: "hsl(210,8%,65%)"
  },
  emptyContainer: {
    padding: 40,
    alignItems: "center"
  },
  emptyText: {
    color: "hsl(210,8%,65%)",
    fontSize: 14
  },
  rtlRow: {
    flexDirection: "row-reverse"
  },
  rtlText: {
    textAlign: "right"
  },
  mapScroll: {
    flex: 1
  },
  mapContainer: {
    padding: 16,
    paddingBottom: 32
  },
  mapCard: {
    backgroundColor: "hsl(220,12%,14%)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "hsla(0,0%,100%,0.05)",
    overflow: "hidden",
    padding: 16
  },
  mapHeaderRow: {
    marginBottom: 12
  },
  mapTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "hsl(0,0%,98%)"
  },
  mapSubtitle: {
    fontSize: 11,
    color: "hsl(210,8%,65%)",
    marginTop: 4
  },
  mapCanvas: {
    height: 380,
    backgroundColor: "hsl(220,15%,8%)",
    borderWidth: 1,
    borderColor: "hsla(0,0%,100%,0.05)",
    borderRadius: 12,
    overflow: "hidden",
    position: "relative"
  },
  gridLineH1: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "25%",
    height: 1,
    backgroundColor: "hsla(0,0%,100%,0.02)"
  },
  gridLineH2: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "50%",
    height: 1,
    backgroundColor: "hsla(0,0%,100%,0.02)"
  },
  gridLineH3: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "75%",
    height: 1,
    backgroundColor: "hsla(0,0%,100%,0.02)"
  },
  gridLineV1: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: "25%",
    width: 1,
    backgroundColor: "hsla(0,0%,100%,0.02)"
  },
  gridLineV2: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: "50%",
    width: 1,
    backgroundColor: "hsla(0,0%,100%,0.02)"
  },
  gridLineV3: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: "75%",
    width: 1,
    backgroundColor: "hsla(0,0%,100%,0.02)"
  },
  routingBoundaryRing: {
    position: "absolute",
    left: "15%",
    top: "15%",
    width: "70%",
    height: "70%",
    borderRadius: 150,
    borderWidth: 1,
    borderColor: "hsla(45,60%,50%,0.12)",
    borderStyle: "dashed"
  },
  routingBoundaryText: {
    position: "absolute",
    top: "10%",
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 8,
    color: "hsla(45,60%,50%,0.3)",
    fontWeight: "bold"
  },
  districtLabel: {
    position: "absolute",
    fontSize: 9,
    fontWeight: "800",
    color: "rgba(255,255,255,0.22)",
    textAlign: "center",
    letterSpacing: 1
  },
  redSeaBlock: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: "32%",
    backgroundColor: "rgba(14, 116, 144, 0.08)",
    borderRightWidth: 1.5,
    borderRightColor: "rgba(14, 116, 144, 0.2)",
    justifyContent: "center",
    alignItems: "center"
  },
  redSeaText: {
    color: "rgba(14, 116, 144, 0.35)",
    fontSize: 10,
    fontWeight: "bold",
    textAlign: "center",
    letterSpacing: 1
  },
  mapPinContainer: {
    position: "absolute",
    width: 28,
    height: 28,
    marginLeft: -14,
    marginTop: -14,
    justifyContent: "center",
    alignItems: "center"
  },
  pinPulseRing: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "hsl(45,60%,50%)"
  },
  pinGlowInner: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "hsla(45,60%,50%,0.2)"
  },
  pinDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "hsl(45,60%,50%)",
    borderWidth: 1,
    borderColor: "#ffffff"
  },
  pinBubble: {
    position: "absolute",
    bottom: 32,
    backgroundColor: "rgba(0,0,0,0.85)",
    borderWidth: 0.5,
    borderColor: "hsla(45,60%,50%,0.3)",
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
    width: 90,
    alignItems: "center"
  },
  pinBubbleText: {
    color: "#ffffff",
    fontSize: 7,
    fontWeight: "bold",
    textAlign: "center"
  },
  mapOverlayCard: {
    position: "absolute",
    bottom: 12,
    left: 12,
    right: 12,
    backgroundColor: "hsl(220,12%,14%)",
    borderWidth: 1,
    borderColor: "hsla(0,0%,100%,0.08)",
    borderRadius: 12,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 6
  },
  mapOverlayImage: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "hsla(0,0%,100%,0.08)"
  },
  mapOverlayName: {
    color: "hsl(0,0%,98%)",
    fontSize: 12,
    fontWeight: "bold"
  },
  mapOverlayAddress: {
    color: "hsl(210,8%,65%)",
    fontSize: 9,
    marginTop: 2
  },
  mapOverlayRating: {
    color: "hsl(45,60%,55%)",
    fontSize: 10,
    fontWeight: "bold",
    marginTop: 2
  },
  mapOverlayBookBtn: {
    backgroundColor: "hsl(45,60%,55%)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: "center"
  },
  mapOverlayBookText: {
    color: "hsl(220,15%,8%)",
    fontSize: 10,
    fontWeight: "bold"
  },
  mapOverlayCloseBtn: {
    borderWidth: 1,
    borderColor: "hsla(0,0%,100%,0.08)",
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: "center"
  },
  mapOverlayCloseText: {
    color: "hsl(210,8%,65%)",
    fontSize: 9,
    fontWeight: "bold"
  }
});
