// Shop availability regressions. Accounts and catalog rows use the guarded local Supabase fixtures; only the
// availability RPC response is a test fixture, so request ordering and candidate lists are deterministic. No booking
// command or payment gateway is called. This exercises the browser's cart, selection and request-lifecycle behavior;
// the server's scheduling rules are covered separately by the database tests.

import type { Page } from "@playwright/test";
import { test, expect, type Provider } from "../fixtures";
import { riyadhDate } from "../support/booking";
import { dbNow, lit, written } from "../support/db";

type AvailabilityRequest = {
  target_branch_id: string;
  target_service_id: string;
  target_date: string;
  p_service_ids?: string[];
  p_variant_ids?: (string | null)[];
  prayer_window_starts?: string[];
  prayer_window_ends?: string[];
};

type SlotFixture = {
  slot_start: string;
  available_employee_count: number;
  candidate_employee_ids: string[];
  candidate_duration_minutes: number[];
};

type RpcReply = { status?: number; body: SlotFixture[] | { code: string; message: string; details: null; hint: null } };

/** Adds only throw-away local catalog rows; deleting the factory provider's owner removes them with the provider. */
function extraCatalog(provider: Provider): { serviceId: string; serviceName: string; employeeId: string } {
  const serviceName = `${provider.serviceName} conditioning`;
  const extra = written<{ serviceId: string; employeeId: string }>(`
    with s as (
      insert into public.services (provider_id, category_id, name_en, name_ar, description_en, description_ar,
                                   base_price, base_duration_minutes, is_active)
      select provider_id, category_id, ${lit(serviceName)}, 'عناية إضافية للاختبار',
             'End-to-end availability test service', 'خدمة اختبار المواعيد', base_price, base_duration_minutes, true
        from public.services where id = ${lit(provider.serviceId)}
      returning id
    ), e as (
      insert into public.employees (branch_id, name_en, name_ar, title_en, title_ar, is_active)
      values (${lit(provider.branchId)}, ${lit(`${provider.employeeName} colleague`)}, 'أخصائي اختبار آخر', 'Barber', 'حلاق', true)
      returning id
    ), links as (
      insert into public.employee_services (employee_id, service_id)
      select ${lit(provider.employeeId)}::uuid, s.id from s
      union all select e.id, ${lit(provider.serviceId)}::uuid from e
      union all select e.id, s.id from e, s
      returning employee_id
    ), availability as (
      insert into public.employee_availability (employee_id, day_of_week, start_time, end_time, is_working_day)
      select e.id, d, '00:00:00', '00:00:00', true from e, generate_series(0, 6) d
      returning employee_id
    )
    select json_build_object('serviceId', (select id from s), 'employeeId', (select id from e),
                             'rows', (select count(*) from links) + (select count(*) from availability))`);
  return { ...extra, serviceName };
}

function testDate(daysAhead: number): string {
  return riyadhDate(new Date(dbNow().getTime() + daysAhead * 86_400_000));
}

function slot(date: string, hour: number, employees: string[], duration = 60): SlotFixture {
  return {
    slot_start: new Date(`${date}T${String(hour).padStart(2, "0")}:00:00+03:00`).toISOString(),
    available_employee_count: employees.length,
    candidate_employee_ids: employees,
    candidate_duration_minutes: employees.map(() => duration),
  };
}

function deferredReply(): { promise: Promise<RpcReply>; resolve: (reply: RpcReply) => void } {
  let resolve!: (reply: RpcReply) => void;
  const promise = new Promise<RpcReply>((done) => { resolve = done; });
  return { promise, resolve };
}

async function availabilityFixture(page: Page, reply: (request: AvailabilityRequest) => RpcReply | Promise<RpcReply>) {
  const requests: AvailabilityRequest[] = [];
  const headers = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "content-type": "application/json",
  };
  await page.route("**/rest/v1/rpc/get_branch_available_slots", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    const request = route.request().postDataJSON() as AvailabilityRequest;
    requests.push(request);
    const response = await reply(request);
    await route.fulfill({ status: response.status ?? 200, headers, body: JSON.stringify(response.body) });
  });
  return requests;
}

const checkout = (page: Page) => page.getByRole("button", { name: /^Confirm & pay deposit/ });
const namedChoice = (page: Page, name: string) => page.getByRole("button").filter({ has: page.getByText(name, { exact: true }) });
const timeButton = (page: Page, hour: number) => page.getByRole("button", { name: new RegExp(`^${hour}:00\\s*am$`, "i") });
const timeButtons = (page: Page) => page.getByRole("button", { name: /^\s*\d{1,2}:\d{2}\s*(am|pm)\s*$/i });

test("any-professional availability receives the whole cart and cart edits clear the selected time", async ({ factory, openAs }) => {
  const provider = await factory.provider();
  const extra = extraCatalog(provider);
  const customer = await factory.customer();
  const { page, errors } = await openAs(customer, { locale: "en", width: "desktop" });
  const date = testDate(3);
  const multiServiceReply = deferredReply();
  const requests = await availabilityFixture(page, (request) => request.p_service_ids?.length === 2
    ? multiServiceReply.promise
    : { body: [slot(request.target_date, 9, [provider.employeeId])] });

  try {
    await page.goto(`/shop/${provider.providerId}`);
    await namedChoice(page, provider.serviceName).click();
    await page.getByRole("button", { name: /Any Available Professional/ }).click();
    await page.getByLabel("Select Date").fill(date);
    await expect(timeButton(page, 9)).toBeVisible();
    await timeButton(page, 9).click();
    await expect(checkout(page)).toBeEnabled();

    await namedChoice(page, extra.serviceName).click();
    await expect.poll(() => requests.at(-1)?.p_service_ids).toEqual([provider.serviceId, extra.serviceId]);
    expect(requests.at(-1)).toMatchObject({
      target_branch_id: provider.branchId,
      target_service_id: provider.serviceId,
      target_date: date,
      p_variant_ids: [null, null],
    });
    expect(requests.at(-1)?.prayer_window_starts?.length).toBeGreaterThan(0);
    expect(requests.at(-1)?.prayer_window_ends).toHaveLength(requests.at(-1)!.prayer_window_starts!.length);
    await expect(checkout(page)).toBeDisabled();
    await expect(timeButtons(page).and(page.locator(":enabled"))).toHaveCount(0);

    // Even when the server returns the very same start time, the enlarged visit needs a fresh customer selection.
    multiServiceReply.resolve({ body: [slot(date, 9, [provider.employeeId], 120)] });
    await expect(timeButton(page, 9)).toBeEnabled();
    await expect(timeButton(page, 9)).toHaveAttribute("aria-pressed", "false");
    await expect(checkout(page)).toBeDisabled();
    await timeButton(page, 9).click();
    await expect(checkout(page)).toBeEnabled();

    await namedChoice(page, extra.serviceName).click();
    await expect.poll(() => requests.at(-1)?.p_service_ids).toEqual([provider.serviceId]);
    expect(requests.at(-1)?.p_variant_ids).toEqual([null]);
    await expect(timeButton(page, 9)).toHaveAttribute("aria-pressed", "false");
    await expect(checkout(page)).toBeDisabled();
    expect(errors.unexpected()).toEqual([]);
  } finally {
    multiServiceReply.resolve({ body: [] });
  }
});

test("an older availability response cannot replace current slots or end a newer request's loading state", async ({ factory, openAs }) => {
  const provider = await factory.provider();
  const customer = await factory.customer();
  const { page, errors } = await openAs(customer, { locale: "en", width: "desktop" });
  const initialDate = testDate(3);
  const olderDate = testDate(4);
  const currentDate = testDate(5);
  const olderReply = deferredReply();
  const currentReply = deferredReply();
  const requests = await availabilityFixture(page, (request) => {
    if (request.target_date === olderDate) return olderReply.promise;
    if (request.target_date === currentDate) return currentReply.promise;
    return { body: [slot(request.target_date, 9, [provider.employeeId])] };
  });

  try {
    await page.goto(`/shop/${provider.providerId}`);
    await namedChoice(page, provider.serviceName).click();
    await page.getByRole("button", { name: /Any Available Professional/ }).click();
    await page.getByLabel("Select Date").fill(initialDate);
    await timeButton(page, 9).click();
    await expect(checkout(page)).toBeEnabled();

    await page.getByLabel("Select Date").fill(olderDate);
    await expect.poll(() => requests.some((request) => request.target_date === olderDate)).toBe(true);
    await expect(checkout(page)).toBeDisabled();
    await expect(timeButtons(page).and(page.locator(":enabled"))).toHaveCount(0);
    await page.getByLabel("Select Date").fill(currentDate);
    await expect.poll(() => requests.some((request) => request.target_date === currentDate)).toBe(true);

    const olderResponse = page.waitForResponse((response) => response.url().endsWith("/rpc/get_branch_available_slots")
      && (response.request().postDataJSON() as AvailabilityRequest).target_date === olderDate);
    olderReply.resolve({ body: [slot(olderDate, 10, [provider.employeeId])] });
    await olderResponse;
    // Let the fulfilled request and React effects settle before examining the still-pending current query.
    await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
    await expect(page.getByText("Loading available times...", { exact: true })).toBeVisible();
    await expect(timeButtons(page).and(page.locator(":enabled"))).toHaveCount(0);
    await expect(checkout(page)).toBeDisabled();

    currentReply.resolve({ body: [slot(currentDate, 11, [provider.employeeId])] });
    await expect(timeButton(page, 11)).toBeEnabled();
    await expect(timeButton(page, 10)).toHaveCount(0);
    await expect(timeButton(page, 9)).toHaveCount(0);
    await expect(timeButton(page, 11)).toHaveAttribute("aria-pressed", "false");
    await expect(checkout(page)).toBeDisabled();
    await timeButton(page, 11).click();
    await expect(checkout(page)).toBeEnabled();
    expect(errors.unexpected()).toEqual([]);
  } finally {
    olderReply.resolve({ body: [] });
    currentReply.resolve({ body: [] });
  }
});

test("a failed availability refresh removes the previous time and prevents checkout", async ({ factory, openAs }) => {
  const provider = await factory.provider();
  const customer = await factory.customer();
  const { page, errors } = await openAs(customer, { locale: "en", width: "desktop" });
  const initialDate = testDate(3);
  const failedDate = testDate(4);
  await availabilityFixture(page, (request) => request.target_date === failedDate
    ? { status: 400, body: { code: "22023", message: "E2E availability check refused", details: null, hint: null } }
    : { body: [slot(request.target_date, 9, [provider.employeeId])] });

  await page.goto(`/shop/${provider.providerId}`);
  await namedChoice(page, provider.serviceName).click();
  await page.getByRole("button", { name: /Any Available Professional/ }).click();
  await page.getByLabel("Select Date").fill(initialDate);
  await timeButton(page, 9).click();
  await expect(checkout(page)).toBeEnabled();
  await page.getByLabel("Select Date").fill(failedDate);
  await expect(page.getByText("Could not load available times: E2E availability check refused", { exact: true })).toBeVisible();
  await expect(timeButtons(page)).toHaveCount(0);
  await expect(checkout(page)).toBeDisabled();
  expect(errors.unexpected([/400.*get_branch_available_slots/])).toEqual([]);
});

test("a chosen professional sees only their eligible full-cart slots and changing professional clears the time", async ({ factory, openAs }) => {
  const provider = await factory.provider();
  const extra = extraCatalog(provider);
  const customer = await factory.customer();
  const { page, errors } = await openAs(customer, { locale: "en", width: "desktop" });
  const date = testDate(3);
  const requests = await availabilityFixture(page, (request) => ({ body: [
    slot(request.target_date, 9, [extra.employeeId], 120),
    slot(request.target_date, 10, [provider.employeeId], 120),
    slot(request.target_date, 11, [extra.employeeId, provider.employeeId], 120),
  ] }));
  const legacyRequests: string[] = [];
  await page.route("**/rest/v1/rpc/get_available_slots", async (route) => {
    legacyRequests.push(route.request().url());
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.goto(`/shop/${provider.providerId}`);
  await namedChoice(page, provider.serviceName).click();
  await namedChoice(page, extra.serviceName).click();
  await page.getByRole("button", { name: /Any Available Professional/ }).click();
  await page.getByLabel("Select Date").fill(date);
  await timeButton(page, 9).click();
  await expect(checkout(page)).toBeEnabled();

  await namedChoice(page, provider.employeeName).click();
  await expect(timeButton(page, 9)).toHaveCount(0);
  await expect(timeButton(page, 10)).toBeEnabled();
  await expect(timeButton(page, 11)).toBeEnabled();
  await expect(timeButton(page, 10)).toHaveAttribute("aria-pressed", "false");
  await expect(checkout(page)).toBeDisabled();
  expect(requests.at(-1)?.p_service_ids).toEqual([provider.serviceId, extra.serviceId]);
  expect(requests.at(-1)?.p_variant_ids).toEqual([null, null]);
  expect(legacyRequests).toEqual([]);
  await timeButton(page, 10).click();
  await expect(checkout(page)).toBeEnabled();
  expect(errors.unexpected()).toEqual([]);
});
