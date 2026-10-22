// Customer booking and deposit, and the cancellation and refund rules (provider booking policy).
//
// Booking runs through the provider's shop page in the browser. Tap is stood in for at the network edge (support/booking.ts):
// the checkout call never reaches a payment gateway, and the deposit is confirmed the way the webhook confirms it. The
// cancellation rules use bookings made through the same server command, at times taken from the database clock, so the
// free-cancellation window (24 h) is crossed by choosing the slot, never by waiting or by the test machine's date.

import { test, expect } from "../fixtures";
import { book, captureDeposit, riyadhDate, slotWithin, stubTap } from "../support/booking";
import { dbNow, one, rows } from "../support/db";
import { rpc, serviceRpc } from "../support/api";

type BookingRow = { status: string; deposit_required: string; cancellation_fee: string | null; refund_amount: string | null; cancelled_by: string | null };
const bookingRow = (id: string) => one<BookingRow>(`select status::text as status, deposit_required::text as deposit_required,
  cancellation_fee::text as cancellation_fee, refund_amount::text as refund_amount, cancelled_by from public.bookings where id = '${id}'`);
const refundRequests = (bookingId: string) => rows<{ amount: string; source: string }>(`select amount::text as amount, source from public.refund_requests where booking_id = '${bookingId}'`);
const money = (value: string | number | null) => Number(value ?? 0).toFixed(2);

test("a customer books on the shop page, pays the deposit through Tap (stubbed), and the booking is confirmed", async ({ factory, openAs }) => {
  const provider = await factory.provider({ price: 200, depositPercent: 20 });
  const customer = await factory.customer();
  const { page, errors } = await openAs(customer, { locale: "en", width: "desktop" });
  const tap = await stubTap(page);

  await page.goto(`/shop/${provider.providerId}`);
  await page.getByRole("button", { name: new RegExp(provider.serviceName) }).click();
  await page.getByRole("button", { name: new RegExp(provider.employeeName) }).click();
  await page.getByLabel("Select Date").fill(riyadhDate(new Date(dbNow().getTime() + 3 * 86_400_000)));
  const firstFree = page.getByRole("button", { pressed: false }).filter({ hasText: /^\s*\d{1,2}:\d{2}\s*(am|pm)\s*$/i }).first();
  const slot = page.getByRole("button", { name: (await firstFree.innerText()).trim(), exact: true });
  await slot.click();
  await expect(slot).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Confirm & pay deposit" }).click();

  // Back from the (stubbed) hosted payment page on the app's own return address.
  await expect(page).toHaveURL(/\/customer\/bookings\?payment=/);
  expect(tap.checkoutRequests).toHaveLength(2);
  // Recovery is read-only; a new attempt is allowed only after the explicit not-found receipt.
  expect(tap.checkoutRequests[0]).toMatchObject({ action: "recover" });
  expect(Object.keys(tap.checkoutRequests[1])).toEqual(["bookingId"]);
  const bookingId = String(tap.checkoutRequests[1].bookingId);
  expect(tap.checkoutRequests[0].bookingId).toBe(bookingId);

  const booked = bookingRow(bookingId);
  expect(booked.status).toBe("confirmed");
  expect(money(booked.deposit_required)).toBe(money((provider.servicePrice * provider.depositPercent) / 100));
  const ledger = one<{ captured: string; intent: string }>(`select total_captured::text as captured, payment_intent_id as intent
    from public.transactional_ledger where booking_id = '${bookingId}'`);
  expect(money(ledger.captured)).toBe(money(booked.deposit_required));
  expect(ledger.intent).toBe(tap.chargeIds[0]);
  await expect(page.getByText(provider.serviceName).first()).toBeVisible();
  expect(errors.unexpected([/status of 404.*\/functions\/v1\/payment-checkout/])).toEqual([]);
});

test("free window: cancelling a paid booking more than 24 h ahead refunds the whole deposit (EN, 1440 px)", async ({ factory, openAs }) => {
  const provider = await factory.provider({ price: 200, depositPercent: 20, freeCancellationHours: 24, lateCancellationFeePercent: 50 });
  const customer = await factory.customer();
  const booking = await book(customer, provider, await slotWithin(customer, provider, 48, 96));
  await captureDeposit(booking.id, booking.deposit);

  const { page, errors } = await openAs(customer, { locale: "en", width: "desktop" });
  await page.goto("/customer/bookings");
  await page.getByRole("button", { name: "Cancel Appointment" }).click();
  const dialog = page.getByRole("dialog", { name: "Cancel Appointment" });
  await expect(dialog).toContainText("You are inside the free-cancellation window");
  await dialog.getByRole("button", { name: "Yes, Cancel" }).click();
  await expect(page.getByRole("status")).toContainText("Booking cancelled. Refund requested:");

  const row = bookingRow(booking.id);
  expect(row).toMatchObject({ status: "cancelled", cancelled_by: "customer" });
  expect(money(row.cancellation_fee)).toBe("0.00");
  expect(money(row.refund_amount)).toBe(money(booking.deposit));
  expect(refundRequests(booking.id).map((r) => [money(r.amount), r.source])).toEqual([[money(booking.deposit), "customer_cancellation"]]);
  expect(errors.unexpected()).toEqual([]);
});

test("late: cancelling a paid booking inside 24 h keeps the provider's late fee (AR, 375 px)", async ({ factory, openAs }) => {
  const provider = await factory.provider({ price: 200, depositPercent: 20, freeCancellationHours: 24, lateCancellationFeePercent: 50 });
  const customer = await factory.customer();
  const booking = await book(customer, provider, await slotWithin(customer, provider, 3, 20));
  await captureDeposit(booking.id, booking.deposit);
  const fee = Math.round(booking.deposit * 50) / 100;

  const { page, errors } = await openAs(customer, { locale: "ar", width: "phone" });
  await page.goto("/customer/bookings");
  await page.getByRole("button", { name: "إلغاء الموعد" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("هذا إلغاء متأخر");
  await dialog.getByRole("button", { name: "نعم، إلغاء" }).click();
  await expect(page.getByRole("status")).toContainText("الرسم المستقطع");

  const row = bookingRow(booking.id);
  expect(row.status).toBe("cancelled");
  expect(money(row.cancellation_fee)).toBe(money(fee));
  expect(money(row.refund_amount)).toBe(money(booking.deposit - fee));
  expect(refundRequests(booking.id).map((r) => money(r.amount))).toEqual([money(booking.deposit - fee)]);
  expect(errors.unexpected()).toEqual([]);
});

test("a provider's cancellation refunds the customer in full even inside 24 h", async ({ factory }) => {
  const provider = await factory.provider({ freeCancellationHours: 24, lateCancellationFeePercent: 50 });
  const customer = await factory.customer();
  const booking = await book(customer, provider, await slotWithin(customer, provider, 3, 20));
  await captureDeposit(booking.id, booking.deposit);
  const reply = await rpc("cancel_booking", { target_booking_id: booking.id, p_reason: "Barber is ill today" }, provider.owner.session.access_token);
  expect(reply.status, JSON.stringify(reply.json)).toBe(200);
  const row = bookingRow(booking.id);
  expect(row).toMatchObject({ status: "cancelled", cancelled_by: "provider" });
  expect(money(row.cancellation_fee)).toBe("0.00");
  expect(money(row.refund_amount)).toBe(money(booking.deposit));
  expect(refundRequests(booking.id).map((r) => r.source)).toEqual(["provider_cancellation"]);
});

test("an unpaid booking is cancelled at no cost and nothing is refunded; another customer cannot cancel it", async ({ factory }) => {
  const provider = await factory.provider();
  const customer = await factory.customer();
  const stranger = await factory.customer();
  const booking = await book(customer, provider, await slotWithin(customer, provider, 48, 96));
  expect(booking.status).toBe("pending_payment");

  const refused = await rpc("cancel_booking", { target_booking_id: booking.id }, stranger.session.access_token);
  expect(refused.status).toBeGreaterThanOrEqual(400);
  expect(bookingRow(booking.id).status).toBe("pending_payment");

  const reply = await rpc("cancel_booking", { target_booking_id: booking.id }, customer.session.access_token);
  expect(reply.status, JSON.stringify(reply.json)).toBe(200);
  const row = bookingRow(booking.id);
  expect(row.status).toBe("cancelled");
  expect(money(row.refund_amount)).toBe("0.00");
  expect(refundRequests(booking.id)).toEqual([]);
});

test("the deposit confirmation refuses an amount that is not the booking's deposit", async ({ factory }) => {
  const provider = await factory.provider({ price: 200, depositPercent: 20 });
  const customer = await factory.customer();
  const booking = await book(customer, provider, await slotWithin(customer, provider, 48, 96));
  const wrong = await serviceRpc("confirm_booking_payment", { target_booking_id: booking.id, target_payment_intent_id: "chg_e2e_wrong_amount", target_total_captured: booking.deposit + 1 });
  expect(wrong.status).toBeGreaterThanOrEqual(400);
  expect(bookingRow(booking.id).status).toBe("pending_payment");
  // A customer cannot confirm their own payment.
  const self = await rpc("confirm_booking_payment", { target_booking_id: booking.id, target_payment_intent_id: "chg_e2e_self", target_total_captured: booking.deposit }, customer.session.access_token);
  expect(self.status).toBeGreaterThanOrEqual(400);
  expect(bookingRow(booking.id).status).toBe("pending_payment");
});
