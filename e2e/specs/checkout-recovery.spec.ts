// Real local auth/booking/browser, controlled checkout receipts. No gateway request is dispatched.
import { randomUUID } from "node:crypto";
import { test, expect } from "../fixtures";
import { book, captureDeposit, slotWithin } from "../support/booking";
import { lit, one } from "../support/db";

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS", "content-type": "application/json" };
for (const locale of ["en", "ar"] as const) {
  test(`unknown checkout remains the same booking after reload and explicit retry (${locale})`, async ({ factory, openAs }, testInfo) => {
    const provider = await factory.provider();
    const customer = await factory.customer();
    const booking = await book(customer, provider, await slotWithin(customer, provider, 48, 96));
    const { page, errors } = await openAs(customer, { locale, width: locale === "ar" ? "phone" : "desktop" });
    const calls: Record<string, unknown>[] = [];
    const attemptId = randomUUID();
    await page.route("**/functions/v1/payment-checkout", async (route) => {
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      calls.push(route.request().postDataJSON());
      return route.fulfill({ status: 202, headers: cors,
        body: JSON.stringify({ success: false, state: "unknown", code: "checkout_unknown", attemptId, recoverable: true }) });
    });
    await page.goto("/customer/bookings");
    await page.getByRole("link", { name: locale === "ar" ? "متابعة الدفع" : "Continue payment", exact: true }).first().click();
    await expect(page).toHaveURL(new RegExp(`/customer/bookings/${booking.id}/confirmation$`));
    const pay = page.getByRole("button", { name: locale === "ar" ? /^ادفع العربون الآن/ : /^Pay deposit now/ });
    await expect(pay).toBeVisible();
    await pay.click();
    const message = locale === "ar" ? "تعذر تأكيد نتيجة الدفع" : "We could not confirm the payment outcome";
    await expect(page.getByRole("alert").filter({ hasText: message })).toContainText(message);
    await page.reload();
    await expect(pay).toBeVisible();
    await pay.click();
    await expect(page.getByRole("alert").filter({ hasText: message })).toContainText(message);
    await page.screenshot({ path: testInfo.outputPath(`checkout-held-${locale}.png`), fullPage: true });
    expect(calls).toEqual([{ bookingId: booking.id, action: "recover" }, { bookingId: booking.id, action: "recover" }]);
    const status = one<{ status: string }>(`select status::text as status from public.bookings where id=${lit(booking.id)}`).status;
    expect(status).toBe("pending_payment");
    expect(errors.unexpected()).toEqual([]);
  });
}

test("captured recovery refreshes the authoritative booking and removes Pay deposit", async ({ factory, openAs }) => {
  const provider = await factory.provider();
  const customer = await factory.customer();
  const booking = await book(customer, provider, await slotWithin(customer, provider, 48, 96));
  const { page, errors } = await openAs(customer, { locale: "en", width: "desktop" });
  const calls: Record<string, unknown>[] = [];
  await page.route("**/functions/v1/payment-checkout", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    calls.push(route.request().postDataJSON());
    await captureDeposit(booking.id, booking.deposit);
    return route.fulfill({ status: 202, headers: cors,
      body: JSON.stringify({ success: false, state: "captured", code: "payment_received", attemptId: randomUUID(), recoverable: true }) });
  });
  await page.goto(`/customer/bookings/${booking.id}/confirmation`);
  await page.getByRole("button", { name: /^Pay deposit now/ }).click();
  await expect(page.getByRole("heading", { name: "Booking Confirmed", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Pay deposit now/ })).toHaveCount(0);
  expect(calls).toEqual([{ bookingId: booking.id, action: "recover" }]);
  expect(errors.unexpected()).toEqual([]);
});
