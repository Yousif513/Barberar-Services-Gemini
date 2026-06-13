"use client";

import React, { useState } from "react";

export default function ProviderDashboardPage() {
  const stats = [
    { title: "Today's Revenue", value: "4,350 SAR", change: "+12% from yesterday", icon: "💰", color: "text-green-600 bg-green-50" },
    { title: "Today's Bookings", value: "28", change: "+8% from yesterday", icon: "📅", color: "text-blue-600 bg-blue-50" },
    { title: "Pending Requests", value: "6", change: "+2% from yesterday", icon: "⏳", color: "text-orange-600 bg-orange-50" },
    { title: "Active Customers", value: "256", change: "+15% from yesterday", icon: "👥", color: "text-indigo-600 bg-indigo-50" }
  ];

  const schedule = [
    { time: "09:00 AM", client: "Ahmed", service: "Haircut", avatar: "A" },
    { time: "10:00 AM", client: "Mohammed", service: "Beard Trim", avatar: "M" },
    { time: "11:00 AM", client: "Sara", service: "Hair Coloring", avatar: "S" },
    { time: "12:00 PM", client: "Omar", service: "Haircut", avatar: "O" },
    { time: "01:00 PM", client: "Noura", service: "Hair Treatment", avatar: "N" }
  ];

  const recentBookings = [
    { client: "Faisal A.", service: "Haircut", provider: "Ahmed", time: "09:00 AM", status: "Confirmed", statusStyle: "text-green-700 bg-green-50 border-green-200" },
    { client: "Khalid M.", service: "Beard Trim", provider: "Mohammed", time: "10:00 AM", status: "Confirmed", statusStyle: "text-green-700 bg-green-50 border-green-200" },
    { client: "Rakan S.", service: "Hair Coloring", provider: "Sara", time: "11:00 AM", status: "Confirmed", statusStyle: "text-green-700 bg-green-50 border-green-200" },
    { client: "Abdulaziz K.", service: "Haircut", provider: "Omar", time: "12:00 PM", status: "Pending", statusStyle: "text-orange-700 bg-orange-50 border-orange-200" },
    { client: "Youssef T.", service: "Hair Treatment", provider: "Noura", time: "01:00 PM", status: "Confirmed", statusStyle: "text-green-700 bg-green-50 border-green-200" }
  ];

  return (
    <div className="space-y-8">
      {/* 1. WELCOME HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Welcome back, Elite Barbershop</h2>
          <p className="text-sm text-gray-500 mt-1">Here is what is happening with your salon today.</p>
        </div>
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2 text-xs font-bold shadow-sm select-none">
          <span className="w-2.5 h-2.5 bg-green-500 rounded-full inline-block animate-pulse"></span>
          <span>Online & Accepting Bookings</span>
        </div>
      </div>

      {/* 2. KPI METRICS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex items-center justify-between group hover:border-[hsl(45,60%,55%)] transition duration-200">
            <div className="space-y-2">
              <p className="text-[10px] uppercase font-bold text-gray-400">{stat.title}</p>
              <p className="text-2xl font-bold tracking-tight text-gray-900">{stat.value}</p>
              <p className="text-[10px] text-green-600 font-bold">{stat.change}</p>
            </div>
            <span className={`text-xl p-3 rounded-xl ${stat.color}`}>{stat.icon}</span>
          </div>
        ))}
      </div>

      {/* 3. SCHEDULE & RECENT BOOKINGS ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Today's Schedule */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-sm text-gray-800">Today's Schedule</h3>
            <button className="text-[10px] font-bold text-[hsl(45,60%,55%)] hover:underline">View Calendar</button>
          </div>

          <div className="space-y-4">
            {schedule.map((slot, i) => (
              <div key={i} className="flex items-center justify-between border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-50 border border-gray-200 text-gray-700 font-bold text-xs flex items-center justify-center">
                    {slot.avatar}
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-gray-800">{slot.client}</h4>
                    <p className="text-[9px] text-gray-400 font-semibold mt-0.5">{slot.service}</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-gray-500">{slot.time}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Bookings Table */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-sm text-gray-800">Recent Bookings</h3>
            <button className="text-[10px] font-bold text-[hsl(45,60%,55%)] hover:underline">View all</button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-150 text-gray-400 font-bold uppercase text-[9px] bg-gray-50/50">
                  <th className="py-3 px-4 text-start">Client</th>
                  <th className="py-3 px-4 text-start">Service</th>
                  <th className="py-3 px-4 text-start">Provider</th>
                  <th className="py-3 px-4 text-start">Time</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentBookings.map((bk, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition-colors duration-150">
                    <td className="py-3 px-4 font-bold text-gray-800">{bk.client}</td>
                    <td className="py-3 px-4 text-gray-500 font-semibold">{bk.service}</td>
                    <td className="py-3 px-4 text-gray-600 font-medium">{bk.provider}</td>
                    <td className="py-3 px-4 font-semibold text-gray-700">{bk.time}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2.5 py-1 rounded-full font-bold text-[9px] border ${bk.statusStyle}`}>
                        {bk.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
