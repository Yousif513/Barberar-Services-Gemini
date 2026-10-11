// The prayer pauses the shop page passes to get_available_slots, reproduced for the receptionist so both offer the same times.
// web_platform/src/app/shop/[id]/page.tsx (getPrayerWindowsForDate): Umm al-Qura method, Shafi madhab, for the branch's coordinates; each of
// fajr, dhuhr, asr, maghrib, isha of the day plus the next day's fajr is paused from 10 minutes before to 30 minutes after.
// The calculation library is injected (the Edge Function imports `adhan`; a node test imports the same package), so this module stays pure.
// With no windows passed the database applies no prayer exclusion at all (docs/work-packages/fixbooking-report.md).

export interface PrayerInstants {
  fajr: Date
  dhuhr: Date
  asr: Date
  maghrib: Date
  isha: Date
}

export type PrayerClock = (latitude: number, longitude: number, date: Date) => PrayerInstants

export const PRAYER_BUFFER_BEFORE_MINUTES = 10
export const PRAYER_BUFFER_AFTER_MINUTES = 30

interface AdhanLibrary {
  Coordinates: new (latitude: number, longitude: number) => unknown
  CalculationMethod: { UmmAlQura(): { madhab: unknown } }
  PrayerTimes: new (coordinates: never, date: Date, parameters: never) => PrayerInstants
  Madhab: { Shafi: unknown }
}

/** The clock the shop uses, built from the `adhan` package namespace. */
export function makeAdhanClock(adhan: AdhanLibrary): PrayerClock {
  return (latitude, longitude, date) => {
    const parameters = adhan.CalculationMethod.UmmAlQura()
    parameters.madhab = adhan.Madhab.Shafi
    const times = new adhan.PrayerTimes(new adhan.Coordinates(latitude, longitude) as never, date, parameters as never)
    return { fajr: times.fajr, dhuhr: times.dhuhr, asr: times.asr, maghrib: times.maghrib, isha: times.isha }
  }
}

export interface PrayerWindows {
  starts: string[]
  ends: string[]
}

/** Six windows (five prayers and the next fajr) as ISO instants, in the arrays get_available_slots expects. */
export function prayerWindowsForDate(ymd: string, latitude: number, longitude: number, clock: PrayerClock): PrayerWindows {
  // Noon UTC keeps the calendar day the same in any runtime time zone.
  const day = new Date(`${ymd}T12:00:00Z`)
  const next = new Date(day.getTime() + 24 * 60 * 60 * 1000)
  const today = clock(latitude, longitude, day)
  const tomorrow = clock(latitude, longitude, next)
  const instants = [today.fajr, today.dhuhr, today.asr, today.maghrib, today.isha, tomorrow.fajr]
  const starts: string[] = []
  const ends: string[] = []
  for (const instant of instants) {
    starts.push(new Date(instant.getTime() - PRAYER_BUFFER_BEFORE_MINUTES * 60 * 1000).toISOString())
    ends.push(new Date(instant.getTime() + PRAYER_BUFFER_AFTER_MINUTES * 60 * 1000).toISOString())
  }
  return { starts, ends }
}
