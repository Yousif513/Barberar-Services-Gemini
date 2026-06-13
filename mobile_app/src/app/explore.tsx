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

const { width } = Dimensions.get("window");

export default function ExploreScreen() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("all");
  const [selectedLocation, setSelectedLocation] = useState("all");

  const categories = [
    { id: "all", name_ar: "الكل", name_en: "All" },
    { id: "haircut", name_ar: "قص شعر", name_en: "Haircut" },
    { id: "makeup", name_ar: "مكياج", name_en: "Makeup" },
    { id: "nails", name_ar: "أظافر", name_en: "Nails" },
    { id: "home", name_ar: "خدمة منزلية", name_en: "Home Service" },
    { id: "salon", name_ar: "صالونات", name_en: "Salons" }
  ];

  const locations = [
    { id: "all", name_ar: "كل الرياض", name_en: "All Riyadh" },
    { id: "malqa", name_ar: "الملقا", name_en: "Al-Malqa" },
    { id: "olaya", name_ar: "العليا", name_en: "Olaya" },
    { id: "yasmin", name_ar: "الياسمين", name_en: "Al-Yasmin" },
    { id: "hamra", name_ar: "الحمراء", name_en: "Al-Hamra" }
  ];

  const mockProviders = [
    {
      id: "p1",
      name: "Elite Grooming Salon",
      category: "salon",
      services: ["haircut", "shave"],
      district: "Al-Malqa",
      districtKey: "malqa",
      rating: 4.9,
      reviews: 148,
      price: "150 SAR",
      image: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=600&auto=format&fit=crop"
    },
    {
      id: "p2",
      name: "Sara Beauty Salon & Spa",
      category: "salon",
      services: ["makeup", "nails"],
      district: "Olaya",
      districtKey: "olaya",
      rating: 4.8,
      reviews: 210,
      price: "350 SAR",
      image: "https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=600&auto=format&fit=crop"
    },
    {
      id: "p3",
      name: "Elena (Freelance Stylist)",
      category: "home",
      services: ["haircut", "makeup"],
      district: "Al-Yasmin",
      districtKey: "yasmin",
      rating: 4.9,
      reviews: 94,
      price: "200 SAR",
      image: "https://images.unsplash.com/photo-1595890833490-cf9b09d62368?q=80&w=600&auto=format&fit=crop"
    },
    {
      id: "p4",
      name: "Tariq (Independent Barber)",
      category: "salon",
      services: ["haircut"],
      district: "Al-Hamra",
      districtKey: "hamra",
      rating: 4.7,
      reviews: 68,
      price: "80 SAR",
      image: "https://images.unsplash.com/photo-1621605815971-fbc98d665033?q=80&w=600&auto=format&fit=crop"
    }
  ];

  // Filter logic
  const filteredProviders = mockProviders.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          p.district.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = selectedFilter === "all" || 
                            p.category === selectedFilter || 
                            p.services.includes(selectedFilter);

    const matchesLocation = selectedLocation === "all" || 
                            p.districtKey === selectedLocation;

    return matchesSearch && matchesCategory && matchesLocation;
  });

  return (
    <SafeAreaView style={styles.container}>
      {/* Search Header */}
      <View style={styles.searchHeader}>
        <Text style={styles.title}>البحث والاستكشاف</Text>
        <Text style={styles.subtitle}>ابحث عن أفضل خدمات التجميل والعناية في الرياض</Text>
        
        <View style={styles.searchContainer}>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="البحث عن الصالونات والمصففين والمكياج..."
            placeholderTextColor="hsl(210,8%,65%)"
            style={styles.searchInput}
          />
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
                {item.name_ar}
              </Text>
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.chipList}
        />

        {/* Location Selectors */}
        <FlatList
          data={locations}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => setSelectedLocation(item.id)}
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
                {item.name_ar}
              </Text>
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.locChipList}
        />
      </View>

      {/* Results List */}
      <FlatList
        data={filteredProviders}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Image source={{ uri: item.image }} style={styles.cardImage as any} />
            <View style={styles.cardContent}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardName}>{item.name}</Text>
                <Text style={styles.cardPrice}>{item.price}</Text>
              </View>
              
              <View style={styles.cardFooter}>
                <Text style={styles.cardLoc}>{item.district}</Text>
                <Text style={styles.cardRating}>★ {item.rating} ({item.reviews} تقييم)</Text>
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>لم يتم العثور على أي نتائج مطابقة</Text>
          </View>
        }
        contentContainerStyle={styles.resultsList}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    textAlign: "right"
  },
  subtitle: {
    fontSize: 12,
    color: "hsl(210,8%,65%)",
    marginTop: 6,
    textAlign: "right",
    marginBottom: 16
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
    textAlign: "right"
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
  }
});
