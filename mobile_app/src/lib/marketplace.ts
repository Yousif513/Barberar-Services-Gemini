import { CalculationMethod, Coordinates, Madhab, PrayerTimes } from "adhan";
import { supabase } from "./supabase";

export type Locale = "en" | "ar";
export type Bilingual = { en: string; ar: string };

// One row of search_marketplace_providers: a verified provider branch with real ratings.
export interface MarketplaceProvider {
  providerId: string;
  branchId: string;
  name: Bilingual;
  branchName: Bilingual;
  city: string;
  district: string;
  latitude: number | null;
  longitude: number | null;
  distanceKm: number | null;
  crVerified: boolean;
  rating: number | null;
  reviews: number;
  startingPrice: number | null;
}

export interface Category {
  id: string;
  slug: string;
  name: Bilingual;
}

export interface ShopService {
  id: string;
  name: Bilingual;
  category: Bilingual;
  price: number;
  duration: number;
}

export interface ShopSpecialist {
  id: string;
  name: Bilingual;
  role: Bilingual;
  avatar: string;
}

export interface ShopPackage {
  id: string;
  name: Bilingual;
  description: Bilingual;
  price: number;
  sessionCount: number;
  expiresInDays: number;
}

export interface ShopReview {
  id: string;
  rating: number;
  comment: string;
  reply: string;
  createdAt: string;
  authorName: string;
}

export interface ShopDetails {
  description: Bilingual;
  address: Bilingual;
  coverImage: string;
  depositPercentage: number;
  freeCancellationHours: number;
  lateCancellationFeePercent: number;
  noShowFeePercent: number;
  latitude: number | null;
  longitude: number | null;
  services: ShopService[];
  specialists: ShopSpecialist[];
  packages: ShopPackage[];
  reviews: ShopReview[];
}

// Saudi VAT rate used only for the on-screen estimate; the server prices every booking.
export const VAT_RATE = 0.15;

// Riyadh is the fallback reference point for prayer times when a branch has no coordinates.
const RIYADH = { lat: 24.7136, lng: 46.6753 };

const both = (en?: string | null, ar?: string | null): Bilingual => ({
  en: en || ar || "",
  ar: ar || en || "",
});

const num = (value: unknown): number | null =>
  value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);

export async function searchProviders(params: {
  query?: string;
  category?: string;
  city?: string;
  district?: string;
  limit?: number;
  offset?: number;
}): Promise<{ providers: MarketplaceProvider[]; total: number }> {
  const { data, error } = await supabase.rpc("search_marketplace_providers", {
    p_query: params.query?.trim() || null,
    p_category: params.category || "all",
    p_city: params.city || "all",
    p_district: params.district || "all",
    p_limit: params.limit ?? 20,
    p_offset: params.offset ?? 0,
  });
  if (error) throw error;
  const rows: any[] = Array.isArray(data?.providers) ? data.providers : [];
  return {
    total: Number(data?.total_count ?? rows.length),
    providers: rows.map((row) => {
      const prices = (Array.isArray(row.sample_services) ? row.sample_services : [])
        .map((s: any) => num(s.price))
        .filter((p: number | null): p is number => p !== null);
      return {
        providerId: row.provider_id,
        branchId: row.branch_id,
        name: both(row.business_name_en, row.business_name_ar),
        branchName: both(row.branch_name_en, row.branch_name_ar),
        city: row.city || "",
        district: row.district || "",
        latitude: num(row.latitude),
        longitude: num(row.longitude),
        distanceKm: num(row.distance_km),
        crVerified: row.cr_verification_status === "verified",
        rating: num(row.rating),
        reviews: Number(row.reviews || 0),
        startingPrice: prices.length ? Math.min(...prices) : null,
      };
    }),
  };
}

export async function loadCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, slug, name_en, name_ar")
    .eq("is_active", true)
    .is("parent_id", null)
    .order("name_en", { ascending: true });
  if (error) throw error;
  return (data || []).map((c: any) => ({ id: c.id, slug: c.slug, name: both(c.name_en, c.name_ar) }));
}

export async function loadShopDetails(providerId: string, branchId: string): Promise<ShopDetails> {
  const [providerRes, branchRes, serviceRes, employeeRes, packageRes, reviewRes] = await Promise.all([
    supabase.from("providers")
      .select("description_en, description_ar, cover_image_url, logo_url, deposit_percentage, free_cancellation_hours, late_cancellation_fee_percent, no_show_fee_percent")
      .eq("id", providerId).maybeSingle(),
    supabase.from("branches").select("address_text_en, address_text_ar, latitude, longitude").eq("id", branchId).maybeSingle(),
    supabase.from("services").select("id, name_en, name_ar, base_price, base_duration_minutes, categories(name_en, name_ar)")
      .eq("provider_id", providerId).eq("is_active", true).order("sort_order", { ascending: true }),
    supabase.from("employees").select("id, name_en, name_ar, title_en, title_ar, photo_url")
      .eq("branch_id", branchId).eq("is_active", true),
    supabase.from("packages").select("id, name_en, name_ar, description_en, description_ar, price, session_count, expires_in_days")
      .eq("provider_id", providerId).eq("is_active", true),
    supabase.rpc("public_provider_reviews", { p_provider_id: providerId, p_limit: 30 }),
  ]);
  for (const res of [providerRes, branchRes, serviceRes, employeeRes, packageRes, reviewRes]) {
    if (res.error) throw res.error;
  }
  const provider: any = providerRes.data;
  const branch: any = branchRes.data;
  if (!provider || !branch) throw new Error("This shop is no longer available.");

  return {
    description: both(provider.description_en, provider.description_ar),
    address: both(branch.address_text_en, branch.address_text_ar),
    coverImage: provider.cover_image_url || provider.logo_url || "",
    depositPercentage: Number(provider.deposit_percentage ?? 20),
    freeCancellationHours: Number(provider.free_cancellation_hours ?? 24),
    lateCancellationFeePercent: Number(provider.late_cancellation_fee_percent ?? 0),
    noShowFeePercent: Number(provider.no_show_fee_percent ?? 0),
    latitude: num(branch.latitude),
    longitude: num(branch.longitude),
    services: (serviceRes.data || []).map((s: any) => ({
      id: s.id,
      name: both(s.name_en, s.name_ar),
      category: both(s.categories?.name_en, s.categories?.name_ar),
      price: Number(s.base_price),
      duration: Number(s.base_duration_minutes),
    })),
    specialists: (employeeRes.data || []).map((e: any) => ({
      id: e.id,
      name: both(e.name_en, e.name_ar),
      role: both(e.title_en, e.title_ar),
      avatar: e.photo_url || "",
    })),
    packages: (packageRes.data || []).map((p: any) => ({
      id: p.id,
      name: both(p.name_en, p.name_ar),
      description: both(p.description_en, p.description_ar),
      price: Number(p.price),
      sessionCount: Number(p.session_count),
      expiresInDays: Number(p.expires_in_days),
    })),
    reviews: (reviewRes.data || [])
      .filter((r: any) => (r.moderation_status || "published") === "published")
      .map((r: any) => ({
        id: r.id,
        rating: Number(r.rating),
        comment: r.comment || "",
        reply: r.reply_comment || "",
        createdAt: r.created_at,
        authorName: [r.reviewer_first_name, r.reviewer_last_initial]
          .filter(Boolean).join(" "),
      })),
  };
}

// Prayer windows (Umm al-Qura) for a branch-local date. The slot RPCs exclude them server-side.
export function prayerWindowsFor(date: string, lat: number | null, lng: number | null) {
  const coords = new Coordinates(lat ?? RIYADH.lat, lng ?? RIYADH.lng);
  const params = CalculationMethod.UmmAlQura();
  params.madhab = Madhab.Shafi;
  const day = new Date(`${date}T12:00:00+03:00`);
  const next = new Date(day.getTime() + 86400000);
  const today = new PrayerTimes(coords, day, params);
  const tomorrow = new PrayerTimes(coords, next, params);
  const times = [today.fajr, today.dhuhr, today.asr, today.maghrib, today.isha, tomorrow.fajr];
  return {
    starts: times.map((t) => new Date(t.getTime() - 10 * 60000).toISOString()),
    ends: times.map((t) => new Date(t.getTime() + 30 * 60000).toISOString()),
  };
}

export async function loadAvailableSlots(params: {
  branchId: string;
  serviceId: string;
  employeeId: string | null;
  durationMinutes: number;
  date: string;
  lat: number | null;
  lng: number | null;
}): Promise<string[]> {
  const { starts, ends } = prayerWindowsFor(params.date, params.lat, params.lng);
  const { data, error } = params.employeeId
    ? await supabase.rpc("get_available_slots", {
        target_employee_id: params.employeeId,
        target_date: params.date,
        service_duration_minutes: params.durationMinutes,
        prayer_window_starts: starts,
        prayer_window_ends: ends,
      })
    : await supabase.rpc("get_branch_available_slots", {
        target_branch_id: params.branchId,
        target_service_id: params.serviceId,
        target_date: params.date,
        prayer_window_starts: starts,
        prayer_window_ends: ends,
      });
  if (error) throw error;
  return (data || []).map((s: any) => s.slot_start as string);
}

// Riyadh-local calendar date (YYYY-MM-DD) offset by a number of days from today.
export function riyadhDate(offsetDays: number): string {
  return new Date(Date.now() + 3 * 3600000 + offsetDays * 86400000).toISOString().slice(0, 10);
}

export const formatSlotLabel = (iso: string, locale: Locale) =>
  new Date(iso).toLocaleTimeString(locale === "ar" ? "ar-SA" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Riyadh",
  });

export const formatSar = (amount: number, locale: Locale) =>
  `${amount.toLocaleString(locale === "ar" ? "ar-SA" : "en-US", { maximumFractionDigits: 2 })} ${locale === "ar" ? "ر.س" : "SAR"}`;
