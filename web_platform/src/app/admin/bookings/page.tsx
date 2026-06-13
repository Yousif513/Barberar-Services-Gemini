"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function AdminBookings() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadGlobalBookings() {
      try {
        setLoading(true);
        // Load bookings from Supabase
        const { data, error } = await supabase
          .from("bookings")
          .select(`
            id,
            scheduled_at,
            status,
            total_price,
            platform_commission,
            customer:profiles( first_name, last_name ),
            branches( name_en, providers( business_name_en ) )
          `)
          .order("scheduled_at", { ascending: false });

        if (data && data.length > 0) {
          setBookings(data);
        } else {
          // Mock bookings
          setBookings([
            {
              id: "b-mock-1",
              scheduled_at: new Date(Date.now() + 86400000).toISOString(),
              status: "confirmed",
              total_price: 120.00,
              platform_commission: 18.00,
              customer: { first_name: "Yousif", last_name: "PC" },
              branches: { name_en: "Al-Malqa Branch", providers: { business_name_en: "Elite Grooming Lounge" } }
            },
            {
              id: "b-mock-2",
              scheduled_at: new Date(Date.now() - 86400000).toISOString(),
              status: "completed",
              total_price: 250.00,
              platform_commission: 37.50,
              customer: { first_name: "Sara", last_name: "Al-Saud" },
              branches: { name_en: "Olaya Spa", providers: { business_name_en: "Sara Beauty Salon & Spa" } }
            },
            {
              id: "b-mock-3",
              scheduled_at: new Date(Date.now() - 172800000).toISOString(),
              status: "pending_payment",
              total_price: 300.00,
              platform_commission: 45.00,
              customer: { first_name: "Mohammed", last_name: "Al-Otaibi" },
              branches: { name_en: "Wellness Retreat", providers: { business_name_en: "Riyadh Wellness Retreat" } }
            }
          ]);
        }
      } catch (err) {
        console.warn("Offline global bookings warning:", err);
      } finally {
        setLoading(false);
      }
    }
    loadGlobalBookings();
  }, []);

  return (
    <div className="space-y-8">
      {/* Title */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-stone-900 font-serif">Global Bookings Ledger</h2>
        <p className="text-sm text-stone-500 mt-1">Audit active client scheduling logs, platform split captures, and status indicators.</p>
      </div>

      {/* Bookings Table */}
      <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-stone-200 text-stone-400 bg-stone-50/50 uppercase tracking-wider font-extrabold text-[10px]">
                <th className="py-4 px-6">Booking Details</th>
                <th className="py-4 px-6">Client / Customer</th>
                <th className="py-4 px-6">Provider / Branch</th>
                <th className="py-4 px-6">Captured Price</th>
                <th className="py-4 px-6">Comm. (15%)</th>
                <th className="py-4 px-6 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 font-medium text-stone-700">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-stone-400">Loading booking sheets...</td>
                </tr>
              ) : (
                bookings.map((b: any) => {
                  const dateStr = new Date(b.scheduled_at).toLocaleString("en-US", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                  });

                  return (
                    <tr key={b.id} className="hover:bg-stone-50/50 transition">
                      <td className="py-4 px-6">
                        <p className="font-bold text-stone-900">{dateStr}</p>
                        <p className="text-[9px] text-stone-400 font-semibold mt-0.5">UUID: {b.id}</p>
                      </td>
                      <td className="py-4 px-6">
                        <p className="font-bold text-stone-800">
                          {b.customer?.first_name || "Guest"} {b.customer?.last_name || ""}
                        </p>
                      </td>
                      <td className="py-4 px-6">
                        <p className="font-bold text-stone-800">
                          {b.branches?.providers?.business_name_en || "Independent"}
                        </p>
                        <p className="text-[9px] text-stone-400 font-semibold">
                          {b.branches?.name_en || "Direct Staff"}
                        </p>
                      </td>
                      <td className="py-4 px-6 font-bold text-stone-900">
                        {b.total_price} SAR
                      </td>
                      <td className="py-4 px-6 font-bold text-amber-700">
                        {b.platform_commission || (b.total_price * 0.15).toFixed(2)} SAR
                      </td>
                      <td className="py-4 px-6 text-right">
                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider border inline-block ${
                          b.status === "confirmed"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : b.status === "completed"
                            ? "bg-stone-100 text-stone-700 border-stone-200"
                            : b.status === "pending_payment"
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-red-50 text-red-700 border-red-200"
                        }`}>
                          {b.status.replace("_", " ")}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
