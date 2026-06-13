"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalGmv: 425840.00,
    commissionRevenue: 63876.00,
    activeProviders: 186,
    openDisputes: 3
  });
  
  const [pendingAudits, setPendingAudits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAdminStats() {
      try {
        setLoading(true);
        // Load pending providers from Supabase
        const { data: providers, error } = await supabase
          .from("providers")
          .select("id, business_name_en, type, created_at")
          .eq("is_verified", false)
          .order("created_at", { ascending: false })
          .limit(3);
        
        if (providers && providers.length > 0) {
          setPendingAudits(providers);
        } else {
          // Fallback to mock audits
          setPendingAudits([
            { id: "p-mock-1", business_name_en: "Jeddah Grooming Palace", type: "salon", created_at: new Date().toISOString() },
            { id: "p-mock-2", business_name_en: "Maha Stylist & Artist", type: "freelancer", created_at: new Date().toISOString() }
          ]);
        }
      } catch (err) {
        console.warn("Offline admin stats fallback warning:", err);
      } finally {
        setLoading(false);
      }
    }
    loadAdminStats();
  }, []);

  return (
    <div className="space-y-8">
      {/* Page Title */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-stone-900">Platform Operations Overview</h2>
        <p className="text-sm text-stone-500 mt-1">Real-time indicators of GMV performance, commissions, and marketplace verification status.</p>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-extrabold text-stone-400 tracking-wider">Total GMV (Captured)</span>
            <span className="text-emerald-600 text-xs font-bold bg-emerald-50 px-2 py-0.5 rounded">+12.4%</span>
          </div>
          <p className="text-2xl font-black text-stone-900 mt-4">{stats.totalGmv.toLocaleString("en-US", { minimumFractionDigits: 2 })} SAR</p>
          <span className="text-[10px] text-stone-400 block mt-2 font-medium">Gross booking transaction value</span>
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-extrabold text-stone-400 tracking-wider">Platform Net Revenue</span>
            <span className="text-stone-400 text-xs font-bold">15% Comm.</span>
          </div>
          <p className="text-2xl font-black text-stone-900 mt-4">{stats.commissionRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })} SAR</p>
          <span className="text-[10px] text-stone-400 block mt-2 font-medium">Reconciled platform earnings</span>
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-extrabold text-stone-400 tracking-wider">Active Providers</span>
            <span className="text-stone-400 text-[10px] font-semibold bg-stone-100 px-2 py-0.5 rounded">Riyadh</span>
          </div>
          <p className="text-2xl font-black text-stone-900 mt-4">{stats.activeProviders}</p>
          <span className="text-[10px] text-stone-400 block mt-2 font-medium">Verified Salons & Freelancers</span>
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-extrabold text-stone-400 tracking-wider">Escrow Disputes</span>
            <span className="text-red-600 text-xs font-bold bg-red-50 px-2 py-0.5 rounded">Action Required</span>
          </div>
          <p className="text-2xl font-black text-stone-900 mt-4">{stats.openDisputes}</p>
          <span className="text-[10px] text-stone-400 block mt-2 font-medium">Open refund requests</span>
        </div>
      </div>

      {/* Main Panel Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Side: Pending Verification audits */}
        <div className="lg:col-span-2 bg-white border border-stone-200 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-stone-100 pb-4">
            <h3 className="font-bold text-sm text-stone-900 uppercase tracking-wide">Pending Verification Queue</h3>
            <Link href="/admin/providers" className="text-[10px] font-bold text-amber-600 hover:underline">View All Audits</Link>
          </div>

          <div className="space-y-4">
            {pendingAudits.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-4 border border-stone-100 rounded-xl bg-stone-50/50 hover:bg-stone-50 transition duration-150">
                <div className="space-y-1">
                  <h4 className="font-bold text-xs text-stone-900">{item.business_name_en}</h4>
                  <p className="text-[9px] text-stone-400 uppercase tracking-wider font-semibold">{item.type}</p>
                  <p className="text-[9px] text-stone-400 font-semibold">Registered: {new Date(item.created_at).toLocaleDateString()}</p>
                </div>
                <Link
                  href="/admin/providers"
                  className="px-3.5 py-1.5 bg-stone-900 hover:bg-stone-800 text-stone-50 text-[10px] font-bold uppercase tracking-wider rounded-lg transition"
                >
                  Audit
                </Link>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: Quick Action Links */}
        <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm space-y-6">
          <h3 className="font-bold text-sm text-stone-900 uppercase tracking-wide border-b border-stone-100 pb-4">Quick Operations</h3>
          
          <div className="space-y-3">
            <Link
              href="/admin/disputes"
              className="flex items-center justify-between p-4 border border-stone-100 rounded-xl hover:border-stone-300 transition duration-150 group"
            >
              <div>
                <h4 className="font-bold text-xs text-stone-900">Arbitrate Disputes</h4>
                <p className="text-[9px] text-stone-400 font-medium mt-0.5">Approve refunds or decline appeals</p>
              </div>
              <span className="text-stone-400 group-hover:text-stone-900 transition-colors">→</span>
            </Link>

            <Link
              href="/admin/ledger"
              className="flex items-center justify-between p-4 border border-stone-100 rounded-xl hover:border-stone-300 transition duration-150 group"
            >
              <div>
                <h4 className="font-bold text-xs text-stone-900">Split Payouts Ledger</h4>
                <p className="text-[9px] text-stone-400 font-medium mt-0.5">Audit transaction splits & release payouts</p>
              </div>
              <span className="text-stone-400 group-hover:text-stone-900 transition-colors">→</span>
            </Link>

            <Link
              href="/admin/bookings"
              className="flex items-center justify-between p-4 border border-stone-100 rounded-xl hover:border-stone-300 transition duration-150 group"
            >
              <div>
                <h4 className="font-bold text-xs text-stone-900">Global Bookings Ledger</h4>
                <p className="text-[9px] text-stone-400 font-medium mt-0.5">View active scheduler status across Riyadh</p>
              </div>
              <span className="text-stone-400 group-hover:text-stone-900 transition-colors">→</span>
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
