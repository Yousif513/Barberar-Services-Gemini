// Checks for the owner's closures, seasonal schedules and the team's leave requests. They run before a request is sent so the
// person sees a reason next to the field; the database constraints (end_date >= start_date, the leave approval trigger) stay
// authoritative. Dates are Riyadh calendar days as YYYY-MM-DD strings, times are HH:MM.
//
// Plain ES module with JSDoc types so the web tests run it directly.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** @param {string} value */
const isRealDate = (value) => {
  if (!DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
};

/** Whole days from a to b, inclusive of both ends. @param {string} a @param {string} b */
export function daysInclusive(a, b) {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000) + 1;
}

/**
 * @param {{ start: string, end: string, today: string, maxDays: number, allowPast?: boolean }} input
 * @returns {"required" | "invalid" | "order" | "past" | "tooLong" | null}
 */
export function checkDateRange({ start, end, today, maxDays, allowPast = false }) {
  if (!start || !end) return "required";
  if (!isRealDate(start) || !isRealDate(end)) return "invalid";
  if (end < start) return "order";
  if (!allowPast && start < today) return "past";
  if (daysInclusive(start, end) > maxDays) return "tooLong";
  return null;
}

/** True when two inclusive date ranges share a day. @param {{start: string, end: string}} a @param {{start: string, end: string}} b */
export function rangesOverlap(a, b) {
  return a.start <= b.end && b.start <= a.end;
}

/** A closing time before the opening time on the same row means the shift ends after midnight. */
export function isOvernightShift(start, end) {
  return TIME.test(start) && TIME.test(end) && end < start;
}

/**
 * @param {{ name: string, start: string, end: string, startTime: string, endTime: string, secondShift: boolean, secondStartTime: string, secondEndTime: string, today: string }} season
 * @returns {"name" | "dates" | "times" | "sameTime" | "secondTimes" | "secondSameTime" | null}
 */
export function checkSeason(season) {
  const name = String(season.name ?? "").trim();
  if (name.length < 2 || name.length > 100) return "name";
  if (checkDateRange({ start: season.start, end: season.end, today: season.today, maxDays: 366 })) return "dates";
  if (!TIME.test(season.startTime) || !TIME.test(season.endTime)) return "times";
  if (season.startTime === season.endTime) return "sameTime";
  if (season.secondShift) {
    if (!TIME.test(season.secondStartTime) || !TIME.test(season.secondEndTime)) return "secondTimes";
    if (season.secondStartTime === season.secondEndTime) return "secondSameTime";
  }
  return null;
}

/** Leave: today or later, at most 90 days. @param {{ start: string, end: string, today: string }} input */
export function checkLeave({ start, end, today }) {
  return checkDateRange({ start, end, today, maxDays: 90 });
}

/** Closures: today or later, at most a year. @param {{ start: string, end: string, today: string }} input */
export function checkClosure({ start, end, today }) {
  return checkDateRange({ start, end, today, maxDays: 366 });
}
