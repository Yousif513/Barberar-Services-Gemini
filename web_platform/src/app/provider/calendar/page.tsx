"use client";

import React, { useCallback, useMemo, useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { usePrayerTimes } from "@/lib/use-prayer-times";

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
    workingHoursPanel: "Roster Working Hours",
    prayerOperationsPanel: "Prayer Operations Control",
    prayerCityLabel: "Prayer city",
    prayerCitySearch: "Search Saudi cities...",
    prayerCityHint: "Choose the city used for prayer calculations and lock windows.",
    lockState: "Lock state",
    lockActiveNow: "Locked now",
    lockClearNow: "Clear now",
    nextLock: "Next lock",
    resumesInLabel: "Resumes in",
    shiftStartLabel: "Shift Start",
    shiftEndLabel: "Shift End",
    openingLabel: "Opening",
    closingLabel: "Closing",
    firstShiftLabel: "First Shift",
    secondShiftLabel: "Second Shift",
    addSecondShift: "Add second shift",
    removeSecondShift: "Remove second shift",
    selectHour: "Select hour"
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
    workingHoursPanel: "ساعات عمل الموظفين أسبوعياً",
    prayerOperationsPanel: "لوحة تشغيل الصلاة",
    prayerCityLabel: "مدينة الصلاة",
    prayerCitySearch: "ابحث في مدن السعودية...",
    prayerCityHint: "اختر المدينة المستخدمة لحساب أوقات الصلاة وفترات القفل.",
    lockState: "حالة القفل",
    lockActiveNow: "مغلق الآن",
    lockClearNow: "متاح الآن",
    nextLock: "القفل القادم",
    resumesInLabel: "يستأنف خلال",
    shiftStartLabel: "بداية المناوبة",
    shiftEndLabel: "نهاية المناوبة",
    openingLabel: "الافتتاح",
    closingLabel: "الإغلاق",
    firstShiftLabel: "المناوبة الأولى",
    secondShiftLabel: "المناوبة الثانية",
    addSecondShift: "إضافة مناوبة ثانية",
    removeSecondShift: "إزالة المناوبة الثانية",
    selectHour: "اختر الساعة"
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

const HOUR_WHEEL_OPTIONS = Array.from({ length: 12 }, (_, index) => `${String(index + 1).padStart(2, "0")}:00`);
const PERIOD_OPTIONS = ["AM", "PM"] as const;

const SAUDI_CITIES = [
  { key: "riyadh", en: "Riyadh", ar: "الرياض", regionEn: "Riyadh", regionAr: "الرياض", lat: 24.7136, lng: 46.6753 },
  { key: "jeddah", en: "Jeddah", ar: "جدة", regionEn: "Makkah", regionAr: "مكة المكرمة", lat: 21.4858, lng: 39.1925 },
  { key: "makkah", en: "Makkah", ar: "مكة المكرمة", regionEn: "Makkah", regionAr: "مكة المكرمة", lat: 21.3891, lng: 39.8579 },
  { key: "madinah", en: "Madinah", ar: "المدينة المنورة", regionEn: "Madinah", regionAr: "المدينة المنورة", lat: 24.5247, lng: 39.5692 },
  { key: "dammam", en: "Dammam", ar: "الدمام", regionEn: "Eastern Province", regionAr: "المنطقة الشرقية", lat: 26.4207, lng: 50.0888 },
  { key: "khobar", en: "Khobar", ar: "الخبر", regionEn: "Eastern Province", regionAr: "المنطقة الشرقية", lat: 26.2172, lng: 50.1971 },
  { key: "dhahran", en: "Dhahran", ar: "الظهران", regionEn: "Eastern Province", regionAr: "المنطقة الشرقية", lat: 26.2361, lng: 50.0393 },
  { key: "jubail", en: "Jubail", ar: "الجبيل", regionEn: "Eastern Province", regionAr: "المنطقة الشرقية", lat: 27.0174, lng: 49.6225 },
  { key: "qatif", en: "Qatif", ar: "القطيف", regionEn: "Eastern Province", regionAr: "المنطقة الشرقية", lat: 26.5652, lng: 50.0089 },
  { key: "hofuf", en: "Hofuf", ar: "الهفوف", regionEn: "Eastern Province", regionAr: "المنطقة الشرقية", lat: 25.3833, lng: 49.5866 },
  { key: "mubarraz", en: "Al Mubarraz", ar: "المبرز", regionEn: "Eastern Province", regionAr: "المنطقة الشرقية", lat: 25.4077, lng: 49.5903 },
  { key: "abqaiq", en: "Abqaiq", ar: "بقيق", regionEn: "Eastern Province", regionAr: "المنطقة الشرقية", lat: 25.9340, lng: 49.6688 },
  { key: "ras_tanura", en: "Ras Tanura", ar: "رأس تنورة", regionEn: "Eastern Province", regionAr: "المنطقة الشرقية", lat: 26.6427, lng: 50.1597 },
  { key: "safwa", en: "Safwa", ar: "صفوى", regionEn: "Eastern Province", regionAr: "المنطقة الشرقية", lat: 26.6495, lng: 49.9552 },
  { key: "saihat", en: "Saihat", ar: "سيهات", regionEn: "Eastern Province", regionAr: "المنطقة الشرقية", lat: 26.4852, lng: 50.0405 },
  { key: "khafji", en: "Khafji", ar: "الخفجي", regionEn: "Eastern Province", regionAr: "المنطقة الشرقية", lat: 28.4391, lng: 48.4913 },
  { key: "hafar_al_batin", en: "Hafar Al Batin", ar: "حفر الباطن", regionEn: "Eastern Province", regionAr: "المنطقة الشرقية", lat: 28.4328, lng: 45.9708 },
  { key: "taif", en: "Taif", ar: "الطائف", regionEn: "Makkah", regionAr: "مكة المكرمة", lat: 21.4373, lng: 40.5127 },
  { key: "rabigh", en: "Rabigh", ar: "رابغ", regionEn: "Makkah", regionAr: "مكة المكرمة", lat: 22.7986, lng: 39.0349 },
  { key: "al_lith", en: "Al Lith", ar: "الليث", regionEn: "Makkah", regionAr: "مكة المكرمة", lat: 20.1461, lng: 40.2725 },
  { key: "qunfudhah", en: "Al Qunfudhah", ar: "القنفذة", regionEn: "Makkah", regionAr: "مكة المكرمة", lat: 19.1264, lng: 41.0789 },
  { key: "bahrah", en: "Bahrah", ar: "بحرة", regionEn: "Makkah", regionAr: "مكة المكرمة", lat: 21.4029, lng: 39.4625 },
  { key: "khulais", en: "Khulais", ar: "خليص", regionEn: "Makkah", regionAr: "مكة المكرمة", lat: 22.1549, lng: 39.3376 },
  { key: "jumum", en: "Al Jumum", ar: "الجموم", regionEn: "Makkah", regionAr: "مكة المكرمة", lat: 21.6169, lng: 39.6981 },
  { key: "yanbu", en: "Yanbu", ar: "ينبع", regionEn: "Madinah", regionAr: "المدينة المنورة", lat: 24.0895, lng: 38.0618 },
  { key: "alula", en: "AlUla", ar: "العلا", regionEn: "Madinah", regionAr: "المدينة المنورة", lat: 26.6085, lng: 37.9232 },
  { key: "badr", en: "Badr", ar: "بدر", regionEn: "Madinah", regionAr: "المدينة المنورة", lat: 23.7828, lng: 38.7905 },
  { key: "khaybar", en: "Khaybar", ar: "خيبر", regionEn: "Madinah", regionAr: "المدينة المنورة", lat: 25.6834, lng: 39.2866 },
  { key: "tabuk", en: "Tabuk", ar: "تبوك", regionEn: "Tabuk", regionAr: "تبوك", lat: 28.3838, lng: 36.5550 },
  { key: "al_wajh", en: "Al Wajh", ar: "الوجه", regionEn: "Tabuk", regionAr: "تبوك", lat: 26.2455, lng: 36.4525 },
  { key: "umluj", en: "Umluj", ar: "أملج", regionEn: "Tabuk", regionAr: "تبوك", lat: 25.0213, lng: 37.2685 },
  { key: "duba", en: "Duba", ar: "ضباء", regionEn: "Tabuk", regionAr: "تبوك", lat: 27.3513, lng: 35.6901 },
  { key: "haql", en: "Haql", ar: "حقل", regionEn: "Tabuk", regionAr: "تبوك", lat: 29.2833, lng: 34.9500 },
  { key: "tayma", en: "Tayma", ar: "تيماء", regionEn: "Tabuk", regionAr: "تبوك", lat: 27.6190, lng: 38.5487 },
  { key: "abha", en: "Abha", ar: "أبها", regionEn: "Asir", regionAr: "عسير", lat: 18.2465, lng: 42.5117 },
  { key: "khamis_mushait", en: "Khamis Mushait", ar: "خميس مشيط", regionEn: "Asir", regionAr: "عسير", lat: 18.3064, lng: 42.7292 },
  { key: "bisha", en: "Bisha", ar: "بيشة", regionEn: "Asir", regionAr: "عسير", lat: 19.9840, lng: 42.6052 },
  { key: "muhayil", en: "Muhayil", ar: "محايل عسير", regionEn: "Asir", regionAr: "عسير", lat: 18.5478, lng: 42.0499 },
  { key: "al_namas", en: "Al Namas", ar: "النماص", regionEn: "Asir", regionAr: "عسير", lat: 19.1190, lng: 42.1300 },
  { key: "tanomah", en: "Tanomah", ar: "تنومة", regionEn: "Asir", regionAr: "عسير", lat: 18.9269, lng: 42.1786 },
  { key: "rijal_almaa", en: "Rijal Almaa", ar: "رجال ألمع", regionEn: "Asir", regionAr: "عسير", lat: 18.2133, lng: 42.2290 },
  { key: "najran", en: "Najran", ar: "نجران", regionEn: "Najran", regionAr: "نجران", lat: 17.5656, lng: 44.2289 },
  { key: "sharurah", en: "Sharurah", ar: "شرورة", regionEn: "Najran", regionAr: "نجران", lat: 17.4750, lng: 47.1000 },
  { key: "jazan", en: "Jazan", ar: "جازان", regionEn: "Jazan", regionAr: "جازان", lat: 16.8892, lng: 42.5611 },
  { key: "sabya", en: "Sabya", ar: "صبيا", regionEn: "Jazan", regionAr: "جازان", lat: 17.1495, lng: 42.6256 },
  { key: "abu_arish", en: "Abu Arish", ar: "أبو عريش", regionEn: "Jazan", regionAr: "جازان", lat: 16.9689, lng: 42.8325 },
  { key: "samta", en: "Samta", ar: "صامطة", regionEn: "Jazan", regionAr: "جازان", lat: 16.5960, lng: 42.9444 },
  { key: "farasan", en: "Farasan", ar: "فرسان", regionEn: "Jazan", regionAr: "جازان", lat: 16.7022, lng: 41.9833 },
  { key: "hail", en: "Hail", ar: "حائل", regionEn: "Hail", regionAr: "حائل", lat: 27.5114, lng: 41.7208 },
  { key: "baqaa", en: "Baqaa", ar: "بقعاء", regionEn: "Hail", regionAr: "حائل", lat: 27.8877, lng: 42.4101 },
  { key: "buraidah", en: "Buraidah", ar: "بريدة", regionEn: "Qassim", regionAr: "القصيم", lat: 26.3592, lng: 43.9818 },
  { key: "unaizah", en: "Unaizah", ar: "عنيزة", regionEn: "Qassim", regionAr: "القصيم", lat: 26.0906, lng: 43.9875 },
  { key: "al_rass", en: "Al Rass", ar: "الرس", regionEn: "Qassim", regionAr: "القصيم", lat: 25.8694, lng: 43.4973 },
  { key: "bukayriyah", en: "Al Bukayriyah", ar: "البكيرية", regionEn: "Qassim", regionAr: "القصيم", lat: 26.1440, lng: 43.6570 },
  { key: "mithnab", en: "Al Mithnab", ar: "المذنب", regionEn: "Qassim", regionAr: "القصيم", lat: 25.8606, lng: 44.2228 },
  { key: "badayea", en: "Al Badayea", ar: "البدائع", regionEn: "Qassim", regionAr: "القصيم", lat: 25.9867, lng: 43.7319 },
  { key: "arar", en: "Arar", ar: "عرعر", regionEn: "Northern Borders", regionAr: "الحدود الشمالية", lat: 30.9753, lng: 41.0381 },
  { key: "rafha", en: "Rafha", ar: "رفحاء", regionEn: "Northern Borders", regionAr: "الحدود الشمالية", lat: 29.6264, lng: 43.4938 },
  { key: "turaif", en: "Turaif", ar: "طريف", regionEn: "Northern Borders", regionAr: "الحدود الشمالية", lat: 31.6725, lng: 38.6637 },
  { key: "sakaka", en: "Sakaka", ar: "سكاكا", regionEn: "Al Jouf", regionAr: "الجوف", lat: 29.9697, lng: 40.2064 },
  { key: "qurayyat", en: "Qurayyat", ar: "القريات", regionEn: "Al Jouf", regionAr: "الجوف", lat: 31.3318, lng: 37.3428 },
  { key: "dumat_al_jandal", en: "Dumat Al Jandal", ar: "دومة الجندل", regionEn: "Al Jouf", regionAr: "الجوف", lat: 29.8111, lng: 39.8664 },
  { key: "al_bahah", en: "Al Bahah", ar: "الباحة", regionEn: "Al Bahah", regionAr: "الباحة", lat: 20.0129, lng: 41.4677 },
  { key: "baljurashi", en: "Baljurashi", ar: "بلجرشي", regionEn: "Al Bahah", regionAr: "الباحة", lat: 19.8611, lng: 41.5572 },
  { key: "al_makhwah", en: "Al Makhwah", ar: "المخواة", regionEn: "Al Bahah", regionAr: "الباحة", lat: 19.7559, lng: 41.4270 },
  { key: "qilwah", en: "Qilwah", ar: "قلوة", regionEn: "Al Bahah", regionAr: "الباحة", lat: 19.9399, lng: 41.3511 },
  { key: "kharj", en: "Al Kharj", ar: "الخرج", regionEn: "Riyadh", regionAr: "الرياض", lat: 24.1554, lng: 47.3346 },
  { key: "diriyah", en: "Diriyah", ar: "الدرعية", regionEn: "Riyadh", regionAr: "الرياض", lat: 24.7346, lng: 46.5756 },
  { key: "dawadmi", en: "Dawadmi", ar: "الدوادمي", regionEn: "Riyadh", regionAr: "الرياض", lat: 24.5070, lng: 44.3924 },
  { key: "majmaah", en: "Al Majmaah", ar: "المجمعة", regionEn: "Riyadh", regionAr: "الرياض", lat: 25.9106, lng: 45.3481 },
  { key: "zulfi", en: "Zulfi", ar: "الزلفي", regionEn: "Riyadh", regionAr: "الرياض", lat: 26.2995, lng: 44.8154 },
  { key: "shaqra", en: "Shaqra", ar: "شقراء", regionEn: "Riyadh", regionAr: "الرياض", lat: 25.2524, lng: 45.2528 },
  { key: "afif", en: "Afif", ar: "عفيف", regionEn: "Riyadh", regionAr: "الرياض", lat: 23.9065, lng: 42.9172 },
  { key: "wadi_dawasir", en: "Wadi Al Dawasir", ar: "وادي الدواسر", regionEn: "Riyadh", regionAr: "الرياض", lat: 20.4623, lng: 44.7837 },
  { key: "aflaj", en: "Al Aflaj", ar: "الأفلاج", regionEn: "Riyadh", regionAr: "الرياض", lat: 22.2846, lng: 46.7226 },
  { key: "quwayiyah", en: "Al Quwayiyah", ar: "القويعية", regionEn: "Riyadh", regionAr: "الرياض", lat: 24.0447, lng: 45.2656 },
  { key: "muzahimiyah", en: "Al Muzahimiyah", ar: "المزاحمية", regionEn: "Riyadh", regionAr: "الرياض", lat: 24.4688, lng: 46.2728 },
  { key: "huraymila", en: "Huraymila", ar: "حريملاء", regionEn: "Riyadh", regionAr: "الرياض", lat: 25.1167, lng: 46.1167 },
  { key: "thadiq", en: "Thadiq", ar: "ثادق", regionEn: "Riyadh", regionAr: "الرياض", lat: 25.2876, lng: 45.8687 },
  { key: "rumah", en: "Rumah", ar: "رماح", regionEn: "Riyadh", regionAr: "الرياض", lat: 25.5622, lng: 47.1600 }
] as const;

const getNearestSaudiCityKey = (lat: number, lng: number) =>
  SAUDI_CITIES.reduce((nearest, city) => {
    const nearestDistance = Math.hypot(nearest.lat - lat, nearest.lng - lng);
    const cityDistance = Math.hypot(city.lat - lat, city.lng - lng);
    return cityDistance < nearestDistance ? city : nearest;
  }, SAUDI_CITIES[0]).key;

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
  const [coords, setCoords] = useState({ lat: 24.7136, lng: 46.6753 });
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
    has_second_shift?: boolean;
    second_start_time?: string | null;
    second_end_time?: string | null;
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
  const [viewMode, setViewMode] = useState<"day" | "week">("day");

  // Unlocked / overridden slots trackers
  const [overriddenSlots, setOverriddenSlots] = useState<number[]>([]);

  // Dispatch / Geofencing controls
  const [travelRadius, setTravelRadius] = useState(15); // in km
  const [trafficDelay, setTrafficDelay] = useState(25); // in mins

  // Roster shift range (shown for editing the selected day)
  const [shiftStart, setShiftStart] = useState("08:00 AM");
  const [shiftEnd, setShiftEnd] = useState("09:00 PM");
  const [hasSecondShift, setHasSecondShift] = useState(false);
  const [secondShiftStart, setSecondShiftStart] = useState("02:00 PM");
  const [secondShiftEnd, setSecondShiftEnd] = useState("10:00 PM");
  const [selectedPrayerCityKey, setSelectedPrayerCityKey] = useState("riyadh");
  const [citySearch, setCitySearch] = useState("");

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

  const buffersConfig = {
    fajr: { before: fajrActive ? bufferDuration : 0, after: fajrActive ? bufferDuration : 0 },
    dhuhr: { before: dhuhrActive ? bufferDuration : 0, after: dhuhrActive ? bufferDuration : 0 },
    asr: { before: asrActive ? bufferDuration : 0, after: asrActive ? bufferDuration : 0 },
    maghrib: { before: maghribActive ? bufferDuration : 0, after: maghribActive ? bufferDuration : 0 },
    isha: { before: ishaActive ? bufferDuration : 0, after: ishaActive ? bufferDuration : 0 }
  };

  const { todayTimes, tomorrowTimes, resumesIn, lockStartsIn, isLocked: isCurrentlyPrayerLocked } = usePrayerTimes(coords.lat, coords.lng, buffersConfig);
  const selectedPrayerCity = useMemo(
    () => SAUDI_CITIES.find((city) => city.key === selectedPrayerCityKey) || SAUDI_CITIES[0],
    [selectedPrayerCityKey]
  );
  const filteredSaudiCities = useMemo(() => {
    const term = citySearch.trim().toLowerCase();
    if (!term) return SAUDI_CITIES;
    return SAUDI_CITIES.filter((city) =>
      city.en.toLowerCase().includes(term) ||
      city.ar.includes(citySearch.trim()) ||
      city.regionEn.toLowerCase().includes(term) ||
      city.regionAr.includes(citySearch.trim())
    );
  }, [citySearch]);

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
    const [hoursStr, minutesStr] = time.split(":");
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

  const getSlotDateTime = (slotLabel: string, date: Date) => {
    const [time, ampm] = slotLabel.split(" ");
    const [hoursStr, minutesStr] = time.split(":");
    let hours = parseInt(hoursStr, 10);
    const minutes = parseInt(minutesStr, 10);
    if (ampm === "PM" && hours !== 12) hours += 12;
    if (ampm === "AM" && hours === 12) hours = 0;
    
    const slotDate = new Date(date);
    slotDate.setHours(hours, minutes, 0, 0);
    return slotDate;
  };

  const getSlotPrayerLockInfoRaw = (slot: typeof timeSlots[0]) => {
    const slotTime = getSlotDateTime(slot.label, selectedDate);
    const allPrayers = [...todayTimes, ...tomorrowTimes];

    for (const prayer of allPrayers) {
      const isActive = 
        (prayer.key === "fajr" && fajrActive) ||
        (prayer.key === "dhuhr" && dhuhrActive) ||
        (prayer.key === "asr" && asrActive) ||
        (prayer.key === "maghrib" && maghribActive) ||
        (prayer.key === "isha" && ishaActive);
        
      if (!isActive) continue;

      const lockStart = new Date(prayer.time.getTime() - bufferDuration * 60 * 1000);
      const lockEnd = new Date(prayer.time.getTime() + bufferDuration * 60 * 1000);

      if (slotTime >= lockStart && slotTime <= lockEnd) {
        return prayer;
      }
    }
    return null;
  };

  const getSlotPrayerLockInfo = (slot: typeof timeSlots[0], index: number) => {
    if (overriddenSlots.includes(index)) return null;
    return getSlotPrayerLockInfoRaw(slot);
  };

  // Helper to determine if a slot is locked by a prayer buffer
  const isSlotPrayerLocked = (slot: typeof timeSlots[0], index: number) => {
    return !!getSlotPrayerLockInfo(slot, index);
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
      const [rawHour, m] = timePart.split(":").map(Number);
      let h = rawHour;
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
        .select("id, name_en, name_ar, latitude, longitude")
        .eq("provider_id", providerInfo.id);
      if (branchesError) throw branchesError;
      setBranches(branchesData || []);
      if (branchesData && branchesData.length > 0) {
        const firstWithCoords = branchesData.find(b => b.latitude && b.longitude);
        if (firstWithCoords) {
          const branchLat = Number(firstWithCoords.latitude);
          const branchLng = Number(firstWithCoords.longitude);
          setCoords({ lat: branchLat, lng: branchLng });
          setSelectedPrayerCityKey(getNearestSaudiCityKey(branchLat, branchLng));
        }
      }
      
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
        .select("*")
        .eq("employee_id", selectedEmployeeId);
      
      if (shiftsError) throw shiftsError;
      
      const fullWeekShifts = Array.from({ length: 7 }, (_, index) => {
        const existing = (shiftsData || []).find(s => s.day_of_week === index);
        return existing || {
          day_of_week: index,
          start_time: "08:00:00",
          end_time: "21:00:00",
          is_working_day: true,
          has_second_shift: false,
          second_start_time: null,
          second_end_time: null
        };
      });
      setAvailabilityShifts(fullWeekShifts);
      
      const currentDayShift = fullWeekShifts.find(s => s.day_of_week === selectedDayToEdit);
      if (currentDayShift) {
        setShiftStart(timeTo12Hour(currentDayShift.start_time));
        setShiftEnd(timeTo12Hour(currentDayShift.end_time));
        setHasSecondShift(Boolean(currentDayShift.has_second_shift));
        setSecondShiftStart(timeTo12Hour(currentDayShift.second_start_time || "14:00:00"));
        setSecondShiftEnd(timeTo12Hour(currentDayShift.second_end_time || "22:00:00"));
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
      const [hoursStr, minutesStr] = timePart.split(":");
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
        is_working_day: shiftConfig ? shiftConfig.is_working_day : true,
        has_second_shift: hasSecondShift,
        second_start_time: hasSecondShift ? timeTo24Hour(secondShiftStart) : null,
        second_end_time: hasSecondShift ? timeTo24Hour(secondShiftEnd) : null
      };

      const { error: saveError } = await supabase
        .from("employee_availability")
        .upsert(payload, { onConflict: "employee_id,day_of_week" });

      if (saveError) {
        const legacyPayload = {
          employee_id: payload.employee_id,
          day_of_week: payload.day_of_week,
          start_time: payload.start_time,
          end_time: payload.end_time,
          is_working_day: payload.is_working_day
        };
        const { error: legacySaveError } = await supabase
          .from("employee_availability")
          .upsert(legacyPayload, { onConflict: "employee_id,day_of_week" });
        if (legacySaveError) throw legacySaveError;
      }

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
  const activePrayerLockCount = [fajrActive, dhuhrActive, asrActive, maghribActive, ishaActive].filter(Boolean).length;

  // Premium Toggle Switch component
  const ToggleSwitch = ({ checked, onChange }: { checked: boolean; onChange: (val: boolean) => void }) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
        checked ? "bg-gradient-to-r from-[#D1AF47] to-[#E0C46A]" : "bg-[#E5E7EB]"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${
          checked ? (isRTL ? "-translate-x-5" : "translate-x-5") : "translate-x-0"
        }`}
      />
    </button>
  );

  const TimeWheelPicker = ({
    label,
    value,
    onChange
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
  }) => {
    const [hour = "08:00", period = "AM"] = value.split(" ");
    const normalizedPeriod = period === "PM" ? "PM" : "AM";
    const updateHour = (nextHour: string) => onChange(`${nextHour} ${normalizedPeriod}`);
    const updatePeriod = (nextPeriod: "AM" | "PM") => onChange(`${hour} ${nextPeriod}`);

    return (
      <div className="space-y-2">
        <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
          <label className={`block text-[9px] font-bold uppercase tracking-wider text-[#667085] ${isRTL ? "text-right" : "text-left"}`}>
            {label}
          </label>
          <span className="rounded-full bg-[#D1AF47]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#A37B16]">
            {value}
          </span>
        </div>
        <div className="grid grid-cols-[1fr_70px] gap-3 rounded-3xl border border-[#D1AF47]/35 bg-[linear-gradient(180deg,#FFFCF4_0%,#F8F2E5_50%,#FFFCF4_100%)] p-3 shadow-[inset_0_18px_35px_rgba(209,175,71,0.10),0_10px_26px_rgba(17,17,17,0.05)]">
          <div
            role="listbox"
            aria-label={`${t.selectHour}: ${label}`}
            className="relative h-40 overflow-y-auto rounded-2xl border border-[#D1AF47]/20 bg-white/55 p-2 snap-y snap-mandatory scrollbar-thin scrollbar-thumb-[#D1AF47]/45 scrollbar-track-transparent"
          >
            <div className="pointer-events-none sticky top-[calc(50%-22px)] z-10 h-11 rounded-2xl border border-[#D1AF47]/45 bg-[#D1AF47]/10 shadow-[0_0_24px_rgba(209,175,71,0.22)]" />
            <div className="-mt-11 py-12">
              {HOUR_WHEEL_OPTIONS.map((option) => {
                const isSelected = option === hour;
                return (
                  <button
                    key={option}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => updateHour(option)}
                    className={`mb-1 flex h-11 w-full snap-center items-center justify-center rounded-2xl text-base font-black tracking-[0.08em] transition-all duration-300 ${
                      isSelected
                        ? "bg-gradient-to-r from-[#D1AF47] to-[#E0C46A] text-[#070B12] shadow-[0_0_22px_rgba(209,175,71,0.32)] scale-[1.02]"
                        : "text-[#B7B1A6] hover:bg-white/80 hover:text-[#101828]"
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid content-center gap-2">
            {PERIOD_OPTIONS.map((option) => {
              const isSelected = option === normalizedPeriod;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => updatePeriod(option)}
                  className={`rounded-2xl px-3 py-4 text-sm font-black tracking-[0.12em] transition-all duration-300 ${
                    isSelected
                      ? "bg-[#15100A] text-[#E6C679] shadow-[0_0_20px_rgba(21,16,10,0.16)]"
                      : "border border-[#D1AF47]/20 bg-white/70 text-[#8A7F6C] hover:border-[#D1AF47]/45"
                  }`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 text-[#344054]">
      {/* ═══════════════ PAGE HEADER ═══════════════ */}
      <div className={`flex flex-col md:flex-row md:items-center md:justify-between gap-6 ${isRTL ? "md:flex-row-reverse text-right" : "text-left"}`}>
        <div>
          <h2 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-[#D1AF47] via-[#E0C46A] to-[#D1AF47] bg-clip-text text-transparent">
            {t.calendarTitle}
          </h2>
          <p className="text-xs text-[#667085] mt-1.5 tracking-wide">{t.subtitle}</p>
        </div>

        <div className={`flex flex-wrap gap-3 items-center ${isRTL ? "justify-end flex-row-reverse" : "justify-start"}`}>
          {/* Employee/Stylist Dropdown */}
          {employees.length > 0 && (
            <div className="relative">
              <select
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className="pl-4 pr-10 py-2.5 bg-[#F9FAFB] border border-[#ECECEC] text-xs font-bold rounded-2xl text-[#101828] outline-none focus:border-[#D1AF47]/40 focus:shadow-[0_0_12px_rgba(209,175,71,0.1)] transition-all duration-300 appearance-none cursor-pointer"
              >
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id} className="bg-white text-[#101828]">
                    {lang === "ar" ? emp.name_ar || emp.name_en : emp.name_en || emp.name_ar}
                  </option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-[#667085]">
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
            className="px-4 py-2.5 bg-[#F9FAFB] border border-[#ECECEC] text-xs font-bold rounded-2xl text-[#101828] outline-none focus:border-[#D1AF47]/40 transition-all duration-300 cursor-pointer"
          />

          <button 
            onClick={() => setSelectedDate(new Date())}
            className="px-5 py-2.5 bg-white border border-[#ECECEC] text-xs font-bold uppercase tracking-wider rounded-2xl text-[#667085] hover:border-[#D1AF47]/30 hover:text-[#101828] transition-all duration-300"
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
          <div className="bg-white border border-[#ECECEC] rounded-3xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
            {/* Planner Header */}
            <div className={`p-6 border-b border-[#ECECEC] bg-[#F9FAFB] rounded-t-3xl flex items-center justify-between ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <h3 className="font-semibold text-sm text-[#101828] tracking-wide">
                {lang === "ar" ? "لوحة التخطيط الفوري للمواعيد" : "Real-time Roster Planner"}
              </h3>
              {/* Day/Week Pill Switcher */}
              <div className="flex bg-[#F3F4F6] border border-[#ECECEC] rounded-xl p-1 gap-1">
                <button
                  onClick={() => setViewMode("day")}
                  className={`px-4 py-1.5 text-[10px] font-extrabold uppercase rounded-xl transition-all duration-300 ${
                    viewMode === "day"
                      ? "bg-gradient-to-r from-[#D1AF47] to-[#E0C46A] text-[#070B12] shadow-[0_0_12px_rgba(209,175,71,0.2)]"
                      : "text-[#667085] hover:text-[#101828] hover:bg-[#E5E7EB]"
                  }`}
                >
                  {t.dayView}
                </button>
                <button
                  onClick={() => setViewMode("week")}
                  className={`px-4 py-1.5 text-[10px] font-extrabold uppercase rounded-xl transition-all duration-300 ${
                    viewMode === "week"
                      ? "bg-gradient-to-r from-[#D1AF47] to-[#E0C46A] text-[#070B12] shadow-[0_0_12px_rgba(209,175,71,0.2)]"
                      : "text-[#667085] hover:text-[#101828] hover:bg-[#E5E7EB]"
                  }`}
                >
                  {t.weekView}
                </button>
              </div>
            </div>

            {viewMode === "day" ? (
            <>
            {/* Off-duty banner */}
            {isOffDutyToday && (
              <div className="m-6 p-6 bg-[#FEF3F2] border border-[#FEE4E2] rounded-2xl text-center text-[#EF4444] space-y-3">
                <svg className="w-8 h-8 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-sm font-bold">
                    {lang === "ar" ? "الأخصائي في إجازة اليوم" : "Stylist is Off-Duty Today"}
                  </p>
                  <p className="text-xs text-[#EF4444]/80 mt-1">
                    {lang === "ar" 
                      ? "تم وضع هذا اليوم كإجازة أسبوعية في مناوبات العمل." 
                      : "This day is configured as off-duty in their weekly working roster."}
                  </p>
                </div>
              </div>
            )}

            {/* Time Slot Rows */}
            <div className={`divide-y divide-[#ECECEC] ${isOffDutyToday ? "opacity-40 pointer-events-none" : ""}`}>
              {timeSlots.map((slot, index) => {
                const lockingPrayerRaw = getSlotPrayerLockInfoRaw(slot);
                const isLocked = isSlotPrayerLocked(slot, index);
                const isOverridden = !!lockingPrayerRaw && overriddenSlots.includes(index);
                const prayerName = lockingPrayerRaw ? (isRTL ? lockingPrayerRaw.nameAr : lockingPrayerRaw.nameEn) : "";
                const appt = appointments.find(a => a.slotIndex === index);
                const blocked = blockouts.find(b => b.slotIndex === index);

                return (
                  <div key={index} className={`flex min-h-[80px] items-stretch ${isRTL ? "flex-row-reverse" : "flex-row"}`}>

                    {/* Time indicator column */}
                    <div className={`w-28 px-4 py-4 flex items-center justify-center text-[11px] font-bold text-[#101828] bg-[#F9FAFB] select-none tracking-wide ${isRTL ? "border-l" : "border-r"} border-[#ECECEC]`}>
                      {slot.label}
                    </div>

                    {/* Slot content area */}
                    <div
                      className={`flex-grow p-2.5 relative flex items-center transition-all duration-300 ${
                        draggedOverSlot === index ? "bg-[#D1AF47]/[0.03] border-2 border-dashed border-[#D1AF47]/40 rounded-2xl" : ""
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
                        <div className={`w-full h-full bg-[#FEF3F2] border border-[#FEE4E2] rounded-2xl flex items-center justify-between px-5 gap-3 text-[#EF4444] shadow-sm ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                          <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse text-right" : "text-left"}`}>
                            <div className="w-9 h-9 rounded-xl bg-[#FEE4E2] text-[#EF4444] flex items-center justify-center flex-shrink-0">
                              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                              </svg>
                            </div>
                            <div>
                              <p className="text-xs font-bold">{prayerName} - {t.blockedBuffer}</p>
                              <p className="text-[10px] text-[#EF4444]/80">{bufferDuration} mins locked (Geofenced Lockout)</p>
                            </div>
                          </div>

                          <button
                            onClick={() => toggleBufferOverride(index)}
                            className="px-3 py-1.5 bg-white border border-[#FEE4E2] hover:bg-[#FEE4E2] rounded-xl text-[9px] font-bold uppercase tracking-wider text-[#EF4444] transition-all duration-300"
                          >
                            {t.unblockSlot}
                          </button>
                        </div>
                      ) : isOverridden ? (
                        // 2. Overridden / Unlocked buffer state
                        <div className={`w-full h-full bg-[#ECFDF3] border border-[#D1FADF] rounded-2xl flex items-center justify-between px-5 gap-3 text-[#22C55E] shadow-sm ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                          <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse text-right" : "text-left"}`}>
                            <div className="w-9 h-9 rounded-xl bg-[#D1FADF] text-[#22C55E] flex items-center justify-center flex-shrink-0">
                              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                              </svg>
                            </div>
                            <div>
                              <p className="text-xs font-bold">{prayerName} - {t.unlockedOverride}</p>
                              <p className="text-[10px] text-[#22C55E]/80">Manual buffer bypass allowed</p>
                            </div>
                          </div>
                          <button
                            onClick={() => toggleBufferOverride(index)}
                            className="px-3 py-1.5 bg-white border border-[#D1FADF] hover:bg-[#D1FADF] rounded-xl text-[9px] font-bold uppercase tracking-wider text-[#027A48] transition-all duration-300"
                          >
                            Lock Buffer
                          </button>
                        </div>
                      ) : blocked ? (
                        // 3. Manual Blockout state
                        <div className={`w-full h-full bg-[#F9FAFB] border border-[#ECECEC] rounded-2xl flex items-center justify-between px-5 gap-3 text-[#667085] ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                          <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse text-right" : "text-left"}`}>
                            <div className="w-9 h-9 rounded-xl bg-[#F3F4F6] text-[#667085] flex items-center justify-center flex-shrink-0">
                              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                              </svg>
                            </div>
                            <div>
                              <p className="text-xs font-bold text-[#101828]">{blocked.reason}</p>
                              <p className="text-[10px] text-[#667085]">Locked out for appointments</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleBlockSlot(index)}
                            className="px-3 py-1.5 bg-white border border-[#ECECEC] hover:bg-[#F9FAFB] rounded-xl text-[9px] font-bold uppercase tracking-wider text-[#667085] transition-all duration-300"
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
                          className={`w-full bg-[#D1AF47]/[0.04] border border-[#D1AF47]/20 rounded-2xl p-4 flex flex-wrap gap-4 items-center justify-between group hover:bg-[#D1AF47]/[0.08] hover:shadow-[0_4px_20px_rgba(209,175,71,0.08)] hover:scale-[1.01] transition-all duration-300 cursor-pointer active:scale-[0.98] ${isRTL ? "border-r-4" : "border-l-4"} border-[#D1AF47]`}
                        >
                          <div className={isRTL ? "text-right" : "text-left"}>
                            <div className={`flex items-center gap-2.5 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                              <h4 className="font-bold text-sm text-[#101828]">{appt.customer}</h4>
                              <span className="text-[10px] bg-[#F3F4F6] text-[#667085] px-2.5 py-0.5 rounded-full font-medium">{appt.duration}</span>
                            </div>
                            <p className="text-xs text-[#667085] mt-1.5">
                              {t.service}: <span className="text-[#101828] font-semibold">{appt.service}</span>
                            </p>
                          </div>

                          <div className={`flex items-center gap-6 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                            <div className={isRTL ? "text-left" : "text-right"}>
                              <p className="text-[10px] text-[#667085]">{t.stylist}</p>
                              <p className="text-xs font-bold text-[#D1AF47]">{appt.staff}</p>
                            </div>
                            <div className={isRTL ? "text-left" : "text-right"}>
                              <p className="text-[10px] text-[#667085]">{t.price}</p>
                              <p className="text-xs font-black text-[#101828]">{appt.price} SAR</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        // 5. Open empty slot state
                        <div className={`w-full h-full rounded-2xl border border-dashed border-[#ECECEC] hover:border-[#D1AF47]/40 hover:bg-[#D1AF47]/[0.01] transition-all duration-300 cursor-pointer flex items-center justify-between px-6 text-[#344054] group`}>
                          <span className="text-xs font-semibold text-[#344054]">
                            {lang === "ar" ? "جدولة حجز في هذا الوقت" : "Schedule Walk-in / Booking"}
                          </span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setTargetSlotIndex(index);
                                setBookStaff(selectedEmployeeId);
                                setShowBookModal(true);
                              }}
                              className="px-3 py-1.5 bg-white border border-[#ECECEC] rounded-xl text-[9px] font-bold uppercase tracking-wider text-[#667085] hover:bg-[#D1AF47]/10 hover:border-[#D1AF47]/20 hover:text-[#D1AF47] transition-all duration-300"
                            >
                              {t.addAppointment}
                            </button>
                            <button
                              onClick={() => handleBlockSlot(index)}
                              className="px-3 py-1.5 bg-white border border-[#ECECEC] rounded-xl text-[9px] font-bold uppercase tracking-wider text-[#667085] hover:bg-[#F9FAFB] transition-all duration-300"
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
            </>
            ) : (
            /* ═══ WEEK VIEW ═══ 7-day grid. Appointments load per selected day,
               so booked blocks appear in that day's column; prayer-lock rows are
               shaded across all days (prayer windows are ~constant for the
               branch location across the week). Click a day header to focus it. */
            (() => {
              const weekStart = new Date(selectedDate);
              weekStart.setDate(selectedDate.getDate() - selectedDate.getDay());
              const weekDays = Array.from({ length: 7 }, (_, i) => {
                const d = new Date(weekStart);
                d.setDate(weekStart.getDate() + i);
                return d;
              });
              const now = new Date();
              const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
              const dayNames = isRTL
                ? ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]
                : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
              return (
                <div className="overflow-x-auto">
                  <div className="min-w-[720px]">
                    {/* Day header row */}
                    <div className={`flex border-b border-[#ECECEC] bg-[#F9FAFB] ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                      <div className={`w-20 flex-shrink-0 ${isRTL ? "border-l" : "border-r"} border-[#ECECEC]`} />
                      {weekDays.map((d, i) => {
                        const isToday = sameDay(d, now);
                        const isSelected = sameDay(d, selectedDate);
                        return (
                          <button
                            key={i}
                            onClick={() => setSelectedDate(new Date(d))}
                            className={`flex-1 px-2 py-3 text-center transition-all duration-200 ${isRTL ? "border-l" : "border-r"} border-[#ECECEC] last:border-0 ${
                              isSelected ? "bg-[#D1AF47]/10" : "hover:bg-[#F3F4F6]"
                            }`}
                          >
                            <span className="block text-[10px] font-extrabold uppercase tracking-wider text-[#101828]">{dayNames[i]}</span>
                            <span className={`mt-1 inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${
                              isToday ? "bg-[#D1AF47] text-[#070B12]" : "text-[#101828]"
                            }`}>{d.getDate()}</span>
                          </button>
                        );
                      })}
                    </div>
                    {/* Time rows */}
                    <div className="divide-y divide-[#ECECEC]">
                      {timeSlots.map((slot, index) => {
                        const isLocked = isSlotPrayerLocked(slot, index);
                        const lockRaw = getSlotPrayerLockInfoRaw(slot);
                        const prayerName = lockRaw ? (isRTL ? lockRaw.nameAr : lockRaw.nameEn) : "";
                        return (
                          <div key={index} className={`flex min-h-[52px] ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                            <div className={`w-20 flex-shrink-0 px-2 py-2 text-[10px] font-bold text-[#101828] bg-[#F9FAFB] flex items-center justify-center ${isRTL ? "border-l" : "border-r"} border-[#ECECEC]`}>
                              {slot.label}
                            </div>
                            {weekDays.map((d, di) => {
                              const isSelectedCol = sameDay(d, selectedDate);
                              const appt = isSelectedCol ? appointments.find((a) => a.slotIndex === index) : undefined;
                              return (
                                <div
                                  key={di}
                                  className={`flex-1 p-1 ${isRTL ? "border-l" : "border-r"} border-[#ECECEC] last:border-0 ${
                                    isLocked ? "bg-[#FEF3F2]" : sameDay(d, now) ? "bg-[#D1AF47]/[0.02]" : ""
                                  }`}
                                >
                                  {isLocked ? (
                                    <div className="flex h-full min-h-[44px] items-center justify-center rounded-lg text-[8px] font-bold uppercase tracking-wider text-[#EF4444]/70">
                                      {prayerName}
                                    </div>
                                  ) : appt ? (
                                    <div className="flex h-full min-h-[44px] flex-col justify-center rounded-lg bg-gradient-to-br from-[#D1AF47]/15 to-[#E0C46A]/10 border border-[#D1AF47]/30 px-2 py-1">
                                      <span className="truncate text-[10px] font-black text-[#101828]">{appt.customer}</span>
                                      <span className="truncate text-[9px] font-semibold text-[#667085]">{appt.service}</span>
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()
            )}
          </div>
        </div>

        {/* ─────── RIGHT COLUMN: CONTROL PANELS ─────── */}
        <div className="space-y-6">

          {/* A. PRAYER OPERATIONS CONTROL + LOCK PARAMETERS */}
          <div className="bg-white border border-[#ECECEC] rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.015)] space-y-5">
            <div className={`flex items-start justify-between gap-4 pb-4 border-b border-[#ECECEC] ${isRTL ? "flex-row-reverse text-right" : "text-left"}`}>
              <div className={`flex items-start gap-3 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <div className="w-10 h-10 rounded-2xl bg-[#D1AF47]/10 flex items-center justify-center shadow-[0_0_24px_rgba(209,175,71,0.18)]">
                  <svg className="w-5 h-5 text-[#D1AF47]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.24em] text-[#A37B16]">{t.prayerOperationsPanel}</p>
                  <h3 className="mt-1 font-bold text-sm uppercase tracking-[0.16em] text-[#101828]">{t.prayerControlPanel}</h3>
                </div>
              </div>
              <span className={`rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-[0.12em] ${
                isCurrentlyPrayerLocked ? "bg-[#FEF3F2] text-[#EF4444]" : "bg-[#ECFDF3] text-[#027A48]"
              }`}>
                {isCurrentlyPrayerLocked ? t.lockActiveNow : t.lockClearNow}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { label: t.prayerCityLabel, value: isRTL ? selectedPrayerCity.ar : selectedPrayerCity.en },
                { label: t.lockState, value: `${activePrayerLockCount}/5` },
                { label: isCurrentlyPrayerLocked ? t.resumesInLabel : t.nextLock, value: isCurrentlyPrayerLocked ? resumesIn : lockStartsIn }
              ].map((metric) => (
                <div key={metric.label} className="rounded-2xl border border-[#D1AF47]/20 bg-[#FFFCF4] px-3 py-3 text-center">
                  <span className="block text-[8px] font-black uppercase tracking-[0.14em] text-[#667085]">{metric.label}</span>
                  <strong className="mt-1 block truncate text-[11px] font-black text-[#101828]">{metric.value}</strong>
                </div>
              ))}
            </div>

            <div className="space-y-2.5">
              <div className={`flex items-end justify-between gap-3 ${isRTL ? "flex-row-reverse text-right" : "text-left"}`}>
                <div>
                  <label className="text-[10px] text-[#667085] font-bold uppercase tracking-wider block">{t.prayerCityLabel}</label>
                  <p className="mt-1 text-[10px] font-semibold text-[#667085]">{t.prayerCityHint}</p>
                </div>
              </div>
              <input
                type="search"
                value={citySearch}
                onChange={(e) => setCitySearch(e.target.value)}
                placeholder={t.prayerCitySearch}
                className={`w-full rounded-2xl border border-[#ECECEC] bg-[#F9FAFB] px-4 py-2.5 text-xs font-semibold text-[#101828] outline-none transition-all duration-300 placeholder:text-[#667085]/45 focus:border-[#D1AF47]/50 focus:shadow-[0_0_18px_rgba(209,175,71,0.14)] ${isRTL ? "text-right" : "text-left"}`}
              />
              <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                {filteredSaudiCities.map((city) => {
                  const isSelected = city.key === selectedPrayerCityKey;
                  return (
                    <button
                      key={city.key}
                      type="button"
                      onClick={() => {
                        setSelectedPrayerCityKey(city.key);
                        setCoords({ lat: city.lat, lng: city.lng });
                      }}
                      className={`w-full rounded-2xl border px-3 py-2.5 text-xs transition-all duration-300 ${
                        isSelected
                          ? "border-[#D1AF47]/55 bg-[#D1AF47]/[0.12] text-[#101828] shadow-[0_0_18px_rgba(209,175,71,0.18)]"
                          : "border-[#ECECEC] bg-white/80 text-[#667085] hover:border-[#D1AF47]/35 hover:text-[#101828]"
                      }`}
                    >
                      <span className={`flex items-center justify-between gap-3 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                        <strong className="truncate font-black">{isRTL ? city.ar : city.en}</strong>
                        <span className="truncate text-[10px] font-bold opacity-70">{isRTL ? city.regionAr : city.regionEn}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2.5">
              <label className="text-[10px] text-[#667085] font-bold uppercase tracking-wider block">{t.bufferDurationLabel}</label>
              <div className="grid grid-cols-3 gap-2">
                {[10, 15, 20, 30, 45, 60].map(mins => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setBufferDuration(mins)}
                    className={`py-2 rounded-xl text-[10px] font-black tracking-wider transition-all duration-300 ${
                      bufferDuration === mins
                        ? "bg-gradient-to-r from-[#D1AF47] to-[#E0C46A] text-[#070B12] shadow-[0_0_15px_rgba(209,175,71,0.2)]"
                        : "bg-white border border-[#ECECEC] text-[#667085] hover:border-[#D1AF47]/40"
                    }`}
                  >
                    {mins}m
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 pt-1">
              {[
                { label: t.fajr, checked: fajrActive, onChange: setFajrActive },
                { label: t.dhuhr, checked: dhuhrActive, onChange: setDhuhrActive },
                { label: t.asr, checked: asrActive, onChange: setAsrActive },
                { label: t.maghrib, checked: maghribActive, onChange: setMaghribActive },
                { label: t.isha, checked: ishaActive, onChange: setIshaActive }
              ].map((prayer) => (
                <div key={prayer.label} className={`flex items-center justify-between rounded-2xl border border-[#ECECEC] bg-white/80 px-3 py-2.5 text-xs ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                  <span className="font-bold text-[#344054]">{prayer.label}</span>
                  <ToggleSwitch checked={prayer.checked} onChange={prayer.onChange} />
                </div>
              ))}
            </div>
          </div>

          {/* B. GEOFENCED LOGISTICS / DISPATCH RADIUS */}
          <div className="bg-white border border-[#ECECEC] rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.015)] space-y-5">
            <div className={`flex items-center gap-2.5 pb-4 border-b border-[#ECECEC] ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <div className="w-8 h-8 rounded-xl bg-[#D1AF47]/10 flex items-center justify-center">
                <svg className="w-4 h-4 text-[#D1AF47]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h3 className="font-bold text-xs uppercase tracking-[0.15em] text-[#101828]">{t.dispatchControlPanel}</h3>
            </div>

            {/* Travel boundary radius control */}
            <div className="space-y-3">
              <div className={`flex justify-between items-center text-[10px] font-bold uppercase tracking-wider ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <span className="text-[#667085]">{t.radiusLabel}</span>
                <span className="text-[#D1AF47] bg-[#D1AF47]/10 px-3 py-1 rounded-full text-[10px] font-bold">{travelRadius} km</span>
              </div>
              <input
                type="range"
                min="5"
                max="50"
                value={travelRadius}
                onChange={(e) => setTravelRadius(Number(e.target.value))}
                className="w-full h-1.5 bg-[#E5E7EB] rounded-lg appearance-none cursor-pointer accent-[#D1AF47]"
              />
            </div>

            {/* Traffic delay buffer control */}
            <div className="space-y-3">
              <div className={`flex justify-between items-center text-[10px] font-bold uppercase tracking-wider ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <span className="text-[#667085]">{t.delayBufferLabel}</span>
                <span className="text-[#D1AF47] bg-[#D1AF47]/10 px-3 py-1 rounded-full text-[10px] font-bold">+{trafficDelay} mins</span>
              </div>
              <input
                type="range"
                min="10"
                max="60"
                value={trafficDelay}
                onChange={(e) => setTrafficDelay(Number(e.target.value))}
                className="w-full h-1.5 bg-[#E5E7EB] rounded-lg appearance-none cursor-pointer accent-[#D1AF47]"
              />
            </div>
          </div>

          {/* C. ROSTER WORKING HOURS */}
          <div className="bg-white border border-[#ECECEC] rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.015)] space-y-5">
            <div className={`flex items-center gap-2.5 pb-4 border-b border-[#ECECEC] ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <div className="w-8 h-8 rounded-xl bg-[#D1AF47]/10 flex items-center justify-center">
                <svg className="w-4 h-4 text-[#D1AF47]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="font-bold text-xs uppercase tracking-[0.15em] text-[#101828]">{t.workingHoursPanel}</h3>
            </div>

            {/* Day Selector */}
            <div className="space-y-1.5">
              <label className={`block text-[9px] font-bold uppercase tracking-wider text-[#667085] ${isRTL ? "text-right" : "text-left"}`}>
                {lang === "ar" ? "اليوم المراد تعديله" : "Day to Edit"}
              </label>
              <select
                value={selectedDayToEdit}
                onChange={(e) => setSelectedDayToEdit(Number(e.target.value))}
                className="w-full bg-[#F9FAFB] border border-[#ECECEC] text-xs rounded-2xl px-4 py-2.5 text-[#101828] outline-none focus:border-[#D1AF47]/40 focus:shadow-[0_0_15px_rgba(209,175,71,0.1)] transition-all duration-300"
              >
                <option value={0} className="bg-white text-[#101828]">{lang === "ar" ? "الأحد" : "Sunday"}</option>
                <option value={1} className="bg-white text-[#101828]">{lang === "ar" ? "الاثنين" : "Monday"}</option>
                <option value={2} className="bg-white text-[#101828]">{lang === "ar" ? "الثلاثاء" : "Tuesday"}</option>
                <option value={3} className="bg-white text-[#101828]">{lang === "ar" ? "الأربعاء" : "Wednesday"}</option>
                <option value={4} className="bg-white text-[#101828]">{lang === "ar" ? "الخميس" : "Thursday"}</option>
                <option value={5} className="bg-white text-[#101828]">{lang === "ar" ? "الجمعة" : "Friday"}</option>
                <option value={6} className="bg-white text-[#101828]">{lang === "ar" ? "السبت" : "Saturday"}</option>
              </select>
            </div>

            {/* Working Day Toggle */}
            <div className={`flex items-center justify-between text-xs py-1 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <span className="font-semibold text-[#667085]">
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TimeWheelPicker
                label={`${t.firstShiftLabel} · ${t.openingLabel}`}
                value={shiftStart}
                onChange={setShiftStart}
              />
              <TimeWheelPicker
                label={`${t.firstShiftLabel} · ${t.closingLabel}`}
                value={shiftEnd}
                onChange={setShiftEnd}
              />
            </div>

            <div className={`flex items-center justify-between rounded-2xl border border-[#D1AF47]/20 bg-[#FFFCF4] px-4 py-3 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <div className={isRTL ? "text-right" : "text-left"}>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#101828]">{t.secondShiftLabel}</p>
                <p className="mt-1 text-[10px] font-semibold text-[#667085]">{hasSecondShift ? `${secondShiftStart} - ${secondShiftEnd}` : t.addSecondShift}</p>
              </div>
              <button
                type="button"
                onClick={() => setHasSecondShift((value) => !value)}
                className={`rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-[0.12em] transition-all duration-300 ${
                  hasSecondShift
                    ? "border border-[#FF5D73]/25 bg-[#FF5D73]/10 text-[#EF4444]"
                    : "bg-gradient-to-r from-[#D1AF47] to-[#E0C46A] text-[#070B12] shadow-[0_0_18px_rgba(209,175,71,0.22)]"
                }`}
              >
                {hasSecondShift ? t.removeSecondShift : t.addSecondShift}
              </button>
            </div>

            {hasSecondShift && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TimeWheelPicker
                  label={`${t.secondShiftLabel} · ${t.openingLabel}`}
                  value={secondShiftStart}
                  onChange={setSecondShiftStart}
                />
                <TimeWheelPicker
                  label={`${t.secondShiftLabel} · ${t.closingLabel}`}
                  value={secondShiftEnd}
                  onChange={setSecondShiftEnd}
                />
              </div>
            )}

            <div className="hidden">
              <div className="space-y-1.5">
                <label className={`block text-[9px] font-bold uppercase tracking-wider text-[#667085] ${isRTL ? "text-right" : "text-left"}`}>
                  {lang === "ar" ? "بداية المناوبة" : "Shift Start"}
                </label>
                <select
                  value={shiftStart}
                  onChange={(e) => setShiftStart(e.target.value)}
                  className="w-full bg-[#F9FAFB] border border-[#ECECEC] text-xs rounded-xl px-3 py-2 text-[#101828] outline-none focus:border-[#D1AF47]/40 focus:shadow-[0_0_12px_rgba(209,175,71,0.1)] transition-all duration-300"
                >
                  <option value="05:00 AM" className="bg-white text-[#101828]">05:00 AM</option>
                  <option value="06:00 AM" className="bg-white text-[#101828]">06:00 AM</option>
                  <option value="07:00 AM" className="bg-white text-[#101828]">07:00 AM</option>
                  <option value="08:00 AM" className="bg-white text-[#101828]">08:00 AM</option>
                  <option value="09:00 AM" className="bg-white text-[#101828]">09:00 AM</option>
                  <option value="10:00 AM" className="bg-white text-[#101828]">10:00 AM</option>
                  <option value="11:00 AM" className="bg-white text-[#101828]">11:00 AM</option>
                  <option value="12:00 PM" className="bg-white text-[#101828]">12:00 PM</option>
                  <option value="01:00 PM" className="bg-white text-[#101828]">01:00 PM</option>
                  <option value="02:00 PM" className="bg-white text-[#101828]">02:00 PM</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className={`block text-[9px] font-bold uppercase tracking-wider text-[#667085] ${isRTL ? "text-right" : "text-left"}`}>
                  {lang === "ar" ? "نهاية المناوبة" : "Shift End"}
                </label>
                <select
                  value={shiftEnd}
                  onChange={(e) => setShiftEnd(e.target.value)}
                  className="w-full bg-[#F9FAFB] border border-[#ECECEC] text-xs rounded-xl px-3 py-2 text-[#101828] outline-none focus:border-[#D1AF47]/40 focus:shadow-[0_0_12px_rgba(209,175,71,0.1)] transition-all duration-300"
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
        <div className="fixed inset-0 bg-[#101828]/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleBookingSubmit}
            className="bg-white border border-[#ECECEC] rounded-3xl p-7 max-w-sm w-full space-y-5 shadow-[0_12px_40px_rgba(0,0,0,0.02)] animate-[modalIn_0.25s_ease-out]"
            style={{ animation: "modalIn 0.25s ease-out" }}
          >
            <h3 className={`font-bold text-base text-[#101828] ${isRTL ? "text-right" : "text-left"}`}>
              {t.addAppointment} ({timeSlots[targetSlotIndex].label})
            </h3>

            <div className="space-y-1.5">
              <label className={`block text-[9px] font-bold uppercase tracking-wider text-[#667085] ${isRTL ? "text-right" : "text-left"}`}>{t.clientName}</label>
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
                  className="w-full bg-[#F9FAFB] border border-[#ECECEC] text-xs rounded-2xl px-4 py-2.5 text-[#101828] outline-none focus:border-[#D1AF47]/40 focus:shadow-[0_0_15px_rgba(209,175,71,0.1)] transition-all duration-300 cursor-pointer"
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id} className="bg-white text-[#101828]">
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
                  className={`w-full bg-[#F9FAFB] border border-[#ECECEC] rounded-2xl px-4 py-2.5 text-xs text-[#101828] outline-none focus:border-[#D1AF47]/40 focus:shadow-[0_0_15px_rgba(209,175,71,0.1)] transition-all duration-300 placeholder:text-[#667085]/40 ${isRTL ? "text-right" : "text-left"}`}
                />
              )}
            </div>

            <div className="space-y-1.5">
              <label className={`block text-[9px] font-bold uppercase tracking-wider text-[#667085] ${isRTL ? "text-right" : "text-left"}`}>{t.service}</label>
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
                className="w-full bg-[#F9FAFB] border border-[#ECECEC] text-xs rounded-2xl px-4 py-2.5 text-[#101828] outline-none focus:border-[#D1AF47]/40 focus:shadow-[0_0_15px_rgba(209,175,71,0.1)] transition-all duration-300 cursor-pointer"
              >
                {services.map((s) => (
                  <option key={s.id} value={s.id} className="bg-white text-[#101828]">
                    {lang === "ar" ? s.name_ar || s.name_en : s.name_en || s.name_ar} ({s.base_price} SAR)
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className={`block text-[9px] font-bold uppercase tracking-wider text-[#667085] ${isRTL ? "text-right" : "text-left"}`}>{t.assignedStylist}</label>
                <select
                  value={bookStaff}
                  onChange={e => setBookStaff(e.target.value)}
                  className="w-full bg-[#F9FAFB] border border-[#ECECEC] text-xs rounded-2xl px-3 py-2.5 text-[#101828] outline-none focus:border-[#D1AF47]/40 focus:shadow-[0_0_15px_rgba(209,175,71,0.1)] transition-all duration-300 cursor-pointer"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id} className="bg-white text-[#101828]">
                      {lang === "ar" ? emp.name_ar || emp.name_en : emp.name_en || emp.name_ar}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className={`block text-[9px] font-bold uppercase tracking-wider text-[#667085] ${isRTL ? "text-right" : "text-left"}`}>{t.priceLabel}</label>
                <input
                  type="text"
                  required
                  value={bookPrice}
                  onChange={e => setBookPrice(e.target.value)}
                  className={`w-full bg-[#F9FAFB] border border-[#ECECEC] rounded-2xl px-4 py-2.5 text-xs text-[#101828] outline-none focus:border-[#D1AF47]/40 focus:shadow-[0_0_15px_rgba(209,175,71,0.1)] transition-all duration-300 ${isRTL ? "text-right" : "text-left"}`}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className={`block text-[9px] font-bold uppercase tracking-wider text-[#667085] ${isRTL ? "text-right" : "text-left"}`}>{t.notes}</label>
              <input
                type="text"
                value={bookNotes}
                onChange={e => setBookNotes(e.target.value)}
                placeholder={t.notesPlaceholder}
                className={`w-full bg-[#F9FAFB] border border-[#ECECEC] rounded-2xl px-4 py-2.5 text-xs text-[#101828] outline-none focus:border-[#D1AF47]/40 focus:shadow-[0_0_15px_rgba(209,175,71,0.1)] transition-all duration-300 placeholder:text-[#667085]/40 ${isRTL ? "text-right" : "text-left"}`}
              />
            </div>

            <div className={`flex justify-end gap-3 pt-3 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <button
                type="button"
                onClick={() => setShowBookModal(false)}
                className="px-5 py-2.5 bg-white border border-[#ECECEC] rounded-2xl text-[10px] font-bold uppercase tracking-wider text-[#667085] hover:bg-[#F9FAFB] transition-all duration-300"
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
        <div className="fixed inset-0 bg-[#101828]/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div
            className="bg-white border border-[#ECECEC] rounded-3xl p-7 max-w-sm w-full space-y-5 shadow-[0_12px_40px_rgba(0,0,0,0.02)]"
            style={{ animation: "modalIn 0.25s ease-out" }}
          >
            <h3 className={`font-bold text-base text-[#101828] ${isRTL ? "text-right" : "text-left"}`}>{t.detailsTitle}</h3>

            <div className="space-y-3.5">
              <div className={`flex justify-between text-xs ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <span className="text-[#667085]">{t.customer}:</span>
                <span className="font-bold text-[#101828]">{showDetailsModal.customer}</span>
              </div>
              <div className={`flex justify-between text-xs ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <span className="text-[#667085]">{t.service}:</span>
                <span className="font-bold text-[#101828]">{showDetailsModal.service}</span>
              </div>
              <div className={`flex justify-between text-xs ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <span className="text-[#667085]">{t.stylist}:</span>
                <span className="font-bold text-[#D1AF47]">{showDetailsModal.staff}</span>
              </div>
              <div className={`flex justify-between text-xs ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <span className="text-[#667085]">{t.time}:</span>
                <span className="font-bold text-[#101828]">{showDetailsModal.time}</span>
              </div>
              <div className={`flex justify-between text-xs ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <span className="text-[#667085]">{t.priceLabel}:</span>
                <span className="font-bold text-[#101828]">{showDetailsModal.price} SAR</span>
              </div>
              {showDetailsModal.notes && (
                <div className={`flex justify-between text-xs ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                  <span className="text-[#667085]">{t.notes}:</span>
                  <span className="font-semibold text-[#667085]">{showDetailsModal.notes}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2.5 pt-5 border-t border-[#ECECEC]">
              <button
                onClick={() => handleCancelBooking(showDetailsModal.id)}
                className="w-full py-2.5 bg-[#FF5D73]/[0.08] hover:bg-[#FF5D73]/[0.15] border border-[#FF5D73]/15 text-[#FF5D73] text-[10px] font-bold uppercase tracking-wider rounded-2xl hover:shadow-[0_0_15px_rgba(255,93,115,0.1)] transition-all duration-300"
              >
                {t.cancelBooking}
              </button>
              <button
                onClick={() => setShowDetailsModal(null)}
                className="w-full py-2.5 bg-white border border-[#ECECEC] text-[#667085] text-[10px] font-bold uppercase tracking-wider rounded-2xl hover:border-[#D1AF47]/40 hover:text-[#101828] transition-all duration-300"
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
