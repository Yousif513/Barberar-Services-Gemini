"use client";

import React, { useState } from "react";
import Link from "next/link";

export default function Home() {
  const [service, setService] = useState("Haircut");
  const [location, setLocation] = useState("Riyadh");
  const [date, setDate] = useState("");

  const categories = [
    { name: "Haircuts", icon: "✂️", image: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=300&auto=format&fit=crop" },
    { name: "Barbers", icon: "🪒", image: "https://images.unsplash.com/photo-1621605815971-fbc98d665033?q=80&w=300&auto=format&fit=crop" },
    { name: "Hair Styling", icon: "💇‍♀️", image: "https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=300&auto=format&fit=crop" },
    { name: "Makeup", icon: "💄", image: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?q=80&w=300&auto=format&fit=crop" },
    { name: "Nails", icon: "💅", image: "https://images.unsplash.com/photo-1604654894610-df63bc536371?q=80&w=300&auto=format&fit=crop" },
    { name: "Skincare", icon: "🧖‍♀️", image: "https://images.unsplash.com/photo-1590439471364-192aa70c0b53?q=80&w=300&auto=format&fit=crop" },
    { name: "Spa", icon: "🪔", image: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?q=80&w=300&auto=format&fit=crop" },
    { name: "Home Services", icon: "🏠", image: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?q=80&w=300&auto=format&fit=crop" }
  ];

  const professionals = [
    { name: "Ahmed", role: "Senior Barber", rating: "4.9 (1500)", status: "Available Today", btnText: "Book Ahmed", image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=200&auto=format&fit=crop" },
    { name: "Sara", role: "Hair Stylist", rating: "4.8 (980)", status: "Available Today", btnText: "Book Sara", image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=200&auto=format&fit=crop" },
    { name: "Mohammed", role: "Beard Specialist", rating: "4.9 (1100)", status: "Available Today", btnText: "Book Mohammed", image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&auto=format&fit=crop" },
    { name: "Leen", role: "Makeup Artist", rating: "4.9 (870)", status: "Available Today", btnText: "Book Leen", image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop" },
    { name: "Salman", role: "Hair Stylist", rating: "4.8 (760)", status: "Available Today", btnText: "Book Salman", image: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?q=80&w=200&auto=format&fit=crop" },
    { name: "Noura", role: "Nail Artist", rating: "4.9 (650)", status: "Available Today", btnText: "Book Noura", image: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=200&auto=format&fit=crop" }
  ];

  return (
    <div className="min-h-screen bg-[hsl(210,20%,98%)] text-[hsl(220,15%,8%)] flex flex-col font-sans">
      
      {/* 1. HEADER */}
      <header className="bg-black/95 text-white py-4 px-6 sm:px-12 flex items-center justify-between border-b border-white/10 sticky top-0 z-50">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-xl font-bold tracking-wider text-[hsl(45,60%,55%)]">PRIMORA</Link>
          <nav className="hidden lg:flex items-center gap-6 text-sm text-gray-300 font-medium">
            <Link href="/" className="hover:text-[hsl(45,60%,55%)] transition-colors">Home</Link>
            <Link href="/services" className="hover:text-[hsl(45,60%,55%)] transition-colors">Services</Link>
            <Link href="/providers" className="hover:text-[hsl(45,60%,55%)] transition-colors">Providers</Link>
            <Link href="/provider/dashboard" className="hover:text-[hsl(45,60%,55%)] transition-colors">Become a Provider</Link>
            <Link href="/about" className="hover:text-[hsl(45,60%,55%)] transition-colors">About</Link>
            <Link href="/contact" className="hover:text-[hsl(45,60%,55%)] transition-colors">Contact</Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/customer/dashboard" className="text-sm font-semibold hover:text-[hsl(45,60%,55%)] transition-colors">Log in</Link>
          <Link href="/customer/dashboard" className="bg-white text-black font-semibold text-xs px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors">Sign up</Link>
        </div>
      </header>

      {/* 2. HERO SECTION */}
      <section className="relative bg-black text-white py-20 px-6 sm:px-12 md:py-32 flex flex-col md:flex-row items-center justify-between gap-12 overflow-hidden">
        {/* Background Image / Overlay */}
        <div className="absolute inset-0 opacity-40 bg-[url('https://images.unsplash.com/photo-1585747860715-2ba37e788b70?q=80&w=1200&auto=format&fit=crop')] bg-cover bg-center" />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-transparent" />
        
        {/* Hero Text */}
        <div className="relative z-10 max-w-xl space-y-6">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight">
            Look Good.<br />Feel Confident.
          </h1>
          <p className="text-sm sm:text-base text-gray-300 max-w-md">
            Book trusted beauty and grooming professionals in minutes. Connect with top stylists, makeup artists, and freelancers in Riyadh.
          </p>
          <div className="flex flex-wrap gap-4 pt-4">
            <Link href="/customer/dashboard" className="px-6 py-3 bg-[hsl(45,60%,55%)] text-black font-bold text-sm rounded-lg hover:bg-[hsl(45,60%,45%)] transition duration-200">
              Book Now
            </Link>
            <Link href="/provider/dashboard" className="px-6 py-3 bg-transparent border border-white text-white font-bold text-sm rounded-lg hover:bg-white/10 transition duration-200">
              Become a Provider
            </Link>
          </div>
        </div>

        {/* Search Card */}
        <div className="relative z-10 w-full max-w-sm bg-white text-black rounded-2xl p-6 shadow-2xl border border-gray-100">
          <h3 className="font-bold text-base mb-6 text-gray-800">What service do you need?</h3>
          <div className="space-y-4">
            {/* Service Input */}
            <div>
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Service</label>
              <select
                value={service}
                onChange={(e) => setService(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[hsl(45,60%,55%)]"
              >
                <option>Haircut</option>
                <option>Beard Grooming</option>
                <option>Makeup</option>
                <option>Nail Artist</option>
                <option>Hair Styling</option>
              </select>
            </div>

            {/* Location Input */}
            <div>
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Location</label>
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[hsl(45,60%,55%)]"
              >
                <option>Riyadh</option>
                <option>Jeddah</option>
                <option>Dammam</option>
              </select>
            </div>

            {/* Date Input */}
            <div>
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[hsl(45,60%,55%)] text-gray-500"
              />
            </div>

            {/* Search Button */}
            <button className="w-full py-3 bg-black text-white font-bold text-sm rounded-lg hover:bg-gray-800 transition duration-200 mt-4">
              Search
            </button>
          </div>
        </div>
      </section>

      {/* 3. POPULAR CATEGORIES */}
      <section className="py-20 px-6 sm:px-12 bg-white">
        <div className="flex justify-between items-end mb-8">
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-black">Popular Categories</h2>
          </div>
          <button className="text-sm font-bold text-[hsl(45,60%,55%)] hover:underline">View all</button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
          {categories.map((cat, i) => (
            <div key={i} className="group cursor-pointer">
              <div className="h-28 w-full rounded-xl overflow-hidden relative border border-gray-100 mb-3">
                <img src={cat.image} alt={cat.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors duration-300" />
                <span className="absolute bottom-2 left-2 text-xl">{cat.icon}</span>
              </div>
              <h4 className="text-xs font-bold text-gray-800 text-center">{cat.name}</h4>
            </div>
          ))}
        </div>
      </section>

      {/* 4. TOP PROFESSIONALS */}
      <section className="py-20 px-6 sm:px-12">
        <div className="flex justify-between items-end mb-8">
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-black">Top Professionals</h2>
          </div>
          <button className="text-sm font-bold text-[hsl(45,60%,55%)] hover:underline">View all</button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6">
          {professionals.map((prof, i) => (
            <div key={i} className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm flex flex-col justify-between group hover:shadow-md transition-shadow duration-300">
              <div className="h-40 overflow-hidden relative">
                <img src={prof.image} alt={prof.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
              </div>
              <div className="p-4 flex flex-col justify-between flex-grow">
                <div>
                  <h4 className="font-bold text-sm text-black">{prof.name}</h4>
                  <p className="text-[10px] text-gray-500 font-semibold mt-1">{prof.role}</p>
                  <p className="text-[10px] font-semibold text-gray-400 mt-2">⭐ {prof.rating}</p>
                  <p className="text-[9px] text-[hsl(150,60%,40%)] bg-[hsla(150,60%,40%,0.05)] border border-[hsla(150,60%,40%,0.15)] rounded-full px-2 py-0.5 inline-block mt-3 font-semibold">
                    {prof.status}
                  </p>
                </div>
                <button className="w-full py-2 bg-transparent border border-gray-200 hover:border-black hover:bg-black hover:text-white rounded-lg text-xs font-bold transition duration-200 mt-4">
                  {prof.btnText}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 5. HOW IT WORKS */}
      <section className="py-20 px-6 sm:px-12 bg-black text-white">
        <h2 className="text-xl sm:text-2xl font-extrabold text-center mb-12">How It Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 max-w-4xl mx-auto">
          <div className="flex flex-col items-center text-center space-y-4">
            <span className="text-3xl p-4 bg-white/5 rounded-full border border-white/10">🔍</span>
            <h4 className="font-bold text-sm">1. Find</h4>
            <p className="text-xs text-gray-400 max-w-xs leading-relaxed">
              Find the perfect service and professional based on reviews, location, and price.
            </p>
          </div>
          <div className="flex flex-col items-center text-center space-y-4">
            <span className="text-3xl p-4 bg-white/5 rounded-full border border-white/10">📅</span>
            <h4 className="font-bold text-sm">2. Book</h4>
            <p className="text-xs text-gray-400 max-w-xs leading-relaxed">
              Choose your preferred date and time, and book instantly with secure online checkout.
            </p>
          </div>
          <div className="flex flex-col items-center text-center space-y-4">
            <span className="text-3xl p-4 bg-white/5 rounded-full border border-white/10">✨</span>
            <h4 className="font-bold text-sm">3. Enjoy</h4>
            <p className="text-xs text-gray-400 max-w-xs leading-relaxed">
              Sit back, relax, and enjoy the premium beauty and grooming experience you deserve.
            </p>
          </div>
        </div>
      </section>

      {/* 6. PROVIDER ACQUISITION BANNER */}
      <section className="py-20 px-6 sm:px-12 bg-white flex flex-col md:flex-row items-center justify-between gap-12 max-w-6xl mx-auto w-full">
        <div className="space-y-6 max-w-md">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-black">Grow Your Business with Primora</h2>
          <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">
            Join thousands of professional stylists, makeup artists, and freelancers who rely on Primora to manage schedules, process secure payments, and acquire new customers in Riyadh.
          </p>
          <Link href="/provider/dashboard" className="px-6 py-3 bg-[hsl(45,60%,55%)] hover:bg-[hsl(45,60%,45%)] text-black font-bold text-sm rounded-lg inline-block transition duration-200">
            Become a Provider
          </Link>
        </div>
        
        <div className="w-full md:w-1/2 max-w-md h-64 rounded-2xl overflow-hidden border border-gray-100 shadow-lg relative">
          <img src="https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?q=80&w=600&auto=format&fit=crop" alt="Provider" className="w-full h-full object-cover" />
        </div>
      </section>

    </div>
  );
}
