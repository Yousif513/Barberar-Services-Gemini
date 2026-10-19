// Legal holds (PRIV, Q2.6): an owner proposes a hold in the console and it takes force only once a different owner approves
// it; releasing it early is again decided by a second person while the hold stays in force; and while a court hold keeps a
// customer's account, clearing that customer's profile is refused at the request (F1). Every person is a fresh test account.

import { randomBytes } from "node:crypto";
import { test, expect, consoleReady } from "../fixtures";
import { one } from "../support/db";
import { rpc } from "../support/api";

type Hold = { id: string; status: string; created_by: string; approved_by: string | null; approval_request_id: string | null };
const holdByReference = (reference: string) => one<Hold>(`select id, status, created_by::text as created_by, approved_by::text as approved_by,
  approval_request_id::text as approval_request_id from public.privacy_legal_holds where case_reference = '${reference}'`);

test("a hold proposed in the console takes force only after a second owner approves; early release waits for a second owner too", async ({ factory, openAs }) => {
  const tag = randomBytes(3).toString("hex").toUpperCase();
  const reference = `CASE-${tag}`;
  const proposer = await factory.consoleUser("owner", { firstName: "Proposer" });
  const approver = await factory.consoleUser("owner", { firstName: "Approver" });
  const customer = await factory.customer({ firstName: "Held", lastName: `Customer${tag}` });

  const { page, errors } = await openAs(proposer, { locale: "en", width: "desktop" });
  await page.goto("/admin/privacy?tab=holds");
  await consoleReady(page);
  const form = page.getByRole("form", { name: "Propose a legal hold" });
  await form.getByLabel("Customer", { exact: true }).fill(customer.email);
  await form.getByRole("button", { name: "Find" }).click();
  // The picker shows the last name as its initial only (data minimisation).
  await form.getByRole("button", { name: "Choose: Held C." }).click();
  await form.getByLabel("Case or dispute reference").fill(reference);
  await form.getByRole("checkbox", { name: "Bookings" }).check();
  await form.getByLabel("Why (at least 20 characters)").fill(`Court case ${tag} needs the booking history kept intact`);
  await form.getByRole("button", { name: "Propose the hold" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Done." })).toBeVisible();

  let hold = holdByReference(reference);
  expect(hold).toMatchObject({ status: "pending_approval", created_by: proposer.id });
  expect(hold.approval_request_id).toBeTruthy();

  // The proposer cannot approve their own hold; a second owner can.
  const own = await rpc("admin_decide_approval", { p_request_id: hold.approval_request_id, p_decision: "approve", p_reason: "Approving my own hold" }, proposer.session.access_token);
  expect(own.status).toBeGreaterThanOrEqual(400);
  expect(holdByReference(reference).status).toBe("pending_approval");
  const second = await rpc("admin_decide_approval", { p_request_id: hold.approval_request_id, p_decision: "approve", p_reason: `Second owner checked ${reference}` }, approver.session.access_token);
  expect(second.status, JSON.stringify(second.json)).toBe(200);
  hold = holdByReference(reference);
  expect(hold).toMatchObject({ status: "active", approved_by: approver.id });

  // Early release from the console: requested, but the hold stays in force until a second owner approves it.
  await page.reload();
  await consoleReady(page);
  const row = page.getByRole("row").filter({ hasText: reference });
  await row.getByRole("button", { name: "Release" }).click();
  const release = page.getByRole("dialog", { name: "Release this hold" });
  await release.getByLabel("Outcome of the review (at least 20 characters)").fill(`The court closed case ${reference} this week`);
  await release.getByRole("button", { name: "Release" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Release requested" })).toBeVisible();
  expect(holdByReference(reference).status).toBe("active");

  const releaseRequest = one<{ id: string }>(`select id from public.admin_approval_requests
    where kind = 'privacy_legal_hold_release' and target_id = '${hold.id}' and status = 'pending'`);
  const ownRelease = await rpc("admin_decide_approval", { p_request_id: releaseRequest.id, p_decision: "approve", p_reason: "Approving my own release" }, proposer.session.access_token);
  expect(ownRelease.status).toBeGreaterThanOrEqual(400);
  const secondRelease = await rpc("admin_decide_approval", { p_request_id: releaseRequest.id, p_decision: "approve", p_reason: `Court order seen for ${reference}` }, approver.session.access_token);
  expect(secondRelease.status, JSON.stringify(secondRelease.json)).toBe(200);
  expect(holdByReference(reference).status).toBe("released");
  expect(errors.unexpected()).toEqual([]);
});

test("while a court hold keeps the account, the customer's profile cannot be cleared", async ({ factory }) => {
  const tag = randomBytes(3).toString("hex").toUpperCase();
  const reference = `COURT-${tag}`;
  const proposer = await factory.consoleUser("owner");
  const approver = await factory.consoleUser("owner");
  const customer = await factory.customer({ firstName: "Kept", lastName: `Account${tag}` });

  const proposed = await rpc("admin_privacy_propose_legal_hold", {
    p_subject_id: customer.id, p_basis: "court_case", p_case_reference: reference, p_categories: ["account", "bookings"], p_booking_id: null,
    p_reason: `Court case ${tag} names this customer as a party`, p_account_reason: "The court asked for the account and its login to be preserved",
  }, proposer.session.access_token);
  expect(proposed.status, JSON.stringify(proposed.json)).toBe(200);
  const hold = holdByReference(reference);
  expect((await rpc("admin_decide_approval", { p_request_id: hold.approval_request_id, p_decision: "approve", p_reason: `Checked the order for ${reference}` }, approver.session.access_token)).status).toBe(200);
  expect(holdByReference(reference).status).toBe("active");

  const cleared = await rpc("admin_clear_customer_profile", { p_customer_id: customer.id, p_reason: "Customer asked by phone to clear the profile" }, proposer.session.access_token);
  expect(cleared.status).toBeGreaterThanOrEqual(400);
  expect(cleared.json?.hint).toBe("legal_hold_active");
  const profile = one<{ first_name: string; email: string }>(`select first_name, email from public.profiles where id = '${customer.id}'`);
  expect(profile).toEqual({ first_name: "Kept", email: customer.email });
});
