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
    mockNotice: "Simulated offline dispatch board. Operations run in local storage.",

    // Redesign extensions
    mapTitle: "Live Dispatch Monitor",
    mapSubtitle: "Real-time routing and shipment tracking",
    courierListTitle: "Courier Fleet Status",
    courierStatusOnline: "On Duty",
    courierStatusBusy: "In Transit",
    courierStatusOffline: "Offline",
    assignCourier: "Assign Courier",
    assignSelectPlaceholder: "Select carrier...",
    dispatchSettings: "Dispatch Parameters",
    radiusLabel: "Search Radius",
    multiplierLabel: "Surge Fee Multiplier",
    autoAssign: "Auto-Dispatch Mode",
    activeCouriers: "Active Couriers",
    jobsCounter: "Total Shipments",
    mapLegendPickup: "Pickup Point",
    mapLegendDelivery: "Delivery Point",
    saveSettingsBtn: "Apply Settings",
    settingsSaved: "Parameters applied successfully!",
    assignBtn: "Assign",
    kpiAvailable: "Open Shipments",
    kpiActive: "Active Runs",
    kpiCompleted: "Completed",
    contentsLabel: "Contents",
    selectJobTip: "Click any shipment card to view its path on the radar grid."
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
    mockNotice: "لوحة محاكاة لوجستية غير متصلة بالشبكة. تعمل العمليات محلياً.",

    // Redesign extensions
    mapTitle: "شاشة الترحيل المباشرة",
    mapSubtitle: "تتبع المسارات والشحنات في الوقت الفعلي",
    courierListTitle: "حالة أسطول المناديب",
    courierStatusOnline: "متصل / متاح",
    courierStatusBusy: "في طريق التوصيل",
    courierStatusOffline: "غير متصل",
    assignCourier: "تعيين مندوب للطلب",
    assignSelectPlaceholder: "اختر ناقلاً...",
    dispatchSettings: "معايير الترحيل الذكي",
    radiusLabel: "نطاق البحث الجغرافي",
    multiplierLabel: "مضاعف الأسعار الإضافي",
    autoAssign: "وضع التوزيع التلقائي للطلبات",
    activeCouriers: "المناديب النشطين",
    jobsCounter: "إجمالي الشحنات",
    mapLegendPickup: "نقطة الاستلام",
    mapLegendDelivery: "نقطة التسليم",
    saveSettingsBtn: "تطبيق المعايير",
    settingsSaved: "تم تطبيق معايير الترحيل بنجاح!",
    assignBtn: "تعيين للطلب",
    kpiAvailable: "الشحنات المتاحة",
    kpiActive: "المهام النشطة",
    kpiCompleted: "المكتملة",
    contentsLabel: "المحتويات",
    selectJobTip: "اضغط على أي بطاقة شحن لعرض مسارها على خريطة الرادار."
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

interface Courier {
  id: string;
  name: string;
  avatar: string;
  rating: number;
  status: "online" | "busy" | "offline";
  vehicle: string;
}

export default function CourierDeliveriesPage() {
  const [locale, setLocale] = useState<"en" | "ar">("ar");
  const [activeTab, setActiveTab] = useState<"available" | "active" | "completed">("available");
  const [jobs, setJobs] = useState<DeliveryJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [carrierId, setCarrierId] = useState("");

  // Redesign state additions
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedCouriers, setSelectedCouriers] = useState<{ [jobId: string]: string }>({});
  
  // Dispatch parameters state
  const [dispatchRadius, setDispatchRadius] = useState<number>(15);
  const [surgeMultiplier, setSurgeMultiplier] = useState<number>(1.2);
  const [autoDispatch, setAutoDispatch] = useState<boolean>(true);
  const [showParamsSaved, setShowParamsSaved] = useState<boolean>(false);

  // Mock Couriers fleet
  const [couriers] = useState<Courier[]>([
    { id: "c-1", name: "Ahmad Al-Harbi", avatar: "AH", rating: 4.9, status: "online", vehicle: "Mercedes Sprinter" },
    { id: "c-2", name: "Sarah Salem", avatar: "SS", rating: 4.8, status: "busy", vehicle: "Ducati Scrambler" },
    { id: "c-3", name: "Yousef Khalid", avatar: "YK", rating: 4.7, status: "offline", vehicle: "Tesla Model Y" }
  ]);

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

  const updateJobStatus = async (jobId: string, nextStatus: "accepted" | "in_transit" | "delivered", overrideCarrierId?: string) => {
    try {
      setError("");
      setSuccess("");

      const targetCarrierId = overrideCarrierId || carrierId;

      if (!jobId.startsWith("dj-mock-")) {
        const payload: any = { status: nextStatus };
        if (nextStatus === "accepted") {
          payload.carrier_id = targetCarrierId;
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
            carrier_id: nextStatus === "accepted" ? targetCarrierId : j.carrier_id
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

  const handleSaveParameters = (e: React.FormEvent) => {
    e.preventDefault();
    setShowParamsSaved(true);
    setTimeout(() => setShowParamsSaved(false), 3000);
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

  // Automatically select the first filtered job for map display highlight
  useEffect(() => {
    if (filteredJobs.length > 0) {
      const exists = filteredJobs.some(j => j.id === selectedJobId);
      if (!exists) {
        setSelectedJobId(filteredJobs[0].id);
      }
    } else {
      setSelectedJobId(null);
    }
  }, [activeTab, jobs]);

  // Map latitude/longitude to clean SVG viewbox coordinates (500x280)
  const getCoords = (job: DeliveryJob) => {
    // bounding box around Riyadh metropolitan coordinates
    const minLat = 24.65;
    const maxLat = 24.85;
    const minLng = 46.58;
    const maxLng = 46.72;
    
    const mapY = (lat: number) => {
      return 240 - ((lat - minLat) / (maxLat - minLat)) * 200;
    };
    
    const mapX = (lng: number) => {
      return 40 + ((lng - minLng) / (maxLng - minLng)) * 420;
    };
    
    return {
      pickup: { x: mapX(job.pickup_longitude || 46.6111), y: mapY(job.pickup_latitude || 24.7963) },
      delivery: { x: mapX(job.delivery_longitude || 46.6231), y: mapY(job.delivery_latitude || 24.6932) }
    };
  };

  const isRTL = locale === "ar";

  return (
    <div 
      className={`space-y-8 font-sans bg-transparent text-[#344054] p-4 md:p-8 relative overflow-hidden`}
      dir={isRTL ? "rtl" : "ltr"}
    >
      {/* Background Glow Accents */}
      <div className="absolute top-[-15%] left-[-10%] w-[45%] h-[45%] bg-[#D1AF47]/5 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] bg-blue-500/5 rounded-full blur-[140px] pointer-events-none" />

      {/* Top Header Section */}
      <div className="flex justify-between items-center flex-wrap gap-4 pb-6 border-b border-[#ECECEC]">
        <div className={isRTL ? "text-right" : "text-left"}>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-[#101828] font-serif flex items-center gap-2">
            <span className="w-1.5 h-6 bg-[#D1AF47] rounded-full inline-block" />
            {t.title}
          </h2>
          <p className="text-xs md:text-sm text-[#667085] mt-2 max-w-xl leading-relaxed">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] uppercase font-extrabold text-[#D1AF47] bg-[#D1AF47]/10 px-3.5 py-1.5 border border-[#D1AF47]/20 rounded-full shadow-[0_0_15px_rgba(209,175,71,0.08)]">
            {t.driverLicense}
          </span>
          <button
            onClick={loadJobs}
            className="px-4 py-2 bg-white border border-[#ECECEC] hover:bg-[#D1AF47] hover:text-[#070B12] text-[#101828] font-bold text-xs rounded-xl transition-all duration-300 shadow-sm border border-[#ECECEC] hover:border-[#D1AF47]/30 hover:scale-[1.03] active:scale-[0.98]"
          >
            {t.refreshBtn}
          </button>
        </div>
      </div>

      {/* Alerts */}
      {success && (
        <div className={`bg-[#3DDC84]/10 border border-[#3DDC84]/20 text-[#22C55E] text-xs rounded-xl p-4 font-semibold shadow-[0_0_15px_rgba(61,220,132,0.05)] ${isRTL ? "text-right" : "text-left"}`}>
          ✓ {success}
        </div>
      )}

      {error && (
        <div className={`bg-[#FF5D73]/10 border border-[#FF5D73]/20 text-[#EF4444] text-xs rounded-xl p-4 font-semibold shadow-[0_0_15px_rgba(255,93,115,0.05)] ${isRTL ? "text-right" : "text-left"}`}>
          ⚠ {error}
        </div>
      )}

      {/* KPI Dashboard Indicators */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {/* KPI 1 */}
        <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgba(0,0,0,0.015)] rounded-[20px] p-5 relative overflow-hidden group hover:border-[#D1AF47]/30 transition duration-300">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-[#D1AF47]/10 to-transparent rounded-bl-full pointer-events-none transition-all duration-300 group-hover:scale-110" />
          <p className="text-xs font-semibold text-[#667085] uppercase tracking-wider">{t.kpiAvailable}</p>
          <h3 className="text-2xl md:text-3xl font-extrabold text-[#101828] mt-2 font-serif tracking-tight">
            {jobs.filter(j => j.status === "pending" && !j.carrier_id).length}
          </h3>
          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-[#D1AF47]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#D1AF47] animate-pulse" />
            <span>{isRTL ? "متاحة للتوزيع" : "Ready to dispatch"}</span>
          </div>
        </div>

        {/* KPI 2 */}
        <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgba(0,0,0,0.015)] rounded-[20px] p-5 relative overflow-hidden group hover:border-blue-500/30 transition duration-300">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-blue-500/10 to-transparent rounded-bl-full pointer-events-none transition-all duration-300 group-hover:scale-110" />
          <p className="text-xs font-semibold text-[#667085] uppercase tracking-wider">{t.kpiActive}</p>
          <h3 className="text-2xl md:text-3xl font-extrabold text-[#101828] mt-2 font-serif tracking-tight">
            {jobs.filter(j => j.carrier_id === carrierId && (j.status === "accepted" || j.status === "in_transit")).length}
          </h3>
          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-blue-400">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-450 animate-pulse" />
            <span>{isRTL ? "مهامك النشطة" : "Active runs"}</span>
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgba(0,0,0,0.015)] rounded-[20px] p-5 relative overflow-hidden group hover:border-[#3DDC84]/30 transition duration-300">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-[#3DDC84]/10 to-transparent rounded-bl-full pointer-events-none transition-all duration-300 group-hover:scale-110" />
          <p className="text-xs font-semibold text-[#667085] uppercase tracking-wider">{t.kpiCompleted}</p>
          <h3 className="text-2xl md:text-3xl font-extrabold text-[#101828] mt-2 font-serif tracking-tight">
            {jobs.filter(j => j.carrier_id === carrierId && j.status === "delivered").length}
          </h3>
          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-[#22C55E]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3DDC84]" />
            <span>{isRTL ? "مكتملة ومسلمة" : "Delivered"}</span>
          </div>
        </div>

        {/* KPI 4 */}
        <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgba(0,0,0,0.015)] rounded-[20px] p-5 relative overflow-hidden group hover:border-purple-550/30 transition duration-300">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-purple-500/10 to-transparent rounded-bl-full pointer-events-none transition-all duration-300 group-hover:scale-110" />
          <p className="text-xs font-semibold text-[#667085] uppercase tracking-wider">{t.activeCouriers}</p>
          <h3 className="text-2xl md:text-3xl font-extrabold text-[#101828] mt-2 font-serif tracking-tight">
            {couriers.filter(c => c.status !== "offline").length} <span className="text-sm text-[#667085] font-sans">/ {couriers.length}</span>
          </h3>
          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-purple-400">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
            <span>{isRTL ? "سائقين متاحين" : "Active on duty"}</span>
          </div>
        </div>
      </div>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Live Map & Delivery List */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Active Logistics Dispatch Map */}
          <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgba(0,0,0,0.015)] rounded-[24px] p-6 relative overflow-hidden shadow-xl">
            <div className={`flex justify-between items-center mb-4 flex-wrap gap-2 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <div>
                <h3 className="text-sm md:text-base font-extrabold text-[#101828] tracking-wide">{t.mapTitle}</h3>
                <p className="text-[11px] text-[#667085]">{t.mapSubtitle}</p>
              </div>
              <div className={`flex items-center gap-4 text-[10px] text-[#344054] ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#D1AF47]" />
                  <span>{t.mapLegendPickup}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#3DDC84]" />
                  <span>{t.mapLegendDelivery}</span>
                </div>
              </div>
            </div>

            {/* Radar map panel */}
            <div className="w-full h-[300px] bg-transparent rounded-2xl relative border border-[#ECECEC] overflow-hidden shadow-inner flex items-center justify-center">
              {/* Pulse scan sweep circle */}
              <div className="absolute w-[360px] h-[360px] border border-[#D1AF47]/5 rounded-full animate-[spin_18s_linear_infinite] pointer-events-none" />
              <div className="absolute w-[200px] h-[200px] border border-[#D1AF47]/5 rounded-full animate-[spin_10s_linear_infinite] pointer-events-none" />
              
              <svg viewBox="0 0 500 280" className="w-full h-full relative z-10 select-none">
                {/* Techy background grid */}
                <defs>
                  <pattern id="radar-grid" width="25" height="25" patternUnits="userSpaceOnUse">
                    <path d="M 25 0 L 0 0 0 25" fill="none" stroke="rgba(255, 255, 255, 0.02)" strokeWidth="0.5" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#radar-grid)" />

                {/* Cyber network arterial roads */}
                <path d="M 0 60 L 500 60 M 0 160 L 500 160 M 0 230 L 500 230 M 110 0 L 110 280 M 240 0 L 240 280 M 390 0 L 390 280" stroke="rgba(255, 255, 255, 0.015)" strokeWidth="1" />
                <path d="M 30 0 L 470 280 M 470 0 L 30 280" stroke="rgba(255, 255, 255, 0.01)" strokeWidth="0.5" strokeDasharray="4 4" />

                {filteredJobs.length === 0 && (
                  <>
                    <circle cx="160" cy="110" r="3" fill="#D1AF47" opacity="0.3" />
                    <circle cx="340" cy="170" r="3" fill="#3DDC84" opacity="0.3" />
                    <path d="M 160 110 Q 250 140 340 170" fill="none" stroke="rgba(209, 175, 71, 0.08)" strokeWidth="1" strokeDasharray="3 3" />
                  </>
                )}

                {/* Dispatch paths */}
                {filteredJobs.map(job => {
                  const coords = getCoords(job);
                  const isSelected = selectedJobId === job.id;
                  
                  const cx = (coords.pickup.x + coords.delivery.x) / 2;
                  const cy = (coords.pickup.y + coords.delivery.y) / 2 - 45;
                  const pathD = `M ${coords.pickup.x} ${coords.pickup.y} Q ${cx} ${cy} ${coords.delivery.x} ${coords.delivery.y}`;
                  
                  return (
                    <g key={`map-route-${job.id}`} className="transition-all duration-300">
                      {/* Glow path shadow */}
                      <path
                        d={pathD}
                        fill="none"
                        stroke={isSelected ? "#D1AF47" : "rgba(255,255,255,0.03)"}
                        strokeWidth={isSelected ? 6 : 2}
                        strokeLinecap="round"
                        opacity={isSelected ? 0.18 : 0.05}
                      />
                      
                      {/* Real dynamic route path */}
                      <path
                        d={pathD}
                        fill="none"
                        stroke={isSelected ? "#D1AF47" : "rgba(255,255,255,0.08)"}
                        strokeWidth={isSelected ? 2.5 : 1}
                        strokeLinecap="round"
                        strokeDasharray={isSelected ? "none" : "5 5"}
                      />

                      {/* Path delivery pulse animation */}
                      {job.status === "in_transit" && (
                        <circle r="4.5" fill="#E0C46A" className="shadow-[0_0_12px_#D1AF47]">
                          <animateMotion dur="4s" repeatCount="indefinite" path={pathD} />
                        </circle>
                      )}

                      {/* Pickup terminal dot */}
                      <circle
                        cx={coords.pickup.x}
                        cy={coords.pickup.y}
                        r={isSelected ? 6.5 : 4.5}
                        fill="#070B12"
                        stroke="#D1AF47"
                        strokeWidth={isSelected ? 2.5 : 1.5}
                        className="cursor-pointer"
                        onClick={() => setSelectedJobId(job.id)}
                      />
                      {isSelected && (
                        <circle
                          cx={coords.pickup.x}
                          cy={coords.pickup.y}
                          r="12"
                          fill="none"
                          stroke="#D1AF47"
                          strokeWidth="1"
                          strokeOpacity="0.4"
                          className="animate-ping"
                          style={{ transformOrigin: `${coords.pickup.x}px ${coords.pickup.y}px` }}
                        />
                      )}

                      {/* Delivery destination dot */}
                      <circle
                        cx={coords.delivery.x}
                        cy={coords.delivery.y}
                        r={isSelected ? 6.5 : 4.5}
                        fill="#070B12"
                        stroke="#3DDC84"
                        strokeWidth={isSelected ? 2.5 : 1.5}
                        className="cursor-pointer"
                        onClick={() => setSelectedJobId(job.id)}
                      />
                      {isSelected && (
                        <circle
                          cx={coords.delivery.x}
                          cy={coords.delivery.y}
                          r="12"
                          fill="none"
                          stroke="#3DDC84"
                          strokeWidth="1"
                          strokeOpacity="0.4"
                          className="animate-ping"
                          style={{ transformOrigin: `${coords.delivery.x}px ${coords.delivery.y}px` }}
                        />
                      )}

                      {/* UI HUD Tags on Map */}
                      {isSelected && (
                        <g className="pointer-events-none select-none text-[8px] font-extrabold fill-white">
                          <rect x={coords.pickup.x - 16} y={coords.pickup.y - 20} width="32" height="12" rx="3.5" fill="#172033" stroke="#D1AF47" strokeWidth="0.5" />
                          <text x={coords.pickup.x} y={coords.pickup.y - 12} textAnchor="middle">PICKUP</text>

                          <rect x={coords.delivery.x - 16} y={coords.delivery.y - 20} width="32" height="12" rx="3.5" fill="#172033" stroke="#3DDC84" strokeWidth="0.5" />
                          <text x={coords.delivery.x} y={coords.delivery.y - 12} textAnchor="middle">DELIVER</text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </svg>

              {/* HUD Hint Tooltip */}
              <div className={`absolute bottom-3 left-3 right-3 bg-white/90 backdrop-blur-md px-3.5 py-2 rounded-xl border border-[#ECECEC] text-[9px] text-[#344054] flex items-center gap-2 z-20 ${isRTL ? "text-right flex-row-reverse" : "text-left flex-row"}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-[#D1AF47] animate-ping" />
                <span className="truncate">{t.selectJobTip}</span>
              </div>
            </div>
          </div>

          {/* Tabs Navigation */}
          <div className={`flex border-b border-[#ECECEC] gap-6 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
            <button
              onClick={() => {
                setActiveTab("available");
                setSelectedJobId(null);
              }}
              className={`pb-4 text-xs font-bold uppercase tracking-wider transition-all duration-300 border-b-2 ${
                activeTab === "available"
                  ? "border-[#D1AF47] text-[#101828] font-extrabold shadow-[0_4px_12px_-4px_rgba(209,175,71,0.5)]"
                  : "border-transparent text-[#667085] hover:text-[#101828]"
              }`}
            >
              {t.tabOpen}
            </button>
            <button
              onClick={() => {
                setActiveTab("active");
                setSelectedJobId(null);
              }}
              className={`pb-4 text-xs font-bold uppercase tracking-wider transition-all duration-300 border-b-2 ${
                activeTab === "active"
                  ? "border-[#D1AF47] text-[#101828] font-extrabold shadow-[0_4px_12px_-4px_rgba(209,175,71,0.5)]"
                  : "border-transparent text-[#667085] hover:text-[#101828]"
              }`}
            >
              {t.tabActive}
            </button>
            <button
              onClick={() => {
                setActiveTab("completed");
                setSelectedJobId(null);
              }}
              className={`pb-4 text-xs font-bold uppercase tracking-wider transition-all duration-300 border-b-2 ${
                activeTab === "completed"
                  ? "border-[#D1AF47] text-[#101828] font-extrabold shadow-[0_4px_12px_-4px_rgba(209,175,71,0.5)]"
                  : "border-transparent text-[#667085] hover:text-[#101828]"
              }`}
            >
              {t.tabCompleted}
            </button>
          </div>

          {/* Delivery Jobs List Grid */}
          {loading ? (
            <div className="text-center py-16 text-[#667085] text-xs font-semibold animate-pulse">
              {isRTL ? "جاري تحميل اللوحة اللوجستية..." : "Loading logistics board..."}
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgba(0,0,0,0.015)] rounded-[20px] py-16 text-center text-[#667085] text-xs font-medium">
              {t.noJobs}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5">
              {filteredJobs.map(job => {
                const isSelected = selectedJobId === job.id;
                
                return (
                  <div
                    key={job.id}
                    onClick={() => setSelectedJobId(job.id)}
                    className={`bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] border rounded-[20px] p-6 shadow-md transition-all duration-300 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-6 cursor-pointer relative ${
                      isSelected 
                        ? "border-[#D1AF47] bg-white border border-[#ECECEC]/85 shadow-[0_0_20px_rgba(209,175,71,0.08)]" 
                        : "border-[#ECECEC] hover:border-[#ECECEC] hover:bg-white border border-[#ECECEC]/45"
                    }`}
                  >
                    {/* Glow indicators inside selected cards */}
                    {isSelected && (
                      <div className="absolute top-0 bottom-0 left-0 w-1 bg-[#D1AF47]" />
                    )}

                    <div className={`space-y-4 flex-1 ${isRTL ? "text-right" : "text-left"}`}>
                      {/* Job Status Header */}
                      <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                        <span className="text-[10px] font-extrabold text-[#667085] uppercase tracking-wider">
                          ID: {job.id.substring(0, 8)}
                        </span>
                        
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border ${
                          job.status === "pending"
                            ? "bg-[#F5B041]/10 text-[#F5B041] border-[#F5B041]/20"
                            : job.status === "in_transit"
                            ? "bg-[#D1AF47]/10 text-[#D1AF47] border-[#D1AF47]/20"
                            : "bg-[#3DDC84]/10 text-[#22C55E] border-[#3DDC84]/20"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            job.status === "pending"
                              ? "bg-[#F5B041]"
                              : job.status === "in_transit"
                              ? "bg-[#D1AF47] animate-pulse"
                              : "bg-[#3DDC84]"
                          }`} />
                          {job.status === "pending"
                            ? t.statusPending
                            : job.status === "accepted"
                            ? t.statusAccepted
                            : job.status === "in_transit"
                            ? t.statusInTransit
                            : t.statusDelivered}
                        </span>
                      </div>

                      {/* Pickup and Delivery Addresses details */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div className="space-y-1">
                          <h5 className="text-[9px] uppercase font-bold text-[#667085] tracking-wider">{t.pickupAddr}</h5>
                          <p className="text-xs font-bold text-[#101828] leading-relaxed">{job.pickup_address}</p>
                        </div>
                        <div className="space-y-1">
                          <h5 className="text-[9px] uppercase font-bold text-[#667085] tracking-wider">{t.deliveryAddr}</h5>
                          <p className="text-xs font-bold text-[#101828] leading-relaxed">{job.delivery_address}</p>
                        </div>
                      </div>

                      {/* Trip Metadata info */}
                      <div className={`flex flex-wrap gap-x-6 gap-y-2 text-[10px] text-[#667085] font-semibold border-t border-[#ECECEC] pt-3.5 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                        {job.delivery_metadata?.distance && (
                          <span>
                            {t.distance}: <strong className="text-[#101828] font-extrabold">{job.delivery_metadata.distance}</strong>
                          </span>
                        )}
                        {job.delivery_metadata?.item && (
                          <span>
                            {t.contentsLabel}: <strong className="text-[#101828] font-extrabold">{job.delivery_metadata.item}</strong>
                          </span>
                        )}
                        <span>
                          {t.estTime}: <strong className="text-[#101828] font-extrabold">{new Date(job.estimated_delivery_time).toLocaleTimeString()}</strong>
                        </span>
                      </div>
                    </div>

                    {/* Actions and Dropdown Assigners */}
                    <div 
                      onClick={(e) => e.stopPropagation()} 
                      className={`flex flex-col items-stretch md:items-end justify-center w-full md:w-auto border-t md:border-0 border-[#ECECEC] pt-4 md:pt-0 ${isRTL ? "md:items-start" : "md:items-end"}`}
                    >
                      {job.status === "pending" && (
                        <div className="flex flex-col gap-2 w-full md:w-auto">
                          <label className="text-[9px] uppercase font-bold text-[#667085] tracking-wider">{t.assignCourier}</label>
                          <div className="flex items-center gap-2">
                            <select
                              value={selectedCouriers[job.id] || ""}
                              onChange={(e) => setSelectedCouriers({ ...selectedCouriers, [job.id]: e.target.value })}
                              className="bg-white border border-[#ECECEC] text-[#101828] border border-[#ECECEC] rounded-xl px-3 py-2 text-xs focus:border-[#D1AF47] focus:outline-none w-full md:w-44 transition duration-200"
                            >
                              <option value="">{t.assignSelectPlaceholder}</option>
                              <option value={carrierId}>{isRTL ? "تعيين لنفسي" : "Assign to self"}</option>
                              {couriers.map(c => (
                                <option key={c.id} value={c.id}>
                                  {c.name} ({c.rating} ★)
                                </option>
                              ))}
                            </select>
                            
                            <button
                              onClick={() => {
                                const targetCarrier = selectedCouriers[job.id] || carrierId;
                                updateJobStatus(job.id, "accepted", targetCarrier);
                              }}
                              className="px-4 py-2 bg-[#D1AF47] hover:bg-[#E0C46A] text-[#070B12] font-bold text-xs uppercase tracking-wider rounded-xl transition-all duration-300 shadow-[0_0_15px_rgba(209,175,71,0.15)] active:scale-95"
                            >
                              {t.assignBtn}
                            </button>
                          </div>
                        </div>
                      )}
                      
                      {job.status === "accepted" && (
                        <button
                          onClick={() => updateJobStatus(job.id, "in_transit")}
                          className="px-6 py-2.5 bg-[#D1AF47] hover:bg-[#E0C46A] text-[#070B12] font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all duration-300 shadow-[0_0_15px_rgba(209,175,71,0.2)] hover:scale-[1.03] active:scale-95 w-full md:w-auto"
                        >
                          {t.startTransitBtn}
                        </button>
                      )}
                      
                      {job.status === "in_transit" && (
                        <button
                          onClick={() => updateJobStatus(job.id, "delivered")}
                          className="px-6 py-2.5 bg-[#3DDC84] hover:bg-[#3DDC84]/80 text-[#070B12] font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all duration-300 shadow-[0_0_15px_rgba(61,220,132,0.2)] hover:scale-[1.03] active:scale-95 w-full md:w-auto"
                        >
                          {t.markDeliveredBtn}
                        </button>
                      )}
                      
                      {job.status === "delivered" && (
                        <span className="text-[10px] uppercase font-extrabold text-[#22C55E] bg-[#3DDC84]/10 px-3.5 py-1.5 border border-[#3DDC84]/20 rounded-lg">
                          ✓ {isRTL ? "مكتملة ومسلمة للعميل" : "Successfully Handed Over"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Fleet Status & Dispatch Parameters */}
        <div className="space-y-6">
          
          {/* Courier Fleet Status List */}
          <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgba(0,0,0,0.015)] rounded-[24px] p-6 shadow-xl relative overflow-hidden">
            <h3 className={`text-sm md:text-base font-extrabold text-[#101828] tracking-wide mb-4 ${isRTL ? "text-right" : "text-left"}`}>
              {t.courierListTitle}
            </h3>
            
            <div className="space-y-4">
              {couriers.map(courier => (
                <div 
                  key={courier.id}
                  className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgba(0,0,0,0.015)] rounded-2xl p-4 flex items-center justify-between hover:bg-white border border-[#ECECEC] transition duration-200"
                >
                  <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                    <div className="w-10 h-10 rounded-full bg-[#1A2236] border border-[#D1AF47]/30 flex items-center justify-center font-bold text-[#D1AF47] text-xs">
                      {courier.avatar}
                    </div>
                    <div className={isRTL ? "text-right" : "text-left"}>
                      <h4 className="text-xs font-bold text-[#101828]">{courier.name}</h4>
                      <p className="text-[9px] text-[#667085] mt-0.5">{courier.vehicle}</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                      courier.status === "online" 
                        ? "bg-[#3DDC84]/10 text-[#22C55E] border-[#3DDC84]/25" 
                        : courier.status === "busy" 
                        ? "bg-[#F5B041]/10 text-[#F5B041] border-[#F5B041]/25"
                        : "bg-white/5 text-[#667085] border-[#ECECEC]"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        courier.status === "online" 
                          ? "bg-[#3DDC84]" 
                          : courier.status === "busy" 
                          ? "bg-[#F5B041]" 
                          : "bg-[#7B859C]"
                      }`} />
                      {courier.status === "online" 
                        ? t.courierStatusOnline 
                        : courier.status === "busy" 
                        ? t.courierStatusBusy 
                        : t.courierStatusOffline}
                    </span>
                    <div className="text-[9px] text-[#D1AF47] font-bold flex items-center gap-1 mt-1 justify-end">
                      <span>★</span>
                      <span>{courier.rating.toFixed(1)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Dispatch Parameters Form */}
          <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgba(0,0,0,0.015)] rounded-[24px] p-6 shadow-xl relative overflow-hidden">
            <h3 className={`text-sm md:text-base font-extrabold text-[#101828] tracking-wide mb-4 ${isRTL ? "text-right" : "text-left"}`}>
              {t.dispatchSettings}
            </h3>

            <form onSubmit={handleSaveParameters} className="space-y-5">
              
              {/* Slider 1: Search Radius */}
              <div className="space-y-2">
                <div className={`flex justify-between text-xs font-bold ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                  <span className="text-[#344054]">{t.radiusLabel}</span>
                  <span className="text-[#D1AF47]">{dispatchRadius} {isRTL ? "كم" : "km"}</span>
                </div>
                <input 
                  type="range" 
                  min="5" 
                  max="50" 
                  value={dispatchRadius}
                  onChange={(e) => setDispatchRadius(Number(e.target.value))}
                  className="w-full h-1 bg-white border border-[#ECECEC] rounded-lg appearance-none cursor-pointer accent-[#D1AF47]"
                />
              </div>

              {/* Slider 2: Price Multiplier */}
              <div className="space-y-2">
                <div className={`flex justify-between text-xs font-bold ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                  <span className="text-[#344054]">{t.multiplierLabel}</span>
                  <span className="text-[#D1AF47]">{surgeMultiplier.toFixed(1)}x</span>
                </div>
                <input 
                  type="range" 
                  min="1" 
                  max="3" 
                  step="0.1"
                  value={surgeMultiplier}
                  onChange={(e) => setSurgeMultiplier(Number(e.target.value))}
                  className="w-full h-1 bg-white border border-[#ECECEC] rounded-lg appearance-none cursor-pointer accent-[#D1AF47]"
                />
              </div>

              {/* Toggle Switch: Auto-Dispatch Mode */}
              <div className={`flex items-center justify-between py-2 border-t border-b border-[#ECECEC] ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <span className="text-xs font-bold text-[#344054]">{t.autoAssign}</span>
                <button
                  type="button"
                  onClick={() => setAutoDispatch(!autoDispatch)}
                  className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    autoDispatch ? "bg-[#D1AF47]" : "bg-white border border-[#ECECEC]"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-transparent shadow ring-0 transition duration-200 ease-in-out ${
                      autoDispatch ? (isRTL ? "-translate-x-5" : "translate-x-5") : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Apply settings action button */}
              <button
                type="submit"
                className="w-full py-2.5 bg-white border border-[#ECECEC] hover:bg-[#D1AF47] hover:text-[#070B12] text-[#101828] font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all duration-300 border border-[#ECECEC] hover:border-[#D1AF47]/30 active:scale-[0.98]"
              >
                {t.saveSettingsBtn}
              </button>

              {/* Saved Success HUD feedback */}
              {showParamsSaved && (
                <div className="text-[10px] text-[#22C55E] font-bold text-center mt-2 animate-pulse">
                  ✓ {t.settingsSaved}
                </div>
              )}

            </form>
          </div>

        </div>

      </div>

      {/* Offline Simulator Notice Footer */}
      <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgba(0,0,0,0.015)] rounded-2xl p-4 text-[10px] text-[#667085] text-center leading-relaxed font-medium">
        🛡 {t.mockNotice}
      </div>

    </div>
  );
}
