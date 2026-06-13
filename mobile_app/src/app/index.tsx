import React, { useState } from "react";
import { 
  StyleSheet, 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  Image, 
  Dimensions 
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BookingSheet } from "@/components/booking-sheet";

const { width } = Dimensions.get("window");

export default function HomeScreen() {
  const [lang, setLang] = useState<"en" | "ar">("ar");
  const [isHomeService, setIsHomeService] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<any>(null);

  const toggleLanguage = () => setLang((prev) => (prev === "en" ? "ar" : "en"));

  // Bilingual UI Dictionary
  const t = {
    en: {
      brand: "Beauty & Grooming",
      city: "Riyadh, KSA",
      searchPlaceholder: "Search salons, stylists, or makeup artists...",
      inStore: "In-Salon",
      homeService: "Home Service",
      menCategory: "Men's Grooming",
      womenCategory: "Women's Beauty",
      topSalons: "Recommended Near You",
      reviews: "reviews",
      startingFrom: "Starting from",
      bookNow: "Book Slot"
    },
    ar: {
      brand: "الجمال والعناية",
      city: "الرياض، المملكة العربية السعودية",
      searchPlaceholder: "البحث عن الصالونات والمصففين والمكياج...",
      inStore: "في الصالون",
      homeService: "خدمة منزلية",
      menCategory: "عناية الرجال",
      womenCategory: "جمال النساء",
      topSalons: "الموصى بها بالقرب منك",
      reviews: "تقييمات",
      startingFrom: "يبدأ من",
      bookNow: "احجز الموعد"
    }
  }[lang];

  // Mock categories
  const categories = {
    men: [
      { id: "m1", name: lang === "ar" ? "قص شعر" : "Haircut", icon: "✂️" },
      { id: "m2", name: lang === "ar" ? "لحية" : "Beard", icon: "🪒" },
      { id: "m3", name: lang === "ar" ? "عناية ممتازة" : "Facial", icon: "🧖‍♂️" },
    ],
    women: [
      { id: "w1", name: lang === "ar" ? "تصفيف شعر" : "Styling", icon: "💇‍♀️" },
      { id: "w2", name: lang === "ar" ? "أظافر" : "Nails", icon: "💅" },
      { id: "w3", name: lang === "ar" ? "مكياج" : "Makeup", icon: "💄" },
      { id: "w4", name: lang === "ar" ? "حناء" : "Henna", icon: "✨" },
    ]
  };

  // Mock Salons / Providers
  const providers = [
    {
      id: "p1",
      name: lang === "ar" ? "صالون إيليت الرجالي" : "Elite Grooming Lounge",
      district: lang === "ar" ? "الملقا، الرياض" : "Al-Malqa, Riyadh",
      rating: "4.9",
      reviewsCount: "128",
      image: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=300&auto=format&fit=crop",
      price: "120 SAR",
      eligibleForHome: true
    },
    {
      id: "p2",
      name: lang === "ar" ? "مركز ريم لجمال المرأة" : "Reem Beauty & Makeup",
      district: lang === "ar" ? "العليا، الرياض" : "Al-Olaya, Riyadh",
      rating: "4.8",
      reviewsCount: "94",
      image: "https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=300&auto=format&fit=crop",
      price: "350 SAR",
      eligibleForHome: true
    }
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        
        {/* HEADER */}
        <View style={[styles.header, lang === "ar" && styles.rtlRow]}>
          <View>
            <Text style={styles.brandText}>{t.brand}</Text>
            <Text style={styles.subBrandText}>📍 {t.city}</Text>
          </View>
          <TouchableOpacity onPress={toggleLanguage} style={styles.langBtn}>
            <Text style={styles.langBtnText}>{lang === "ar" ? "English" : "العربية"}</Text>
          </TouchableOpacity>
        </View>

        {/* SEARCH BAR */}
        <View style={[styles.searchContainer, lang === "ar" && styles.rtlRow]}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput 
            placeholder={t.searchPlaceholder} 
            placeholderTextColor="hsl(210,8%,65%)" 
            style={[styles.searchInput, lang === "ar" && styles.rtlText]}
          />
        </View>

        {/* IN-STORE VS HOME SERVICE TOGGLE */}
        <View style={styles.toggleWrapper}>
          <TouchableOpacity 
            onPress={() => setIsHomeService(false)} 
            style={[styles.toggleBtn, !isHomeService && styles.toggleActive]}
          >
            <Text style={[styles.toggleText, !isHomeService && styles.toggleTextActive]}>{t.inStore}</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => setIsHomeService(true)} 
            style={[styles.toggleBtn, isHomeService && styles.toggleActive]}
          >
            <Text style={[styles.toggleText, isHomeService && styles.toggleTextActive]}>{t.homeService}</Text>
          </TouchableOpacity>
        </View>

        {/* CATEGORIES SECTION */}
        <Text style={[styles.sectionTitle, lang === "ar" && styles.rtlText]}>{t.womenCategory}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.catScroll, lang === "ar" && styles.rtlRow]}>
          {categories.women.map((cat) => (
            <TouchableOpacity key={cat.id} style={styles.catCard}>
              <Text style={styles.catIcon}>{cat.icon}</Text>
              <Text style={styles.catName}>{cat.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={[styles.sectionTitle, lang === "ar" && styles.rtlText]}>{t.menCategory}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.catScroll, lang === "ar" && styles.rtlRow]}>
          {categories.men.map((cat) => (
            <TouchableOpacity key={cat.id} style={styles.catCard}>
              <Text style={styles.catIcon}>{cat.icon}</Text>
              <Text style={styles.catName}>{cat.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* RECOMMENDED FEED */}
        <Text style={[styles.sectionTitle, lang === "ar" && styles.rtlText]}>{t.topSalons}</Text>
        <View style={styles.providerGrid}>
          {providers
            .filter(p => !isHomeService || p.eligibleForHome)
            .map((provider) => (
              <View key={provider.id} style={styles.providerCard}>
                <Image source={{ uri: provider.image }} style={styles.cardImg as any} />
                <View style={styles.cardDetails}>
                  <Text style={styles.cardName}>{provider.name}</Text>
                  <Text style={styles.cardLoc}>📍 {provider.district}</Text>
                  <Text style={styles.cardRating}>⭐ {provider.rating} ({provider.reviewsCount} {t.reviews})</Text>
                  
                  <View style={[styles.cardFooter, lang === "ar" && styles.rtlRow]}>
                    <Text style={styles.cardPrice}>{t.startingFrom}: <Text style={styles.priceHighlight}>{provider.price}</Text></Text>
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

      </ScrollView>

      {/* BOOKING BOTTOM SHEET SHEET */}
      {selectedProvider && (
        <BookingSheet 
          provider={selectedProvider} 
          locale={lang} 
          onClose={() => setSelectedProvider(null)} 
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    width: 80,
    height: 90,
    backgroundColor: "hsl(220,12%,14%)",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    borderWidth: 1,
    borderColor: "hsla(0,0%,100%,0.05)"
  },
  catIcon: {
    fontSize: 26,
    marginBottom: 8
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
