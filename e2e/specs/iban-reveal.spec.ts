// Audited IBAN reveal (Q3, GOV-1): finance reveals a provider's full IBAN with a ticketed reason; the console shows it for
// at most 60 seconds and then removes it from the page; the reveal is audited without the IBAN; a role without
// iban.reveal neither sees the control nor gets an answer from the server. The 60 seconds pass on the page's own clock
// (page.clock), so the test waits for nothing.

import { test, expect, consoleReady } from "../fixtures";
import { rows } from "../support/db";
import { rpc } from "../support/api";
import { payoutRequest } from "../support/money";

// The console prints an IBAN in groups of four, the way it is read out and checked.
const grouped = (iban: string) => iban.match(/.{1,4}/g)!.join(" ");

const reason = () => `PAY-${String(Date.now()).slice(-4)} confirming the payout destination before transfer`;

test("finance reveals an IBAN, sees it for 60 seconds, then it is gone from the page", async ({ factory, openAs }) => {
  const provider = await factory.provider();
  const payout = payoutRequest(provider.providerId, provider.owner.id);
  const finance = await factory.consoleUser("finance");
  const { page, errors } = await openAs(finance, { locale: "en", width: "desktop", clock: true });

  await page.goto("/admin/ledger");
  await consoleReady(page);
  await page.getByRole("tab", { name: "Payout Requests" }).click();
  const row = page.getByRole("row").filter({ hasText: provider.businessName });
  await expect(row).toContainText(payout.ibanMasked);
  await expect(page.getByText(grouped(payout.iban))).toHaveCount(0);

  await row.getByRole("button", { name: `Reveal the IBAN of ${provider.businessName}` }).click();
  const confirm = page.getByRole("dialog", { name: "Reveal the full IBAN" });
  await confirm.getByLabel(/Reason with a ticket/).fill(reason());
  await confirm.getByRole("button", { name: "Reveal IBAN" }).click();

  const shown = page.getByRole("dialog", { name: `IBAN of ${provider.businessName}` });
  await expect(shown).toContainText(grouped(payout.iban));
  await expect(shown.getByRole("timer")).toHaveText("Hidden in 60 s");

  await page.clock.fastForward(30_000);
  await expect(shown.getByRole("timer")).toHaveText(/Hidden in (29|30) s/);
  await expect(shown).toContainText(grouped(payout.iban));

  await page.clock.fastForward(31_000);
  await expect(shown).toHaveCount(0);
  await expect(page.getByText(grouped(payout.iban))).toHaveCount(0);
  await expect(row).toContainText(payout.ibanMasked);

  const audit = rows<{ details: string }>(`select details::text as details from public.admin_audit_logs
                                           where action = 'iban.revealed' and actor_id = '${finance.id}'`);
  expect(audit).toHaveLength(1);
  expect(audit[0].details).not.toContain(payout.iban);
  expect(errors.unexpected()).toEqual([]);
});

async function revealInArabicOnPhone(factory: any, openAs: any) {
  const provider = await factory.provider();
  const payout = payoutRequest(provider.providerId, provider.owner.id);
  const finance = await factory.consoleUser("finance");
  const opened = await openAs(finance, { locale: "ar", width: "phone", clock: true });
  const { page } = opened;
  await page.goto("/admin/ledger");
  await consoleReady(page);
  await page.getByRole("tab", { name: "طلبات سحب الأرباح" }).click();
  const nameAr = rows<{ n: string }>(`select business_name_ar as n from public.providers where id = '${provider.providerId}'`)[0].n;
  await page.getByRole("button", { name: `كشف آيبان ${nameAr}` }).click();
  const confirm = page.getByRole("dialog", { name: "كشف الآيبان كاملاً" });
  await confirm.getByRole("textbox").fill(reason());
  await confirm.getByRole("button", { name: "كشف الآيبان" }).click();
  const shown = page.getByRole("dialog", { name: `آيبان ${nameAr}` });
  await expect(shown).toContainText(grouped(payout.iban));
  return { ...opened, shown, payout };
}

test("Arabic on a phone: the IBAN hides itself after 60 seconds and a reload does not bring it back", async ({ factory, openAs }) => {
  const { page, errors, shown, payout } = await revealInArabicOnPhone(factory, openAs);
  await expect(shown.getByRole("timer")).toContainText("يختفي خلال");
  await page.clock.fastForward(61_000);
  await expect(shown).toHaveCount(0);
  await expect(page.getByText(grouped(payout.iban))).toHaveCount(0);
  await page.reload();
  await consoleReady(page);
  await expect(page.getByText(grouped(payout.iban))).toHaveCount(0);
  expect(errors.unexpected()).toEqual([]);
});

// Fixed (QAFIX): the revealed-IBAN panel is portalled to <body>, above the payout table, so "Hide now" can be pressed.
test("Arabic on a phone: 'Hide now' can be pressed and removes the IBAN at once", async ({ factory, openAs }) => {
  const { page, shown, payout } = await revealInArabicOnPhone(factory, openAs);
  await shown.getByRole("button", { name: "إخفاء الآن" }).click({ timeout: 5_000 });
  await expect(shown).toHaveCount(0);
  await expect(page.getByText(grouped(payout.iban))).toHaveCount(0);
});

test("English on a desktop: 'Hide now' removes the IBAN at once", async ({ factory, openAs }) => {
  const provider = await factory.provider();
  const payout = payoutRequest(provider.providerId, provider.owner.id);
  const finance = await factory.consoleUser("finance");
  const { page, errors } = await openAs(finance, { locale: "en", width: "desktop" });
  await page.goto("/admin/ledger");
  await consoleReady(page);
  await page.getByRole("tab", { name: "Payout Requests" }).click();
  await page.getByRole("button", { name: `Reveal the IBAN of ${provider.businessName}` }).click();
  const confirm = page.getByRole("dialog", { name: "Reveal the full IBAN" });
  await confirm.getByLabel(/Reason with a ticket/).fill(reason());
  await confirm.getByRole("button", { name: "Reveal IBAN" }).click();
  const shown = page.getByRole("dialog", { name: `IBAN of ${provider.businessName}` });
  await expect(shown).toContainText(grouped(payout.iban));
  await shown.getByRole("button", { name: "Hide now" }).click({ timeout: 5_000 });
  await expect(shown).toHaveCount(0);
  await expect(page.getByText(grouped(payout.iban))).toHaveCount(0);
  expect(errors.unexpected()).toEqual([]);
});

test("operations (no iban.reveal) is offered no reveal control and the server refuses the reveal", async ({ factory, openAs }) => {
  const provider = await factory.provider();
  payoutRequest(provider.providerId, provider.owner.id);
  const operations = await factory.consoleUser("operations");
  const refused = await rpc("reveal_provider_iban", { p_provider_id: provider.providerId, p_reason: reason() }, operations.session.access_token);
  expect(refused.status).toBeGreaterThanOrEqual(400);
  expect(JSON.stringify(refused.json)).not.toMatch(/SA\d{22}/);

  // The ledger is not an operations screen at all: the console shows the access notice, never the payout table.
  const { page } = await openAs(operations, { locale: "en", width: "desktop" });
  await page.goto("/admin/ledger");
  await expect(page.getByText("You do not have access to this screen")).toBeVisible();
  await expect(page.getByRole("button", { name: /Reveal the IBAN/ })).toHaveCount(0);
});
