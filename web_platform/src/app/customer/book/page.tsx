"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { usePrayerTimes } from "@/lib/use-prayer-times";

// Accepted payment methods come from the admin registry and linked payment APIs:
// only enabled, customer-facing methods backed by a connected gateway appear here.
type CheckoutMethod = {
  key: string;
  label_en: string;
  label_ar: string;
  is_default: boolean;
  gateway_key?: string | null;
  gateway_name?: string | null;
};

type CheckoutIntegration = {
  key: string;
  name: string;
  category: string;
  enabled: boolean;
  status: "connected" | "disconnected";
  env: string;
  supported_payment_method_keys?: string[] | null;
};

const isCheckoutMethodAcceptable = (method: any, integrations: CheckoutIntegration[]) => {
  const roles = method.enabled_for_roles ?? [];
  const requiresGateway = method.requires_gateway ?? !(method.gateway_key === "internal" || method.gateway_key === null);
  if (!method.enabled || !roles.includes("customer")) return false;
  if (!requiresGateway || method.gateway_key === "internal") return true;
  return integrations.some((integration) =>
    integration.key === method.gateway_key &&
    integration.category === "payments" &&
    integration.enabled &&
    integration.status === "connected" &&
    integration.env === method.env &&
    (integration.supported_payment_method_keys ?? []).includes(method.key)
  );
};

type ServiceItem = {
  id: string;
  name: string;
  price: number;
  duration: number;
};

type ProviderDetails = {
  name: string;
  description: string;
  district: string;
  services: ServiceItem[];
};

function BookingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const providerId = searchParams.get("id") || "1";

  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [isHomeService, setIsHomeService] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [payMethods, setPayMethods] = useState<CheckoutMethod[]>([]);
  const [paymentConfigMessage, setPaymentConfigMessage] = useState("");
  const { isTimeInLockWindow } = usePrayerTimes();

  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    async function checkProvider() {
      setIsChecking(true);
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(providerId)) {
        setIsDemoMode(true);
        setIsChecking(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("providers")
          .select("id")
          .eq("id", providerId)
          .maybeSingle();

        if (data && !error) {
          router.replace(`/shop/${providerId}`);
        } else {
          setIsDemoMode(true);
          setIsChecking(false);
        }
      } catch (err) {
        setIsDemoMode(true);
        setIsChecking(false);
      }
    }
    checkProvider();
  }, [providerId, router]);

  useEffect(() => {
    (async () => {
      try {
        const { data: accepted, error: acceptedError } = await supabase
          .from("accepted_payment_methods")
          .select("key, label_en, label_ar, is_default, gateway_key, gateway_name")
          .order("sort_order");

        if (!acceptedError && accepted?.length) {
          setPayMethods(accepted as CheckoutMethod[]);
          setPaymentConfigMessage("");
          return;
        }

        const [{ data: methods }, { data: integrations }] = await Promise.all([
          supabase
            .from("payment_methods")
            .select("key, label_en, label_ar, is_default, enabled, enabled_for_roles, gateway_key, env, requires_gateway")
            .eq("enabled", true)
            .order("sort_order"),
          supabase
            .from("integrations")
            .select("key, name, category, enabled, status, env, supported_payment_method_keys")
            .eq("category", "payments")
        ]);

        const paymentApis = (integrations ?? []) as CheckoutIntegration[];
        const forCustomers = (methods ?? [])
          .filter((m) => isCheckoutMethodAcceptable(m, paymentApis))
          .map((m: any) => ({
            key: m.key,
            label_en: m.label_en,
            label_ar: m.label_ar,
            is_default: m.is_default,
            gateway_key: m.gateway_key,
            gateway_name: paymentApis.find((api) => api.key === m.gateway_key)?.name || null
          }));
        setPayMethods(forCustomers);
        setPaymentConfigMessage(forCustomers.length ? "" : "No active payment methods are currently configured by the admin.");
      } catch {
        setPayMethods([]);
        setPaymentConfigMessage("Payment methods are not available. Please ask the admin to configure active payment APIs.");
      }
    })();
  }, []);

  const mockProviderDetails: Record<string, ProviderDetails> = {
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

  const provider = mockProviderDetails[providerId] || mockProviderDetails["1"];
  const [selectedService, setSelectedService] = useState<ServiceItem>(provider.services[0]);

  const slotToDate = (dateValue: string, slot: string) => {
    const [timePart, modifier] = slot.split(" ");
    const [hourPart, minutePart] = timePart.split(":");
    let hours = Number(hourPart);
    const minutes = Number(minutePart);
    if (modifier === "PM" && hours !== 12) hours += 12;
    if (modifier === "AM" && hours === 12) hours = 0;
    const candidate = new Date(`${dateValue}T00:00:00`);
    candidate.setHours(hours, minutes, 0, 0);
    return candidate;
  };

  // Client-side mirror of the prayer lock windows; move this into the
  // get_available_slots RPC once the backend slot API accepts branch windows.
  const getAvailableSlots = () => {
    const slots = ["09:00 AM", "09:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM", "01:00 PM", "01:30 PM", "02:00 PM", "02:30 PM", "03:00 PM", "04:00 PM", "04:30 PM", "05:00 PM", "07:30 PM", "08:00 PM"];
    if (!selectedDate) return slots;
    return slots.filter((slot) => !isTimeInLockWindow(slotToDate(selectedDate, slot)));
  };

  const handleBook = async () => {
    if (!selectedDate || !selectedSlot) {
      setMessage("Error: Please select a date and an available time slot.");
      return;
    }

    setIsLoading(true);
    setMessage("");

    try {
      setMessage("Please select a live provider from the store to reserve a verified slot.");
      setTimeout(() => router.push("/services"), 1500);
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Booking could not be completed.");
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

  if (isChecking) {
    return (
      <div className="min-h-[400px] flex items-center justify-center bg-[#F2EEE6] rounded-3xl p-12">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-4 border-[#C29A4C] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-[10px] font-black tracking-widest text-[#8A7F6C] uppercase">
            Resolving Live Provider...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {isDemoMode && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2.5">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
            </span>
            <span className="text-xs font-black text-amber-800 tracking-wide uppercase">
              Demo Booking Mode / وضع الحجز التجريبي
            </span>
          </div>
          <span className="text-[9px] font-black text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
            Simulation
          </span>
        </div>
      )}

      {/* Provider Details Header */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900">{provider.name}</h2>
        <p className="text-xs text-gray-400 mt-1">Location: {provider.district}</p>
        <p className="text-xs text-gray-500 mt-4 leading-relaxed">{provider.description}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Slot Selector form column */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Service Selector */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-sm text-gray-800">Select Service</h3>
            <div className="space-y-2">
              {provider.services.map((srv) => (
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
                  Riyadh Prayer Time Slots are blocked automatically (20-minute gap buffers).
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

          {/* Accepted payment methods — admin-controlled registry */}
          <div className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">We accept</span>
            <div className="flex flex-wrap gap-1.5">
              {payMethods.length === 0 ? (
                <span className="rounded-full border border-red-100 bg-red-50 px-2.5 py-1 text-[9px] font-black text-red-600">
                  {paymentConfigMessage || "No active payment methods"}
                </span>
              ) : payMethods.map((m) => (
                <span
                  key={m.key}
                  className={`rounded-full border px-2.5 py-1 text-[9px] font-black ${
                    m.is_default
                      ? "border-[hsl(45,60%,55%)]/50 bg-[hsl(45,60%,96%)] text-[hsl(42,55%,38%)]"
                      : "border-gray-200 bg-gray-50 text-gray-500"
                  }`}
                >
                  {m.label_en}{m.gateway_name ? ` · ${m.gateway_name}` : ""}
                </span>
              ))}
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
              disabled={isLoading || !selectedDate || !selectedSlot || payMethods.length === 0}
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
