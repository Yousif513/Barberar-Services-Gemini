"use client";

import React, { useState } from "react";
import Link from "next/link";

export default function Home() {
  const [service, setService] = useState("Haircut");
  const [location, setLocation] = useState("Riyadh");
  const [date, setDate] = useState("");

  const categories = [
    { 
      name: "Haircuts & Barbering", 
      link: "/customer/search?category=barber", 
      image: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=400&auto=format&fit=crop" 
    },
    { 
      name: "Hair Styling & Color", 
      link: "/customer/search?category=hair", 
      image: "https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=400&auto=format&fit=crop" 
    },
    { 
      name: "Wellness & Spa Rooms", 
      link: "/customer/search?category=spa", 
      image: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?q=80&w=400&auto=format&fit=crop" 
    },
    { 
      name: "Makeup & Cosmetics", 
      link: "/customer/search?category=makeup", 
      image: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?q=80&w=400&auto=format&fit=crop" 
    },
    { 
      name: "On-Demand Home Services", 
      link: "/customer/jobs", 
      image: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?q=80&w=400&auto=format&fit=crop" 
    }
  ];

  const bestSellers = [
    {
      id: "1",
      name: "Elite Grooming Lounge",
      category: "Barbershop",
      rating: "4.9",
      reviews: "128",
      price: "120 SAR",
      image: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=400&auto=format&fit=crop"
    },
    {
      id: "2",
      name: "Sara Beauty Salon & Spa",
      category: "Luxury Spa",
      rating: "4.8",
      reviews: "96",
      price: "250 SAR",
      image: "https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=400&auto=format&fit=crop"
    },
    {
      id: "3",
      name: "Riyadh Wellness Retreat",
      category: "Therapies & Massage",
      rating: "4.9",
      reviews: "74",
      price: "300 SAR",
      image: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?q=80&w=400&auto=format&fit=crop"
    },
    {
      id: "4",
      name: "The Barberia & Spa",
      category: "Grooming Combo",
      rating: "4.7",
      reviews: "58",
      price: "180 SAR",
      image: "https://images.unsplash.com/photo-1621605815971-fbc98d665033?q=80&w=400&auto=format&fit=crop"
    },
    {
      id: "5",
      name: "Lumière Glow Studio",
      category: "Facials & Skincare",
      rating: "4.9",
      reviews: "110",
      price: "150 SAR",
      image: "https://images.unsplash.com/photo-1590439471364-192aa70c0b53?q=80&w=400&auto=format&fit=crop"
    }
  ];

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 flex flex-col font-sans antialiased">
      
      {/* 1. TOP PROMO BAR */}
      <div className="w-full bg-stone-100 border-b border-stone-200 py-2.5 px-4 text-center text-[10px] sm:text-xs font-semibold tracking-wider text-stone-600 uppercase flex items-center justify-center gap-4">
        <span>Book Premier Home Service & Salon Appointments in Riyadh</span>
        <span className="hidden md:inline text-stone-300">|</span>
        <span className="hidden md:inline">Get 15% off your first booking - Use code: <strong className="text-stone-900 font-bold">PRIMORA15</strong></span>
      </div>

      {/* 2. HEADER */}
      <header className="bg-white border-b border-stone-200/80 py-5 px-6 sm:px-12 flex items-center justify-between sticky top-0 z-50 shadow-sm backdrop-blur-md bg-white/95">
        <div className="flex items-center gap-12">
          <Link href="/" className="text-2xl font-serif font-black tracking-widest text-stone-900 hover:opacity-80 transition">
            PRIMORA
          </Link>
          <nav className="hidden lg:flex items-center gap-8 text-xs font-bold uppercase tracking-wider text-stone-500">
            <Link href="/" className="text-stone-900 hover:text-stone-900 transition-colors">Home</Link>
            <Link href="/customer/search" className="hover:text-stone-950 transition-colors">Discover</Link>
            <Link href="/customer/jobs" className="hover:text-stone-950 transition-colors">Service Board</Link>
            <Link href="/provider/dashboard" className="hover:text-stone-950 transition-colors">Become a Provider</Link>
            <Link href="/about" className="hover:text-stone-950 transition-colors font-medium">About Us</Link>
          </nav>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
            {/* Search Icon */}
            <Link href="/customer/search" className="text-stone-700 hover:text-stone-950 transition">
              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </Link>
            {/* Profile Icon */}
            <Link href="/login" className="text-stone-700 hover:text-stone-950 transition">
              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </Link>
          </div>
          
          <div className="h-4 w-px bg-stone-200 hidden sm:block"></div>
          
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-xs font-bold uppercase tracking-wider text-stone-600 hover:text-stone-950 transition">
              Log in
            </Link>
            <Link href="/login" className="bg-stone-900 text-stone-50 font-bold text-xs uppercase tracking-wider px-5 py-2.5 rounded-full hover:bg-stone-800 transition shadow-sm">
              Sign up
            </Link>
          </div>
        </div>
      </header>

      {/* 3. HERO SLIDER AREA */}
      <section className="relative bg-gradient-to-br from-[#f8f8f6] via-[#f3f3ee] to-[#ecece6] py-16 sm:py-24 px-6 sm:px-12 border-b border-stone-200 overflow-hidden">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Hero Left Content */}
          <div className="lg:col-span-6 space-y-8 relative z-10">
            <span className="text-[10px] tracking-widest uppercase font-extrabold text-stone-500">New Riyadh Collective</span>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-serif text-stone-950 leading-[1.15] tracking-tight">
              Style Naturally.<br />Groom Confidently.
            </h1>
            <p className="text-sm sm:text-base text-stone-600 max-w-lg leading-relaxed font-light">
              Riyadh's premier luxury marketplace. Instantly book verified salons, master barbershops, wellness retreats, and certified home-service providers near you.
            </p>
            
            <div className="flex flex-wrap items-center gap-6 pt-4">
              <Link href="/login" className="px-8 py-3.5 bg-stone-900 text-stone-50 font-bold text-xs uppercase tracking-widest rounded-full hover:bg-stone-800 transition shadow-md">
                Shop Services
              </Link>
              <Link href="/customer/search" className="group text-stone-800 hover:text-stone-950 font-bold text-xs uppercase tracking-widest flex items-center gap-1.5 transition">
                Explore Collective
                <svg className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </Link>
            </div>

            {/* Sub-features bar */}
            <div className="pt-10 border-t border-stone-300/60 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center sm:text-left">
              <div>
                <p className="text-[10px] uppercase font-bold text-stone-400">Verified Artists</p>
                <p className="text-xs text-stone-700 font-semibold mt-0.5">Top 1% Vetted</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-stone-400">Escrow Security</p>
                <p className="text-xs text-stone-700 font-semibold mt-0.5">Pay Post-Checkout</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-stone-400">Riyadh Geofenced</p>
                <p className="text-xs text-stone-700 font-semibold mt-0.5">Flexible In-Home</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-stone-400">Flexible Bookings</p>
                <p className="text-xs text-stone-700 font-semibold mt-0.5">Easy Reschedule</p>
              </div>
            </div>
          </div>

          {/* Hero Right Visual Column */}
          <div className="lg:col-span-6 relative flex justify-center lg:justify-end">
            <div className="relative w-full max-w-lg aspect-[4/3] sm:aspect-video lg:aspect-[4/5] rounded-3xl overflow-hidden shadow-2xl border border-stone-200/50 bg-stone-300">
              <img 
                src="https://images.unsplash.com/photo-1608248597481-496100c8c836?q=80&w=800&auto=format&fit=crop" 
                alt="Luxury Unisex Grooming Collective" 
                className="w-full h-full object-cover" 
              />
              <div className="absolute inset-0 bg-gradient-to-t from-stone-950/40 via-transparent to-transparent"></div>
              
              {/* Floating Badge */}
              <div className="absolute bottom-6 left-6 bg-white/90 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/50 max-w-xs shadow-lg">
                <span className="text-[9px] uppercase font-extrabold text-stone-400 block tracking-wider">Featured Space</span>
                <h4 className="font-serif font-bold text-stone-900 text-sm mt-0.5">Riyadh Apothecary & Spa</h4>
                <p className="text-[10px] text-stone-500 mt-1">Starting from 150 SAR per session</p>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* 4. VALUE PROPOSITION BAR */}
      <section className="bg-white border-b border-stone-200 py-8 px-6 sm:px-12">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-stone-100 rounded-full text-stone-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h4 className="text-[11px] uppercase tracking-wider font-extrabold text-stone-900">Verified Artists</h4>
              <p className="text-[10px] text-stone-500 font-medium mt-0.5">Top 1% vetted professionals</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-stone-100 rounded-full text-stone-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div>
              <h4 className="text-[11px] uppercase tracking-wider font-extrabold text-stone-900">Secure Escrow</h4>
              <p className="text-[10px] text-stone-500 font-medium mt-0.5">Released only after service</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-stone-100 rounded-full text-stone-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h4 className="text-[11px] uppercase tracking-wider font-extrabold text-stone-900">Hygiene Certified</h4>
              <p className="text-[10px] text-stone-500 font-medium mt-0.5">Strict hygiene protocols</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-stone-100 rounded-full text-stone-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <div>
              <h4 className="text-[11px] uppercase tracking-wider font-extrabold text-stone-900">24/7 Dedicated Help</h4>
              <p className="text-[10px] text-stone-500 font-medium mt-0.5">Local Riyadh-based support</p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. SHOP BY CATEGORY */}
      <section className="py-20 px-6 sm:px-12 bg-white">
        <div className="max-w-7xl mx-auto space-y-12">
          
          {/* Centered Heading */}
          <div className="text-center space-y-2">
            <h2 className="text-2xl sm:text-3xl font-serif text-stone-950 font-bold tracking-tight">Shop by Category</h2>
            <div className="w-12 h-0.5 bg-stone-800 mx-auto mt-4"></div>
          </div>

          {/* Grid Layout (exactly 5 cards like the screenshot) */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
            {categories.map((cat, i) => (
              <div key={i} className="flex flex-col items-center text-center group">
                <div className="w-full aspect-[4/5] rounded-2xl overflow-hidden relative border border-stone-200/30 bg-stone-100 shadow-sm mb-4">
                  <img 
                    src={cat.image} 
                    alt={cat.name} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                  />
                  <div className="absolute inset-0 bg-black/10 group-hover:bg-black/5 transition-all duration-300" />
                </div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-900 mt-1">{cat.name}</h4>
                <Link href={cat.link} className="text-[10px] font-bold text-stone-400 group-hover:text-stone-950 transition-colors uppercase mt-1 tracking-widest flex items-center gap-1">
                  Book Now
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* 6. BEST SELLERS / FEATURED SERVICES */}
      <section className="py-20 px-6 sm:px-12 bg-stone-50 border-t border-stone-200">
        <div className="max-w-7xl mx-auto space-y-12">
          
          {/* Header Row */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-2xl sm:text-3xl font-serif text-stone-950 font-bold tracking-tight">Featured Artists</h2>
              <p className="text-xs text-stone-500">Riyadh's highest-rated salons and professional groomers</p>
            </div>
            
            {/* Carousel navigation controls */}
            <div className="flex items-center gap-2">
              <button className="p-2.5 bg-white border border-stone-200 hover:border-stone-400 rounded-full text-stone-700 transition shadow-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button className="p-2.5 bg-white border border-stone-200 hover:border-stone-400 rounded-full text-stone-700 transition shadow-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
            {bestSellers.map((item) => (
              <div key={item.id} className="flex flex-col justify-between bg-white border border-stone-200/60 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300 group p-3 relative">
                
                {/* Image Wrapper */}
                <div className="aspect-square w-full rounded-xl overflow-hidden bg-stone-100 relative mb-4">
                  <img 
                    src={item.image} 
                    alt={item.name} 
                    className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-500" 
                  />
                  {/* Badge */}
                  <span className="absolute top-2.5 left-2.5 bg-stone-900 text-stone-50 text-[8px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded">
                    Popular
                  </span>
                </div>

                {/* Details */}
                <div className="space-y-2 flex-grow flex flex-col justify-between">
                  <div>
                    {/* Stars */}
                    <div className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5 text-amber-500 fill-current" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                      <span className="text-[10px] font-bold text-stone-700">{item.rating} <span className="text-stone-400 font-normal">({item.reviews})</span></span>
                    </div>

                    <h4 className="font-bold text-stone-900 text-xs sm:text-sm mt-1 group-hover:text-stone-700 transition-colors line-clamp-1">{item.name}</h4>
                    <p className="text-[10px] text-stone-400 font-semibold uppercase tracking-wider">{item.category}</p>
                  </div>

                  {/* Price Row & Add Button */}
                  <div className="flex items-center justify-between pt-3 border-t border-stone-100 mt-2">
                    <span className="text-xs font-extrabold text-stone-900">{item.price}</span>
                    <Link 
                      href={`/customer/book?id=${item.id}`} 
                      className="w-8 h-8 rounded-full bg-stone-900 hover:bg-stone-800 text-stone-50 flex items-center justify-center transition shadow-sm"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </Link>
                  </div>

                </div>

              </div>
            ))}
          </div>

        </div>
      </section>

      {/* 7. HOW IT WORKS */}
      <section className="py-24 px-6 sm:px-12 bg-white border-t border-stone-200">
        <div className="max-w-7xl mx-auto space-y-16">
          <div className="text-center space-y-2">
            <h2 className="text-2xl sm:text-3xl font-serif text-stone-950 font-bold tracking-tight">How It Works</h2>
            <div className="w-12 h-0.5 bg-stone-800 mx-auto mt-4"></div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 max-w-5xl mx-auto">
            <div className="flex flex-col items-center text-center space-y-4 group">
              <span className="text-sm font-serif font-bold text-stone-400 group-hover:text-stone-800 transition duration-300">01</span>
              <h4 className="font-serif font-bold text-stone-900 text-base">Select Service</h4>
              <p className="text-xs text-stone-500 max-w-xs leading-relaxed font-light">
                Find the perfect grooming, massage, or salon treatment based on reviews, locations, and transparent pricing.
              </p>
            </div>
            
            <div className="flex flex-col items-center text-center space-y-4 group">
              <span className="text-sm font-serif font-bold text-stone-400 group-hover:text-stone-800 transition duration-300">02</span>
              <h4 className="font-serif font-bold text-stone-900 text-base">Secure Booking</h4>
              <p className="text-xs text-stone-500 max-w-xs leading-relaxed font-light">
                Choose your preferred date, time slot, and staff. Secure the booking using our trusted escrow payout system.
              </p>
            </div>
            
            <div className="flex flex-col items-center text-center space-y-4 group">
              <span className="text-sm font-serif font-bold text-stone-400 group-hover:text-stone-800 transition duration-300">03</span>
              <h4 className="font-serif font-bold text-stone-900 text-base">Exceptional Care</h4>
              <p className="text-xs text-stone-500 max-w-xs leading-relaxed font-light">
                Enjoy the premium care you deserve, either at the provider's physical location or in the comfort of your home.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 8. PROVIDER ACQUISITION BANNER */}
      <section className="py-20 px-6 sm:px-12 bg-stone-100 border-t border-stone-200">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-12 w-full">
          <div className="space-y-6 max-w-lg">
            <span className="text-[10px] tracking-widest uppercase font-extrabold text-stone-400">Join Riyadh's Finest Collective</span>
            <h2 className="text-2xl sm:text-3xl font-serif text-stone-950 font-bold tracking-tight">Grow Your Business with Primora</h2>
            <p className="text-xs sm:text-sm text-stone-600 leading-relaxed font-light">
              Join thousands of master barbershops, luxury wellness spas, independent hair stylists, and beauty professionals who manage bookings, secure split payments, and acquire loyal customers in Riyadh.
            </p>
            <Link href="/provider/dashboard" className="px-6 py-3.5 bg-stone-900 text-stone-50 font-bold text-xs uppercase tracking-widest rounded-full hover:bg-stone-800 transition shadow-md inline-block">
              Become a Provider
            </Link>
          </div>
          
          <div className="w-full md:w-1/2 max-w-md aspect-[4/3] rounded-3xl overflow-hidden border border-stone-200 shadow-xl relative bg-stone-300">
            <img 
              src="https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?q=80&w=600&auto=format&fit=crop" 
              alt="Primora Service Provider Studio" 
              className="w-full h-full object-cover" 
            />
          </div>
        </div>
      </section>

      {/* 9. FOOTER */}
      <footer className="bg-stone-950 text-stone-400 py-12 px-6 sm:px-12 border-t border-stone-900">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          <div className="space-y-4">
            <h4 className="text-white font-serif font-black tracking-widest text-lg">PRIMORA</h4>
            <p className="text-xs text-stone-500 font-light leading-relaxed">
              Luxury Beauty, Grooming & Wellness Marketplace. Connecting premier Riyadh artists with selective clients.
            </p>
          </div>
          <div>
            <h5 className="text-white text-xs uppercase tracking-widest font-extrabold mb-4">Discover</h5>
            <ul className="space-y-2 text-xs">
              <li><Link href="/customer/search" className="hover:text-white transition">Explore Services</Link></li>
              <li><Link href="/customer/search?category=barber" className="hover:text-white transition">Barbershops</Link></li>
              <li><Link href="/customer/search?category=spa" className="hover:text-white transition">Spa & Massage</Link></li>
              <li><Link href="/customer/search?category=makeup" className="hover:text-white transition">Makeup Artists</Link></li>
            </ul>
          </div>
          <div>
            <h5 className="text-white text-xs uppercase tracking-widest font-extrabold mb-4">For Partners</h5>
            <ul className="space-y-2 text-xs">
              <li><Link href="/provider/dashboard" className="hover:text-white transition">Become a Provider</Link></li>
              <li><Link href="/provider/dashboard" className="hover:text-white transition">Staff Management</Link></li>
              <li><Link href="/provider/dashboard" className="hover:text-white transition">Split Ledger Pricing</Link></li>
            </ul>
          </div>
          <div>
            <h5 className="text-white text-xs uppercase tracking-widest font-extrabold mb-4">Legal</h5>
            <ul className="space-y-2 text-xs">
              <li><Link href="/privacy" className="hover:text-white transition">Privacy Policy</Link></li>
              <li><Link href="/terms" className="hover:text-white transition">Terms of Service</Link></li>
              <li><Link href="/security" className="hover:text-white transition">ZATCA & Payments</Link></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto pt-8 border-t border-stone-900 text-center text-xs text-stone-600 font-medium">
          <p>© {new Date().getFullYear()} PRIMORA. All rights reserved. Built for Riyadh, Saudi Arabia.</p>
        </div>
      </footer>

    </div>
  );
}
