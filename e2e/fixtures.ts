// Playwright fixtures for the PRIMORA end-to-end suite.
//
//   factory   creates what one test needs (accounts, console roles, a bookable provider) and removes the accounts afterwards
//   openAs    opens an isolated browser context signed in as one account, in one language and at one width, with:
//             - every request to a hosted Supabase project or to Tap aborted (the suite never leaves this machine);
//             - console errors and uncaught exceptions recorded, so a test can require that none happened.
//
// No test shares an account or a provider with another test, and nothing depends on the test machine's calendar: times
// come from the database clock (dbNow) and the browser clock is controlled with page.clock where a timer matters.

import { test as base, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { aal2Session, createAccount, deleteAccount, passwordSession, uniquePhone, type Account, type Session } from "./support/auth";
import { lit, sql, written } from "./support/db";
import { sessionStorageKey, stack } from "./support/stack";

export type Locale = "en" | "ar";
export type ConsoleRole = "owner" | "finance" | "operations" | "analyst";

export const WIDTHS = { phone: { width: 375, height: 812 }, desktop: { width: 1440, height: 900 } } as const;
export type Width = keyof typeof WIDTHS;

export type Person = Account & { session: Session };

export type Provider = {
  owner: Person;
  providerId: string;
  branchId: string;
  employeeId: string;
  employeeName: string;
  serviceId: string;
  serviceName: string;
  servicePrice: number;
  serviceMinutes: number;
  depositPercent: number;
  freeCancellationHours: number;
  lateCancellationFeePercent: number;
  businessName: string;
};

/** Hosts the suite must never reach: any hosted Supabase project and the payment gateway. */
const FORBIDDEN_HOSTS = /^https?:\/\/([^/]*\.)?(supabase\.co|supabase\.in|supabase\.com|tap\.company|gotap\.com)(:\d+)?\//i;

export class ErrorLog {
  readonly entries: string[] = [];
  watch(page: Page): void {
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const where = message.location()?.url ?? "";
      this.entries.push(`console.error: ${message.text()}${where ? ` (${where.replace(stack().baseURL, "")})` : ""}`);
    });
    page.on("pageerror", (error) => this.entries.push(`uncaught: ${error.message}`));
  }
  /** Entries not explained by one of the designed refusals the test triggers on purpose. */
  unexpected(allowed: RegExp[] = []): string[] {
    return this.entries.filter((entry) => !allowed.some((pattern) => pattern.test(entry)));
  }
}

export type Opened = { context: BrowserContext; page: Page; errors: ErrorLog };

export type OpenOptions = { locale?: Locale; width?: Width; clock?: boolean };

async function open(browser: Browser, person: Person | null, options: OpenOptions, opened: BrowserContext[]): Promise<Opened> {
  const { baseURL } = stack();
  const locale = options.locale ?? "en";
  const localStorage: { name: string; value: string }[] = [{ name: "primora_lang", value: locale }];
  if (person) localStorage.push({ name: sessionStorageKey(), value: JSON.stringify(person.session) });
  const context = await browser.newContext({
    baseURL,
    viewport: WIDTHS[options.width ?? "desktop"],
    locale: locale === "ar" ? "ar-SA" : "en-US",
    timezoneId: "Asia/Riyadh",
    storageState: { cookies: [], origins: [{ origin: baseURL, localStorage }] },
  });
  opened.push(context);
  await context.route(FORBIDDEN_HOSTS, (route) => route.abort("blockedbyclient"));
  const page = await context.newPage();
  const errors = new ErrorLog();
  errors.watch(page);
  if (options.clock) await page.clock.install();
  return { context, page, errors };
}

type Factory = {
  customer(options?: { firstName?: string; lastName?: string }): Promise<Person>;
  consoleUser(role: ConsoleRole, options?: { firstName?: string }): Promise<Person>;
  /** A console account with a password but no session yet and no authenticator (for the real sign-in screens). */
  consoleAccount(role: ConsoleRole): Promise<Account>;
  provider(options?: { depositPercent?: number; freeCancellationHours?: number; lateCancellationFeePercent?: number; price?: number }): Promise<Provider>;
};

let providerSerial = 0;

function assignConsoleRole(account: Account, role: ConsoleRole, firstName: string): void {
  // The way supabase/seed.sql assigns the local console accounts (GOV-1): a profile with the admin role and a role row.
  sql(`update public.profiles set role = 'admin', first_name = ${lit(firstName)}, last_name = ${lit(`E2E ${role}`)} where id = ${lit(account.id)};
       insert into public.admin_role_assignments (user_id, admin_role, reason)
       values (${lit(account.id)}, ${lit(role)}, 'End-to-end test account (throw-away)')
       on conflict (user_id) do update set admin_role = excluded.admin_role;`);
}

export const test = base.extend<{ factory: Factory; openAs: (person: Person | null, options?: OpenOptions) => Promise<Opened> }>({
  factory: async ({}, use) => {
    const created: Account[] = [];
    const factory: Factory = {
      async customer(options = {}) {
        const account = await createAccount("customer");
        created.push(account);
        sql(`update public.profiles set first_name = ${lit(options.firstName ?? "Noura")}, last_name = ${lit(options.lastName ?? "E2E")},
               phone_number = ${lit(uniquePhone())}, phone_verified = true where id = ${lit(account.id)};`);
        return { ...account, session: await passwordSession(account) };
      },
      async consoleAccount(role) {
        const account = await createAccount(role);
        created.push(account);
        assignConsoleRole(account, role, "Test");
        return account;
      },
      async consoleUser(role, options = {}) {
        const account = await createAccount(role);
        created.push(account);
        assignConsoleRole(account, role, options.firstName ?? "Test");
        // The session first: enrolment stores the factor (and its secret) on the account.
        const session = await aal2Session(account);
        return Object.assign(account, { session });
      },
      async provider(options = {}) {
        const ownerAccount = await createAccount("provider");
        created.push(ownerAccount);
        providerSerial += 1;
        const tag = `${ownerAccount.id.slice(0, 6)}${providerSerial}`;
        const businessName = `E2E Salon ${tag}`;
        const serviceName = `E2E Haircut ${tag}`;
        const employeeName = `E2E Barber ${tag}`;
        const price = options.price ?? 200;
        const depositPercent = options.depositPercent ?? 20;
        const freeCancellationHours = options.freeCancellationHours ?? 24;
        const lateCancellationFeePercent = options.lateCancellationFeePercent ?? 50;
        // A verified provider with one branch, one professional who works around the clock every day (so any test time has
        // free slots, whatever the weekday), and one service.
        const ids = written<{ provider_id: string; branch_id: string; employee_id: string; service_id: string }>(`
          with owner as (
            update public.profiles set role = 'provider_owner', first_name = 'Owner', last_name = ${lit(tag)},
                   phone_number = ${lit(uniquePhone())}, phone_verified = true
             where id = ${lit(ownerAccount.id)} returning id
          ), p as (
            insert into public.providers (owner_id, type, business_name_en, business_name_ar, description_en, description_ar,
                                          is_verified, status, deposit_percentage, free_cancellation_hours, late_cancellation_fee_percent)
            select id, 'salon_barber_shop', ${lit(businessName)}, ${lit(`صالون اختبار ${tag}`)}, 'End-to-end test provider', 'مزود اختبار',
                   true, 'active', ${depositPercent}, ${freeCancellationHours}, ${lateCancellationFeePercent} from owner
            returning id
          ), b as (
            insert into public.branches (provider_id, name_en, name_ar, address_text_en, address_text_ar, latitude, longitude, city, district)
            select id, 'E2E Branch', 'فرع الاختبار', 'Olaya Street, Riyadh', 'شارع العليا، الرياض', 24.7112, 46.6744, 'Riyadh', 'Olaya' from p
            returning id, provider_id
          ), e as (
            insert into public.employees (branch_id, name_en, name_ar, title_en, title_ar, is_active)
            select id, ${lit(employeeName)}, ${lit(`حلاق اختبار ${tag}`)}, 'Barber', 'حلاق', true from b
            returning id
          ), s as (
            insert into public.services (provider_id, category_id, name_en, name_ar, description_en, description_ar, base_price, base_duration_minutes, is_active)
            select provider_id, (select id from public.categories where slug = 'mens-haircut'), ${lit(serviceName)}, ${lit(`قصة اختبار ${tag}`)},
                   'End-to-end test service', 'خدمة اختبار', ${price}, 60, true from b
            returning id
          ), es as (
            insert into public.employee_services (employee_id, service_id) select e.id, s.id from e, s returning employee_id
          ), av as (
            insert into public.employee_availability (employee_id, day_of_week, start_time, end_time, is_working_day)
            select e.id, d, '00:00:00', '00:00:00', true from e, generate_series(0, 6) d returning employee_id
          )
          select json_build_object('provider_id', (select id from p), 'branch_id', (select id from b), 'employee_id', (select id from e),
                 'service_id', (select id from s), 'rows', (select count(*) from es) + (select count(*) from av))`);
        const owner: Person = { ...ownerAccount, session: await passwordSession(ownerAccount) };
        return {
          owner, providerId: ids.provider_id, branchId: ids.branch_id, employeeId: ids.employee_id, employeeName, serviceId: ids.service_id,
          serviceName, servicePrice: price, serviceMinutes: 60, depositPercent, freeCancellationHours, lateCancellationFeePercent, businessName,
        };
      },
    };
    await use(factory);
    for (const account of created.reverse()) await deleteAccount(account.id);
  },

  openAs: async ({ browser }, use) => {
    const opened: BrowserContext[] = [];
    await use((person, options = {}) => open(browser, person, options, opened));
    for (const context of opened) await context.close().catch(() => undefined);
  },
});

export { expect };

/** Waits until the admin console shell has decided what to show (auth guard, console role, then the screen). */
export async function consoleReady(page: Page): Promise<void> {
  await expect(page.locator("#admin-main")).toBeVisible({ timeout: 45_000 });
  await expect(page.locator("#admin-main > div > p[role=status]")).toHaveCount(0, { timeout: 30_000 });
}
