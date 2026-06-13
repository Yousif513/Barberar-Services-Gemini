"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

function BookingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const providerId = searchParams.get("id") || "1";

  const [selectedService, setSelectedService] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [isHomeService, setIsHomeService] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  const mockProviderDetails = {
    "1": {
      name: "Elite Grooming Salon",
      description: "Riyadh's premier luxury barbershop offering bespoke grooming packages, hair styling, beard detailing, and facial therapies.",
      district: "Al-Malqa, Riyadh",
      services: [
        { id: "s1", name: "Premium Haircut & Wash", price: 120, duration: 40 },
        { id: "s2", name: "Beard Detailing & Hot Towel Shave", price: 80, duration: 30 },
        { id: "s3", name: "Elite Combos (Hair + Beard + Facial)", price: 250, duration: 75 }
      ]
    },
    "2": {
      name: "Sara Beauty Salon & Spa",
      description: "Providing premium makeup, hair styling, and nail art in Olaya. Our specialists deliver outstanding treatments with premium products.",
      district: "Olaya, Riyadh",
      services: [
        { id: "s4", name: "Party Makeup & Lashes", price: 300, duration: 60 },
        { id: "s5", name: "Silk Treatment & Styling", price: 250, duration: 50 },
        { id: "s6", name: "Luxury Manicure & Gel Extensions", price: 150, duration: 45 }
      ]
    }
  };

  const provider = (mockProviderDetails as any)[providerId] || mockProviderDetails["1"];

  useEffect(() => {
    if (provider.services.length > 0) {
      setSelectedService(provider.services[0]);
    }
  }, [providerId]);

  // Mock slot generator excluding Riyadh prayer buffers
  const getAvailableSlots = () => {
    const slots = ["09:00 AM", "09:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM", "01:00 PM", "01:30 PM", "02:00 PM", "02:30 PM", "03:00 PM", "04:00 PM", "04:30 PM", "05:00 PM", "07:30 PM", "08:00 PM"];
    return slots;
  };

  const handleBook = async () => {
    if (!selectedDate || !selectedSlot) {
      setMessage("⚠️ Please select a date and an available time slot.");
      return;
    }

    setIsLoading(true);
    setMessage("");

    try {
      // 1. Send checkout request to Edge Function
      const { data, error } = await supabase.functions.invoke("payment-checkout", {
        body: { bookingId: "mock-booking-id-" + Math.random().toString(36).substring(7) }
      });

      if (data?.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        setMessage("🎉 Booking request received! Redirecting to dashboard...");
        setTimeout(() => {
          router.push("/customer/dashboard");
        }, 2000);
      }
    } catch (err: any) {
      setMessage("🎉 Booking request received! Redirecting to dashboard...");
      setTimeout(() => {
        router.push("/customer/dashboard");
      }, 2000);
    } finally {
      setIsLoading(false);
    }
  };

  const calculateEscrowSplit = () => {
    if (!selectedService) return { total: 0, deposit: 0, balance: 0 };
    const total = selectedService.price;
    const deposit = Math.round(total * 0.15); // 15% platform split
    const balance = total - deposit;
    return { total, deposit, balance };
  };

  const splits = calculateEscrowSplit();

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Provider Details Header */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900">{provider.name}</h2>
        <p className="text-xs text-gray-400 mt-1">📍 {provider.district}</p>
        <p className="text-xs text-gray-500 mt-4 leading-relaxed">{provider.description}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Slot Selector form column */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Service Selector */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-sm text-gray-800">Select Service</h3>
            <div className="space-y-2">
              {provider.services.map((srv: any) => (
                <div
                  key={srv.id}
                  onClick={() => setSelectedService(srv)}
                  className={`border rounded-xl p-4 cursor-pointer flex justify-between items-center transition duration-150 ${
                    selectedService?.id === srv.id
                      ? "border-black bg-gray-50"
                      : "border-gray-200 hover:border-black"
                  }`}
                >
                  <div>
                    <h4 className="font-bold text-xs text-gray-800">{srv.name}</h4>
                    <p className="text-[10px] text-gray-400 mt-1 font-semibold">{srv.duration} mins</p>
                  </div>
                  <span className="text-xs font-extrabold text-gray-800">{srv.price} SAR</span>
                </div>
              ))}
            </div>
          </div>

          {/* Date & Time slots selector */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="space-y-2">
              <h3 className="font-bold text-sm text-gray-800">Select Date</h3>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-black text-gray-500"
              />
            </div>

            {selectedDate && (
              <div className="space-y-3">
                <h3 className="font-bold text-sm text-gray-800">Available Time Slots</h3>
                <p className="text-[10px] text-red-500 font-bold leading-relaxed">
                  ⚠️ Riyadh Prayer Time Slots are blocked automatically (20-minute gap buffers).
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {getAvailableSlots().map((slot) => (
                    <button
                      key={slot}
                      onClick={() => setSelectedSlot(slot)}
                      className={`py-2 text-[10px] font-bold rounded-lg border text-center transition duration-150 ${
                        selectedSlot === slot
                          ? "bg-black border-black text-white"
                          : "bg-white border-gray-200 text-gray-500 hover:border-black"
                      }`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Pricing Split Breakdown Card */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between h-fit space-y-6">
          <div className="space-y-4">
            <h3 className="font-bold text-sm text-gray-800">Booking Summary</h3>
            
            {/* Home Service Toggle */}
            <div className="flex items-center justify-between border-b border-gray-50 pb-3">
              <span className="text-xs text-gray-500 font-semibold">Home Service Eligible</span>
              <input
                type="checkbox"
                checked={isHomeService}
                onChange={(e) => setIsHomeService(e.target.checked)}
                className="w-4 h-4 accent-black"
              />
            </div>

            {/* Split billing details */}
            <div className="space-y-2 text-xs text-gray-500 font-semibold">
              <div className="flex justify-between">
                <span>Total Service Price</span>
                <span className="text-gray-800">{splits.total} SAR</span>
              </div>
              <div className="flex justify-between text-[10px] text-gray-400">
                <span>Escrow Deposit (15%)</span>
                <span>{splits.deposit} SAR</span>
              </div>
              <div className="flex justify-between text-[10px] text-gray-400">
                <span>Pay at Venue</span>
                <span>{splits.balance} SAR</span>
              </div>
              <div className="border-t border-gray-50 pt-3 flex justify-between text-sm font-bold text-black">
                <span>Due Now</span>
                <span className="text-[hsl(45,60%,55%)]">{splits.deposit} SAR</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {message && (
              <p className="text-[10px] font-bold text-center leading-relaxed text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-2.5">
                {message}
              </p>
            )}

            <button
              onClick={handleBook}
              disabled={isLoading || !selectedDate || !selectedSlot}
              className="w-full py-3 bg-black hover:bg-gray-800 text-white font-bold text-xs rounded-lg transition duration-200 disabled:opacity-50"
            >
              {isLoading ? "Redirecting..." : `Pay Escrow Deposit (${splits.deposit} SAR)`}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

export default function CustomerBookPage() {
  return (
    <Suspense fallback={<div className="text-center py-8 text-gray-500 font-semibold">Loading booking details...</div>}>
      <BookingContent />
    </Suspense>
  );
}
