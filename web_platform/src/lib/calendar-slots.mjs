// The provider calendar lays a day out in labelled slots ("09:00 AM", "03:30 PM"). A booking command needs an exact instant,
// and the platform runs on Riyadh time (UTC+3, no daylight saving), so a slot on a calendar day is that day's Riyadh date
// plus the slot's clock time at +03:00, whatever time zone the browser is in.
//
// Plain ES module with JSDoc types so the web tests run it directly.

/**
 * @param {string} label for example "12:00 PM"
 * @returns {{ hours: number, minutes: number } | null}
 */
export function parseSlotLabel(label) {
  const match = /^(\d{1,2}):(\d{2})\s?(AM|PM)$/i.exec(String(label ?? "").trim());
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 1 || hours > 12 || minutes > 59) return null;
  const pm = match[3].toUpperCase() === "PM";
  if (pm && hours !== 12) hours += 12;
  if (!pm && hours === 12) hours = 0;
  return { hours, minutes };
}

/**
 * @param {string} dateKey a Riyadh calendar day, YYYY-MM-DD
 * @param {string} label for example "03:30 PM"
 * @returns {string | null} for example 2026-10-08T15:30:00+03:00
 */
export function slotIso(dateKey, label) {
  const time = parseSlotLabel(label);
  if (!time || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey))) return null;
  return `${dateKey}T${String(time.hours).padStart(2, "0")}:${String(time.minutes).padStart(2, "0")}:00+03:00`;
}
