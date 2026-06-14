import React, { useState } from "react";
import { 
  StyleSheet, 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  Image, 
  FlatList, 
  Dimensions 
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ShopDetailsModal } from "@/components/shop-details-modal";
import { mockShops, mockServices } from "@/constants/mockData";

const { width } = Dimensions.get("window");

export default function ExploreScreen() {
  const [lang, setLang] = useState<"en" | "ar">("ar");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("all");
  const [selectedLocation, setSelectedLocation] = useState("all");
  const [selectedProvider, setSelectedProvider] = useState<any>(null);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [selectedCity, setSelectedCity] = useState<"riyadh" | "jeddah">("riyadh");
  const [selectedMapShop, setSelectedMapShop] = useState<any>(null);

  const toggleLanguage = () => setLang((prev) => (prev === "en" ? "ar" : "en"));

  const categories = [
    { id: "all", name_ar: "الكل", name_en: "All" },
    { id: "haircut", name_ar: "قص شعر", name_en: "Haircut" },
    { id: "makeup", name_ar: "مكياج", name_en: "Makeup" },
    { id: "nails", name_ar: "أظافر", name_en: "Nails" },
    { id: "home", name_ar: "خدمة منزلية", name_en: "Home Service" },
    { id: "salon", name_ar: "صالونات", name_en: "Salons" }
  ];

  const locations = [
    { id: "all", name_ar: "كل الأحياء", name_en: "All Neighborhoods" },
    { id: "malqa", name_ar: "الملقا", name_en: "Al-Malqa" },
    { id: "olaya", name_ar: "العليا", name_en: "Olaya" },
    { id: "yasmin", name_ar: "الياسمين", name_en: "Al-Yasmin" },
    { id: "hamra", name_ar: "الحمراء", name_en: "Al-Hamra" },
    { id: "shatei", name_ar: "الشاطئ", name_en: "Ash-Shati" }
  ];

  const handleNeighborhoodSelect = (id: string) => {
    setSelectedLocation(id);
    if (id === "malqa" || id === "olaya" || id === "yasmin") {
      setSelectedCity("riyadh");
    } else if (id === "hamra" || id === "shatei") {
      setSelectedCity("jeddah");
    }
  };

  const filteredLocations = locations.filter(loc => {
    if (loc.id === "all") return true;
    if (selectedCity === "riyadh") {
      return loc.id === "malqa" || loc.id === "olaya" || loc.id === "yasmin";
    } else {
      return loc.id === "hamra" || loc.id === "shatei";
    }
  });

  const t = {
    en: {
      title: "Discover & Explore",
      subtitle: "Find the best beauty & grooming venues in Riyadh & Jeddah",
      searchPlaceholder: "Search salons, specialists, or styling...",
      startingFrom: "Starting from",
      reviews: "reviews",
      empty: "No results match your filters",
      langBtn: "العربية",
      listView: "List",
      mapView: "Map",
      riyadh: "Riyadh",
      jeddah: "Jeddah",
      interactiveMap: "Interactive Map",
      mapInstructions: "Tap gold pins to view details and book.",
      close: "Close",
      bookNow: "Book Now"
    },
    ar: {
      title: "البحث والاستكشاف",
      subtitle: "ابحث عن أفضل خدمات التجميل والعناية في الرياض وجدة",
      searchPlaceholder: "البحث عن الصالونات والمصففين والمكياج...",
      startingFrom: "يبدأ من",
      reviews: "تقييم",
      empty: "لم يتم العثور على أي نتائج مطابقة",
      langBtn: "English",
      listView: "قائمة",
      mapView: "خريطة",
      riyadh: "الرياض",
      jeddah: "جدة",
      interactiveMap: "خريطة تفاعلية",
      mapInstructions: "انقر على المؤشرات الذهبية لعرض التفاصيل وحجز موعد.",
      close: "إغلاق",
      bookNow: "حجز الموعد"
    }
  }[lang];

  // Use unified mockShops
  const mockProviders = mockShops;

  // Filter logic
  const filteredProviders = mockProviders.filter(p => {
    const matchesSearch = p.name.en.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          p.name.ar.includes(searchQuery) ||
                          p.address.en.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          p.address.ar.includes(searchQuery);
    
    const matchesCategory = selectedFilter === "all" || 
                            (selectedFilter === "home" && mockServices.some(s => s.shopId === p.id && s.serviceType === "mobile")) ||
                            (selectedFilter === "salon" && mockServices.some(s => s.shopId === p.id && s.serviceType === "salon")) ||
                            mockServices.some(s => s.shopId === p.id && s.category === selectedFilter);

    const matchesLocation = selectedLocation === "all" || 
                            p.neighborhoodKey === selectedLocation;

    const matchesCity = p.city === selectedCity;

    return matchesSearch && matchesCategory && matchesLocation && matchesCity;
  });

  const activePins = [
    { id: "1", name: { en: "Elite Grooming Lounge", ar: "صالون إيليت الرجالي" }, city: "riyadh", district: "malqa", left: "25%", top: "30%", rating: 4.9, address: { en: "Al-Malqa, Riyadh", ar: "حي الملقا، الرياض" }, image: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=300&auto=format&fit=crop" },
    { id: "3", name: { en: "Riyadh Premium Spa & Wellness", ar: "سبا الرياض الفاخر للعناية" }, city: "riyadh", district: "yasmin", left: "70%", top: "32%", rating: 4.9, address: { en: "Al-Yasmin, Riyadh", ar: "حي الياسمين، الرياض" }, image: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?q=80&w=300&auto=format&fit=crop" },
    { id: "2", name: { en: "Sara Beauty Salon & Spa", ar: "صالون وسبا سارة للتجميل" }, city: "riyadh", district: "olaya", left: "50%", top: "68%", rating: 4.8, address: { en: "Olaya, Riyadh", ar: "حي العليا، الرياض" }, image: "https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=300&auto=format&fit=crop" },
    { id: "4", name: { en: "Jeddah Royal Wellness Center", ar: "مركز النخبة الملكي بجدة" }, city: "jeddah", district: "hamra", left: "68%", top: "70%", rating: 4.7, address: { en: "Al-Hamra, Jeddah", ar: "حي الحمراء، جدة" }, image: "https://images.unsplash.com/photo-1512290923902-8a9f81dc236c?q=80&w=300&auto=format&fit=crop" },
    { id: "5", name: { en: "Ash-Shati Luxury Ladies Spa", ar: "صالون الشاطئ النسائي الفاخر" }, city: "jeddah", district: "shatei", left: "55%", top: "35%", rating: 4.9, address: { en: "Ash-Shati, Jeddah", ar: "حي الشاطئ، جدة" }, image: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=80&w=300&auto=format&fit=crop" }
  ].filter(pin => {
    if (pin.city !== selectedCity) return false;
    
    if (selectedLocation !== "all" && pin.district !== selectedLocation) return false;

    const shopObj = mockShops.find(s => s.id === pin.id);
    if (!shopObj) return false;

    const matchesCategory = selectedFilter === "all" || 
                            (selectedFilter === "home" && mockServices.some(s => s.shopId === pin.id && s.serviceType === "mobile")) ||
                            (selectedFilter === "salon" && mockServices.some(s => s.shopId === pin.id && s.serviceType === "salon")) ||
                            mockServices.some(s => s.shopId === pin.id && s.category === selectedFilter);

    const matchesSearch = searchQuery === "" ||
                          pin.name.en.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          pin.name.ar.includes(searchQuery) ||
                          pin.address.en.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          pin.address.ar.includes(searchQuery);

    return matchesCategory && matchesSearch;
  });

  return (
    <SafeAreaView style={styles.container}>
      {/* Search Header */}
      <View style={styles.searchHeader}>
        <View style={{ flexDirection: lang === "ar" ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <Text style={[styles.title, lang === "ar" && styles.rtlText]}>{t.title}</Text>
            <Text style={[styles.subtitle, lang === "ar" && styles.rtlText]}>{t.subtitle}</Text>
          </View>
          <TouchableOpacity onPress={toggleLanguage} style={styles.langBtn}>
            <Text style={styles.langBtnText}>{t.langBtn}</Text>
          </TouchableOpacity>
        </View>
        
        <View style={[styles.searchContainer, lang === "ar" && styles.rtlRow]}>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t.searchPlaceholder}
            placeholderTextColor="hsl(210,8%,65%)"
            style={[styles.searchInput, lang === "ar" && styles.rtlText, { paddingHorizontal: 10 }]}
          />
        </View>

        {/* ViewMode (List/Map) & City Selection Toggles */}
        <View style={{ flexDirection: lang === "ar" ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
          {/* List/Map Selector */}
          <View style={{ flexDirection: lang === "ar" ? "row-reverse" : "row", backgroundColor: "hsl(220,12%,14%)", borderRadius: 8, padding: 2 }}>
            <TouchableOpacity 
              onPress={() => setViewMode("list")}
              style={[{ paddingVertical: 6, paddingHorizontal: 16, borderRadius: 6 }, viewMode === "list" && { backgroundColor: "hsl(45,60%,55%)" }]}
            >
              <Text style={{ fontSize: 11, fontWeight: "bold", color: viewMode === "list" ? "hsl(220,15%,8%)" : "hsl(0,0%,80%)" }}>
                {t.listView}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => {
                setViewMode("map");
                setSelectedMapShop(null);
              }}
              style={[{ paddingVertical: 6, paddingHorizontal: 16, borderRadius: 6 }, viewMode === "map" && { backgroundColor: "hsl(45,60%,55%)" }]}
            >
              <Text style={{ fontSize: 11, fontWeight: "bold", color: viewMode === "map" ? "hsl(220,15%,8%)" : "hsl(0,0%,80%)" }}>
                {t.mapView}
              </Text>
            </TouchableOpacity>
          </View>

          {/* City Selector */}
          <View style={{ flexDirection: lang === "ar" ? "row-reverse" : "row", backgroundColor: "hsl(220,12%,14%)", borderRadius: 8, padding: 2 }}>
            <TouchableOpacity 
              onPress={() => {
                setSelectedCity("riyadh");
                if (selectedLocation === "hamra" || selectedLocation === "shatei") {
                  setSelectedLocation("all");
                }
              }}
              style={[{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6 }, selectedCity === "riyadh" && { backgroundColor: "hsla(45,60%,55%,0.15)" }]}
            >
              <Text style={{ fontSize: 11, fontWeight: "600", color: selectedCity === "riyadh" ? "hsl(45,60%,55%)" : "hsl(210,8%,65%)" }}>
                {t.riyadh}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => {
                setSelectedCity("jeddah");
                if (selectedLocation === "malqa" || selectedLocation === "olaya" || selectedLocation === "yasmin") {
                  setSelectedLocation("all");
                }
              }}
              style={[{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6 }, selectedCity === "jeddah" && { backgroundColor: "hsla(45,60%,55%,0.15)" }]}
            >
              <Text style={{ fontSize: 11, fontWeight: "600", color: selectedCity === "jeddah" ? "hsl(45,60%,55%)" : "hsl(210,8%,65%)" }}>
                {t.jeddah}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Quick Filters */}
      <View style={styles.filterSection}>
        <FlatList
          data={categories}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => setSelectedFilter(item.id)}
              style={[
                styles.filterChip,
                selectedFilter === item.id && styles.activeChip
              ]}
            >
              <Text 
                style={[
                  styles.chipText,
                  selectedFilter === item.id && styles.activeChipText
                ]}
              >
                {lang === "ar" ? item.name_ar : item.name_en}
              </Text>
            </TouchableOpacity>
          )}
          contentContainerStyle={[styles.chipList, lang === "ar" && styles.rtlRow]}
        />

        {/* Location Selectors */}
        <FlatList
          data={filteredLocations}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => handleNeighborhoodSelect(item.id)}
              style={[
                styles.locChip,
                selectedLocation === item.id && styles.activeLocChip
              ]}
            >
              <Text 
                style={[
                  styles.locChipText,
                  selectedLocation === item.id && styles.activeLocChipText
                ]}
              >
                {lang === "ar" ? item.name_ar : item.name_en}
              </Text>
            </TouchableOpacity>
          )}
          contentContainerStyle={[styles.locChipList, lang === "ar" && styles.rtlRow]}
        />
      </View>

      {/* Results List or Interactive Map */}
      {viewMode === "map" ? (
        <ScrollView style={styles.mapScroll} contentContainerStyle={styles.mapContainer}>
          <View style={styles.mapCard}>
            <View style={[styles.mapHeaderRow, lang === "ar" && styles.rtlRow]}>
              <View>
                <Text style={[styles.mapTitle, lang === "ar" && styles.rtlText]}>
                  {selectedCity === "jeddah" 
                    ? (lang === "ar" ? "خريطة جدة التفاعلية" : "Jeddah Interactive Map")
                    : (lang === "ar" ? "خريطة الرياض التفاعلية" : "Riyadh Interactive Map")}
                </Text>
                <Text style={[styles.mapSubtitle, lang === "ar" && styles.rtlText]}>
                  {t.mapInstructions}
                </Text>
              </View>
            </View>

            {/* Simulated Digital Grid Map Box */}
            <View style={styles.mapCanvas}>
              {/* Subtle Grid Lines */}
              <View style={styles.gridLineH1} />
              <View style={styles.gridLineH2} />
              <View style={styles.gridLineH3} />
              <View style={styles.gridLineV1} />
              <View style={styles.gridLineV2} />
              <View style={styles.gridLineV3} />

              {selectedCity === "riyadh" ? (
                <>
                  {/* Routing boundary ring (dashed style) */}
                  <View style={styles.routingBoundaryRing} />
                  <Text style={styles.routingBoundaryText}>10KM ROUTING BOUNDARY / حد التوصيل ١٠ كم</Text>

                  {/* Neighborhood Area Text labels */}
                  <Text style={[styles.districtLabel, { left: "15%", top: "22%" }]}>AL-MALQA{"\n"}الملقا</Text>
                  <Text style={[styles.districtLabel, { left: "65%", top: "20%" }]}>AL-YASMIN{"\n"}الياسمين</Text>
                  <Text style={[styles.districtLabel, { left: "45%", top: "75%" }]}>OLAYA{"\n"}العليا</Text>
                </>
              ) : (
                <>
                  {/* Red Sea block on the left */}
                  <View style={styles.redSeaBlock}>
                    <Text style={styles.redSeaText}>
                      RED SEA{"\n"}البحر الأحمر
                    </Text>
                  </View>

                  {/* Neighborhood Area Text labels */}
                  <Text style={[styles.districtLabel, { left: "45%", top: "25%" }]}>ASH-SHATI{"\n"}الشاطئ</Text>
                  <Text style={[styles.districtLabel, { left: "60%", top: "65%" }]}>AL-HAMRA{"\n"}الحمراء</Text>
                </>
              )}

              {/* Render Map Pins */}
              {activePins.map((pin) => (
                <TouchableOpacity
                  key={pin.id}
                  onPress={() => setSelectedMapShop(pin)}
                  style={[styles.mapPinContainer, { left: pin.left as any, top: pin.top as any }]}
                >
                  {/* Pin label bubble */}
                  <View style={styles.pinBubble}>
                    <Text style={styles.pinBubbleText} numberOfLines={1}>
                      {pin.name[lang]}
                    </Text>
                  </View>

                  {/* Pin Marker */}
                  <View style={styles.pinPulseRing} />
                  <View style={styles.pinGlowInner} />
                  <View style={styles.pinDot} />
                </TouchableOpacity>
              ))}

              {/* Selected Shop Overlay Card at the bottom of the map */}
              {selectedMapShop && (
                <View style={[styles.mapOverlayCard, lang === "ar" && styles.rtlRow]}>
                  <Image source={{ uri: selectedMapShop.image }} style={styles.mapOverlayImage} />
                  <View style={{ flex: 1, paddingHorizontal: 10, justifyContent: "center" }}>
                    <Text style={[styles.mapOverlayName, lang === "ar" && styles.rtlText]} numberOfLines={1}>
                      {selectedMapShop.name[lang]}
                    </Text>
                    <Text style={[styles.mapOverlayAddress, lang === "ar" && styles.rtlText]} numberOfLines={1}>
                      {selectedMapShop.address[lang]}
                    </Text>
                    <Text style={[styles.mapOverlayRating, lang === "ar" && styles.rtlText]}>
                      ★ {selectedMapShop.rating}
                    </Text>
                  </View>
                  <View style={{ gap: 6, justifyContent: "center" }}>
                    <TouchableOpacity
                      onPress={() => {
                        const shopObj = mockShops.find((s) => s.id === selectedMapShop.id);
                        if (shopObj) {
                          setSelectedProvider(shopObj);
                        }
                      }}
                      style={styles.mapOverlayBookBtn}
                    >
                      <Text style={styles.mapOverlayBookText}>{t.bookNow}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setSelectedMapShop(null)}
                      style={styles.mapOverlayCloseBtn}
                    >
                      <Text style={styles.mapOverlayCloseText}>{t.close}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      ) : (
        /* Results List */
        <FlatList
          data={filteredProviders}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => setSelectedProvider(item)}>
              <Image source={{ uri: item.image }} style={styles.cardImage as any} />
              <View style={styles.cardContent}>
                <View style={[styles.cardHeader, lang === "ar" && styles.rtlRow]}>
                  <Text style={styles.cardName}>{item.name[lang]}</Text>
                  <Text style={styles.cardPrice}>
                    {mockServices.filter(s => s.shopId === item.id)[0]?.price || 100} SAR
                  </Text>
                </View>
                
                <View style={[styles.cardFooter, lang === "ar" && styles.rtlRow]}>
                  <Text style={styles.cardLoc}>{item.neighborhood}</Text>
                  <Text style={styles.cardRating}>★ {item.rating} ({item.reviewsCount} {t.reviews})</Text>
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
      )}

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
