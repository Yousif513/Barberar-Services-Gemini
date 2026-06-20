"use client";

import React, { useCallback, useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const translations = {
  en: {
    calendarTitle: "Riyadh Calendar & Scheduling Engine",
    subtitle: "Real-time dispatch, prayer time buffers, and roster overrides control panel",
    today: "Today",
    weekView: "Week View",
    dayView: "Day View",
    stylistFilter: "All Stylists",
    blockedBuffer: "Prayer Time Buffer (Locked)",
    fajr: "Fajr Buffer",
    dhuhr: "Dhuhr Buffer",
    asr: "Asr Buffer",
    maghrib: "Maghrib Buffer",
    isha: "Isha Buffer",
    customer: "Customer",
    stylist: "Stylist",
    service: "Service",
    time: "Time",
    price: "Price",
    addAppointment: "+ Book Walk-in",
    duration: "Duration",
    prayerControlPanel: "Prayer Lock Parameters",
    bufferDurationLabel: "Buffer Duration (minutes)",
    dispatchControlPanel: "Geofenced Dispatch Radius",
    radiusLabel: "Travel Boundary Radius",
    delayBufferLabel: "Traffic Buffer Delay",
    blockSlot: "Block Slot",
    unblockSlot: "Unlock/Override Buffer",
    unlockedOverride: "Unlocked Buffer (Manual Override)",
    blockoutReason: "Roster Blockout",
    save: "Save",
    cancel: "Cancel",
    clientName: "Client Name",
    assignedStylist: "Assigned Stylist",
    priceLabel: "Price (SAR)",
    detailsTitle: "Appointment Details",
    cancelBooking: "Cancel Appointment",
    reassign: "Reassign Stylist",
    notes: "Roster Notes",
    notesPlaceholder: "e.g., in-salon workstation 2",
    blockedTag: "BLOCKED",
    workingHoursPanel: "Roster Working Hours"
  },
  ar: {
    calendarTitle: "محرك جدولة ومواعيد الرياض",
    subtitle: "لوحة التحكم الفوري للخدمات، فترات الصلاة، ومناوبات الموظفين",
    today: "اليوم",
    weekView: "عرض الأسبوع",
    dayView: "عرض اليوم",
    stylistFilter: "جميع المصففين",
    blockedBuffer: "فترة الصلاة (مغلق تلقائياً)",
    fajr: "صلاة الفجر",
    dhuhr: "صلاة الظهر",
    asr: "صلاة العصر",
    maghrib: "صلاة المغرب",
    isha: "صلاة العشاء",
    customer: "العميل",
    stylist: "المصفف",
    service: "الخدمة",
    time: "الوقت",
    price: "السعر",
    addAppointment: "+ حجز عميل حضور",
    duration: "المدة",
    prayerControlPanel: "معايير أقفال الصلاة",
    bufferDurationLabel: "مدة فترة الانتظار (بالدقائق)",
    dispatchControlPanel: "نطاق الخدمات الجغرافية بالرياض",
    radiusLabel: "نصف قطر التغطية الجغرافية",
    delayBufferLabel: "حساب فترات الازدحام المروري",
    blockSlot: "حجز/إغلاق الفترة",
    unblockSlot: "إلغاء قفل فترة الصلاة",
    unlockedOverride: "تم فتح القفل (تجاوز يدوي)",
    blockoutReason: "فترة مغلقة للموظف",
    save: "حفظ التعديلات",
    cancel: "إلغاء",
    clientName: "اسم العميل",
    assignedStylist: "الأخصائي المعين",
    priceLabel: "السعر (ريال)",
    detailsTitle: "تفاصيل الموعد",
    cancelBooking: "إلغاء الموعد بالكامل",
    reassign: "إعادة تعيين الأخصائي",
    notes: "ملاحظات الدوام",
    notesPlaceholder: "مثال: كرسي العمل رقم ٢ بالصالون",
    blockedTag: "مغلق مؤقتاً",
    workingHoursPanel: "ساعات عمل الموظفين أسبوعياً"
  }
};

interface Appointment {
  id: string;
  customer: string;
  service: string;
  time: string;
  slotIndex: number;
  staff: string;
  price: string;
  duration: string;
  notes?: string;
}

interface Blockout {
  slotIndex: number;
  reason: string;
}

export default function ProviderCalendarPage() {
  const [lang, setLang] = useState<"en" | "ar">("ar");

  useEffect(() => {
    const checkLang = () => {
      const currentLang = document.documentElement.lang as "en" | "ar";
      if (currentLang && currentLang !== lang) {
        setLang(currentLang);
      }
    };
    checkLang();
    const observer = new MutationObserver(checkLang);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, [lang]);

  const t = translations[lang];

  // --- 1. DB & CORE SCHEDULER STATES ---
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [providerId, setProviderId] = useState("");
  const [branches, setBranches] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [blockouts, setBlockouts] = useState<Blockout[]>([
    { slotIndex: 1, reason: "Stylist Break & Sanitation" }
  ]);

  // Weekly availability shifts (0 to 6)
  const [availabilityShifts, setAvailabilityShifts] = useState<Array<{
    day_of_week: number;
    start_time: string;
    end_time: string;
    is_working_day: boolean;
  }>>([]);
  const [selectedDayToEdit, setSelectedDayToEdit] = useState<number>(new Date().getDay());

  // --- 2. CONTROL PANEL STATES ---
  const [draggedOverSlot, setDraggedOverSlot] = useState<number | null>(null);

  // Prayer buffers active state
  const [fajrActive, setFajrActive] = useState(true);
  const [dhuhrActive, setDhuhrActive] = useState(true);
  const [asrActive, setAsrActive] = useState(true);
  const [maghribActive, setMaghribActive] = useState(true);
  const [ishaActive, setIshaActive] = useState(true);
  const [bufferDuration, setBufferDuration] = useState(20); // default 20 mins

  // Unlocked / overridden slots trackers
  const [overriddenSlots, setOverriddenSlots] = useState<number[]>([]);

  // Dispatch / Geofencing controls
  const [travelRadius, setTravelRadius] = useState(15); // in km
  const [trafficDelay, setTrafficDelay] = useState(25); // in mins

  // Roster shift range (shown for editing the selected day)
  const [shiftStart, setShiftStart] = useState("08:00 AM");
  const [shiftEnd, setShiftEnd] = useState("09:00 PM");

  // --- 3. MODALS STATES ---
  const [showBookModal, setShowBookModal] = useState(false);
  const [targetSlotIndex, setTargetSlotIndex] = useState<number | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState<Appointment | null>(null);

  // Form states for booking
  const [bookCustomer, setBookCustomer] = useState("");
  const [bookService, setBookService] = useState("");
  const [bookStaff, setBookStaff] = useState("");
  const [bookPrice, setBookPrice] = useState("150");
  const [bookDuration, setBookDuration] = useState("45 mins");
  const [bookNotes, setBookNotes] = useState("");

  // Time Slots (08:00 AM to 09:00 PM)
  const timeSlots = [
    { label: "08:00 AM", isPrayer: false, prayerKey: "fajr" },
    { label: "09:00 AM", isPrayer: false },
    { label: "10:00 AM", isPrayer: false },
    { label: "11:00 AM", isPrayer: false },
    { label: "12:00 PM", isPrayer: true, prayerName: t.dhuhr, prayerKey: "dhuhr" },
    { label: "01:00 PM", isPrayer: false },
    { label: "02:00 PM", isPrayer: false },
    { label: "03:30 PM", isPrayer: true, prayerName: t.asr, prayerKey: "asr" },
    { label: "04:00 PM", isPrayer: false },
    { label: "05:00 PM", isPrayer: false },
    { label: "06:00 PM", isPrayer: false },
    { label: "07:00 PM", isPrayer: true, prayerName: t.maghrib, prayerKey: "maghrib" },
    { label: "08:00 PM", isPrayer: false },
    { label: "08:30 PM", isPrayer: true, prayerName: t.isha, prayerKey: "isha" },
    { label: "09:00 PM", isPrayer: false }
  ];

  // Helper to convert time format from "08:00 AM" to "08:00:00"
  const timeTo24Hour = (time12: string): string => {
    if (!time12) return "08:00:00";
    const [time, modifier] = time12.split(" ");
    let [hoursStr, minutesStr] = time.split(":");
    let hours = parseInt(hoursStr, 10);
    const minutes = minutesStr ? minutesStr.slice(0, 2) : "00";
    if (hours === 12) {
      hours = 0;
    }
    if (modifier === "PM") {
      hours += 12;
    }
    return `${String(hours).padStart(2, "0")}:${minutes}:00`;
  };

  // Helper to convert time format from "08:00:00" to "08:00 AM"
  const timeTo12Hour = (time24: string): string => {
    if (!time24) return "08:00 AM";
    const [hoursStr, minutesStr] = time24.split(":");
    let hours = parseInt(hoursStr, 10);
    const minutes = minutesStr ? minutesStr.slice(0, 2) : "00";
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    if (hours === 0) hours = 12;
    return `${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;
  };

  // Helper to determine if a slot is locked by a prayer buffer
  const isSlotPrayerLocked = (slot: typeof timeSlots[0], index: number) => {
    if (!slot.isPrayer) return false;
    if (overriddenSlots.includes(index)) return false;

    if (slot.prayerKey === "fajr") return fajrActive;
    if (slot.prayerKey === "dhuhr") return dhuhrActive;
    if (slot.prayerKey === "asr") return asrActive;
    if (slot.prayerKey === "maghrib") return maghribActive;
    if (slot.prayerKey === "isha") return ishaActive;

    return false;
  };

  // Convert time to slot index
  const getSlotIndexForTime = (date: Date): number => {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    let displayHour = hours % 12;
    if (displayHour === 0) displayHour = 12;
    const ampm = hours >= 12 ? "PM" : "AM";
    const formattedTime = `${String(displayHour).padStart(2, "0")}:${String(minutes).padStart(2, "0")} ${ampm}`;
    
    const idx = timeSlots.findIndex(slot => slot.label === formattedTime);
    if (idx !== -1) return idx;
    
    let closestIdx = 0;
    let minDiff = Infinity;
    const targetMinutes = hours * 60 + minutes;
    
    timeSlots.forEach((slot, index) => {
      const [timePart, ampmPart] = slot.label.split(" ");
      let [h, m] = timePart.split(":").map(Number);
      if (ampmPart === "PM" && h !== 12) h += 12;
      if (ampmPart === "AM" && h === 12) h = 0;
      const slotMinutes = h * 60 + m;
      
      const diff = Math.abs(targetMinutes - slotMinutes);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = index;
      }
    });
    
    return closestIdx;
  };

  // Fetch initial context data
  const loadCalendarData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) {
        console.warn("Auth session missing or error:", userError.message);
        return;
      }
      if (!user) return;
      
      // Get provider details
      const { data: providerInfo, error: providerError } = await supabase
        .from("providers")
        .select("id")
        .eq("owner_id", user.id)
        .maybeSingle();
      if (providerError) throw providerError;
      if (!providerInfo) {
        setError(lang === "ar" ? "لم يتم العثور على مزود خدمة نشط." : "No active provider profile found.");
        return;
      }
      setProviderId(providerInfo.id);
      
      // Get branches
      const { data: branchesData, error: branchesError } = await supabase
        .from("branches")
        .select("id, name_en, name_ar")
        .eq("provider_id", providerInfo.id);
      if (branchesError) throw branchesError;
      setBranches(branchesData || []);
      
      // Get services
      const { data: servicesData, error: servicesError } = await supabase
        .from("services")
        .select("id, name_en, name_ar, base_price, base_duration_minutes")
        .eq("provider_id", providerInfo.id)
        .eq("is_active", true);
      if (servicesError) throw servicesError;
      setServices(servicesData || []);
      
      // Get customers
      const { data: customersData } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, phone_number")
        .eq("role", "customer")
        .limit(100);
      setCustomers(customersData || []);
      if (customersData && customersData.length > 0) {
        setSelectedCustomerId(customersData[0].id);
        setBookCustomer(`${customersData[0].first_name || ""} ${customersData[0].last_name || ""}`.trim() || customersData[0].phone_number);
      }
      
      const branchIds = (branchesData || []).map(b => b.id);
      if (branchIds.length === 0) return;
      
      // Get employees
      const { data: staffData, error: staffError } = await supabase
        .from("employees")
        .select("id, name_en, name_ar, title_en, title_ar, is_active")
        .in("branch_id", branchIds)
        .eq("is_active", true);
      if (staffError) throw staffError;
      setEmployees(staffData || []);
      
      if (staffData && staffData.length > 0) {
        setSelectedEmployeeId(prev => prev || staffData[0].id);
        setBookStaff(staffData[0].id);
      }
    } catch (err: any) {
      console.error("Error loading calendar context:", err);
      setError(lang === "ar" ? "فشل تحميل بيانات الجدولة" : "Failed to load calendar scheduling context.");
    } finally {
      setLoading(false);
    }
  }, [lang]);

  // Fetch shifts & bookings for the selected employee
  const loadEmployeeSchedule = useCallback(async () => {
    if (!selectedEmployeeId) return;
    try {
      setError("");
      
      // 1. Fetch weekly availability shifts
      const { data: shiftsData, error: shiftsError } = await supabase
        .from("employee_availability")
        .select("day_of_week, start_time, end_time, is_working_day")
        .eq("employee_id", selectedEmployeeId);
      
      if (shiftsError) throw shiftsError;
      
      const fullWeekShifts = Array.from({ length: 7 }, (_, index) => {
        const existing = (shiftsData || []).find(s => s.day_of_week === index);
        return existing || {
          day_of_week: index,
          start_time: "08:00:00",
          end_time: "21:00:00",
          is_working_day: true
        };
      });
      setAvailabilityShifts(fullWeekShifts);
      
      const currentDayShift = fullWeekShifts.find(s => s.day_of_week === selectedDayToEdit);
      if (currentDayShift) {
        setShiftStart(timeTo12Hour(currentDayShift.start_time));
        setShiftEnd(timeTo12Hour(currentDayShift.end_time));
      }
      
      // 2. Fetch bookings
      const startOfDay = new Date(selectedDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);
      
      const { data: bookingsData, error: bookingsError } = await supabase
        .from("bookings")
        .select(`
          id,
          scheduled_at,
          duration_minutes,
          total_price,
          status,
          services ( name_en, name_ar ),
          profiles ( first_name, last_name, phone_number )
        `)
        .eq("employee_id", selectedEmployeeId)
        .neq("status", "cancelled")
        .gte("scheduled_at", startOfDay.toISOString())
        .lte("scheduled_at", endOfDay.toISOString())
        .order("scheduled_at", { ascending: true });
        
      if (bookingsError) throw bookingsError;
      
      const mapped: Appointment[] = (bookingsData || []).map((bk: any) => {
        const scheduledTime = new Date(bk.scheduled_at);
        const serviceName = lang === "ar" ? bk.services?.name_ar || bk.services?.name_en : bk.services?.name_en || bk.services?.name_ar;
        const customerName = bk.profiles 
          ? `${bk.profiles.first_name || ""} ${bk.profiles.last_name || ""}`.trim() || bk.profiles.phone_number
          : "Walk-in Customer";
        
        const startStr = scheduledTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const endTimeVal = new Date(scheduledTime.getTime() + (bk.duration_minutes || 60) * 60 * 1000);
        const endStr = endTimeVal.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        return {
          id: bk.id,
          customer: customerName,
          service: serviceName || "Styling Service",
          time: `${startStr} - ${endStr}`,
          slotIndex: getSlotIndexForTime(scheduledTime),
          staff: employees.find(e => e.id === selectedEmployeeId)?.name_en || "Stylist",
          price: String(bk.total_price || 0),
          duration: `${bk.duration_minutes || 60} mins`,
          notes: ""
        };
      });
      
      setAppointments(mapped);
    } catch (err: any) {
      console.error("Error loading employee shifts/bookings:", err);
      setError(lang === "ar" ? "فشل تحميل جدول مناوبات الموظف" : "Failed to load employee schedule and shifts.");
    }
  }, [selectedEmployeeId, selectedDate, selectedDayToEdit, employees, lang]);

  useEffect(() => {
    void loadCalendarData();
  }, [loadCalendarData]);

  useEffect(() => {
    if (selectedEmployeeId) {
      void loadEmployeeSchedule();
    }
  }, [selectedEmployeeId, selectedDate, selectedDayToEdit, loadEmployeeSchedule]);

  useEffect(() => {
    if (services.length > 0) {
      setBookService(services[0].id);
      setBookPrice(String(services[0].base_price || 0));
      setBookDuration(`${services[0].base_duration_minutes || 60} mins`);
    }
  }, [services]);

  // Handle Walk-in Booking Submission
  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmployeeId = bookStaff || selectedEmployeeId;
    if (targetSlotIndex === null || !targetEmployeeId) return;

    try {
      setLoading(true);
      setError("");
      setSuccess("");

      const selectedService = services.find(s => s.id === bookService);
      const basePrice = selectedService ? selectedService.base_price : 100;
      const baseDuration = selectedService ? selectedService.base_duration_minutes : 60;

      const slotLabel = timeSlots[targetSlotIndex].label;
      const [timePart, ampm] = slotLabel.split(" ");
      let [hoursStr, minutesStr] = timePart.split(":");
      let hours = parseInt(hoursStr, 10);
      const minutes = parseInt(minutesStr, 10) || 0;
      if (ampm === "PM" && hours !== 12) hours += 12;
      if (ampm === "AM" && hours === 12) hours = 0;

      const bookingTime = new Date(selectedDate);
      bookingTime.setHours(hours, minutes, 0, 0);

      let customerIdVal = selectedCustomerId;
      if (!customerIdVal) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) customerIdVal = user.id;
      }

      const employeeObj = employees.find(e => e.id === targetEmployeeId);
      const { data: empData } = await supabase
        .from("employees")
        .select("branch_id")
        .eq("id", selectedEmployeeId)
        .maybeSingle();

      const branchIdVal = empData?.branch_id || (branches.length > 0 ? branches[0].id : null);
      if (!branchIdVal) {
        throw new Error("No branch associated with employee.");
      }

      const payload = {
        customer_id: customerIdVal,
        branch_id: branchIdVal,
        employee_id: selectedEmployeeId,
        service_id: bookService,
        status: "confirmed",
        is_home_service: false,
        scheduled_at: bookingTime.toISOString(),
        duration_minutes: baseDuration,
        total_price: Number(bookPrice || basePrice),
        deposit_required: 0,
        tax_amount: Number((Number(bookPrice || basePrice) * 0.15).toFixed(2)),
        platform_commission: Number((Number(bookPrice || basePrice) * 0.15).toFixed(2))
      };

      const { error: insertError } = await supabase
        .from("bookings")
        .insert(payload);

      if (insertError) throw insertError;

      setSuccess(lang === "ar" ? "تم تسجيل الحجز بنجاح" : "Walk-in booking created successfully.");
      setShowBookModal(false);
      setBookCustomer("");
      setBookNotes("");
      setTargetSlotIndex(null);
      await loadEmployeeSchedule();
    } catch (err: any) {
      console.error("Error creating walk-in booking:", err);
      setError(lang === "ar" ? "فشل إنشاء الحجز" : `Failed to create walk-in: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Cancel Appointment
  const handleCancelBooking = async (id: string) => {
    try {
      setLoading(true);
      setError("");
      setSuccess("");

      const { error: cancelError } = await supabase
        .from("bookings")
        .update({ status: "cancelled" })
        .eq("id", id);

      if (cancelError) throw cancelError;

      setSuccess(lang === "ar" ? "تم إلغاء الموعد" : "Appointment cancelled successfully.");
      setShowDetailsModal(null);
      await loadEmployeeSchedule();
    } catch (err: any) {
      console.error("Error cancelling booking:", err);
      setError(lang === "ar" ? "فشل إلغاء الموعد" : "Failed to cancel appointment.");
    } finally {
      setLoading(false);
    }
  };

  // Save employee working shifts Roster
  const handleSaveShift = async () => {
    if (!selectedEmployeeId) return;
    try {
      setLoading(true);
      setSuccess("");
      setError("");

      const shiftConfig = availabilityShifts.find(s => s.day_of_week === selectedDayToEdit);
      const payload = {
        employee_id: selectedEmployeeId,
        day_of_week: selectedDayToEdit,
        start_time: timeTo24Hour(shiftStart),
        end_time: timeTo24Hour(shiftEnd),
        is_working_day: shiftConfig ? shiftConfig.is_working_day : true
      };

      const { error: saveError } = await supabase
        .from("employee_availability")
        .upsert(payload, { onConflict: "employee_id,day_of_week" });

      if (saveError) throw saveError;

      setSuccess(lang === "ar" ? "تم حفظ ساعات العمل بنجاح" : "Working hours updated successfully.");
      await loadEmployeeSchedule();
    } catch (err: any) {
      console.error("Error saving shift:", err);
      setError(lang === "ar" ? "فشل حفظ ساعات العمل" : "Failed to save working hours.");
    } finally {
      setLoading(false);
    }
  };

  // Toggle Override
  const toggleBufferOverride = (index: number) => {
    if (overriddenSlots.includes(index)) {
      setOverriddenSlots(prev => prev.filter(i => i !== index));
    } else {
      setOverriddenSlots(prev => [...prev, index]);
    }
  };

  // Block a slot manually
  const handleBlockSlot = (index: number) => {
    const isAlreadyBlocked = blockouts.some(b => b.slotIndex === index);
    if (isAlreadyBlocked) {
      setBlockouts(prev => prev.filter(b => b.slotIndex !== index));
    } else {
      setBlockouts(prev => [...prev, { slotIndex: index, reason: "Blocked via Dashboard Control" }]);
    }
  };

  const isRTL = lang === "ar";
  const currentDayOfWeekVal = selectedDate.getDay();
  const currentDayShiftInfo = availabilityShifts.find(s => s.day_of_week === currentDayOfWeekVal);
  const isOffDutyToday = currentDayShiftInfo ? !currentDayShiftInfo.is_working_day : false;

  // Premium Toggle Switch component
  const ToggleSwitch = ({ checked, onChange }: { checked: boolean; onChange: (val: boolean) => void }) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
        checked ? "bg-gradient-to-r from-[#D1AF47] to-[#E0C46A]" : "bg-white/[0.06]"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${
          checked ? (isRTL ? "-translate-x-5" : "translate-x-5") : "translate-x-0"
        }`}
      />
    </button>
  );

  return (
    <div className="space-y-8 text-[#B8C0D4]">
      {/* ═══════════════ PAGE HEADER ═══════════════ */}
      <div className={`flex flex-col md:flex-row md:items-center md:justify-between gap-6 ${isRTL ? "md:flex-row-reverse text-right" : "text-left"}`}>
        <div>
          <h2 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-[#D1AF47] via-[#E0C46A] to-[#D1AF47] bg-clip-text text-transparent">
            {t.calendarTitle}
          </h2>
          <p className="text-xs text-[#7B859C] mt-1.5 tracking-wide">{t.subtitle}</p>
        </div>

        <div className={`flex flex-wrap gap-3 items-center ${isRTL ? "justify-end flex-row-reverse" : "justify-start"}`}>
          {/* Employee/Stylist Dropdown */}
          {employees.length > 0 && (
            <div className="relative">
              <select
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className="pl-4 pr-10 py-2.5 bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] text-xs font-bold rounded-2xl text-[#B8C0D4] outline-none focus:border-[#D1AF47]/40 focus:shadow-[0_0_12px_rgba(209,175,71,0.1)] transition-all duration-300 appearance-none cursor-pointer"
              >
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id} className="bg-[#111827] text-white">
                    {lang === "ar" ? emp.name_ar || emp.name_en : emp.name_en || emp.name_ar}
                  </option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-[#7B859C]">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          )}

          {/* Date Picker */}
          <input
            type="date"
            value={selectedDate.toISOString().split("T")[0]}
            onChange={(e) => setSelectedDate(new Date(e.target.value))}
            className="px-4 py-2.5 bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] text-xs font-bold rounded-2xl text-[#B8C0D4] outline-none focus:border-[#D1AF47]/40 transition-all duration-300 cursor-pointer"
          />

          <button 
            onClick={() => setSelectedDate(new Date())}
            className="px-5 py-2.5 bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] text-xs font-bold uppercase tracking-wider rounded-2xl text-[#B8C0D4] hover:border-[#D1AF47]/30 hover:text-white transition-all duration-300"
          >
            {t.today}
          </button>
          
          <button
            onClick={() => {
              setTargetSlotIndex(2); // default to 10:00 AM for quick walkin click
              setBookStaff(selectedEmployeeId);
              setShowBookModal(true);
            }}
            className="px-5 py-2.5 bg-gradient-to-r from-[#D1AF47] to-[#E0C46A] text-[#070B12] font-bold text-xs uppercase tracking-widest rounded-2xl hover:shadow-[0_0_25px_rgba(209,175,71,0.35)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
          >
            {t.addAppointment}
          </button>
        </div>
      </div>

      {/* ═══════════════ TWO COLUMN CONTROL GRID ═══════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

        {/* ─────── LEFT/MID: SCHEDULE PLANNER ─────── */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[#111827]/80 backdrop-blur-sm border border-white/[0.06] rounded-3xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
            {/* Planner Header */}
            <div className={`p-6 border-b border-white/[0.04] bg-white/[0.02] rounded-t-3xl flex items-center justify-between ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <h3 className="font-semibold text-sm text-white tracking-wide">
                {lang === "ar" ? "لوحة التخطيط الفوري للمواعيد" : "Real-time Roster Planner"}
              </h3>
              {/* Day/Week Glassmorphic Pill Switcher */}
              <div className="flex bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-xl p-1 gap-1">
                <button className="px-4 py-1.5 text-[10px] font-extrabold uppercase rounded-xl bg-gradient-to-r from-[#D1AF47] to-[#E0C46A] text-[#070B12] shadow-[0_0_12px_rgba(209,175,71,0.2)] transition-all duration-300">
                  {t.dayView}
                </button>
                <button className="px-4 py-1.5 text-[10px] font-extrabold uppercase rounded-xl text-[#7B859C] hover:text-white hover:bg-white/[0.04] transition-all duration-300">
                  {t.weekView}
                </button>
              </div>
            </div>

            {/* Off-duty banner */}
            {isOffDutyToday && (
              <div className="m-6 p-6 bg-[#FF5D73]/[0.04] border border-[#FF5D73]/10 rounded-2xl text-center text-[#FF5D73] space-y-3">
                <svg className="w-8 h-8 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-sm font-bold">
                    {lang === "ar" ? "الأخصائي في إجازة اليوم" : "Stylist is Off-Duty Today"}
                  </p>
                  <p className="text-xs text-[#FF5D73]/60 mt-1">
                    {lang === "ar" 
                      ? "تم وضع هذا اليوم كإجازة أسبوعية في مناوبات العمل." 
                      : "This day is configured as off-duty in their weekly working roster."}
                  </p>
                </div>
              </div>
            )}

            {/* Time Slot Rows */}
            <div className={`divide-y divide-white/[0.04] ${isOffDutyToday ? "opacity-40 pointer-events-none" : ""}`}>
              {timeSlots.map((slot, index) => {
                const isLocked = isSlotPrayerLocked(slot, index);
                const isOverridden = slot.isPrayer && overriddenSlots.includes(index);
                const appt = appointments.find(a => a.slotIndex === index);
                const blocked = blockouts.find(b => b.slotIndex === index);

                return (
                  <div key={index} className={`flex min-h-[80px] items-stretch ${isRTL ? "flex-row-reverse" : "flex-row"}`}>

                    {/* Time indicator column */}
                    <div className={`w-28 px-4 py-4 flex items-center justify-center text-[11px] font-semibold text-[#7B859C] bg-white/[0.02] select-none tracking-wide ${isRTL ? "border-l" : "border-r"} border-white/[0.04]`}>
                      {slot.label}
                    </div>

                    {/* Slot content area */}
                    <div
                      className={`flex-grow p-2.5 relative flex items-center transition-all duration-300 ${
                        draggedOverSlot === index ? "bg-[#D1AF47]/[0.06] border-2 border-dashed border-[#D1AF47]/40 rounded-2xl" : ""
                      }`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (!isLocked && !blocked && !appt) {
                          setDraggedOverSlot(index);
                        }
                      }}
                      onDragLeave={() => setDraggedOverSlot(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDraggedOverSlot(null);
                        const apptId = e.dataTransfer.getData("text/plain");
                        if (apptId && !isLocked && !blocked && !appt) {
                          setAppointments(prev => prev.map(a => {
                            if (a.id === apptId) {
                              const newLabel = timeSlots[index].label;
                              return {
                                ...a,
                                slotIndex: index,
                                time: `${newLabel} - ${lang === "ar" ? "تعديل موعد" : "Rescheduled"}`
                              };
                            }
                            return a;
                          }));
                        }
                      }}
                    >
                      {isLocked ? (
                        // 1. Prayer Lockout Buffer state
                        <div className={`w-full h-full bg-[#FF5D73]/[0.04] border border-[#FF5D73]/10 rounded-2xl flex items-center justify-between px-5 gap-3 text-[#FF5D73] shadow-[inset_0_0_20px_rgba(255,93,115,0.03)] ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                          <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse text-right" : "text-left"}`}>
                            <div className="w-9 h-9 rounded-xl bg-[#FF5D73]/[0.08] flex items-center justify-center flex-shrink-0">
                              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                              </svg>
                            </div>
                            <div>
                              <p className="text-xs font-bold">{slot.prayerName} - {t.blockedBuffer}</p>
                              <p className="text-[10px] text-[#FF5D73]/60">{bufferDuration} mins locked (Geofenced Lockout)</p>
                            </div>
                          </div>

                          <button
                            onClick={() => toggleBufferOverride(index)}
                            className="px-3 py-1.5 bg-[#FF5D73]/[0.08] hover:bg-[#FF5D73]/[0.15] border border-[#FF5D73]/15 rounded-xl text-[9px] font-bold uppercase tracking-wider text-[#FF5D73]/80 hover:text-[#FF5D73] transition-all duration-300"
                          >
                            {t.unblockSlot}
                          </button>
                        </div>
                      ) : isOverridden ? (
                        // 2. Overridden / Unlocked buffer state
                        <div className={`w-full h-full bg-[#3DDC84]/[0.04] border border-[#3DDC84]/10 rounded-2xl flex items-center justify-between px-5 gap-3 text-[#3DDC84] shadow-[inset_0_0_20px_rgba(61,220,132,0.03)] ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                          <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse text-right" : "text-left"}`}>
                            <div className="w-9 h-9 rounded-xl bg-[#3DDC84]/[0.08] flex items-center justify-center flex-shrink-0">
                              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                              </svg>
                            </div>
                            <div>
                              <p className="text-xs font-bold">{slot.prayerName} - {t.unlockedOverride}</p>
                              <p className="text-[10px] text-[#3DDC84]/60">Manual buffer bypass allowed</p>
                            </div>
                          </div>
                          <button
                            onClick={() => toggleBufferOverride(index)}
                            className="px-3 py-1.5 bg-[#3DDC84]/[0.08] hover:bg-[#3DDC84]/[0.15] border border-[#3DDC84]/15 rounded-xl text-[9px] font-bold uppercase tracking-wider text-[#3DDC84]/80 hover:text-[#3DDC84] transition-all duration-300"
                          >
                            Lock Buffer
                          </button>
                        </div>
                      ) : blocked ? (
                        // 3. Manual Blockout state
                        <div className={`w-full h-full bg-white/[0.02] border border-white/[0.06] rounded-2xl flex items-center justify-between px-5 gap-3 text-[#7B859C] ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                          <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse text-right" : "text-left"}`}>
                            <div className="w-9 h-9 rounded-xl bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                              </svg>
                            </div>
                            <div>
                              <p className="text-xs font-bold text-[#B8C0D4]">{blocked.reason}</p>
                              <p className="text-[10px] text-[#7B859C]">Locked out for appointments</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleBlockSlot(index)}
                            className="px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-xl text-[9px] font-bold uppercase tracking-wider text-[#B8C0D4] hover:text-white transition-all duration-300"
                          >
                            Unblock
                          </button>
                        </div>
                      ) : appt ? (
                        // 4. Booked Appointment state
                        <div
                          onClick={() => setShowDetailsModal(appt)}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", appt.id);
                          }}
                          className={`w-full bg-[#D1AF47]/[0.06] rounded-2xl p-4 flex flex-wrap gap-4 items-center justify-between group hover:bg-[#D1AF47]/[0.10] hover:shadow-[0_0_20px_rgba(209,175,71,0.12)] hover:scale-[1.01] transition-all duration-300 cursor-pointer active:scale-[0.98] ${isRTL ? "border-r-4" : "border-l-4"} border-[#D1AF47]`}
                        >
                          <div className={isRTL ? "text-right" : "text-left"}>
                            <div className={`flex items-center gap-2.5 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                              <h4 className="font-bold text-sm text-white group-hover:text-[#E0C46A] transition-colors duration-300">{appt.customer}</h4>
                              <span className="text-[10px] bg-white/[0.06] text-[#7B859C] px-2.5 py-0.5 rounded-full font-medium">{appt.duration}</span>
                            </div>
                            <p className="text-xs text-[#7B859C] mt-1.5">
                              {t.service}: <span className="text-[#B8C0D4] font-semibold">{appt.service}</span>
                            </p>
                          </div>

                          <div className={`flex items-center gap-6 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                            <div className={isRTL ? "text-left" : "text-right"}>
                              <p className="text-[10px] text-[#7B859C]">{t.stylist}</p>
                              <p className="text-xs font-bold text-[#D1AF47]">{appt.staff}</p>
                            </div>
                            <div className={isRTL ? "text-left" : "text-right"}>
                              <p className="text-[10px] text-[#7B859C]">{t.price}</p>
                              <p className="text-xs font-black text-white">{appt.price} SAR</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        // 5. Open empty slot state
                        <div className={`w-full h-full rounded-2xl border border-dashed border-white/[0.06] hover:border-[#D1AF47]/30 hover:bg-[#D1AF47]/[0.02] transition-all duration-300 cursor-pointer flex items-center justify-between px-6 text-[#7B859C] hover:text-[#D1AF47] group`}>
                          <span className="text-xs font-semibold opacity-0 group-hover:opacity-100 transition-all duration-300">
                            {lang === "ar" ? "جدولة حجز في هذا الوقت" : "Schedule Walk-in / Booking"}
                          </span>
                          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300">
                            <button
                              onClick={() => {
                                setTargetSlotIndex(index);
                                setBookStaff(selectedEmployeeId);
                                setShowBookModal(true);
                              }}
                              className="px-3 py-1.5 bg-white/[0.04] backdrop-blur-sm border border-white/[0.06] rounded-xl text-[9px] font-bold uppercase tracking-wider text-white hover:bg-[#D1AF47]/10 hover:border-[#D1AF47]/20 hover:text-[#D1AF47] transition-all duration-300"
                            >
                              {t.addAppointment}
                            </button>
                            <button
                              onClick={() => handleBlockSlot(index)}
                              className="px-3 py-1.5 bg-white/[0.02] backdrop-blur-sm border border-white/[0.06] rounded-xl text-[9px] font-bold uppercase tracking-wider text-[#7B859C] hover:bg-white/[0.04] hover:text-[#B8C0D4] transition-all duration-300"
                            >
                              {t.blockSlot}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ─────── RIGHT COLUMN: CONTROL PANELS ─────── */}
        <div className="space-y-6">

          {/* A. PRAYER LOCK BUFFER CONTROL */}
          <div className="bg-[#111827]/80 backdrop-blur-sm border border-white/[0.06] rounded-3xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.3)] space-y-5">
            <div className={`flex items-center gap-2.5 pb-4 border-b border-white/[0.04] ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <div className="w-8 h-8 rounded-xl bg-[#D1AF47]/10 flex items-center justify-center">
                <svg className="w-4 h-4 text-[#D1AF47]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="font-bold text-xs uppercase tracking-[0.15em] text-white">{t.prayerControlPanel}</h3>
            </div>

            {/* Buffer time length control */}
            <div className="space-y-2.5">
              <label className="text-[10px] text-[#7B859C] font-bold uppercase tracking-wider block">{t.bufferDurationLabel}</label>
              <div className="flex gap-2">
                {[15, 20, 30].map(mins => (
                  <button
                    key={mins}
                    onClick={() => setBufferDuration(mins)}
                    className={`flex-1 py-2 rounded-xl text-[10px] font-black tracking-wider transition-all duration-300 ${
                      bufferDuration === mins
                        ? "bg-gradient-to-r from-[#D1AF47] to-[#E0C46A] text-[#070B12] shadow-[0_0_15px_rgba(209,175,71,0.2)]"
                        : "bg-white/[0.04] hover:bg-white/[0.08] text-[#B8C0D4] backdrop-blur-sm"
                    }`}
                  >
                    {mins}m
                  </button>
                ))}
              </div>
            </div>

            {/* Individual prayer lock toggles */}
            <div className="space-y-3.5 pt-2">
              {/* Fajr */}
              <div className={`flex items-center justify-between text-xs ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <span className="font-semibold text-[#B8C0D4]">{t.fajr}</span>
                <ToggleSwitch checked={fajrActive} onChange={setFajrActive} />
              </div>

              {/* Dhuhr */}
              <div className={`flex items-center justify-between text-xs ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <span className="font-semibold text-[#B8C0D4]">{t.dhuhr}</span>
                <ToggleSwitch checked={dhuhrActive} onChange={setDhuhrActive} />
              </div>

              {/* Asr */}
              <div className={`flex items-center justify-between text-xs ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <span className="font-semibold text-[#B8C0D4]">{t.asr}</span>
                <ToggleSwitch checked={asrActive} onChange={setAsrActive} />
              </div>

              {/* Maghrib */}
              <div className={`flex items-center justify-between text-xs ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <span className="font-semibold text-[#B8C0D4]">{t.maghrib}</span>
                <ToggleSwitch checked={maghribActive} onChange={setMaghribActive} />
              </div>

              {/* Isha */}
              <div className={`flex items-center justify-between text-xs ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <span className="font-semibold text-[#B8C0D4]">{t.isha}</span>
                <ToggleSwitch checked={ishaActive} onChange={setIshaActive} />
              </div>
            </div>
          </div>

          {/* B. GEOFENCED LOGISTICS / DISPATCH RADIUS */}
          <div className="bg-[#111827]/80 backdrop-blur-sm border border-white/[0.06] rounded-3xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.3)] space-y-5">
            <div className={`flex items-center gap-2.5 pb-4 border-b border-white/[0.04] ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <div className="w-8 h-8 rounded-xl bg-[#D1AF47]/10 flex items-center justify-center">
                <svg className="w-4 h-4 text-[#D1AF47]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h3 className="font-bold text-xs uppercase tracking-[0.15em] text-white">{t.dispatchControlPanel}</h3>
            </div>

            {/* Travel boundary radius control */}
            <div className="space-y-3">
              <div className={`flex justify-between items-center text-[10px] font-bold uppercase tracking-wider ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <span className="text-[#7B859C]">{t.radiusLabel}</span>
                <span className="text-[#D1AF47] bg-[#D1AF47]/10 px-3 py-1 rounded-full text-[10px] font-bold">{travelRadius} km</span>
              </div>
              <input
                type="range"
                min="5"
                max="50"
                value={travelRadius}
                onChange={(e) => setTravelRadius(Number(e.target.value))}
                className="w-full h-1.5 bg-white/[0.06] rounded-lg appearance-none cursor-pointer accent-[#D1AF47]"
              />
            </div>

            {/* Traffic delay buffer control */}
            <div className="space-y-3">
              <div className={`flex justify-between items-center text-[10px] font-bold uppercase tracking-wider ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <span className="text-[#7B859C]">{t.delayBufferLabel}</span>
                <span className="text-[#D1AF47] bg-[#D1AF47]/10 px-3 py-1 rounded-full text-[10px] font-bold">+{trafficDelay} mins</span>
              </div>
              <input
                type="range"
                min="10"
                max="60"
                value={trafficDelay}
                onChange={(e) => setTrafficDelay(Number(e.target.value))}
                className="w-full h-1.5 bg-white/[0.06] rounded-lg appearance-none cursor-pointer accent-[#D1AF47]"
              />
            </div>
          </div>

          {/* C. ROSTER WORKING HOURS */}
          <div className="bg-[#111827]/80 backdrop-blur-sm border border-white/[0.06] rounded-3xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.3)] space-y-5">
            <div className={`flex items-center gap-2.5 pb-4 border-b border-white/[0.04] ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <div className="w-8 h-8 rounded-xl bg-[#D1AF47]/10 flex items-center justify-center">
                <svg className="w-4 h-4 text-[#D1AF47]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="font-bold text-xs uppercase tracking-[0.15em] text-white">{t.workingHoursPanel}</h3>
            </div>

            {/* Day Selector */}
            <div className="space-y-1.5">
              <label className={`block text-[9px] font-bold uppercase tracking-wider text-[#7B859C] ${isRTL ? "text-right" : "text-left"}`}>
                {lang === "ar" ? "اليوم المراد تعديله" : "Day to Edit"}
              </label>
              <select
                value={selectedDayToEdit}
                onChange={(e) => setSelectedDayToEdit(Number(e.target.value))}
                className="w-full bg-white/[0.03] border border-white/[0.06] text-xs rounded-2xl px-4 py-2.5 text-white outline-none focus:border-[#D1AF47]/40 focus:shadow-[0_0_15px_rgba(209,175,71,0.1)] transition-all duration-300"
              >
                <option value={0} className="bg-[#111827] text-white">{lang === "ar" ? "الأحد" : "Sunday"}</option>
                <option value={1} className="bg-[#111827] text-white">{lang === "ar" ? "الاثنين" : "Monday"}</option>
                <option value={2} className="bg-[#111827] text-white">{lang === "ar" ? "الثلاثاء" : "Tuesday"}</option>
                <option value={3} className="bg-[#111827] text-white">{lang === "ar" ? "الأربعاء" : "Wednesday"}</option>
                <option value={4} className="bg-[#111827] text-white">{lang === "ar" ? "الخميس" : "Thursday"}</option>
                <option value={5} className="bg-[#111827] text-white">{lang === "ar" ? "الجمعة" : "Friday"}</option>
                <option value={6} className="bg-[#111827] text-white">{lang === "ar" ? "السبت" : "Saturday"}</option>
              </select>
            </div>

            {/* Working Day Toggle */}
            <div className={`flex items-center justify-between text-xs py-1 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <span className="font-semibold text-[#B8C0D4]">
                {lang === "ar" ? "يوم عمل نشط" : "Active Work Day"}
              </span>
              <ToggleSwitch
                checked={availabilityShifts.find(s => s.day_of_week === selectedDayToEdit)?.is_working_day ?? true}
                onChange={(val) => {
                  setAvailabilityShifts(prev => prev.map(s =>
                    s.day_of_week === selectedDayToEdit ? { ...s, is_working_day: val } : s
                  ));
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className={`block text-[9px] font-bold uppercase tracking-wider text-[#7B859C] ${isRTL ? "text-right" : "text-left"}`}>
                  {lang === "ar" ? "بداية المناوبة" : "Shift Start"}
                </label>
                <select
                  value={shiftStart}
                  onChange={(e) => setShiftStart(e.target.value)}
                  className="w-full bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] text-xs rounded-xl px-3 py-2 text-[#B8C0D4] outline-none focus:border-[#D1AF47]/40 focus:shadow-[0_0_12px_rgba(209,175,71,0.1)] transition-all duration-300"
                >
                  <option value="05:00 AM" className="bg-[#111827] text-white">05:00 AM</option>
                  <option value="06:00 AM" className="bg-[#111827] text-white">06:00 AM</option>
                  <option value="07:00 AM" className="bg-[#111827] text-white">07:00 AM</option>
                  <option value="08:00 AM" className="bg-[#111827] text-white">08:00 AM</option>
                  <option value="09:00 AM" className="bg-[#111827] text-white">09:00 AM</option>
                  <option value="10:00 AM" className="bg-[#111827] text-white">10:00 AM</option>
                  <option value="11:00 AM" className="bg-[#111827] text-white">11:00 AM</option>
                  <option value="12:00 PM" className="bg-[#111827] text-white">12:00 PM</option>
                  <option value="01:00 PM" className="bg-[#111827] text-white">01:00 PM</option>
                  <option value="02:00 PM" className="bg-[#111827] text-white">02:00 PM</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className={`block text-[9px] font-bold uppercase tracking-wider text-[#7B859C] ${isRTL ? "text-right" : "text-left"}`}>
                  {lang === "ar" ? "نهاية المناوبة" : "Shift End"}
                </label>
                <select
                  value={shiftEnd}
                  onChange={(e) => setShiftEnd(e.target.value)}
                  className="w-full bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] text-xs rounded-xl px-3 py-2 text-[#B8C0D4] outline-none focus:border-[#D1AF47]/40 focus:shadow-[0_0_12px_rgba(209,175,71,0.1)] transition-all duration-300"
                >
                  <option value="07:00 PM">07:00 PM</option>
                  <option value="08:00 PM">08:00 PM</option>
                  <option value="09:00 PM">09:00 PM</option>
                  <option value="10:00 PM">10:00 PM</option>
                </select>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* ═══════════════ WALK-IN BOOKING MODAL ═══════════════ */}
      {showBookModal && targetSlotIndex !== null && (
        <div className="fixed inset-0 bg-[#070B12]/70 backdrop-blur-xl z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleBookingSubmit}
            className="bg-[#111827] border border-white/[0.08] rounded-3xl p-7 max-w-sm w-full space-y-5 shadow-[0_24px_80px_rgba(0,0,0,0.5)] animate-[modalIn_0.25s_ease-out]"
            style={{ animation: "modalIn 0.25s ease-out" }}
          >
            <h3 className={`font-bold text-base text-white ${isRTL ? "text-right" : "text-left"}`}>
              {t.addAppointment} ({timeSlots[targetSlotIndex].label})
            </h3>

            <div className="space-y-1.5">
              <label className={`block text-[9px] font-bold uppercase tracking-wider text-[#7B859C] ${isRTL ? "text-right" : "text-left"}`}>{t.clientName}</label>
              {customers.length > 0 ? (
                <select
                  value={selectedCustomerId}
                  onChange={(e) => {
                    const custId = e.target.value;
                    setSelectedCustomerId(custId);
                    const selectedCust = customers.find(c => c.id === custId);
                    if (selectedCust) {
                      setBookCustomer(`${selectedCust.first_name || ""} ${selectedCust.last_name || ""}`.trim() || selectedCust.phone_number);
                    }
                  }}
                  className="w-full bg-white/[0.03] border border-white/[0.06] text-xs rounded-2xl px-4 py-2.5 text-white outline-none focus:border-[#D1AF47]/40 focus:shadow-[0_0_15px_rgba(209,175,71,0.1)] transition-all duration-300 cursor-pointer"
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id} className="bg-[#111827] text-white">
                      {`${c.first_name || ""} ${c.last_name || ""}`.trim() || c.phone_number}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  required
                  value={bookCustomer}
                  onChange={e => setBookCustomer(e.target.value)}
                  placeholder="Fahad Al-Malki"
                  className={`w-full bg-white/[0.03] border border-white/[0.06] rounded-2xl px-4 py-2.5 text-xs text-white outline-none focus:border-[#D1AF47]/40 focus:shadow-[0_0_15px_rgba(209,175,71,0.1)] transition-all duration-300 placeholder:text-[#7B859C]/50 ${isRTL ? "text-right" : "text-left"}`}
                />
              )}
            </div>

            <div className="space-y-1.5">
              <label className={`block text-[9px] font-bold uppercase tracking-wider text-[#7B859C] ${isRTL ? "text-right" : "text-left"}`}>{t.service}</label>
              <select
                value={bookService}
                onChange={(e) => {
                  const servId = e.target.value;
                  setBookService(servId);
                  const selectedServ = services.find(s => s.id === servId);
                  if (selectedServ) {
                    setBookPrice(String(selectedServ.base_price || 0));
                    setBookDuration(`${selectedServ.base_duration_minutes || 60} mins`);
                  }
                }}
                className="w-full bg-white/[0.03] border border-white/[0.06] text-xs rounded-2xl px-4 py-2.5 text-white outline-none focus:border-[#D1AF47]/40 focus:shadow-[0_0_15px_rgba(209,175,71,0.1)] transition-all duration-300 cursor-pointer"
              >
                {services.map((s) => (
                  <option key={s.id} value={s.id} className="bg-[#111827] text-white">
                    {lang === "ar" ? s.name_ar || s.name_en : s.name_en || s.name_ar} ({s.base_price} SAR)
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className={`block text-[9px] font-bold uppercase tracking-wider text-[#7B859C] ${isRTL ? "text-right" : "text-left"}`}>{t.assignedStylist}</label>
                <select
                  value={bookStaff}
                  onChange={e => setBookStaff(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/[0.06] text-xs rounded-2xl px-3 py-2.5 text-white outline-none focus:border-[#D1AF47]/40 focus:shadow-[0_0_15px_rgba(209,175,71,0.1)] transition-all duration-300 cursor-pointer"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id} className="bg-[#111827] text-white">
                      {lang === "ar" ? emp.name_ar || emp.name_en : emp.name_en || emp.name_ar}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className={`block text-[9px] font-bold uppercase tracking-wider text-[#7B859C] ${isRTL ? "text-right" : "text-left"}`}>{t.priceLabel}</label>
                <input
                  type="text"
                  required
                  value={bookPrice}
                  onChange={e => setBookPrice(e.target.value)}
                  className={`w-full bg-white/[0.03] border border-white/[0.06] rounded-2xl px-4 py-2.5 text-xs text-white outline-none focus:border-[#D1AF47]/40 focus:shadow-[0_0_15px_rgba(209,175,71,0.1)] transition-all duration-300 ${isRTL ? "text-right" : "text-left"}`}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className={`block text-[9px] font-bold uppercase tracking-wider text-[#7B859C] ${isRTL ? "text-right" : "text-left"}`}>{t.notes}</label>
              <input
                type="text"
                value={bookNotes}
                onChange={e => setBookNotes(e.target.value)}
                placeholder={t.notesPlaceholder}
                className={`w-full bg-white/[0.03] border border-white/[0.06] rounded-2xl px-4 py-2.5 text-xs text-white outline-none focus:border-[#D1AF47]/40 focus:shadow-[0_0_15px_rgba(209,175,71,0.1)] transition-all duration-300 placeholder:text-[#7B859C]/50 ${isRTL ? "text-right" : "text-left"}`}
              />
            </div>

            <div className={`flex justify-end gap-3 pt-3 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <button
                type="button"
                onClick={() => setShowBookModal(false)}
                className="px-5 py-2.5 bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] hover:bg-white/[0.06] rounded-2xl text-[10px] font-bold uppercase tracking-wider text-[#B8C0D4] hover:text-white transition-all duration-300"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 bg-gradient-to-r from-[#D1AF47] to-[#E0C46A] hover:shadow-[0_0_25px_rgba(209,175,71,0.35)] text-[#070B12] text-[10px] font-bold uppercase tracking-widest rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
              >
                {t.save}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ═══════════════ APPOINTMENT DETAILS MODAL ═══════════════ */}
      {showDetailsModal && (
        <div className="fixed inset-0 bg-[#070B12]/70 backdrop-blur-xl z-50 flex items-center justify-center p-4">
          <div
            className="bg-[#111827] border border-white/[0.08] rounded-3xl p-7 max-w-sm w-full space-y-5 shadow-[0_24px_80px_rgba(0,0,0,0.5)]"
            style={{ animation: "modalIn 0.25s ease-out" }}
          >
            <h3 className={`font-bold text-base text-white ${isRTL ? "text-right" : "text-left"}`}>{t.detailsTitle}</h3>

            <div className="space-y-3.5">
              <div className={`flex justify-between text-xs ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <span className="text-[#7B859C]">{t.customer}:</span>
                <span className="font-bold text-white">{showDetailsModal.customer}</span>
              </div>
              <div className={`flex justify-between text-xs ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <span className="text-[#7B859C]">{t.service}:</span>
                <span className="font-bold text-white">{showDetailsModal.service}</span>
              </div>
              <div className={`flex justify-between text-xs ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <span className="text-[#7B859C]">{t.stylist}:</span>
                <span className="font-bold text-[#D1AF47]">{showDetailsModal.staff}</span>
              </div>
              <div className={`flex justify-between text-xs ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <span className="text-[#7B859C]">{t.time}:</span>
                <span className="font-bold text-white">{showDetailsModal.time}</span>
              </div>
              <div className={`flex justify-between text-xs ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <span className="text-[#7B859C]">{t.priceLabel}:</span>
                <span className="font-bold text-white">{showDetailsModal.price} SAR</span>
              </div>
              {showDetailsModal.notes && (
                <div className={`flex justify-between text-xs ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                  <span className="text-[#7B859C]">{t.notes}:</span>
                  <span className="font-semibold text-[#B8C0D4]">{showDetailsModal.notes}</span>
                </div>
              )}
            </div>

            <div className={`flex flex-col gap-2.5 pt-5 border-t border-white/[0.04]`}>
              <button
                onClick={() => handleCancelBooking(showDetailsModal.id)}
                className="w-full py-2.5 bg-[#FF5D73]/[0.08] hover:bg-[#FF5D73]/[0.15] border border-[#FF5D73]/15 text-[#FF5D73] text-[10px] font-bold uppercase tracking-wider rounded-2xl hover:shadow-[0_0_15px_rgba(255,93,115,0.1)] transition-all duration-300"
              >
                {t.cancelBooking}
              </button>
              <button
                onClick={() => setShowDetailsModal(null)}
                className="w-full py-2.5 bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] text-[#B8C0D4] text-[10px] font-bold uppercase tracking-wider rounded-2xl hover:bg-white/[0.06] hover:text-white transition-all duration-300"
              >
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal entrance animation keyframes */}
      <style>{`
        @keyframes modalIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>

    </div>
  );
}
