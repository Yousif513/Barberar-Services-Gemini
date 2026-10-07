import { Coordinates, CalculationMethod, PrayerTimes, Madhab } from "adhan";

// The paused windows around each prayer (Umm al-Qura, Shafi'i), as ISO instants for get_available_slots'
// prayer_window_starts / prayer_window_ends arguments. Same buffers as the shop page's booking flow, so a reschedule
// is offered exactly the times a new booking would be. Plain ES module so the web tests run it directly.
const BUFFER_MINUTES = { before: 10, after: 30 };

/**
 * @param {string} dateKey the booking day as YYYY-MM-DD
 * @param {number | string} latitude branch latitude
 * @param {number | string} longitude branch longitude
 * @returns {{ starts: string[], ends: string[] }} six windows: Fajr to Isha of the day and the next Fajr
 */
export function prayerWindowsForDate(dateKey, latitude, longitude) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!year || !month || !day || !Number.isFinite(lat) || !Number.isFinite(lng)) return { starts: [], ends: [] };
  const coordinates = new Coordinates(lat, lng);
  const params = CalculationMethod.UmmAlQura();
  params.madhab = Madhab.Shafi;
  const today = new PrayerTimes(coordinates, new Date(year, month - 1, day), params);
  const tomorrow = new PrayerTimes(coordinates, new Date(year, month - 1, day + 1), params);
  const times = [today.fajr, today.dhuhr, today.asr, today.maghrib, today.isha, tomorrow.fajr];
  return {
    starts: times.map((time) => new Date(time.getTime() - BUFFER_MINUTES.before * 60_000).toISOString()),
    ends: times.map((time) => new Date(time.getTime() + BUFFER_MINUTES.after * 60_000).toISOString()),
  };
}
