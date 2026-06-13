"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface Resource {
  id: string;
  name: string;
  category: string;
  capacity: number;
  is_active: boolean;
}

export default function ResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  // Form states
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Massage Room");
  const [capacity, setCapacity] = useState(1);
  const [branchId, setBranchId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const categories = ["Massage Room", "Facial Room", "Sauna", "Jacuzzi", "Yoga Studio", "Grooming Station"];

  useEffect(() => {
    loadResources();
  }, []);

  async function loadResources() {
    try {
      setLoading(true);
      setError("");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Find provider profile owned by the user
      const { data: providerInfo } = await supabase
        .from("providers")
        .select("id")
        .eq("owner_id", user.id)
        .maybeSingle();

      if (providerInfo) {
        // Get branches of this provider
        const { data: branches } = await supabase
          .from("branches")
          .select("id")
          .eq("provider_id", providerInfo.id);

        const branchIds = branches?.map(b => b.id) || [];
        if (branchIds.length > 0) {
          setBranchId(branchIds[0]); // Default to first branch

          const { data: resourcesData, error: fetchError } = await supabase
            .from("resources")
            .select("*")
            .in("branch_id", branchIds)
            .order("created_at", { ascending: false });

          if (fetchError) throw fetchError;
          setResources(resourcesData || []);
        }
      }
    } catch (err: any) {
      console.error("Error loading resources:", err.message);
      setError("Failed to load resources. Showing mock fallbacks.");
      // Fallback mock items
      setResources([
        { id: "1", name: "Zen Massage Bed A", category: "Massage Room", capacity: 1, is_active: true },
        { id: "2", name: "Royal Spa Room", category: "Sauna", capacity: 4, is_active: true },
        { id: "3", name: "Hammam Scrub Table", category: "Massage Room", capacity: 1, is_active: true },
        { id: "4", name: "Facial Care Station 1", category: "Facial Room", capacity: 2, is_active: true }
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddResource(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!name.trim()) {
      setError("Please specify a resource name.");
      return;
    }

    if (!branchId) {
      setError("No branch found. Please verify your provider account settings.");
      return;
    }

    try {
      const { data, error: insertError } = await supabase
        .from("resources")
        .insert({
          branch_id: branchId,
          name,
          category,
          capacity,
          is_active: true
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setSuccess("Resource registered successfully!");
      setName("");
      setCapacity(1);
      setShowAddForm(false);
      loadResources();
    } catch (err: any) {
      console.error("Error inserting resource:", err.message);
      setError(err.message || "Failed to create resource.");
    }
  }

  async function toggleResourceStatus(id: string, currentStatus: boolean) {
    try {
      const { error: updateError } = await supabase
        .from("resources")
        .update({ is_active: !currentStatus })
        .eq("id", id);

      if (updateError) throw updateError;
      loadResources();
    } catch (err: any) {
      console.error("Error updating resource:", err.message);
    }
  }

  return (
    <div className="space-y-8">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Spa Rooms & Resources</h2>
          <p className="text-sm text-gray-500 mt-1">Manage physical resources, treatment beds, and rooms for service allocation.</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-black text-white hover:bg-gray-800 rounded-xl text-xs font-bold transition duration-150 flex items-center gap-2"
        >
          {showAddForm ? "Close Form" : "➕ Add New Resource"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-4">
          ⚠️ {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-xl p-4">
          ✅ {success}
        </div>
      )}

      {/* ADD RESOURCE DIALOG */}
      {showAddForm && (
        <form onSubmit={handleAddResource} className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm max-w-xl space-y-4">
          <h3 className="font-bold text-sm text-gray-800">Register Physical Resource</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Resource Name</label>
              <input
                type="text"
                placeholder="e.g. Moroccan Bath Room A"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-gray-700 font-semibold"
                required
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Resource Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-gray-700 font-bold"
              >
                {categories.map((cat, idx) => (
                  <option key={idx} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Simultaneous Capacity</label>
              <input
                type="number"
                min="1"
                max="50"
                value={capacity}
                onChange={(e) => setCapacity(parseInt(e.target.value) || 1)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-gray-700 font-semibold"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="px-4 py-2 bg-[hsl(45,60%,55%)] hover:bg-[hsl(45,60%,45%)] text-black font-bold text-xs rounded-xl transition duration-150"
          >
            Create Resource
          </button>
        </form>
      )}

      {/* RESOURCES GRID */}
      {loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Loading resources...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {resources.map((res) => (
            <div
              key={res.id}
              className={`bg-white border rounded-2xl p-6 shadow-sm flex flex-col justify-between transition duration-200 ${
                res.is_active ? "border-gray-200 hover:border-[hsl(45,60%,55%)]" : "border-gray-100 opacity-60"
              }`}
            >
              <div>
                <div className="flex justify-between items-start mb-3">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{res.category}</span>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                    res.is_active ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
                  }`}>
                    {res.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
                <h4 className="font-bold text-sm text-gray-800 mb-1">{res.name}</h4>
                <p className="text-[10px] text-gray-500 font-semibold mb-6">👤 Max Capacity: {res.capacity} {res.capacity === 1 ? "person" : "people"}</p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => toggleResourceStatus(res.id, res.is_active)}
                  className={`flex-1 py-2 rounded-lg text-[10px] font-bold border transition duration-150 ${
                    res.is_active 
                      ? "bg-gray-50 hover:bg-red-50 hover:text-red-700 hover:border-red-200 text-gray-600 border-gray-200" 
                      : "bg-green-50 text-green-700 hover:bg-green-100 border-green-200"
                  }`}
                >
                  {res.is_active ? "Deactivate" : "Activate"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
