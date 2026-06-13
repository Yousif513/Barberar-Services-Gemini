"use client";

import React, { useState } from "react";
import Link from "next/link";

export default function CustomerSearchPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedLocation, setSelectedLocation] = useState("all");

  const categories = [
    { id: "all", name: "All Services" },
    { id: "haircut", name: "Haircut" },
    { id: "makeup", name: "Makeup" },
    { id: "nails", name: "Nails" },
    { id: "skincare", name: "Skincare" }
  ];

  const locations = [
    { id: "all", name: "All Riyadh" },
    { id: "malqa", name: "Al-Malqa" },
    { id: "olaya", name: "Olaya" },
    { id: "yasmin", name: "Al-Yasmin" },
    { id: "hamra", name: "Al-Hamra" }
  ];

  const mockProviders = [
    {
      id: "1",
      name: "Elite Grooming Salon",
      category: "haircut",
      district: "Al-Malqa",
      districtKey: "malqa",
      rating: "4.9",
      reviews: 1500,
      price: "150 SAR",
      isHomeService: true,
      image: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=400&auto=format&fit=crop"
    },
    {
      id: "2",
      name: "Sara Beauty Salon & Spa",
      category: "makeup",
      district: "Olaya",
      districtKey: "olaya",
      rating: "4.8",
      reviews: 980,
      price: "350 SAR",
      isHomeService: false,
      image: "https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=400&auto=format&fit=crop"
    },
    {
      id: "3",
      name: "Elena (Freelance Stylist)",
      category: "makeup",
      district: "Al-Yasmin",
      districtKey: "yasmin",
      rating: "4.9",
      reviews: 870,
      price: "200 SAR",
      isHomeService: true,
      image: "https://images.unsplash.com/photo-1595890833490-cf9b09d62368?q=80&w=400&auto=format&fit=crop"
    },
    {
      id: "4",
      name: "Tariq Mahmood",
      category: "haircut",
      district: "Al-Hamra",
      districtKey: "hamra",
      rating: "4.8",
      reviews: 760,
      price: "80 SAR",
      isHomeService: false,
      image: "https://images.unsplash.com/photo-1621605815971-fbc98d665033?q=80&w=400&auto=format&fit=crop"
    }
  ];

  const filteredProviders = mockProviders.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          p.district.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "all" || p.category === selectedCategory;
    const matchesLocation = selectedLocation === "all" || p.districtKey === selectedLocation;
    return matchesSearch && matchesCategory && matchesLocation;
  });

  return (
    <div className="space-y-8">
      {/* Search Header */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-gray-900">Explore Beauty & Grooming</h2>
        <p className="text-xs text-gray-500 mt-1">Discover Riyadh's top-rated salons, stylists, and freelancers</p>
      </div>

      {/* Search Bar Input */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-4 bg-gray-50 px-4 py-2 rounded-lg border border-gray-100">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by salon name or neighborhood..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-none text-sm w-full placeholder-gray-400 text-gray-700"
          />
        </div>
      </div>

      {/* Filter Chips row */}
      <div className="space-y-4">
        {/* Category Filters */}
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition duration-150 border ${
                selectedCategory === cat.id
                  ? "bg-black border-black text-white"
                  : "bg-white border-gray-200 text-gray-500 hover:border-black"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Location Filters */}
        <div className="flex flex-wrap gap-2">
          {locations.map((loc) => (
            <button
              key={loc.id}
              onClick={() => setSelectedLocation(loc.id)}
              className={`px-3 py-1 bg-transparent border rounded-lg text-[10px] font-bold transition duration-150 ${
                selectedLocation === loc.id
                  ? "border-[hsl(45,60%,55%)] text-[hsl(45,60%,55%)] bg-[hsla(45,60%,55%,0.05)]"
                  : "border-gray-200 text-gray-400 hover:border-gray-300"
              }`}
            >
              {loc.name}
            </button>
          ))}
        </div>
      </div>

      {/* Grid List */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {filteredProviders.length > 0 ? (
          filteredProviders.map((provider) => (
            <div key={provider.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm flex flex-col justify-between group hover:shadow-md transition-shadow duration-300">
              <div className="h-44 overflow-hidden relative">
                <img src={provider.image} alt={provider.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                {provider.isHomeService && (
                  <span className="absolute top-3 right-3 bg-black text-[hsl(45,60%,55%)] text-[8px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full border border-[hsla(45,60%,55%,0.2)]">
                    Home Service
                  </span>
                )}
              </div>
              
              <div className="p-5 flex flex-col justify-between flex-grow">
                <div>
                  <div className="flex justify-between items-start">
                    <h4 className="font-bold text-sm text-black">{provider.name}</h4>
                    <span className="text-xs font-bold text-gray-800">{provider.price}</span>
                  </div>
                  <p className="text-[10px] text-gray-400 font-semibold mt-2">{provider.district}</p>
                  <div className="flex items-center gap-1 mt-1 text-[10px] font-bold text-gray-800">
                    <svg className="w-3 h-3 text-amber-500 fill-current" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    <span>{provider.rating} ({provider.reviews} reviews)</span>
                  </div>
                </div>

                <Link href={`/customer/book?id=${provider.id}`} className="w-full py-2.5 bg-black hover:bg-gray-800 text-white rounded-lg text-xs font-bold text-center transition duration-200 mt-6 block">
                  View & Book
                </Link>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full py-16 text-center text-gray-500 font-semibold">
            No results match your search filters.
          </div>
        )}
      </div>
    </div>
  );
}
