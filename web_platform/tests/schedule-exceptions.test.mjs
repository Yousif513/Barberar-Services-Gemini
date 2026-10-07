import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkClosure, checkLeave, checkSeason, daysInclusive, isOvernightShift, rangesOverlap } from "../src/lib/schedule-exceptions.mjs";

const today = "2026-10-08";

describe("date ranges (R16)", () => {
  it("counts both ends", () => {
    assert.equal(daysInclusive("2026-10-08", "2026-10-08"), 1);
    assert.equal(daysInclusive("2026-10-08", "2026-10-10"), 3);
    assert.equal(daysInclusive("2026-02-27", "2026-03-02"), 4);
  });
  it("accepts today and later, refuses the past, a reversed range and non-dates", () => {
    assert.equal(checkClosure({ start: "2026-10-08", end: "2026-10-08", today }), null);
    assert.equal(checkClosure({ start: "2026-10-07", end: "2026-10-09", today }), "past");
    assert.equal(checkClosure({ start: "2026-10-12", end: "2026-10-10", today }), "order");
    assert.equal(checkClosure({ start: "", end: "2026-10-10", today }), "required");
    assert.equal(checkClosure({ start: "2026-02-30", end: "2026-03-02", today: "2026-01-01" }), "invalid");
    assert.equal(checkClosure({ start: "08/10/2026", end: "2026-10-10", today }), "invalid");
  });
  it("limits leave to 90 days and closures to a year", () => {
    assert.equal(checkLeave({ start: "2026-10-10", end: "2027-01-07", today }), null); // exactly 90 days
    assert.equal(checkLeave({ start: "2026-10-10", end: "2027-01-08", today }), "tooLong");
    assert.equal(checkClosure({ start: "2026-10-10", end: "2027-10-10", today }), null);
    assert.equal(checkClosure({ start: "2026-10-10", end: "2027-10-11", today }), "tooLong");
  });
  it("finds overlapping ranges, including touching days", () => {
    assert.equal(rangesOverlap({ start: "2026-10-10", end: "2026-10-12" }, { start: "2026-10-12", end: "2026-10-14" }), true);
    assert.equal(rangesOverlap({ start: "2026-10-10", end: "2026-10-11" }, { start: "2026-10-12", end: "2026-10-14" }), false);
  });
});

describe("seasonal schedules (R16)", () => {
  const base = { name: "Ramadan", start: "2027-02-18", end: "2027-03-19", startTime: "21:00", endTime: "02:00", secondShift: false, secondStartTime: "", secondEndTime: "", today };
  it("lets a Ramadan evening shift run past midnight", () => {
    assert.equal(checkSeason(base), null);
    assert.equal(isOvernightShift("21:00", "02:00"), true);
    assert.equal(isOvernightShift("09:00", "17:00"), false);
  });
  it("refuses an empty name, equal times and a half-set second shift", () => {
    assert.equal(checkSeason({ ...base, name: " " }), "name");
    assert.equal(checkSeason({ ...base, startTime: "09:00", endTime: "09:00" }), "sameTime");
    assert.equal(checkSeason({ ...base, startTime: "", endTime: "" }), "times");
    assert.equal(checkSeason({ ...base, secondShift: true }), "secondTimes");
    assert.equal(checkSeason({ ...base, secondShift: true, secondStartTime: "10:00", secondEndTime: "10:00" }), "secondSameTime");
    assert.equal(checkSeason({ ...base, secondShift: true, secondStartTime: "13:00", secondEndTime: "16:00" }), null);
  });
  it("refuses dates in the past", () => {
    assert.equal(checkSeason({ ...base, start: "2026-10-01" }), "dates");
  });
});
