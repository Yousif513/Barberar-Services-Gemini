"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function CustomerDashboard() {
  const [service, setService] = useState("");
  const [provider, setProvider] = useState("");
  const [location, setLocation] = useState("Riyadh");
  const [date, setDate] = useState("");

  const [userName, setUserName] = useState("Yousif");
  const [upcoming, setUpcoming] = useState<any>(null);
  const [recentBookingsList, setRecentBookingsList] = useState<any[]>([]);
  const [recommendedList, setRecommendedList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        // Get user session
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // Fetch profile
          const { data: profile } = await supabase
            .from("profiles")
            .select("first_name, last_name")
            .eq("id", user.id)
            .single();
          if (profile?.first_name) {
            setUserName(profile.first_name);
          }

          // Fetch upcoming booking
          const { data: upcomingData } = await supabase
            .from("bookings")
            .select(`
              id,
              scheduled_at,
              status,
              total_price,
              services ( name_en, name_ar ),
              employees ( name_en, name_ar ),
              branches (
                name_en,
                name_ar,
                providers ( business_name_en, business_name_ar, logo_url )
              )
            `)
            .eq("customer_id", user.id)
            .gte("scheduled_at", new Date().toISOString())
            .in("status", ["confirmed", "pending_payment"])
            .order("scheduled_at", { ascending: true })
            .limit(1);

          if (upcomingData && upcomingData.length > 0) {
            setUpcoming(upcomingData[0]);
          }

          // Fetch recent bookings
          const { data: recentData } = await supabase
            .from("bookings")
            .select(`
              id,
              scheduled_at,
              status,
              total_price,
              services ( name_en, name_ar ),
              branches (
                providers ( business_name_en, business_name_ar )
              )
            `)
            .eq("customer_id", user.id)
            .order("scheduled_at", { ascending: false })
            .limit(5);

          if (recentData && recentData.length > 0) {
            setRecentBookingsList(recentData.map(b => ({
              date: new Date(b.scheduled_at).toLocaleDateString("en-GB", { day: 'numeric', month: 'short', year: 'numeric' }),
              provider: (b as any).branches?.providers?.business_name_en || "Stylist",
              service: (b as any).services?.name_en || "Grooming Service",
              status: b.status.replace("_", " ").toUpperCase()
            })));
          }

          // Fetch recommended providers
          const { data: providersData } = await supabase
            .from("providers")
            .select("id, business_name_en, type, logo_url")
            .eq("is_verified", true)
            .limit(3);

          if (providersData && providersData.length > 0) {
            setRecommendedList(providersData.map(p => ({
              name: p.business_name_en,
              role: p.type === "freelancer" ? "Freelancer Stylist" : "Premium Salon",
              rating: (4.5 + Math.random() * 0.5).toFixed(1),
              image: p.logo_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop"
            })));
          }
        }
      } catch (error) {
        console.error("Error loading dashboard data:", error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  // If recentBookingsList is empty, fallback to mock bookings
  const bookingsToRender = recentBookingsList.length > 0 ? recentBookingsList : [
    { date: "12 May 2024", provider: "Ahmed Barber", service: "Haircut + Beard", status: "COMPLETED" },
    { date: "05 May 2024", provider: "Sara Hair", service: "Hair Coloring", status: "COMPLETED" },
    { date: "28 Apr 2024", provider: "Leen Makeup", service: "Party Makeup", status: "COMPLETED" }
  ];

  const recommendationsToRender = recommendedList.length > 0 ? recommendedList : [
    { name: "Leen Makeup", role: "Makeup Artist", rating: "4.9", image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop" },
    { name: "Salman Hair", role: "Hair Stylist", rating: "4.8", image: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?q=80&w=200&auto=format&fit=crop" },
    { name: "Noura Nails", role: "Nail Artist", rating: "4.9", image: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=200&auto=format&fit=crop" }
  ];

  const upcomingToRender = upcoming ? {
    id: upcoming.id,
    provider: (upcoming as any).branches?.providers?.business_name_en || (upcoming as any).employees?.name_en || "Stylist",
    service: (upcoming as any).services?.name_en || "Service",
    date: new Date(upcoming.scheduled_at).toLocaleDateString("en-US", { weekday: 'long', month: 'short', day: 'numeric' }),
    time: new Date(upcoming.scheduled_at).toLocaleTimeString("en-US", { hour: '2-digit', minute: '2-digit' }),
    image: (upcoming as any).branches?.providers?.logo_url || "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=100&auto=format&fit=crop",
    isMock: false
  } : {
    id: "mock",
    provider: "Ahmed Barber",
    service: "Haircut + Beard",
    date: "Tomorrow",
    time: "5:00 PM",
    image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=100&auto=format&fit=crop",
    isMock: true
  };


  return (
    <div className="space-y-8">
      {/* 1. WELCOME HEADER */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">Good Morning, {userName}</h2>
        <p className="text-sm text-gray-500 mt-1">What would you like today?</p>
      </div>

      {/* 2. SEARCH GRID */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
        <div>
          <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Search Service</label>
          <input
            type="text"
            placeholder="e.g. Haircut"
            value={service}
            onChange={(e) => setService(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-gray-700"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Search Provider</label>
          <input
            type="text"
            placeholder="e.g. Ahmed"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-gray-700"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Location</label>
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-gray-700"
          >
            <option>Riyadh</option>
            <option>Jeddah</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-gray-500"
          />
        </div>
        <button className="py-2.5 bg-black hover:bg-gray-800 text-white font-bold text-xs rounded-lg transition duration-150">
          Search
        </button>
      </div>

      {/* 3. MIDDLE PANEL: UPCOMING & RECOMMENDATIONS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Upcoming Booking */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start mb-6">
            <h3 className="font-bold text-sm text-gray-800">
              Upcoming Booking {upcomingToRender.isMock && <span className="text-[9px] font-normal text-amber-500 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.5 ml-2">Sample</span>}
            </h3>
          </div>
          
          <div className="flex items-center gap-4 bg-gray-50 border border-gray-100 rounded-xl p-4">
            <div className="w-12 h-12 rounded-full overflow-hidden border border-gray-200 bg-gray-200">
              <img src={upcomingToRender.image} alt={upcomingToRender.provider} className="w-full h-full object-cover" />
            </div>
            <div className="flex-1">
              <h4 className="font-bold text-sm text-gray-800">{upcomingToRender.provider}</h4>
              <p className="text-[10px] text-gray-400 mt-1 font-semibold">{upcomingToRender.service}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-gray-800">{upcomingToRender.date}</p>
              <p className="text-[10px] text-gray-400 mt-1 font-semibold">{upcomingToRender.time}</p>
            </div>
          </div>

          <button className="w-full py-2.5 bg-black hover:bg-gray-800 text-white font-bold text-xs rounded-lg transition duration-150 mt-6">
            View Booking
          </button>
        </div>

        {/* Recommended for You */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-sm text-gray-800">Recommended for You</h3>
            <button className="text-[10px] font-bold text-[hsl(45,60%,55%)] hover:underline">View all</button>
          </div>

          <div className="space-y-4">
            {recommendationsToRender.map((rec, i) => (
              <div key={i} className="flex items-center justify-between border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl overflow-hidden border border-gray-100">
                    <img src={rec.image} alt={rec.name} className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-gray-800">{rec.name}</h4>
                    <p className="text-[9px] text-gray-400 font-semibold mt-0.5">{rec.role}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-gray-800">Rating: {rec.rating}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* 4. RECENT BOOKINGS & REFER A FRIEND */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Recent Bookings Table */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-sm text-gray-800">Recent Bookings</h3>
            <button className="text-[10px] font-bold text-[hsl(45,60%,55%)] hover:underline">View all bookings</button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-150 text-gray-400 font-bold uppercase text-[9px]">
                  <th className="py-3 px-4 text-start">Date</th>
                  <th className="py-3 px-4 text-start">Provider</th>
                  <th className="py-3 px-4 text-start">Service</th>
                  <th className="py-3 px-4 text-start">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {bookingsToRender.map((bk, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition-colors duration-150">
                    <td className="py-3 px-4 text-gray-500 font-semibold">{bk.date}</td>
                    <td className="py-3 px-4 font-bold text-gray-800">{bk.provider}</td>
                    <td className="py-3 px-4 text-gray-600 font-medium">{bk.service}</td>
                    <td className="py-3 px-4">
                      <span className="px-2.5 py-1 bg-green-50 text-green-700 rounded-full font-bold text-[9px] border border-green-200">
                        {bk.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Refer a Friend */}
        <div className="bg-black text-white border border-gray-900 rounded-2xl p-6 shadow-sm flex flex-col justify-between relative overflow-hidden">
          {/* Decorative Box Glow */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-[hsla(45,60%,55%,0.05)] rounded-full blur-3xl" />
          
          <div>
            <h3 className="font-bold text-sm mb-2 text-white">Refer a friend</h3>
            <p className="text-[10px] text-gray-400 leading-relaxed max-w-[150px]">
              Get 20 SAR credit when they book!
            </p>
          </div>

          <div className="flex justify-between items-end mt-8">
            <button className="px-4 py-2 bg-[hsl(45,60%,55%)] text-black font-bold text-[10px] rounded-lg hover:bg-[hsl(45,60%,45%)] transition duration-150">
              Refer Now
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
