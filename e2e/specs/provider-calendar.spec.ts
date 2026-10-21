// Provider calendar basics: the owner sees a customer's booking on the day and in the week it falls in, a cancelled booking
// leaves the planner, and another provider's owner never sees it. The booking day is derived from the database clock (three
// days ahead, 10:00 Riyadh), and the browser clock is fixed with page.clock where the screen's notion of "today" matters.

import { test, expect } from "../fixtures";
import { book, captureDeposit, riyadhDate } from "../support/booking";
import { dbNow, lit, one, sql } from "../support/db";
import { rpc } from "../support/api";
import { stack } from "../support/stack";

test("the owner finds the booking on its day and in its week; once cancelled it leaves the planner", async ({ factory, openAs }) => {
  const provider = await factory.provider();
  const customer = await factory.customer({ firstName: "Calendar", lastName: "Guest" });
  const day = riyadhDate(new Date(dbNow().getTime() + 3 * 86_400_000));
  const booking = await book(customer, provider, `${day}T10:00:00+03:00`);
  await captureDeposit(booking.id, booking.deposit);

  const { page, errors } = await openAs(provider.owner, { locale: "en", width: "desktop" });
  await page.goto("/provider/calendar");
  await expect(page.getByRole("button", { name: "Day View" })).toBeVisible();
  const dateInput = page.locator('input[type="date"]').first();
  await dateInput.fill(day);
  await expect(page.getByText(provider.serviceName).first()).toBeVisible();
  await expect(page.getByText("Calendar Guest").first()).toBeVisible();

  await page.getByRole("button", { name: "Week View" }).click();
  await expect(page.getByText(provider.serviceName).first()).toBeVisible();

  // Cancelled by the customer elsewhere: the planner no longer offers it after a reload.
  expect((await rpc("cancel_booking", { target_booking_id: booking.id }, customer.session.access_token)).status).toBe(200);
  await page.reload();
  await expect(page.getByRole("button", { name: "Day View" })).toBeVisible();
  await page.locator('input[type="date"]').first().fill(day);
  await expect(page.getByText("Calendar Guest")).toHaveCount(0);
  expect(errors.unexpected()).toEqual([]);
});

test("another provider's owner does not see the booking through the calendar's own query", async ({ factory }) => {
  const provider = await factory.provider();
  const other = await factory.provider();
  const customer = await factory.customer();
  const day = riyadhDate(new Date(dbNow().getTime() + 3 * 86_400_000));
  const booking = await book(customer, provider, `${day}T11:00:00+03:00`);
  const s = stack();
  const read = async (token: string) => (await fetch(`${s.apiUrl}/rest/v1/bookings?select=id&id=eq.${booking.id}`, {
    headers: { apikey: s.anonKey, authorization: `Bearer ${token}` },
  })).json();
  expect(await read(provider.owner.session.access_token)).toHaveLength(1);
  expect(await read(other.owner.session.access_token)).toEqual([]);
});

// Fixed (QAFIX): the date picker shows the Riyadh day (riyadhDateKey), so between 00:00 and 03:00 Riyadh it shows today.
test("just after midnight in Riyadh the date picker shows today's date", async ({ factory, openAs }) => {
  const provider = await factory.provider();
  // The most recent 01:30 Riyadh time that is not in the future (the session's tokens stay valid on a clock set back).
  const now = dbNow();
  let at = new Date(`${riyadhDate(now)}T01:30:00+03:00`);
  if (at.getTime() > now.getTime()) at = new Date(at.getTime() - 86_400_000);
  const { page } = await openAs(provider.owner, { locale: "en", width: "desktop" });
  await page.clock.install({ time: at });
  await page.goto("/provider/calendar");
  await expect(page.getByRole("button", { name: "Day View" })).toBeVisible();
  await expect(page.locator('input[type="date"]').first()).toHaveValue(riyadhDate(at), { timeout: 5_000 });
});

// These cases replace only the first local Data API write response. The explicit retry writes to the real
// disposable provider's availability row, so a schema refusal or missing receipt cannot become a reduced save.
for (const scenario of [
  { locale: "en" as const, failure: "refused", heading: "Roster Working Hours", add: "Add second shift",
    remove: "Remove second shift", opening: "Select hour: Second Shift · Opening", save: "Save", busy: "Saving...",
    error: "Failed to save working hours.", success: "Working hours updated successfully." },
  { locale: "ar" as const, failure: "empty receipt", heading: "ساعات عمل الموظفين أسبوعياً", add: "إضافة مناوبة ثانية",
    remove: "إزالة المناوبة الثانية", opening: "اختر الساعة: المناوبة الثانية · الافتتاح", save: "حفظ التعديلات", busy: "جارٍ الحفظ...",
    error: "فشل حفظ ساعات العمل", success: "تم حفظ ساعات العمل بنجاح" },
]) {
  test(`a ${scenario.failure} working-hours save keeps both shifts for an explicit retry (${scenario.locale})`, async ({ factory, openAs }, testInfo) => {
    const provider = await factory.provider();
    sql(`update public.employee_availability
            set start_time = '09:00:00', end_time = '12:00:00', has_second_shift = false,
                second_start_time = null, second_end_time = null
          where employee_id = ${lit(provider.employeeId)};`);
    const { page, errors } = await openAs(provider.owner, { locale: scenario.locale, width: "desktop" });
    const writes: Record<string, unknown>[] = [];
    let releaseFirst!: () => void;
    const firstReply = new Promise<void>((done) => { releaseFirst = done; });
    const responseHeaders = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "content-type": "application/json",
    };
    await page.route("**/rest/v1/employee_availability*", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      writes.push(route.request().postDataJSON() as Record<string, unknown>);
      if (writes.length > 1) return route.continue();
      await firstReply;
      return route.fulfill({
        status: scenario.failure === "refused" ? 400 : 200,
        headers: responseHeaders,
        body: scenario.failure === "refused"
          ? JSON.stringify({ code: "PGRST204", message: "Second-shift column not found in the schema cache.", details: null, hint: null })
          : "null",
      });
    });

    try {
      await page.goto("/provider/calendar");
      const roster = page.getByRole("heading", { name: scenario.heading, exact: true }).locator("..").locator("..");
      await expect(roster.getByRole("button", { name: "09:00 AM", exact: true })).toBeVisible();
      await roster.getByRole("button", { name: scenario.add, exact: true }).click();
      await roster.getByRole("button", { name: "02:00 PM", exact: true }).click();
      await roster.getByRole("listbox", { name: scenario.opening, exact: true }).getByRole("option", { name: "03:00", exact: true }).click();
      const day = Number(await roster.locator("select").first().inputValue());

      await page.getByRole("button", { name: scenario.locale === "ar" ? "عرض الأسبوع" : "Week View", exact: true }).click();
      await roster.getByRole("button", { name: scenario.save, exact: true }).click();
      await expect.poll(() => writes.length).toBe(1);
      await expect(roster.getByRole("button", { name: scenario.busy, exact: true })).toBeDisabled();
      await expect(roster.locator("select").first()).toBeDisabled();
      await expect(roster.getByRole("switch")).toBeDisabled();
      await expect(roster.getByRole("button", { name: scenario.remove, exact: true })).toBeDisabled();
      await expect(roster.getByRole("button", { name: "03:00 PM", exact: true })).toBeDisabled();
      await expect(page.locator("select").filter({ has: page.locator(`option[value="${provider.employeeId}"]`) })).toBeDisabled();
      await expect(page.locator('input[type="date"]').first()).toBeDisabled();
      await expect(page.getByRole("button", { name: scenario.locale === "ar" ? "اليوم" : "Today", exact: true })).toBeDisabled();
      const weekDays = page.getByRole("button", { name: scenario.locale === "ar"
        ? /^(الأحد|الإثنين|الثلاثاء|الأربعاء|الخميس|الجمعة|السبت)\s*\d+$/
        : /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s*\d+$/ });
      await expect(weekDays).toHaveCount(7);
      for (const dayButton of await weekDays.all()) await expect(dayButton).toBeDisabled();
      expect(writes[0]).toEqual({
        employee_id: provider.employeeId, day_of_week: day, start_time: "09:00:00", end_time: "12:00:00",
        is_working_day: true, has_second_shift: true, second_start_time: "15:00:00", second_end_time: "22:00:00",
      });
      releaseFirst();

      await expect(roster.getByRole("alert")).toHaveText(scenario.error);
      await expect(roster.getByRole("status")).toHaveCount(0);
      await expect(roster.getByRole("button", { name: scenario.save, exact: true })).toBeEnabled();
      await expect(roster.getByRole("button", { name: scenario.remove, exact: true })).toBeVisible();
      await expect(roster.getByRole("button", { name: "03:00 PM", exact: true })).toBeVisible();
      expect(writes).toHaveLength(1);
      await roster.screenshot({ path: testInfo.outputPath(`working-hours-failed-${scenario.locale}.png`) });
      expect(one<{ has_second_shift: boolean }>(`select has_second_shift from public.employee_availability
                where employee_id = ${lit(provider.employeeId)} and day_of_week = ${day}`).has_second_shift).toBe(false);

      await page.unroute("**/rest/v1/employee_availability*");
      await roster.getByRole("button", { name: scenario.save, exact: true }).click();
      await expect(roster.getByRole("status")).toHaveText(scenario.success);
      await expect(roster.getByRole("alert")).toHaveCount(0);
      await roster.screenshot({ path: testInfo.outputPath(`working-hours-saved-${scenario.locale}.png`) });
      expect(one(`select start_time, end_time, is_working_day, has_second_shift, second_start_time, second_end_time
                    from public.employee_availability
                   where employee_id = ${lit(provider.employeeId)} and day_of_week = ${day}`)).toEqual({
        start_time: "09:00:00", end_time: "12:00:00", is_working_day: true,
        has_second_shift: true, second_start_time: "15:00:00", second_end_time: "22:00:00",
      });
      await page.reload();
      await expect(roster.getByRole("button", { name: scenario.remove, exact: true })).toBeVisible();
      await expect(roster.getByRole("button", { name: "03:00 PM", exact: true })).toBeVisible();
      expect(errors.unexpected([/Error saving shift:/, /400 \(Bad Request\)/])).toEqual([]);
    } finally {
      releaseFirst();
    }
  });
}

test("a confirmed working-hours write with a failed calendar refresh asks for reload without reporting save failure", async ({ factory, openAs }) => {
  const provider = await factory.provider();
  sql(`update public.employee_availability set start_time = '09:00:00', end_time = '12:00:00'
        where employee_id = ${lit(provider.employeeId)};`);
  const { page, errors } = await openAs(provider.owner, { locale: "en", width: "desktop" });
  await page.goto("/provider/calendar");
  const roster = page.getByRole("heading", { name: "Roster Working Hours", exact: true }).locator("..").locator("..");
  await expect(roster.getByRole("button", { name: "09:00 AM", exact: true }).first()).toBeVisible();
  const day = Number(await roster.locator("select").first().inputValue());
  await roster.getByRole("button", { name: "Add second shift", exact: true }).click();
  let writeDispatched = false;
  await page.route("**/rest/v1/employee_availability*", async (route) => {
    if (route.request().method() === "POST") {
      writeDispatched = true;
      return route.continue();
    }
    if (route.request().method() === "GET" && writeDispatched) {
      return route.fulfill({ status: 503, headers: { "access-control-allow-origin": "*" }, contentType: "application/json",
        body: JSON.stringify({ code: "TEST_REFRESH_UNAVAILABLE", message: "Local test refresh is unavailable.", details: null, hint: null }) });
    }
    return route.continue();
  });
  await roster.getByRole("button", { name: "Save", exact: true }).click();
  await expect(roster.getByRole("alert")).toHaveText("Working hours were saved, but the calendar could not refresh. Reload working hours.");
  await expect(roster.getByRole("status")).toHaveCount(0);
  await expect(roster.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  expect(one<{ has_second_shift: boolean }>(`select has_second_shift from public.employee_availability
             where employee_id = ${lit(provider.employeeId)} and day_of_week = ${day}`).has_second_shift).toBe(true);
  await page.unroute("**/rest/v1/employee_availability*");
  await roster.getByRole("button", { name: "Reload working hours", exact: true }).click();
  await expect(roster.getByRole("button", { name: "Remove second shift", exact: true })).toBeVisible();
  await expect(roster.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  await expect(roster.getByRole("alert")).toHaveCount(0);
  expect(errors.unexpected([/Error loading employee shifts\/bookings:/, /503 \(Service Unavailable\)/])).toEqual([]);
});


test("working-hours reads gate saving, discard an old day response and recover from a failed read locally", async ({ factory, openAs }) => {
  const provider = await factory.provider();
  sql(`update public.employee_availability set start_time = '09:00:00', end_time = '12:00:00'
        where employee_id = ${lit(provider.employeeId)};`);
  const { page, errors } = await openAs(provider.owner, { locale: "en", width: "desktop" });
  let releaseFirst!: () => void;
  const firstReply = new Promise<void>((done) => { releaseFirst = done; });
  let reads = 0;
  let writes = 0;
  let failRead = false;
  let holdInitial = true;
  const heldRequests: import("@playwright/test").Request[] = [];
  await page.route("**/rest/v1/employee_availability*", async (route) => {
    if (route.request().method() === "POST") { writes += 1; return route.continue(); }
    if (route.request().method() !== "GET") return route.continue();
    reads += 1;
    if (holdInitial) { heldRequests.push(route.request()); await firstReply; }
    if (failRead) return route.fulfill({ status: 503, headers: { "access-control-allow-origin": "*" }, contentType: "application/json",
      body: JSON.stringify({ code: "TEST_READ_UNAVAILABLE", message: "Local test read unavailable.", details: null, hint: null }) });
    return route.continue();
  });

  try {
    await page.goto("/provider/calendar");
    const roster = page.getByRole("heading", { name: "Roster Working Hours", exact: true }).locator("..").locator("..");
    const save = roster.getByRole("button", { name: "Save", exact: true });
    const editDay = roster.locator("select").first();
    await expect.poll(() => reads).toBeGreaterThan(0);
    await expect(save).toBeDisabled();
    await expect(roster.getByRole("button", { name: "08:00 AM", exact: true })).toBeDisabled();
    const originalDay = Number(await editDay.inputValue());
    const currentDay = (originalDay + 1) % 7;
    sql(`update public.employee_availability set start_time = '15:00:00', end_time = '18:00:00'
          where employee_id = ${lit(provider.employeeId)} and day_of_week = ${currentDay};`);
    holdInitial = false;
    await editDay.selectOption(String(currentDay));
    await expect(roster.getByRole("button", { name: "03:00 PM", exact: true })).toBeVisible();
    await expect(save).toBeEnabled();
    const oldResponses = Promise.all(heldRequests.map((request) => page.waitForResponse((response) => response.request() === request)));
    releaseFirst();
    await Promise.all((await oldResponses).map((response) => response.finished()));
    await expect(editDay).toHaveValue(String(currentDay));
    await expect(roster.getByRole("button", { name: "03:00 PM", exact: true })).toBeVisible();
    await expect(roster.getByRole("button", { name: "09:00 AM", exact: true })).toHaveCount(0);
    await expect(save).toBeEnabled();

    failRead = true;
    await editDay.selectOption(String((originalDay + 2) % 7));
    await expect(roster.getByRole("alert")).toHaveText("Failed to load employee schedule and shifts.");
    await expect(save).toBeDisabled();
    await expect(roster.getByRole("button", { name: "03:00 PM", exact: true })).toBeDisabled();
    failRead = false;
    await roster.getByRole("button", { name: "Reload working hours", exact: true }).click();
    await expect(roster.getByRole("button", { name: "09:00 AM", exact: true })).toBeVisible();
    await expect(save).toBeEnabled();
    await expect(roster.getByRole("alert")).toHaveCount(0);

    const missingDay = (originalDay + 3) % 7;
    sql(`delete from public.employee_availability where employee_id = ${lit(provider.employeeId)} and day_of_week = ${missingDay};`);
    await editDay.selectOption(String(missingDay));
    await expect(roster.getByRole("button", { name: "08:00 AM", exact: true })).toBeVisible();
    await expect(save).toBeEnabled();
    expect(writes).toBe(0);
    expect(errors.unexpected([/Error loading employee shifts\/bookings:/, /503 \(Service Unavailable\)/])).toEqual([]);
  } finally {
    releaseFirst();
  }
});
