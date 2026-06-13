"use client";

import React, { useState } from "react";
import Link from "next/link";

export default function CustomerFavorites() {
  const [favorites, setFavorites] = useState([
    {
      id: "1",
      name: "Elite Grooming Lounge",
      category: "Barbershop",
      rating: "4.9",
      reviews: "128",
      image: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=300&auto=format&fit=crop",
      district: "Al-Malqa, Riyadh"
    },
    {
      id: "2",
      name: "Sara Beauty Salon & Spa",
      category: "Luxury Spa",
      rating: "4.8",
      reviews: "96",
      image: "https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=300&auto=format&fit=crop",
      district: "Olaya, Riyadh"
    }
  ]);

  const handleRemove = (id: string) => {
    setFavorites(prev => prev.filter(f => f.id !== id));
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">My Favorites</h2>
        <p className="text-sm text-gray-500 mt-1">Quick access to your preferred salons, barbershops, and stylists in Riyadh.</p>
      </div>

      {favorites.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {favorites.map((item) => (
            <div key={item.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm flex flex-col justify-between group hover:shadow-md transition-shadow duration-300">
              <div className="h-44 overflow-hidden relative">
                <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                <button 
                  onClick={() => handleRemove(item.id)}
                  className="absolute top-3 right-3 bg-white/95 hover:bg-red-50 text-red-500 p-2 rounded-full border border-gray-200/50 shadow-sm transition"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>

              <div className="p-5 flex flex-col justify-between flex-grow">
                <div>
                  <span className="text-[9px] uppercase font-bold text-gray-400 block tracking-wider">{item.category}</span>
                  <h4 className="font-bold text-sm text-black mt-1">{item.name}</h4>
                  <p className="text-[10px] text-gray-400 font-semibold mt-1">📍 {item.district}</p>
                  
                  <div className="flex items-center gap-1 mt-3 text-[10px] font-bold text-gray-800">
                    <svg className="w-3.5 h-3.5 text-amber-500 fill-current" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    <span>{item.rating} ({item.reviews} reviews)</span>
                  </div>
                </div>

                <div className="flex gap-2 mt-6">
                  <Link href={`/customer/book?id=${item.id}`} className="flex-1 py-2.5 bg-black hover:bg-gray-800 text-white rounded-xl text-xs font-bold text-center transition duration-200">
                    Book Appointment
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl p-16 text-center text-gray-500 font-semibold">
          No favorites added yet.
        </div>
      )}
    </div>
  );
}
