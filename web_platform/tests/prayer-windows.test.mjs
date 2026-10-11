import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { prayerWindowsForDate } from "../src/lib/prayer-windows.mjs";

// The reschedule dialog sends these windows to get_available_slots, as the shop page does for a new booking (R3, R7).
describe("prayer windows for the reschedule slot query", () => {
  it("returns six ordered windows for a Riyadh day, Dhuhr around midday local time", () => {
    const { starts, ends } = prayerWindowsForDate("2026-10-08", 24.7136, 46.6753);
    assert.equal(starts.length, 6);
    assert.equal(ends.length, 6);
    for (let i = 0; i < 6; i += 1) assert.ok(new Date(starts[i]) < new Date(ends[i]), `window ${i} is not empty`);
    for (let i = 1; i < 6; i += 1) assert.ok(new Date(starts[i]) > new Date(starts[i - 1]), `window ${i} comes after window ${i - 1}`);
    // The window is 10 minutes before to 30 minutes after the prayer: 40 minutes long.
    assert.equal((new Date(ends[1]) - new Date(starts[1])) / 60000, 40);
    // Dhuhr in Riyadh in October is about 11:30 local, which is 08:30 UTC.
    const dhuhrUtcHour = new Date(starts[1]).getUTCHours() + new Date(starts[1]).getUTCMinutes() / 60;
    assert.ok(dhuhrUtcHour > 8 && dhuhrUtcHour < 9.5, `Dhuhr window starts at ${dhuhrUtcHour} UTC`);
  });

  it("sends no windows rather than guessed ones when the date or the coordinates are unusable", () => {
    assert.deepEqual(prayerWindowsForDate("", 24.7, 46.7), { starts: [], ends: [] });
    assert.deepEqual(prayerWindowsForDate("2026-10-08", "x", 46.7), { starts: [], ends: [] });
  });
});
