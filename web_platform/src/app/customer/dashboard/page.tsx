"use client";

import React, { useState } from "react";

export default function CustomerDashboard() {
  const [service, setService] = useState("");
  const [provider, setProvider] = useState("");
  const [location, setLocation] = useState("Riyadh");
  const [date, setDate] = useState("");

  const recommendations = [
    { name: "Leen Makeup", role: "Makeup Artist", rating: "4.9", image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop" },
    { name: "Salman Hair", role: "Hair Stylist", rating: "4.8", image: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?q=80&w=200&auto=format&fit=crop" },
    { name: "Noura Nails", role: "Nail Artist", rating: "4.9", image: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=200&auto=format&fit=crop" }
  ];

  const recentBookings = [
    { date: "12 May 2024", provider: "Ahmed Barber", service: "Haircut + Beard", status: "Completed" },
    { date: "05 May 2024", provider: "Sara Hair", service: "Hair Coloring", status: "Completed" },
    { date: "28 Apr 2024", provider: "Leen Makeup", service: "Party Makeup", status: "Completed" }
  ];

  return (
    <div className="space-y-8">
      {/* 1. WELCOME HEADER */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">Good Morning, Yousif 👋</h2>
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
            <h3 className="font-bold text-sm text-gray-800">Upcoming Booking</h3>
          </div>
          
          <div className="flex items-center gap-4 bg-gray-50 border border-gray-100 rounded-xl p-4">
            <div className="w-12 h-12 rounded-full overflow-hidden border border-gray-200 bg-gray-200">
              <img src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=100&auto=format&fit=crop" alt="Ahmed Barber" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1">
              <h4 className="font-bold text-sm text-gray-800">Ahmed Barber</h4>
              <p className="text-[10px] text-gray-400 mt-1 font-semibold">Haircut + Beard</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-gray-800">Tomorrow</p>
              <p className="text-[10px] text-gray-400 mt-1 font-semibold">5:00 PM</p>
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
            {recommendations.map((rec, i) => (
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
                  <span className="text-[10px] font-bold text-gray-800">⭐ {rec.rating}</span>
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
                {recentBookings.map((bk, i) => (
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
            <span className="text-4xl select-none">🎁</span>
          </div>
        </div>

      </div>
    </div>
  );
}
