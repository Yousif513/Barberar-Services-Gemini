"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface UserPackage {
  id: string;
  remaining_sessions: number;
  expires_at: string;
  packages: {
    name_en: string;
    name_ar: string;
    description_en: string;
    session_count: number;
    price: number;
    providers: {
      business_name_en: string;
      business_name_ar: string;
    };
  };
}

export default function CustomerPackagesPage() {
  const [userPackages, setUserPackages] = useState<UserPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadUserPackages();
  }, []);

  async function loadUserPackages() {
    try {
      setLoading(true);
      setError("");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error: fetchError } = await supabase
        .from("user_packages")
        .select(`
          id,
          remaining_sessions,
          expires_at,
          packages (
            name_en,
            name_ar,
            description_en,
            session_count,
            price,
            providers (
              business_name_en,
              business_name_ar
            )
          )
        `)
        .eq("customer_id", user.id);

      if (fetchError) throw fetchError;
      setUserPackages((data as any) || []);
    } catch (err: any) {
      console.error("Error loading customer packages:", err.message);
      setError("Failed to load your packages. Showing mock items.");
      // Fallback mock items
      setUserPackages([
        {
          id: "1",
          remaining_sessions: 4,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
          packages: {
            name_en: "Moroccan Hammam Spa package",
            name_ar: "باقة الحمام المغربي الاسترخائي",
            description_en: "Moroccan bath package with clay mask & massage.",
            session_count: 6,
            price: 990,
            providers: {
              business_name_en: "Riyadh Premium Spa & Wellness",
              business_name_ar: "سبا الرياض الفاخر للعناية"
            }
          }
        },
        {
          id: "2",
          remaining_sessions: 9,
          expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days
          packages: {
            name_en: "Elite Hair & Beard Grooming Multi-Pass",
            name_ar: "بطاقة قص الشعر واللحية الممتازة",
            description_en: "10 session pass for elite styling & grooming.",
            session_count: 10,
            price: 1000,
            providers: {
              business_name_en: "Elite Grooming Lounge",
              business_name_ar: "صالون إيليت الرجالي"
            }
          }
        }
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* HEADER */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">My Wellness Packages</h2>
        <p className="text-sm text-gray-500 mt-1">Track your active memberships, session passes, and redemption codes.</p>
      </div>

      {error && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl p-4">
          Notice: {error}
        </div>
      )}

      {/* PACKAGES LIST */}
      {loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Loading your passes...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {userPackages.map((item) => {
            const pctRemaining = (item.remaining_sessions / item.packages.session_count) * 100;
            const isExpiringSoon = new Date(item.expires_at).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;

            return (
              <div
                key={item.id}
                className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between hover:border-[hsl(45,60%,55%)] transition duration-200"
              >
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        {item.packages.providers.business_name_en}
                      </span>
                      <h3 className="font-bold text-sm text-gray-800 mt-1">{item.packages.name_en}</h3>
                    </div>
                  </div>

                  <p className="text-xs text-gray-500 mb-6">{item.packages.description_en}</p>

                  {/* SESSIONS BALANCE PROGRESS BAR */}
                  <div className="space-y-2 mb-6">
                    <div className="flex justify-between text-xs font-bold text-gray-700">
                      <span>Sessions Remaining</span>
                      <span className="text-[hsl(45,60%,55%)]">{item.remaining_sessions} / {item.packages.session_count}</span>
                    </div>
                    <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-black h-full transition-all duration-300"
                        style={{ width: `${pctRemaining}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center border-t border-gray-50 pt-4">
                  <div>
                    <span className="text-[9px] text-gray-400 uppercase font-bold">Expires On</span>
                    <span className={`text-xs block font-bold mt-0.5 ${isExpiringSoon ? "text-red-500 animate-pulse" : "text-gray-600"}`}>
                      {new Date(item.expires_at).toLocaleDateString("en-GB", { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  <button className="px-4 py-2 bg-black hover:bg-gray-800 text-white font-bold text-xs rounded-xl transition duration-150">
                    Redeem Code
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
