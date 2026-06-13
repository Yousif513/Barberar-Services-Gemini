"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function AdminLedger() {
  const [ledger, setLedger] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const loadLedger = async () => {
    try {
      setLoading(true);
      // Fetch transactional ledger
      const { data, error: dbError } = await supabase
        .from("transactional_ledger")
        .select(`
          id,
          booking_id,
          payment_intent_id,
          total_captured,
          platform_share,
          provider_share,
          payout_status,
          created_at
        `)
        .order("created_at", { ascending: false });

      if (dbError) throw dbError;

      if (data && data.length > 0) {
        setLedger(data);
      } else {
        // Mock splits ledger
        setLedger([
          {
            id: "tl-mock-1",
            booking_id: "b-mock-1",
            payment_intent_id: "ch_tap_981240182",
            total_captured: 120.00,
            platform_share: 18.00,
            provider_share: 102.00,
            payout_status: "pending",
            created_at: new Date().toISOString()
          },
          {
            id: "tl-mock-2",
            booking_id: "b-mock-2",
            payment_intent_id: "ch_tap_981240183",
            total_captured: 250.00,
            platform_share: 37.50,
            provider_share: 212.50,
            payout_status: "released",
            created_at: new Date().toISOString()
          },
          {
            id: "tl-mock-3",
            booking_id: "b-mock-3",
            payment_intent_id: "ch_tap_981240184",
            total_captured: 300.00,
            platform_share: 45.00,
            provider_share: 255.00,
            payout_status: "pending",
            created_at: new Date().toISOString()
          }
        ]);
      }
    } catch (err) {
      setError("Failed to load platform splits ledger.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLedger();
  }, []);

  const handleReleasePayout = async (id: string) => {
    try {
      setSuccess("");
      setError("");

      if (id.startsWith("tl-mock-")) {
        // Update mock state
        setLedger((prev) =>
          prev.map((t) => (t.id === id ? { ...t, payout_status: "released" } : t))
        );
        setSuccess(`Escrow split payout released successfully!`);
        return;
      }

      const { error: patchError } = await supabase
        .from("transactional_ledger")
        .update({ payout_status: "released" })
        .eq("id", id);

      if (patchError) throw patchError;

      setSuccess(`Escrow split payout released successfully!`);
      loadLedger();
    } catch (err) {
      setError("Failed to release transaction payout split.");
      console.error(err);
    }
  };

  return (
    <div className="space-y-8">
      {/* Title */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-stone-900 font-serif">Transactions Splits Ledger</h2>
        <p className="text-sm text-stone-500 mt-1">Audit Tap Connect escrow splits, captured funds, and release pending payouts to bank profiles.</p>
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

      {/* Ledger Table */}
      <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-stone-200 text-stone-400 bg-stone-50/50 uppercase tracking-wider font-extrabold text-[10px]">
                <th className="py-4 px-6">Payment Intent</th>
                <th className="py-4 px-6">Gross Captured</th>
                <th className="py-4 px-6">Platform Share (15%)</th>
                <th className="py-4 px-6">Provider Share (85%)</th>
                <th className="py-4 px-6">Payout Status</th>
                <th className="py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 font-medium text-stone-700">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-stone-400">Loading captured splits ledger...</td>
                </tr>
              ) : (
                ledger.map((item) => (
                  <tr key={item.id} className="hover:bg-stone-50/50 transition">
                    <td className="py-4 px-6">
                      <p className="font-bold text-stone-900">{item.payment_intent_id}</p>
                      <p className="text-[9px] text-stone-400 font-semibold mt-0.5">Booking UUID: {item.booking_id}</p>
                    </td>
                    <td className="py-4 px-6 font-bold text-stone-900">
                      {item.total_captured} SAR
                    </td>
                    <td className="py-4 px-6 font-bold text-amber-700">
                      {item.platform_share} SAR
                    </td>
                    <td className="py-4 px-6 font-bold text-stone-800">
                      {item.provider_share} SAR
                    </td>
                    <td className="py-4 px-6">
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider border inline-block ${
                        item.payout_status === "released"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                      }`}>
                        {item.payout_status}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => handleReleasePayout(item.id)}
                        disabled={item.payout_status === "released"}
                        className="px-3 py-1.5 bg-stone-900 hover:bg-stone-800 disabled:bg-stone-100 disabled:text-stone-400 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg transition"
                      >
                        {item.payout_status === "released" ? "Released" : "Release Payout"}
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
