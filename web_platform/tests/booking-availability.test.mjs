import assert from "node:assert/strict";
import { test } from "node:test";
import { loadBookingSlots } from "../src/lib/booking-availability.mjs";

const visit = {
  branchId: "branch-a", serviceIds: ["haircut", "beard"], specialistId: "any",
  date: "2030-10-20", prayerStarts: [], prayerEnds: [],
};
const slot = (time, candidates) => ({ slot_start: time, candidate_employee_ids: candidates });
const morning = "2030-10-20T07:00:00+00:00";
const afternoon = "2030-10-20T12:00:00+00:00";

test("availability sends the entire ordered visit with aligned variants to the server", async () => {
  const calls = [];
  const client = { rpc: async (...args) => { calls.push(args); return { data: [slot(morning, ["staff-a"])], error: null }; } };
  assert.deepEqual(await loadBookingSlots(client, visit), [morning]);
  assert.deepEqual(calls, [["get_branch_available_slots", {
    target_branch_id: "branch-a", target_service_id: "haircut", target_date: "2030-10-20",
    prayer_window_starts: [], prayer_window_ends: [], p_service_ids: ["haircut", "beard"], p_variant_ids: [null, null],
  }]]);
});

test("a named professional can only use slots where the server lists them as qualified for the full visit", async () => {
  const client = { rpc: async () => ({ data: [slot(morning, ["staff-a"]), slot(afternoon, ["staff-b"])], error: null }) };
  assert.deepEqual(await loadBookingSlots(client, { ...visit, specialistId: "staff-b" }), [afternoon]);
  assert.deepEqual(await loadBookingSlots(client, { ...visit, specialistId: "staff-c" }), []);
});

test("a successful empty schedule remains empty and never invents default times", async () => {
  assert.deepEqual(await loadBookingSlots({ rpc: async () => ({ data: [], error: null }) }, visit), []);
});

test("availability failures propagate and cannot be mistaken for an empty successful schedule", async () => {
  const refusal = { message: "Scheduling is temporarily unavailable", code: "42501" };
  await assert.rejects(loadBookingSlots({ rpc: async () => ({ data: null, error: refusal }) }, visit), (error) => error === refusal);
});

test("malformed or obsolete availability responses fail closed", async () => {
  for (const data of [null, {}, [slot("not-a-time", ["staff-a"])], [slot(morning, [])], [{ slot_start: morning }]]) {
    await assert.rejects(loadBookingSlots({ rpc: async () => ({ data, error: null }) }, visit), /invalid/);
  }
});

test("duplicate server rows expose each available start once", async () => {
  const client = { rpc: async () => ({ data: [slot(morning, ["staff-a"]), slot(morning, ["staff-b"])], error: null }) };
  assert.deepEqual(await loadBookingSlots(client, visit), [morning]);
});
