"use client";

import React, { useState, useEffect } from "react";

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

  // --- 1. SCHEDULER STATES ---
  const [appointments, setAppointments] = useState<Appointment[]>([
    {
      id: "1",
      customer: "Faisal Al-Otaibi",
      service: "Premium Grooming Pack",
      time: "03:00 PM - 04:00 PM",
      slotIndex: 6, // 03:00 PM
      staff: "Ali Al-Harbi",
      price: "250",
      duration: "60 mins",
      notes: "In-salon VIP chair"
    },
    {
      id: "2",
      customer: "Sara Al-Mansoori",
      service: "Hair Styling & Silk Treatment",
      time: "04:15 PM - 05:15 PM",
      slotIndex: 8, // 04:00 PM
      staff: "Elena Rostova",
      price: "450",
      duration: "60 mins",
      notes: "Requires organic oils"
    },
    {
      id: "3",
      customer: "Bandar Bin-Khalid",
      service: "Kids Haircut & Styling",
      time: "06:00 PM - 06:40 PM",
      slotIndex: 10, // 06:00 PM
      staff: "Tariq Mahmood",
      price: "80",
      duration: "40 mins",
      notes: "Tablet for cartoons"
    }
  ]);

  const [blockouts, setBlockouts] = useState<Blockout[]>([
    { slotIndex: 1, reason: "Stylist Break & Sanitation" }
  ]);

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

  // Roster shift range
  const [shiftStart, setShiftStart] = useState("08:00 AM");
  const [shiftEnd, setShiftEnd] = useState("09:00 PM");

  // --- 3. MODALS STATES ---
  const [showBookModal, setShowBookModal] = useState(false);
  const [targetSlotIndex, setTargetSlotIndex] = useState<number | null>(null);

  const [showDetailsModal, setShowDetailsModal] = useState<Appointment | null>(null);

  // Form states for booking
  const [bookCustomer, setBookCustomer] = useState("");
  const [bookService, setBookService] = useState("Premium Grooming Pack");
  const [bookStaff, setBookStaff] = useState("Ali Al-Harbi");
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

  // Handle Walk-in Booking Submission
  const handleBookingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (targetSlotIndex === null || !bookCustomer.trim()) return;

    const slotLabel = timeSlots[targetSlotIndex].label;

    const newAppt: Appointment = {
      id: `walk-${Date.now()}`,
      customer: bookCustomer,
      service: bookService,
      time: `${slotLabel} - Forward`,
      slotIndex: targetSlotIndex,
      staff: bookStaff,
      price: bookPrice,
      duration: bookDuration,
      notes: bookNotes
    };

    setAppointments(prev => [...prev, newAppt]);
    setShowBookModal(false);
    setBookCustomer("");
    setBookNotes("");
    setTargetSlotIndex(null);
  };

  // Cancel Appointment
  const handleCancelBooking = (id: string) => {
    setAppointments(prev => prev.filter(a => a.id !== id));
    setShowDetailsModal(null);
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

  return (
    <div className="space-y-8 text-stone-200">
      {/* Title Header */}
      <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${isRTL ? "sm:flex-row-reverse text-right" : "text-left"}`}>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[hsl(45,60%,55%)]">{t.calendarTitle}</h2>
          <p className="text-xs text-[hsl(210,8%,65%)] mt-1">{t.subtitle}</p>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 bg-[hsla(0,0%,100%,0.03)] border border-[hsla(0,0%,100%,0.08)] text-xs font-bold uppercase rounded-lg hover:border-[hsl(45,60%,55%)] transition duration-200">
            {t.today}
          </button>
          <button 
            onClick={() => {
              setTargetSlotIndex(2); // default to 10:00 AM for quick walkin click
              setShowBookModal(true);
            }}
            className="px-4 py-2 bg-[hsl(45,60%,55%)] text-[hsl(220,15%,8%)] font-bold text-xs uppercase tracking-widest rounded-lg hover:bg-[hsl(45,60%,45%)] transition duration-200"
          >
            {t.addAppointment}
          </button>
        </div>
      </div>

      {/* Two Column Control Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* LEFT/MID: REDESIGNED SCHEDULE PLANNER */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[hsl(220,12%,14%)] border border-[hsla(0,0%,100%,0.08)] rounded-xl overflow-hidden shadow-lg">
            <div className={`p-6 border-b border-[hsla(0,0%,100%,0.08)] bg-[hsla(0,0%,100%,0.02)] flex items-center justify-between ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <h3 className="font-semibold text-sm">
                {lang === "ar" ? "لوحة التخطيط الفوري للمواعيد" : "Real-time Roster Planner"}
              </h3>
              <div className="flex bg-[hsl(220,15%,8%)] border border-[hsla(0,0%,100%,0.08)] rounded-lg p-1">
                <button className="px-3 py-1.5 text-[10px] font-extrabold uppercase rounded-md bg-[hsl(220,12%,14%)] text-[hsl(45,60%,55%)]">
                  {t.dayView}
                </button>
                <button className="px-3 py-1.5 text-[10px] font-extrabold uppercase rounded-md text-[hsl(210,8%,65%)] hover:text-[hsl(0,0%,98%)]">
                  {t.weekView}
                </button>
              </div>
            </div>

            {/* Time Slot Rows */}
            <div className="divide-y divide-[hsla(0,0%,100%,0.05)]">
              {timeSlots.map((slot, index) => {
                const isLocked = isSlotPrayerLocked(slot, index);
                const isOverridden = slot.isPrayer && overriddenSlots.includes(index);
                const appt = appointments.find(a => a.slotIndex === index);
                const blocked = blockouts.find(b => b.slotIndex === index);

                return (
                  <div key={index} className={`flex min-h-[80px] items-stretch ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                    
                    {/* Time indicator */}
                    <div className="w-24 px-4 py-4 border-r border-[hsla(0,0%,100%,0.05)] flex items-center justify-center text-xs font-semibold text-[hsl(210,8%,65%)] bg-[hsla(0,0%,100%,0.01)] select-none">
                      {slot.label}
                    </div>

                    {/* Slot content area */}
                    <div 
                      className={`flex-grow p-2 relative flex items-center transition duration-150 ${
                        draggedOverSlot === index ? "bg-[hsla(45,60%,55%,0.06)] border border-dashed border-[hsl(45,60%,55%)] rounded-lg" : ""
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
                        <div className={`w-full h-full bg-[hsla(355,75%,50%,0.05)] border border-[hsla(355,75%,50%,0.15)] rounded-lg flex items-center justify-between px-4 gap-3 text-[hsl(355,75%,60%)] ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                          <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse text-right" : "text-left"}`}>
                            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            <div>
                              <p className="text-xs font-bold">{slot.prayerName} - {t.blockedBuffer}</p>
                              <p className="text-[10px] text-[hsl(355,75%,75%)]">{bufferDuration} mins locked (Geofenced Lockout)</p>
                            </div>
                          </div>
                          
                          <button
                            onClick={() => toggleBufferOverride(index)}
                            className="px-2.5 py-1.5 bg-[hsla(355,75%,50%,0.15)] hover:bg-[hsla(355,75%,50%,0.25)] border border-[hsla(355,75%,50%,0.2)] rounded text-[9px] font-bold uppercase tracking-wider text-[hsl(355,75%,70%)] transition"
                          >
                            {t.unblockSlot}
                          </button>
                        </div>
                      ) : isOverridden ? (
                        // 2. Overridden / Unlocked buffer state
                        <div className={`w-full h-full bg-[hsla(150,60%,40%,0.04)] border border-[hsla(150,60%,40%,0.15)] rounded-lg flex items-center justify-between px-4 gap-3 text-[hsl(150,60%,45%)] ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                          <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse text-right" : "text-left"}`}>
                            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                            </svg>
                            <div>
                              <p className="text-xs font-bold">{slot.prayerName} - {t.unlockedOverride}</p>
                              <p className="text-[10px] text-[hsl(150,60%,50%)]">Manual buffer bypass allowed</p>
                            </div>
                          </div>
                          <button
                            onClick={() => toggleBufferOverride(index)}
                            className="px-2.5 py-1.5 bg-[hsla(150,60%,40%,0.1)] border border-[hsla(150,60%,40%,0.2)] rounded text-[9px] font-bold uppercase tracking-wider text-[hsl(150,60%,60%)] transition"
                          >
                            Lock Buffer
                          </button>
                        </div>
                      ) : blocked ? (
                        // 3. Manual Blockout state
                        <div className={`w-full h-full bg-[hsla(210,10%,30%,0.15)] border border-[hsla(210,10%,30%,0.3)] rounded-lg flex items-center justify-between px-4 gap-3 text-stone-400 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                          <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse text-right" : "text-left"}`}>
                            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                            </svg>
                            <div>
                              <p className="text-xs font-bold">{blocked.reason}</p>
                              <p className="text-[10px] text-stone-500">Locked out for appointments</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleBlockSlot(index)}
                            className="px-2.5 py-1.5 bg-stone-800 hover:bg-stone-700 border border-stone-700 rounded text-[9px] font-bold uppercase tracking-wider text-stone-300 transition"
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
                          className="w-full bg-[hsla(45,60%,55%,0.08)] border-l-4 border-[hsl(45,60%,55%)] rounded-r-lg p-3.5 flex flex-wrap gap-4 items-center justify-between group hover:bg-[hsla(45,60%,55%,0.12)] transition duration-200 cursor-pointer active:scale-95"
                        >
                          <div className={isRTL ? "text-right" : "text-left"}>
                            <div className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                              <h4 className="font-bold text-sm text-stone-50 group-hover:text-[hsl(45,60%,55%)] transition-colors">{appt.customer}</h4>
                              <span className="text-[10px] bg-[hsla(0,0%,100%,0.05)] text-[hsl(210,8%,65%)] px-2 py-0.5 rounded-full">{appt.duration}</span>
                            </div>
                            <p className="text-xs text-[hsl(210,8%,65%)] mt-1">
                              {t.service}: <span className="text-stone-200 font-semibold">{appt.service}</span>
                            </p>
                          </div>

                          <div className={`flex items-center gap-6 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                            <div className={isRTL ? "text-left" : "text-right"}>
                              <p className="text-[10px] text-[hsl(210,8%,65%)]">{t.stylist}</p>
                              <p className="text-xs font-bold text-[hsl(45,60%,55%)]">{appt.staff}</p>
                            </div>
                            <div className={isRTL ? "text-left" : "text-right"}>
                              <p className="text-[10px] text-[hsl(210,8%,65%)]">{t.price}</p>
                              <p className="text-xs font-black text-stone-100">{appt.price} SAR</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        // 5. Open empty slot state
                        <div className={`w-full h-full rounded-lg border border-dashed border-[hsla(0,0%,100%,0.08)] hover:border-[hsl(45,60%,55%)] hover:bg-[hsla(45,60%,55%,0.02)] transition duration-150 cursor-pointer flex items-center justify-between px-6 text-[hsl(210,8%,65%)] hover:text-[hsl(45,60%,55%)] group`}>
                          <span className="text-xs font-semibold opacity-0 group-hover:opacity-100 transition duration-150">
                            {lang === "ar" ? "جدولة حجز في هذا الوقت" : "Schedule Walk-in / Booking"}
                          </span>
                          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition duration-150">
                            <button
                              onClick={() => {
                                setTargetSlotIndex(index);
                                setShowBookModal(true);
                              }}
                              className="px-2.5 py-1 bg-stone-900 border border-stone-800 rounded text-[9px] font-bold uppercase tracking-wider text-stone-100 hover:bg-stone-850"
                            >
                              {t.addAppointment}
                            </button>
                            <button
                              onClick={() => handleBlockSlot(index)}
                              className="px-2.5 py-1 bg-stone-950 border border-stone-850 rounded text-[9px] font-bold uppercase tracking-wider text-stone-400 hover:bg-stone-900"
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

        {/* RIGHT COLUMN: CONTROL PANELS */}
        <div className="space-y-6">
          
          {/* A. PRAYER LOCK BUFFER CONTROL */}
          <div className="bg-[hsl(220,12%,14%)] border border-[hsla(0,0%,100%,0.08)] rounded-xl p-6 shadow-lg space-y-4">
            <div className={`flex items-center gap-2 pb-3 border-b border-[hsla(0,0%,100%,0.05)] ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <svg className="w-5 h-5 text-[hsl(45,60%,55%)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <h3 className="font-bold text-xs uppercase tracking-wider text-stone-100">{t.prayerControlPanel}</h3>
            </div>

            {/* Buffer time length control */}
            <div className="space-y-2">
              <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block">{t.bufferDurationLabel}</label>
              <div className="flex gap-2">
                {[15, 20, 30].map(mins => (
                  <button
                    key={mins}
                    onClick={() => setBufferDuration(mins)}
                    className={`flex-1 py-1.5 rounded text-[10px] font-black tracking-wider transition ${
                      bufferDuration === mins
                        ? "bg-[hsl(45,60%,55%)] text-[hsl(220,15%,8%)]"
                        : "bg-[hsla(0,0%,100%,0.04)] hover:bg-[hsla(0,0%,100%,0.08)] text-stone-300"
                    }`}
                  >
                    {mins}m
                  </button>
                ))}
              </div>
            </div>

            {/* Individual prayer lock toggles */}
            <div className="space-y-3 pt-2">
              {/* Fajr */}
              <div className={`flex items-center justify-between text-xs ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <span className="font-semibold text-stone-300">{t.fajr}</span>
                <input
                  type="checkbox"
                  checked={fajrActive}
                  onChange={(e) => setFajrActive(e.target.checked)}
                  className="w-4 h-4 rounded accent-[hsl(45,60%,55%)]"
                />
              </div>

              {/* Dhuhr */}
              <div className={`flex items-center justify-between text-xs ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <span className="font-semibold text-stone-300">{t.dhuhr}</span>
                <input
                  type="checkbox"
                  checked={dhuhrActive}
                  onChange={(e) => setDhuhrActive(e.target.checked)}
                  className="w-4 h-4 rounded accent-[hsl(45,60%,55%)]"
                />
              </div>

              {/* Asr */}
              <div className={`flex items-center justify-between text-xs ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <span className="font-semibold text-stone-300">{t.asr}</span>
                <input
                  type="checkbox"
                  checked={asrActive}
                  onChange={(e) => setAsrActive(e.target.checked)}
                  className="w-4 h-4 rounded accent-[hsl(45,60%,55%)]"
                />
              </div>

              {/* Maghrib */}
              <div className={`flex items-center justify-between text-xs ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <span className="font-semibold text-stone-300">{t.maghrib}</span>
                <input
                  type="checkbox"
                  checked={maghribActive}
                  onChange={(e) => setMaghribActive(e.target.checked)}
                  className="w-4 h-4 rounded accent-[hsl(45,60%,55%)]"
                />
              </div>

              {/* Isha */}
              <div className={`flex items-center justify-between text-xs ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <span className="font-semibold text-stone-300">{t.isha}</span>
                <input
                  type="checkbox"
                  checked={ishaActive}
                  onChange={(e) => setIshaActive(e.target.checked)}
                  className="w-4 h-4 rounded accent-[hsl(45,60%,55%)]"
                />
              </div>
            </div>
          </div>

          {/* B. GEOFENCED LOGISTICS / DISPATCH RADIUS */}
          <div className="bg-[hsl(220,12%,14%)] border border-[hsla(0,0%,100%,0.08)] rounded-xl p-6 shadow-lg space-y-4">
            <div className={`flex items-center gap-2 pb-3 border-b border-[hsla(0,0%,100%,0.05)] ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <svg className="w-5 h-5 text-[hsl(45,60%,55%)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <h3 className="font-bold text-xs uppercase tracking-wider text-stone-100">{t.dispatchControlPanel}</h3>
            </div>

            {/* Travel boundary radius control */}
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] text-stone-400 font-bold uppercase tracking-wider">
                <span>{t.radiusLabel}</span>
                <span className="text-[hsl(45,60%,55%)]">{travelRadius} km</span>
              </div>
              <input
                type="range"
                min="5"
                max="50"
                value={travelRadius}
                onChange={(e) => setTravelRadius(Number(e.target.value))}
                className="w-full h-1 bg-stone-800 rounded-lg appearance-none cursor-pointer accent-[hsl(45,60%,55%)]"
              />
            </div>

            {/* Traffic delay buffer control */}
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] text-stone-400 font-bold uppercase tracking-wider">
                <span>{t.delayBufferLabel}</span>
                <span className="text-[hsl(45,60%,55%)]">+{trafficDelay} mins</span>
              </div>
              <input
                type="range"
                min="10"
                max="60"
                value={trafficDelay}
                onChange={(e) => setTrafficDelay(Number(e.target.value))}
                className="w-full h-1 bg-stone-800 rounded-lg appearance-none cursor-pointer accent-[hsl(45,60%,55%)]"
              />
            </div>
          </div>

          {/* C. ROSTER WORKING HOURS */}
          <div className="bg-[hsl(220,12%,14%)] border border-[hsla(0,0%,100%,0.08)] rounded-xl p-6 shadow-lg space-y-4">
            <div className={`flex items-center gap-2 pb-3 border-b border-[hsla(0,0%,100%,0.05)] ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <svg className="w-5 h-5 text-[hsl(45,60%,55%)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="font-bold text-xs uppercase tracking-wider text-stone-100">{t.workingHoursPanel}</h3>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[9px] text-stone-400 font-bold uppercase">Start</label>
                <select
                  value={shiftStart}
                  onChange={(e) => setShiftStart(e.target.value)}
                  className="w-full bg-[hsl(220,15%,8%)] border border-[hsla(0,0%,100%,0.08)] text-xs rounded-lg px-2.5 py-1.5 text-stone-200 outline-none"
                >
                  <option value="07:00 AM">07:00 AM</option>
                  <option value="08:00 AM">08:00 AM</option>
                  <option value="09:00 AM">09:00 AM</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] text-stone-400 font-bold uppercase">End</label>
                <select
                  value={shiftEnd}
                  onChange={(e) => setShiftEnd(e.target.value)}
                  className="w-full bg-[hsl(220,15%,8%)] border border-[hsla(0,0%,100%,0.08)] text-xs rounded-lg px-2.5 py-1.5 text-stone-200 outline-none"
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

      {/* WALK-IN BOOKING MODAL */}
      {showBookModal && targetSlotIndex !== null && (
        <div className="fixed inset-0 bg-stone-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleBookingSubmit} className="bg-[hsl(220,12%,14%)] border border-[hsla(0,0%,100%,0.1)] rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-xl">
            <h3 className={`font-bold text-base text-stone-100 ${isRTL ? "text-right" : "text-left"}`}>
              {t.addAppointment} ({timeSlots[targetSlotIndex].label})
            </h3>

            <div className="space-y-1">
              <label className={`block text-[9px] font-bold uppercase text-stone-400 ${isRTL ? "text-right" : "text-left"}`}>{t.clientName}</label>
              <input
                type="text"
                required
                value={bookCustomer}
                onChange={e => setBookCustomer(e.target.value)}
                placeholder="Fahad Al-Malki"
                className={`w-full bg-[hsl(220,15%,8%)] border border-[hsla(0,0%,100%,0.08)] rounded-xl px-4 py-2 text-xs text-stone-200 outline-none focus:border-[hsl(45,60%,55%)] ${isRTL ? "text-right" : "text-left"}`}
              />
            </div>

            <div className="space-y-1">
              <label className={`block text-[9px] font-bold uppercase text-stone-400 ${isRTL ? "text-right" : "text-left"}`}>{t.service}</label>
              <select
                value={bookService}
                onChange={e => setBookService(e.target.value)}
                className="w-full bg-[hsl(220,15%,8%)] border border-[hsla(0,0%,100%,0.08)] text-xs rounded-xl px-4 py-2.5 text-stone-200 outline-none focus:border-[hsl(45,60%,55%)]"
              >
                <option value="Premium Grooming Pack">Premium Grooming Pack (250 SAR)</option>
                <option value="Haircut & Styling">Haircut & Styling (120 SAR)</option>
                <option value="Beard Grooming">Beard Grooming (80 SAR)</option>
                <option value="Swedish Therapy Massage">Swedish Therapy Massage (300 SAR)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className={`block text-[9px] font-bold uppercase text-stone-400 ${isRTL ? "text-right" : "text-left"}`}>{t.assignedStylist}</label>
                <select
                  value={bookStaff}
                  onChange={e => setBookStaff(e.target.value)}
                  className="w-full bg-[hsl(220,15%,8%)] border border-[hsla(0,0%,100%,0.08)] text-xs rounded-xl px-3 py-2 text-stone-200 outline-none focus:border-[hsl(45,60%,55%)]"
                >
                  <option value="Ali Al-Harbi">Ali Al-Harbi</option>
                  <option value="Elena Rostova">Elena Rostova</option>
                  <option value="Tariq Mahmood">Tariq Mahmood</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className={`block text-[9px] font-bold uppercase text-stone-400 ${isRTL ? "text-right" : "text-left"}`}>{t.priceLabel}</label>
                <input
                  type="text"
                  required
                  value={bookPrice}
                  onChange={e => setBookPrice(e.target.value)}
                  className={`w-full bg-[hsl(220,15%,8%)] border border-[hsla(0,0%,100%,0.08)] rounded-xl px-4 py-2 text-xs text-stone-200 outline-none focus:border-[hsl(45,60%,55%)] ${isRTL ? "text-right" : "text-left"}`}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className={`block text-[9px] font-bold uppercase text-stone-400 ${isRTL ? "text-right" : "text-left"}`}>{t.notes}</label>
              <input
                type="text"
                value={bookNotes}
                onChange={e => setBookNotes(e.target.value)}
                placeholder={t.notesPlaceholder}
                className={`w-full bg-[hsl(220,15%,8%)] border border-[hsla(0,0%,100%,0.08)] rounded-xl px-4 py-2 text-xs text-stone-200 outline-none focus:border-[hsl(45,60%,55%)] ${isRTL ? "text-right" : "text-left"}`}
              />
            </div>

            <div className={`flex justify-end gap-3 pt-2 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <button
                type="button"
                onClick={() => setShowBookModal(false)}
                className="px-4 py-2 border border-stone-800 hover:bg-stone-850 rounded-lg text-[10px] font-bold uppercase tracking-wider text-stone-300"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-[hsl(45,60%,55%)] hover:bg-[hsl(45,60%,45%)] text-[hsl(220,15%,8%)] text-[10px] font-bold uppercase tracking-widest rounded-lg transition"
              >
                {t.save}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* APPOINTMENT DETAILS MODAL */}
      {showDetailsModal && (
        <div className="fixed inset-0 bg-stone-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[hsl(220,12%,14%)] border border-[hsla(0,0%,100%,0.1)] rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-xl">
            <h3 className={`font-bold text-base text-stone-100 ${isRTL ? "text-right" : "text-left"}`}>{t.detailsTitle}</h3>

            <div className="space-y-3">
              <div className={`flex justify-between text-xs ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <span className="text-stone-400">{t.customer}:</span>
                <span className="font-bold text-stone-100">{showDetailsModal.customer}</span>
              </div>
              <div className={`flex justify-between text-xs ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <span className="text-stone-400">{t.service}:</span>
                <span className="font-bold text-stone-100">{showDetailsModal.service}</span>
              </div>
              <div className={`flex justify-between text-xs ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <span className="text-stone-400">{t.stylist}:</span>
                <span className="font-bold text-[hsl(45,60%,55%)]">{showDetailsModal.staff}</span>
              </div>
              <div className={`flex justify-between text-xs ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <span className="text-stone-400">{t.time}:</span>
                <span className="font-bold text-stone-100">{showDetailsModal.time}</span>
              </div>
              <div className={`flex justify-between text-xs ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <span className="text-stone-400">{t.priceLabel}:</span>
                <span className="font-bold text-stone-100">{showDetailsModal.price} SAR</span>
              </div>
              {showDetailsModal.notes && (
                <div className={`flex justify-between text-xs ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                  <span className="text-stone-400">{t.notes}:</span>
                  <span className="font-semibold text-stone-300">{showDetailsModal.notes}</span>
                </div>
              )}
            </div>

            <div className={`flex flex-col gap-2 pt-4 border-t border-[hsla(0,0%,100%,0.05)]`}>
              <button
                onClick={() => handleCancelBooking(showDetailsModal.id)}
                className="w-full py-2 bg-[hsla(355,75%,50%,0.15)] hover:bg-[hsla(355,75%,50%,0.25)] border border-[hsla(355,75%,50%,0.2)] text-[hsl(355,75%,70%)] text-[10px] font-bold uppercase tracking-wider rounded-lg transition"
              >
                {t.cancelBooking}
              </button>
              <button
                onClick={() => setShowDetailsModal(null)}
                className="w-full py-2 bg-stone-900 border border-stone-850 text-stone-300 text-[10px] font-bold uppercase tracking-wider rounded-lg hover:bg-stone-850 transition"
              >
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
