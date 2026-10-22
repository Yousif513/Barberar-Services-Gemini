// Bookings through the real server commands (create_booking as the customer), Tap stood in for at the network edge, and
// times taken from the database clock. A slot is found by asking get_available_slots for the Riyadh dates around the wanted
// time, so a test never depends on the weekday, the hour or the calendar date it runs on.

import { randomBytes, randomUUID } from "node:crypto";
import { expect, type Page, type Route } from "@playwright/test";
import { rpc, serviceRpc } from "./api";
import { dbNow, one } from "./db";
import { stack } from "./stack";
import type { Person, Provider } from "../fixtures";

const HOUR = 3_600_000;

/** The calendar date in Riyadh (the branch's time zone) of an instant. */
export function riyadhDate(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** The first free slot of the provider's professional that starts within [now + fromHours, now + toHours]. */
export async function slotWithin(customer: Person, provider: Provider, fromHours: number, toHours: number): Promise<string> {
  const now = dbNow().getTime();
  const from = now + fromHours * HOUR;
  const to = now + toHours * HOUR;
  const dates = new Set<string>();
  for (let t = from; t <= to + 24 * HOUR; t += 12 * HOUR) dates.add(riyadhDate(new Date(t)));
  for (const date of dates) {
    const reply = await rpc("get_available_slots", { target_employee_id: provider.employeeId, target_date: date, service_duration_minutes: provider.serviceMinutes }, customer.session.access_token);
    expect(reply.status, JSON.stringify(reply.json)).toBe(200);
    const found = (reply.json as { slot_start: string }[]).map((s) => s.slot_start).find((s) => {
      const at = new Date(s).getTime();
      return at >= from && at <= to;
    });
    if (found) return found;
  }
  throw new Error(`no free slot between ${fromHours} h and ${toHours} h from now`);
}

export type Booked = { id: string; status: string; deposit: number; scheduledAt: string };

/** A booking made by the customer through the same server command the shop page calls. */
export async function book(customer: Person, provider: Provider, scheduledAt: string): Promise<Booked> {
  const reply = await rpc("create_booking", {
    target_employee_id: provider.employeeId, target_service_id: provider.serviceId, target_scheduled_at: scheduledAt, request_branch_id: provider.branchId,
  }, customer.session.access_token);
  expect(reply.status, JSON.stringify(reply.json)).toBe(200);
  return { id: reply.json.id, status: reply.json.status, deposit: Number(reply.json.deposit_required), scheduledAt: reply.json.scheduled_at };
}

/**
 * What Tap's webhook does once a deposit is captured: the payment-webhook function re-reads the charge from Tap and calls
 * confirm_booking_payment as the service role. The test stands in for Tap and the webhook with that same call.
 */
export async function captureDeposit(bookingId: string, amount: number, chargeId = `chg_e2e_${randomBytes(8).toString("hex")}`): Promise<string> {
  const reply = await serviceRpc("confirm_booking_payment", { target_booking_id: bookingId, target_payment_intent_id: chargeId, target_total_captured: amount });
  expect(reply.status, JSON.stringify(reply.json)).toBe(200);
  return chargeId;
}

export type TapStub = { checkoutRequests: Record<string, unknown>[]; chargeIds: string[] };

/**
 * Tap at the network edge, for one page: the browser's call to the payment-checkout Edge Function is answered here (it never
 * reaches the local functions runtime, which could hold real keys), with a checkout address on a host that does not exist;
 * when the browser goes there, the deposit is confirmed as Tap's webhook would confirm it and the browser is sent back to
 * the app's return address, as Tap's hosted page does after payment.
 */
export async function stubTap(page: Page): Promise<TapStub> {
  const stub: TapStub = { checkoutRequests: [], chargeIds: [] };
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };
  await page.route("**/functions/v1/payment-checkout", async (route: Route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    stub.checkoutRequests.push(body);
    if (body.action === "recover") {
      return route.fulfill({ status: 404, headers: { ...cors, "content-type": "application/json" },
        body: JSON.stringify({ success: false, code: "checkout_not_found" }) });
    }
    const chargeId = `chg_e2e_${randomBytes(8).toString("hex")}`;
    stub.chargeIds.push(chargeId);
    await route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" },
      body: JSON.stringify({ success: true, state: "ready", attemptId: randomUUID(), checkoutUrl: `https://tap-checkout.e2e.invalid/pay/${chargeId}?booking=${String(body.bookingId)}`, chargeId }) });
  });
  await page.route("https://tap-checkout.e2e.invalid/**", async (route: Route) => {
    const url = new URL(route.request().url());
    const chargeId = url.pathname.split("/").pop() as string;
    const bookingId = url.searchParams.get("booking") as string;
    const deposit = Number(one<{ d: string }>(`select deposit_required::text as d from public.bookings where id = '${bookingId}'`).d);
    await captureDeposit(bookingId, deposit, chargeId);
    await route.fulfill({ status: 302, headers: { location: `${stack().baseURL}/customer/bookings?payment=${bookingId}&tap_id=${chargeId}` } });
  });
  return stub;
}
