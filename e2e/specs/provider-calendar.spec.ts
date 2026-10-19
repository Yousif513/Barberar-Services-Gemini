// Provider calendar basics: the owner sees a customer's booking on the day and in the week it falls in, a cancelled booking
// leaves the planner, and another provider's owner never sees it. The booking day is derived from the database clock (three
// days ahead, 10:00 Riyadh), and the browser clock is fixed with page.clock where the screen's notion of "today" matters.

import { test, expect } from "../fixtures";
import { book, captureDeposit, riyadhDate } from "../support/booking";
import { dbNow } from "../support/db";
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
