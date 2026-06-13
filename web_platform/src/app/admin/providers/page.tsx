"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function AdminProviders() {
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const loadProviders = async () => {
    try {
      setLoading(true);
      // Fetch all providers
      const { data, error: dbError } = await supabase
        .from("providers")
        .select("id, business_name_en, type, is_verified, commission_percentage, trade_license_url, created_at")
        .order("created_at", { ascending: false });

      if (dbError) throw dbError;

      if (data && data.length > 0) {
        setProviders(data);
      } else {
        // Fallback mock providers
        setProviders([
          { id: "p-mock-1", business_name_en: "Elite Grooming Salon", type: "salon", is_verified: true, commission_percentage: 15.00, trade_license_url: "#", created_at: new Date().toISOString() },
          { id: "p-mock-2", business_name_en: "Sara Beauty Salon & Spa", type: "salon", is_verified: true, commission_percentage: 15.00, trade_license_url: "#", created_at: new Date().toISOString() },
          { id: "p-mock-3", business_name_en: "Jeddah Grooming Palace", type: "salon", is_verified: false, commission_percentage: 15.00, trade_license_url: "#", created_at: new Date().toISOString() },
          { id: "p-mock-4", business_name_en: "Maha Stylist & Artist", type: "freelancer", is_verified: false, commission_percentage: 15.00, trade_license_url: "#", created_at: new Date().toISOString() }
        ]);
      }
    } catch (err: any) {
      setError("Failed to fetch provider registry.");
      console.warn("Offline fallback registry notice:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProviders();
  }, []);

  const handleToggleVerification = async (id: string, currentStatus: boolean) => {
    try {
      setSuccess("");
      setError("");

      if (id.startsWith("p-mock-")) {
        // Update mock state directly
        setProviders((prev) =>
          prev.map((p) => (p.id === id ? { ...p, is_verified: !currentStatus } : p))
        );
        setSuccess(`Verification status updated successfully!`);
        return;
      }

      const { error: patchError } = await supabase
        .from("providers")
        .update({ is_verified: !currentStatus })
        .eq("id", id);

      if (patchError) throw patchError;

      setSuccess(`Verification status updated successfully!`);
      loadProviders();
    } catch (err: any) {
      setError("Failed to toggle provider verification status.");
      console.warn("Offline verification update notice:", err);
    }
  };

  const handleUpdateCommission = async (id: string, newRate: number) => {
    try {
      setSuccess("");
      setError("");

      if (id.startsWith("p-mock-")) {
        setProviders((prev) =>
          prev.map((p) => (p.id === id ? { ...p, commission_percentage: newRate } : p))
        );
        setSuccess(`Commission percentage updated!`);
        return;
      }

      const { error: patchError } = await supabase
        .from("providers")
        .update({ commission_percentage: newRate })
        .eq("id", id);

      if (patchError) throw patchError;

      setSuccess(`Commission percentage updated!`);
      loadProviders();
    } catch (err: any) {
      setError("Failed to update commission rate.");
      console.warn("Offline commission update notice:", err);
    }
  };

  return (
    <div className="space-y-8">
      {/* Title */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-stone-900 font-serif">Provider Registry & Audits</h2>
        <p className="text-sm text-stone-500 mt-1">Audit trade credentials, toggle verified badges, and customize commission parameters.</p>
      </div>

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl p-4 font-semibold">
          Success: {success}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl p-4 font-semibold">
          Error: {error}
        </div>
      )}

      {/* Audit Table */}
      <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-stone-200 text-stone-400 bg-stone-50/50 uppercase tracking-wider font-extrabold text-[10px]">
                <th className="py-4 px-6">Business Name</th>
                <th className="py-4 px-6">Vertical Scope</th>
                <th className="py-4 px-6">Verification Status</th>
                <th className="py-4 px-6">Commission Rate</th>
                <th className="py-4 px-6">Trade License</th>
                <th className="py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 font-medium text-stone-700">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-stone-400">Loading provider records...</td>
                </tr>
              ) : (
                providers.map((item) => (
                  <tr key={item.id} className="hover:bg-stone-50/50 transition">
                    <td className="py-4 px-6">
                      <p className="font-bold text-stone-900">{item.business_name_en}</p>
                      <p className="text-[9px] text-stone-400 font-semibold mt-0.5">UUID: {item.id}</p>
                    </td>
                    <td className="py-4 px-6 capitalize">{item.type}</td>
                    <td className="py-4 px-6">
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider border ${
                        item.is_verified 
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                          : "bg-amber-50 text-amber-700 border-amber-200"
                      }`}>
                        {item.is_verified ? "Verified" : "Pending Audit"}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={item.commission_percentage}
                          onChange={(e) => handleUpdateCommission(item.id, parseFloat(e.target.value) || 0)}
                          className="w-14 bg-stone-50 border border-stone-200 rounded px-1.5 py-1 text-center font-bold text-stone-900 outline-none focus:border-stone-400"
                        />
                        <span className="font-bold text-stone-400">%</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <a 
                        href={item.trade_license_url || "#"} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-stone-400 hover:text-stone-900 transition flex items-center gap-1 font-bold"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span>License.pdf</span>
                      </a>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => handleToggleVerification(item.id, item.is_verified)}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition ${
                          item.is_verified 
                            ? "bg-stone-100 hover:bg-stone-200 text-stone-700" 
                            : "bg-stone-900 hover:bg-stone-800 text-white"
                        }`}
                      >
                        {item.is_verified ? "Revoke" : "Verify"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
