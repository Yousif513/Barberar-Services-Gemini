"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const translations = {
  en: {
    title: "Courier Logistics Dispatch",
    subtitle: "Accept and fulfill delivery shipments for customer bookings and wellness product orders.",
    tabOpen: "Available Shipments",
    tabActive: "My Active Runs",
    tabCompleted: "Completed Deliveries",
    noJobs: "No delivery jobs found in this category.",
    acceptBtn: "Accept Shipment",
    startTransitBtn: "Start Transit / Ship",
    markDeliveredBtn: "Confirm Handover & Deliver",
    pickupAddr: "Pickup From",
    deliveryAddr: "Deliver To",
    estTime: "Est. Time",
    statusLabel: "Status",
    statusPending: "Pending Dispatch",
    statusAccepted: "Assigned / Accepted",
    statusInTransit: "In Transit",
    statusDelivered: "Delivered",
    statusCancelled: "Cancelled",
    successAccept: "Shipment accepted successfully!",
    successStatus: "Delivery status updated successfully!",
    errorLoad: "Failed to load delivery jobs.",
    distance: "Distance",
    eta: "ETA",
    driverLicense: "Carrier License: verified ",
    refreshBtn: "Refresh Board",
    mockNotice: "Simulated offline dispatch board. Operations run in local storage."
  },
  ar: {
    title: "لوحة ترحيل الشحنات واللوجستيات",
    subtitle: "قبول وتوصيل الشحنات للطلبات وحجوزات العملاء ومنتجات العافية.",
    tabOpen: "الشحنات المتاحة",
    tabActive: "شحناتي النشطة",
    tabCompleted: "الشحنات المكتملة",
    noJobs: "لا توجد شحنات توصيل في هذا القسم.",
    acceptBtn: "قبول الشحن والتوصيل",
    startTransitBtn: "بدء الشحن والتوصيل",
    markDeliveredBtn: "تأكيد التسليم للعميل",
    pickupAddr: "مكان الاستلام",
    deliveryAddr: "مكان التسليم",
    estTime: "الوقت المقدر",
    statusLabel: "الحالة",
    statusPending: "قيد الانتظار",
    statusAccepted: "تم قبول الشحنة",
    statusInTransit: "قيد التوصيل الآن",
    statusDelivered: "تم التسليم بنجاح",
    statusCancelled: "ملغي",
    successAccept: "تم قبول الشحنة بنجاح وجاري إعدادها!",
    successStatus: "تم تحديث حالة التوصيل بنجاح!",
    errorLoad: "فشل تحميل شحنات التوصيل.",
    distance: "المسافة",
    eta: "الوقت المتوقع",
    driverLicense: "رخصة الناقل: معتمدة وموثقة ",
    refreshBtn: "تحديث اللوحة",
    mockNotice: "لوحة محاكاة لوجستية غير متصلة بالشبكة. تعمل العمليات محلياً."
  }
};

interface DeliveryJob {
  id: string;
  booking_id: string;
  pickup_address: string;
  delivery_address: string;
  pickup_latitude: number;
  pickup_longitude: number;
  delivery_latitude: number;
  delivery_longitude: number;
  carrier_id: string | null;
  status: "pending" | "accepted" | "in_transit" | "delivered" | "cancelled";
  estimated_delivery_time: string;
  delivery_metadata: any;
  created_at: string;
}

export default function CourierDeliveriesPage() {
  const [locale, setLocale] = useState<"en" | "ar">("ar");
  const [activeTab, setActiveTab] = useState<"available" | "active" | "completed">("available");
  const [jobs, setJobs] = useState<DeliveryJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [carrierId, setCarrierId] = useState("");

  // Sync language with document root
  useEffect(() => {
    const handleLangSync = () => {
      const currentLang = document.documentElement.lang as "en" | "ar";
      if (currentLang === "en" || currentLang === "ar") {
        setLocale(currentLang);
      }
    };
    handleLangSync();
    const observer = new MutationObserver(handleLangSync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, []);

  const t = translations[locale];

  const loadJobs = async () => {
    try {
      setLoading(true);
      setError("");
      
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCarrierId(user.id);
      } else {
        setCarrierId("mock-carrier-id-123");
      }

      // Check if we can fetch from Supabase
      const { data, error: fetchError } = await supabase
        .from("delivery_jobs")
        .select("*")
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;

      if (data && data.length > 0) {
        setJobs(data);
      } else {
        // Fallback to generating mock data if database table is empty
        generateMockJobs();
      }
    } catch (err: any) {
      console.warn("Using simulated delivery jobs data in sandbox mode:", err.message);
      generateMockJobs();
    } finally {
      setLoading(false);
    }
  };

  const generateMockJobs = () => {
    const localSaved = localStorage.getItem("primora_delivery_jobs");
    if (localSaved) {
      try {
        setJobs(JSON.parse(localSaved));
        return;
      } catch (e) {
        // Parse error, regenerate
      }
    }

    const mockJobsList: DeliveryJob[] = [
      {
        id: "dj-mock-1",
        booking_id: "booking-mock-1",
        pickup_address: locale === "ar" ? "صالون إيليت - الملقا، الرياض" : "Elite Barbershop - Al-Malqa, Riyadh",
        delivery_address: locale === "ar" ? "حي الهدا، فيلا 12، الرياض" : "Al-Hada District, Villa 12, Riyadh",
        pickup_latitude: 24.7963,
        pickup_longitude: 46.6111,
        delivery_latitude: 24.6932,
        delivery_longitude: 46.6231,
        carrier_id: null,
        status: "pending",
        estimated_delivery_time: new Date(Date.now() + 45 * 60000).toISOString(),
        delivery_metadata: { distance: "8.4 km", item: "Luxury Grooming Oil & Kit" },
        created_at: new Date(Date.now() - 30 * 60000).toISOString()
      },
      {
        id: "dj-mock-2",
        booking_id: "booking-mock-2",
        pickup_address: locale === "ar" ? "سبا لوميير النسائي - العليا، الرياض" : "Lumiere Spa - Al-Olaya, Riyadh",
        delivery_address: locale === "ar" ? "حي الياسمين، شقة 44، الرياض" : "Al-Yasmin District, Apt 44, Riyadh",
        pickup_latitude: 24.7112,
        pickup_longitude: 46.6744,
        delivery_latitude: 24.8115,
        delivery_longitude: 46.6412,
        carrier_id: null,
        status: "pending",
        estimated_delivery_time: new Date(Date.now() + 90 * 60000).toISOString(),
        delivery_metadata: { distance: "12.8 km", item: "Organic Massage Oil & Bath Salts Pack" },
        created_at: new Date(Date.now() - 15 * 60000).toISOString()
      },
      {
        id: "dj-mock-3",
        booking_id: "booking-mock-3",
        pickup_address: locale === "ar" ? "صالون إيليت - الملقا، الرياض" : "Elite Barbershop - Al-Malqa, Riyadh",
        delivery_address: locale === "ar" ? "حي النخيل، شارع الأمير تركي، الرياض" : "Al-Nakheel District, Prince Turki St, Riyadh",
        pickup_latitude: 24.7963,
        pickup_longitude: 46.6111,
        delivery_latitude: 24.7345,
        delivery_longitude: 46.6432,
        carrier_id: "mock-carrier-id-123",
        status: "accepted",
        estimated_delivery_time: new Date(Date.now() + 20 * 60000).toISOString(),
        delivery_metadata: { distance: "6.2 km", item: "Premium Hair Care & Styling Clay" },
        created_at: new Date(Date.now() - 60 * 60000).toISOString()
      }
    ];

    setJobs(mockJobsList);
    localStorage.setItem("primora_delivery_jobs", JSON.stringify(mockJobsList));
  };

  useEffect(() => {
    loadJobs();
  }, [locale]);

  const updateJobStatus = async (jobId: string, nextStatus: "accepted" | "in_transit" | "delivered") => {
    try {
      setError("");
      setSuccess("");

      if (!jobId.startsWith("dj-mock-")) {
        const payload: any = { status: nextStatus };
        if (nextStatus === "accepted") {
          payload.carrier_id = carrierId;
        }

        const { error: updateError } = await supabase
          .from("delivery_jobs")
          .update(payload)
          .eq("id", jobId);

        if (updateError) throw updateError;
      }

      // Local state update
      const updated = jobs.map(j => {
        if (j.id === jobId) {
          return {
            ...j,
            status: nextStatus,
            carrier_id: nextStatus === "accepted" ? carrierId : j.carrier_id
          };
        }
        return j;
      });

      setJobs(updated);
      localStorage.setItem("primora_delivery_jobs", JSON.stringify(updated));

      if (nextStatus === "accepted") {
        setSuccess(t.successAccept);
      } else {
        setSuccess(t.successStatus);
      }
      setTimeout(() => setSuccess(""), 4000);
    } catch (err: any) {
      console.error("Status transition error:", err.message);
      setError(t.errorLoad);
    }
  };

  const filteredJobs = jobs.filter(j => {
    if (activeTab === "available") {
      return j.status === "pending" && !j.carrier_id;
    }
    if (activeTab === "active") {
      return j.carrier_id === carrierId && (j.status === "accepted" || j.status === "in_transit");
    }
    if (activeTab === "completed") {
      return j.carrier_id === carrierId && j.status === "delivered";
    }
    return false;
  });

  const isRTL = locale === "ar";

  return (
    <div className="space-y-8 font-sans">
      
      {/* Header */}
      <div className={`flex justify-between items-center flex-wrap gap-4 ${isRTL ? "flex-row-reverse text-right" : "flex-row text-left"}`}>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-stone-900 font-serif">{t.title}</h2>
          <p className="text-sm text-stone-500 mt-1">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] uppercase font-bold text-[hsl(45,60%,55%)] bg-[hsl(45,60%,95%)] px-3 py-1 border border-amber-500/20 rounded-full font-semibold">
            {t.driverLicense}
          </span>
          <button
            onClick={loadJobs}
            className="px-4 py-2 bg-stone-900 hover:bg-stone-850 text-white font-bold text-xs rounded-xl transition shadow-sm"
          >
            {t.refreshBtn}
          </button>
        </div>
      </div>

      {success && (
        <div className={`bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl p-4 font-semibold ${isRTL ? "text-right" : "text-left"}`}>
          {success}
        </div>
      )}

      {error && (
        <div className={`bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl p-4 font-semibold ${isRTL ? "text-right" : "text-left"}`}>
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className={`flex border-b border-stone-200 gap-6 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
        <button
          onClick={() => setActiveTab("available")}
          className={`pb-4 text-xs font-bold uppercase tracking-wider transition-all duration-200 border-b-2 ${
            activeTab === "available"
              ? "border-[hsl(45,60%,55%)] text-stone-900 font-extrabold"
              : "border-transparent text-stone-400 hover:text-stone-600"
          }`}
        >
          {t.tabOpen}
        </button>
        <button
          onClick={() => setActiveTab("active")}
          className={`pb-4 text-xs font-bold uppercase tracking-wider transition-all duration-200 border-b-2 ${
            activeTab === "active"
              ? "border-[hsl(45,60%,55%)] text-stone-900 font-extrabold"
              : "border-transparent text-stone-400 hover:text-stone-600"
          }`}
        >
          {t.tabActive}
        </button>
        <button
          onClick={() => setActiveTab("completed")}
          className={`pb-4 text-xs font-bold uppercase tracking-wider transition-all duration-200 border-b-2 ${
            activeTab === "completed"
              ? "border-[hsl(45,60%,55%)] text-stone-900 font-extrabold"
              : "border-transparent text-stone-400 hover:text-stone-600"
          }`}
        >
          {t.tabCompleted}
        </button>
      </div>

      {/* Jobs List Grid */}
      {loading ? (
        <div className="text-center py-12 text-stone-400 text-xs font-semibold">
          {isRTL ? "جاري تحميل اللوحة اللوجستية..." : "Loading logistics board..."}
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-2xl py-12 text-center text-stone-400 text-xs font-semibold">
          {t.noJobs}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {filteredJobs.map(job => (
            <div
              key={job.id}
              className={`bg-white border border-stone-200 rounded-2xl p-6 shadow-sm hover:border-[hsl(45,60%,55%)] transition duration-300 flex flex-col md:flex-row justify-between items-start md:items-center gap-6`}
            >
              <div className={`space-y-4 max-w-2xl flex-1 ${isRTL ? "text-right" : "text-left"}`}>
                {/* Details Header */}
                <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                  <span className="text-[10px] font-extrabold text-stone-400 uppercase tracking-widest">
                    ID: {job.id.substring(0, 8)}
                  </span>
                  <span className={`px-2 py-0.5 text-[8px] font-extrabold uppercase rounded border ${
                    job.status === "pending"
                      ? "bg-amber-50 text-amber-700 border-amber-250/20"
                      : job.status === "in_transit"
                      ? "bg-sky-50 text-sky-700 border-sky-250/20"
                      : "bg-emerald-50 text-emerald-700 border-emerald-250/20"
                  }`}>
                    {job.status === "pending"
                      ? t.statusPending
                      : job.status === "accepted"
                      ? t.statusAccepted
                      : job.status === "in_transit"
                      ? t.statusInTransit
                      : t.statusDelivered}
                  </span>
                </div>

                {/* Addresses */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <h5 className="text-[9px] uppercase font-bold text-stone-400 mb-1">{t.pickupAddr}</h5>
                    <p className="text-xs font-bold text-stone-800">{job.pickup_address}</p>
                  </div>
                  <div>
                    <h5 className="text-[9px] uppercase font-bold text-stone-400 mb-1">{t.deliveryAddr}</h5>
                    <p className="text-xs font-bold text-stone-850">{job.delivery_address}</p>
                  </div>
                </div>

                {/* Metadata */}
                <div className={`flex flex-wrap gap-x-6 gap-y-2 text-[10px] text-stone-400 font-semibold border-t border-stone-100 pt-3 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                  {job.delivery_metadata?.distance && (
                    <span>
                      {t.distance}: <strong className="text-stone-700 font-bold">{job.delivery_metadata.distance}</strong>
                    </span>
                  )}
                  {job.delivery_metadata?.item && (
                    <span>
                      {isRTL ? "المحتويات" : "Contents"}: <strong className="text-stone-750 font-bold">{job.delivery_metadata.item}</strong>
                    </span>
                  )}
                  <span>
                    {t.estTime}: <strong className="text-stone-700 font-bold">{new Date(job.estimated_delivery_time).toLocaleTimeString()}</strong>
                  </span>
                </div>
              </div>

              {/* Actions Button */}
              <div className={`flex flex-col items-stretch md:items-end justify-center w-full md:w-auto border-t md:border-0 pt-4 md:pt-0 ${isRTL ? "md:items-start" : "md:items-end"}`}>
                {job.status === "pending" && (
                  <button
                    onClick={() => updateJobStatus(job.id, "accepted")}
                    className="px-6 py-2.5 bg-stone-900 hover:bg-stone-850 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition duration-150 shadow-sm"
                  >
                    {t.acceptBtn}
                  </button>
                )}
                {job.status === "accepted" && (
                  <button
                    onClick={() => updateJobStatus(job.id, "in_transit")}
                    className="px-6 py-2.5 bg-[hsl(45,60%,45%)] hover:bg-[hsl(45,60%,40%)] text-white font-bold text-xs uppercase tracking-wider rounded-xl transition duration-150 shadow-sm"
                  >
                    {t.startTransitBtn}
                  </button>
                )}
                {job.status === "in_transit" && (
                  <button
                    onClick={() => updateJobStatus(job.id, "delivered")}
                    className="px-6 py-2.5 bg-emerald-700 hover:bg-emerald-850 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition duration-150 shadow-sm"
                  >
                    {t.markDeliveredBtn}
                  </button>
                )}
                {job.status === "delivered" && (
                  <span className="text-[10px] uppercase font-extrabold text-emerald-600 bg-emerald-50 px-3 py-1.5 border border-emerald-200 rounded-lg">
                    {isRTL ? "مكتملة ومسلمة للعميل" : "Successfully Handed Over"}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Simulator Info Notice */}
      <div className="bg-stone-100 border border-stone-250/60 rounded-xl p-4 text-[10px] text-stone-500 text-center leading-relaxed">
        {t.mockNotice}
      </div>

    </div>
  );
}
