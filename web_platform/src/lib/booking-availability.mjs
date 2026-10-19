/**
 * Load the same complete visit that the booking command will validate. The
 * branch RPC resolves qualifications, staff durations, buffers and conflicts.
 * @param {{ rpc: Function }} client
 * @param {{ branchId: string, serviceIds: string[], specialistId: string, date: string,
 *   prayerStarts: string[], prayerEnds: string[] }} visit
 * @returns {Promise<string[]>}
 */
export async function loadBookingSlots(client, visit) {
  const { data, error } = await client.rpc("get_branch_available_slots", {
    target_branch_id: visit.branchId,
    target_service_id: visit.serviceIds[0],
    target_date: visit.date,
    prayer_window_starts: visit.prayerStarts,
    prayer_window_ends: visit.prayerEnds,
    p_service_ids: visit.serviceIds,
    p_variant_ids: visit.serviceIds.map(() => null),
  });
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error("Availability returned an invalid response.");
  const slots = [];
  for (const row of data) {
    if (typeof row?.slot_start !== "string" || !Number.isFinite(Date.parse(row.slot_start)) ||
        !Array.isArray(row.candidate_employee_ids) || row.candidate_employee_ids.length === 0) {
      throw new Error("Availability returned an invalid slot.");
    }
    if (visit.specialistId === "any" || row.candidate_employee_ids.includes(visit.specialistId)) {
      slots.push(row.slot_start);
    }
  }
  return [...new Set(slots)];
}
