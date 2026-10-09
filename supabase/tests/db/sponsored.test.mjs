// G63 Sponsored placement (labelled): owner-priced, off until configured. Money and consumer protection are involved, so the tests prove the
// arithmetic (price snapshot, cap, statement, invoice line) and the refusals (every role, every unset setting) on the migrated schema.
// The harness session runs in UTC like a hosted one: every month and day below is computed in Asia/Riyadh by the database itself.
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

let db;
let admin;
let customer; // the demo customer
let stranger;
let employeeUser;
let reporter;
let frontDesk;
let provider3;
let owner3;
let employee3;
let employee2;
let categorySlug;
let otherCategorySlug;
let branch1City;
let thisMonthStart;
let lastMonthStart;
const owner1 = ROLES.user(SEED.owner1);
const owner2 = ROLES.user(SEED.owner2);
const PRICE = 25.5;
let seq = 0;
let capturedCapped;
let capturedCappedRows;

const setSetting = (key, value, user = admin) =>
  as(db, user, `select admin_update_platform_setting($1, $2::jsonb, 'sponsored test setup') r`, [key, JSON.stringify(value)]).then((r) => r[0].r);
const configure = async ({ price = PRICE, slots = 3, window = 14 } = {}) => {
  await setSetting("sponsored.price_per_new_client_sar", price);
  await setSetting("sponsored.max_slots_per_search", slots);
  await setSetting("sponsored.attribution_window_days", window);
  await setSetting("sponsored.enabled", true);
};
const config = () => sys(db, `select sponsored_config() c`).then((r) => r[0].c);

const create = (user, over = {}) =>
  as(db, user, `select create_sponsored_campaign($1, $2, $3, $4, $5, $6, $7, $8) r`,
    [over.provider ?? SEED.provider1, over.branch ?? null, over.city ?? null, over.category ?? null, over.cap === undefined ? 100 : over.cap,
     over.start ?? null, over.end ?? null, over.reason ?? "launch the spring promotion"]).then((r) => r[0].r);
const setStatus = (user, id, status, reason = "operator decision") =>
  as(db, user, `select set_sponsored_campaign_status($1, $2, $3) r`, [id, status, reason]).then((r) => r[0].r);
const update = (user, id, cap, ends = null, reason = "change the budget") =>
  as(db, user, `select update_sponsored_campaign($1, $2, $3, $4) r`, [id, cap, ends, reason]).then((r) => r[0].r);
// An active campaign of a provider, created and activated by its owner.
const launch = async (owner, provider, over = {}) => {
  const { campaign_id } = await create(owner, { provider, ...over });
  await setStatus(owner, campaign_id, "active");
  return campaign_id;
};
const place = (user = ROLES.anon, city = null, category = null, limit = null) =>
  as(db, user, `select get_sponsored_placements($1, $2, $3) r`, [city, category, limit]).then((r) => r[0].r);
// FIX-MONEY M-12: the search is a pure read; the trusted server-side caller records what it displayed, in display order.
const placeAndRecord = async () => {
  const r = await place();
  const ids = r.placements.map((x) => x.campaign_id);
  if (ids.length) await as(db, ROLES.service, `select record_sponsored_impressions($1::uuid[])`, [ids]);
  return r;
};
const click = (user, campaignId) => as(db, user, `select record_sponsored_click($1) r`, [campaignId]).then((r) => r[0].r);
const campaignRow = (id) => sys(db, `select * from sponsored_campaigns where id = $1`, [id]).then((r) => r[0]);
const attributionFor = (bookingId) => sys(db, `select * from sponsored_attributions where booking_id = $1`, [bookingId]).then((r) => r[0]);
const fresh = async () => ROLES.user(await createUser(db));

// A booking inserted as the system, in the current or the previous Riyadh month, one 45-minute slot per call so windows never overlap.
const booking = async (customerId, { month = "current", employee = SEED.employee1, status = "confirmed" } = {}) => {
  seq += 1;
  const svc = await serviceFor(db, employee);
  const base = new Date(month === "last" ? lastMonthStart : thisMonthStart).getTime() + 3600000 * 6 + seq * 45 * 60000;
  const at = new Date(base).toISOString();
  const rows = await sys(db,
    `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes, total_price, deposit_required, booking_window, source)
     select $1, e.branch_id, e.id, $2, $3::booking_status, $4::timestamptz, 30, 100, 20, tstzrange($4::timestamptz, $4::timestamptz + interval '30 minutes'),
            case when $1::uuid is null then 'walk_in' else 'marketplace' end
       from employees e where e.id = $5 returning id`, [customerId, svc.id, status, at, employee]);
  return rows[0].id;
};
const complete = (bookingId) => sys(db, `update bookings set status = 'completed' where id = $1`, [bookingId]);
// click on a campaign, book, complete: the whole path of one referred visit.
const visit = async (user, campaignId, over = {}) => {
  if (over.click !== false) await click(user, campaignId);
  const id = await booking(user.sub, over);
  await complete(id);
  return id;
};

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  customer = ROLES.user(SEED.customer);
  stranger = ROLES.user(await createUser(db));
  employeeUser = ROLES.user(await createUser(db, { role: "provider_employee" }));
  reporter = ROLES.user(await createUser(db, { role: "provider_employee" }));
  frontDesk = ROLES.user(await createUser(db, { role: "provider_employee" }));
  await sys(db, `update employees set profile_id = $1 where id = $2`, [employeeUser.sub, SEED.employee1]);
  for (const person of [reporter, frontDesk]) {
    await sys(db, `insert into employees (branch_id, profile_id, name_en, name_ar) values ($1, $2, 'Delegate', 'مفوّض')`, [SEED.branch1, person.sub]);
  }
  await sys(db, `insert into provider_memberships (provider_id, user_id, role, permissions, is_active) values ($1, $2, 'manager', '{"reports":true}', true)`,
    [SEED.provider1, reporter.sub]);
  await sys(db, `insert into provider_memberships (provider_id, user_id, role, permissions, is_active) values ($1, $2, 'receptionist', '{"bookings":true}', true)`,
    [SEED.provider1, frontDesk.sub]);
  const third = await sys(db, `select id, owner_id from providers where id = any (public.demo_provider_ids()) and id not in ($1, $2) order by id limit 1`,
    [SEED.provider1, SEED.provider2]);
  provider3 = third[0].id;
  owner3 = ROLES.user(third[0].owner_id);
  employee3 = (await sys(db, `select e.id from employees e join branches b on b.id = e.branch_id where b.provider_id = $1 order by e.id limit 1`, [provider3]))[0].id;
  employee2 = (await sys(db, `select e.id from employees e join branches b on b.id = e.branch_id where b.provider_id = $1 order by e.id limit 1`, [SEED.provider2]))[0].id;
  const cats = await sys(db, `select slug from categories where is_active order by slug limit 2`);
  categorySlug = cats[0].slug;
  otherCategorySlug = cats[1].slug;
  branch1City = (await sys(db, `select city from branches where id = $1`, [SEED.branch1]))[0].city;
  const months = (await sys(db, `select (date_trunc('month', now() at time zone 'Asia/Riyadh') at time zone 'Asia/Riyadh') as this_m,
                                       ((date_trunc('month', now() at time zone 'Asia/Riyadh') - interval '1 month') at time zone 'Asia/Riyadh') as last_m`))[0];
  thisMonthStart = months.this_m;
  lastMonthStart = months.last_m;
});

describe("the session and the defaults", () => {
  it("runs in UTC, like a hosted session", async () => {
    const [{ tz }] = await sys(db, `select current_setting('TimeZone') tz`);
    assert.equal(tz, "UTC");
  });

  it("ships off and unset: no price, no slot count, no window, no switch", async () => {
    const rows = await sys(db, `select key, value from platform_settings where key like 'sponsored.%' order by key`);
    assert.deepEqual(rows.map((r) => [r.key, r.value]), [
      ["sponsored.attribution_window_days", null],
      ["sponsored.enabled", false],
      ["sponsored.max_slots_per_search", null],
      ["sponsored.price_per_new_client_sar", null],
    ]);
    const cfg = await config();
    assert.equal(cfg.configured, false);
    assert.equal(cfg.enabled, false);
    assert.deepEqual([...cfg.missing].sort(), ["sponsored.attribution_window_days", "sponsored.max_slots_per_search", "sponsored.price_per_new_client_sar"]);
    assert.equal(cfg.price_per_new_client_sar, null);
  });

  it("does nothing while unconfigured: no placements, no click, no campaign", async () => {
    assert.deepEqual(await place(), { configured: false, placements: [] });
    assert.deepEqual(await place(customer), { configured: false, placements: [] });
    await expectError(click(ROLES.anon, "99999999-9999-4999-8999-999999999999"), /Campaign not found/);
    await expectError(create(owner1), /not available yet/);
  });

  it("settings are edited only through the audited command, with validation", async () => {
    await expectError(setSetting("sponsored.enabled", true, owner1), /Administrator access required/);
    await expectError(setSetting("sponsored.enabled", true, customer), /Administrator access required/);
    await expectError(setSetting("sponsored.enabled", true, ROLES.anon), /permission denied|Administrator/i);
    await expectError(setSetting("sponsored.enabled", "yes"), /true or false/);
    for (const bad of [0, -3, 1.234, "12", 100001]) await expectError(setSetting("sponsored.price_per_new_client_sar", bad), /sponsored price/i);
    for (const bad of [0, 11, 1.5, "3"]) await expectError(setSetting("sponsored.max_slots_per_search", bad), /sponsored places/i);
    for (const bad of [0, 366, 2.5, "7"]) await expectError(setSetting("sponsored.attribution_window_days", bad), /attribution window/i);
    await expectError(as(db, admin, `select admin_update_platform_setting('sponsored.enabled', 'true'::jsonb, 'x')`), /reason/i);
  });

  it("refuses to run while ANY one setting is unset, and runs once all four are set", async () => {
    await setSetting("sponsored.enabled", true);
    assert.equal((await config()).configured, false); // price, slots and window still unset
    await setSetting("sponsored.price_per_new_client_sar", PRICE);
    assert.equal((await config()).configured, false);
    await setSetting("sponsored.max_slots_per_search", 1);
    assert.equal((await config()).configured, false);
    await setSetting("sponsored.attribution_window_days", 14);
    const ready = await config();
    assert.equal(ready.configured, true);
    assert.equal(ready.price_per_new_client_sar, PRICE);
    // taking any one away switches it off again
    for (const [key, value] of [["sponsored.price_per_new_client_sar", PRICE], ["sponsored.max_slots_per_search", 1], ["sponsored.attribution_window_days", 14]]) {
      await setSetting(key, null);
      assert.equal((await config()).configured, false, `${key} unset`);
      assert.deepEqual(await place(), { configured: false, placements: [] });
      await setSetting(key, value);
    }
    await setSetting("sponsored.enabled", false);
    assert.equal((await config()).configured, false);
    assert.equal((await place()).configured, false);
    await setSetting("sponsored.enabled", true);
    assert.equal((await config()).configured, true);
  });
});

describe("campaign commands (provider owner only)", () => {
  let draft;

  it("the owner creates a draft: cap required, nothing is shown or billed yet", async () => {
    const r = await create(owner1, { cap: 100 });
    draft = r.campaign_id;
    assert.equal(r.status, "draft");
    const row = await campaignRow(draft);
    assert.equal(Number(row.monthly_budget_cap_sar), 100);
    assert.equal(row.accepted_price_sar, null);
    assert.equal(row.created_by, SEED.owner1);
    assert.equal((await place()).placements.length, 0);
    await expectError(click(ROLES.anon, draft), /Campaign not found/);
  });

  it("validates input and keeps the audit reason", async () => {
    await expectError(create(owner1, { cap: 0 }), /monthly budget/);
    await expectError(create(owner1, { cap: null }), /monthly budget/);
    await expectError(create(owner1, { cap: 12.345 }), /monthly budget/);
    await expectError(create(owner1, { cap: 1000001 }), /monthly budget/);
    await expectError(create(owner1, { start: "2030-01-10", end: "2030-01-01" }), /end date/);
    await expectError(create(owner1, { category: "no-such-category" }), /Unknown category/);
    await expectError(create(owner1, { branch: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9" }), /Branch not found/);
    await expectError(create(owner1, { branch: SEED.branch1, city: "Atlantis" }), /not in the chosen city/);
    await expectError(create(owner1, { reason: "no" }), /reason/);
    const logged = await sys(db, `select details from admin_audit_logs where action = 'sponsored.campaign_created' and target_id = $1`, [draft]);
    assert.equal(logged.length, 1);
    assert.equal(logged[0].details.reason, "launch the spring promotion");
  });

  it("refuses everybody but the owner of that provider", async () => {
    await expectError(create(ROLES.anon), /permission denied|Authentication/i);
    await expectError(create(ROLES.service), /Authentication required/);
    await expectError(create(customer), /Provider not found/);
    await expectError(create(stranger), /Provider not found/);
    await expectError(create(owner2), /Provider not found/); // another provider's owner
    await expectError(create(employeeUser), /Provider not found/);
    await expectError(create(reporter), /Provider not found/); // a delegate with reports reads, it does not spend
    await expectError(create(frontDesk), /Provider not found/);
    await expectError(create(admin), /Provider not found/); // the platform does not spend a provider's money
    for (const user of [customer, owner2, employeeUser, reporter, admin]) {
      await expectError(setStatus(user, draft, "active"), /Campaign not found/);
      await expectError(update(user, draft, 50), /Campaign not found/);
    }
    await expectError(setStatus(ROLES.anon, draft, "active"), /permission denied|Authentication/i);
    await expectError(update(ROLES.anon, draft, 50), /permission denied|Authentication/i);
    assert.equal((await campaignRow(draft)).status, "draft");
  });

  it("activation stamps the price the provider accepted, and a replay changes nothing", async () => {
    await expectError(setStatus(owner1, draft, "paused"), /Only an active campaign can be paused/);
    await expectError(setStatus(owner1, draft, "draft"), /active, paused or ended/);
    await expectError(setStatus(owner1, draft, "active", "x"), /reason/);
    const on = await setStatus(owner1, draft, "active");
    assert.deepEqual([on.status, on.changed, on.accepted_price_sar], ["active", true, PRICE]);
    const row = await campaignRow(draft);
    assert.equal(Number(row.accepted_price_sar), PRICE);
    assert.ok(row.accepted_at);
    const again = await setStatus(owner1, draft, "active");
    assert.equal(again.changed, false);
    assert.equal((await sys(db, `select count(*)::int n from admin_audit_logs where action = 'sponsored.campaign_active' and target_id = $1`, [draft]))[0].n, 1);
  });

  it("the budget can be changed while the campaign lives; an ended campaign is final", async () => {
    await expectError(update(owner1, draft, 0), /monthly budget/);
    await expectError(update(owner1, draft, 50, "2000-01-01"), /end date/);
    const r = await update(owner1, draft, 150.25);
    assert.equal(r.monthly_budget_cap_sar, 150.25);
    await setStatus(owner1, draft, "paused");
    assert.equal((await campaignRow(draft)).status, "paused");
    await setStatus(owner1, draft, "active");
    await setStatus(owner1, draft, "ended", "season is over");
    const row = await campaignRow(draft);
    assert.equal(row.status, "ended");
    assert.ok(row.ended_at);
    await expectError(setStatus(owner1, draft, "active"), /ended campaign cannot be changed/);
    await expectError(update(owner1, draft, 100), /ended campaign cannot be changed/);
    assert.equal((await setStatus(owner1, draft, "ended")).changed, false);
  });

  it("only an active, verified business can promote; the owner can always pause or end", async () => {
    const { campaign_id } = await create(owner2, { provider: SEED.provider2 });
    await sys(db, `update providers set is_verified = false where id = $1`, [SEED.provider2]);
    await expectError(create(owner2, { provider: SEED.provider2 }), /active, verified business/);
    await expectError(setStatus(owner2, campaign_id, "active"), /active, verified business/);
    await sys(db, `update providers set is_verified = true where id = $1`, [SEED.provider2]);
    await setStatus(owner2, campaign_id, "active");
    await setSetting("sponsored.enabled", false);
    await expectError(setStatus(owner2, campaign_id, "paused").then(() => setStatus(owner2, campaign_id, "active")), /not available yet/);
    assert.equal((await campaignRow(campaign_id)).status, "paused"); // pausing still worked while the feature was off
    await setStatus(owner2, campaign_id, "ended");
    await setSetting("sponsored.enabled", true);
  });
});

describe("placements: fair rotation, always labelled", () => {
  let c1; let c2; let c3;

  before(async () => {
    await setSetting("sponsored.max_slots_per_search", 1);
    c1 = await launch(owner1, SEED.provider1);
    c2 = await launch(owner2, SEED.provider2);
    c3 = await launch(owner3, provider3);
  });

  it("rotates least recently shown first, one place per search, and records the show time", async () => {
    const seen = [];
    for (let i = 0; i < 6; i += 1) {
      const r = await placeAndRecord();
      assert.equal(r.configured, true);
      assert.equal(r.placements.length, 1);
      seen.push(r.placements[0].campaign_id);
    }
    assert.deepEqual(seen, [c1, c2, c3, c1, c2, c3]);
    const rows = await sys(db, `select id, last_shown_at from sponsored_campaigns where id in ($1, $2, $3)`, [c1, c2, c3]);
    assert.ok(rows.every((r) => r.last_shown_at));
  });

  it("every returned place is flagged sponsored, for every caller and every limit", async () => {
    await setSetting("sponsored.max_slots_per_search", 3);
    for (const user of [ROLES.anon, customer, owner1, admin, ROLES.service]) {
      const r = await place(user, null, null, 10);
      assert.ok(r.placements.length >= 1);
      assert.ok(r.placements.every((p) => p.is_sponsored === true));
    }
  });

  it("never shows more than the owner's slot limit, and one place per provider", async () => {
    await setSetting("sponsored.max_slots_per_search", 2);
    const extra = await launch(owner1, SEED.provider1); // a second active campaign of provider 1
    const a = await place(ROLES.anon, null, null, 50);
    assert.equal(a.placements.length, 2);
    assert.equal(new Set(a.placements.map((p) => p.provider_id)).size, 2);
    const one = await place(ROLES.anon, null, null, 1);
    assert.equal(one.placements.length, 1);
    await setSetting("sponsored.max_slots_per_search", 3);
    const all = await place(ROLES.anon, null, null, 50);
    assert.equal(all.placements.length, 3); // three providers, four campaigns
    assert.equal(new Set(all.placements.map((p) => p.provider_id)).size, 3);
    await setStatus(owner1, extra, "ended", "test is over");
  });

  it("the fairness holds across equal turns: with 2 slots and 3 campaigns each is shown equally often", async () => {
    await setSetting("sponsored.max_slots_per_search", 2);
    const counts = new Map();
    for (let i = 0; i < 6; i += 1) {
      for (const p of (await placeAndRecord()).placements) counts.set(p.campaign_id, (counts.get(p.campaign_id) ?? 0) + 1);
    }
    for (const id of [c1, c2, c3]) assert.equal(counts.get(id), 4);
    await setSetting("sponsored.max_slots_per_search", 3);
  });

  it("leaves out a paused campaign, an unverified provider, an ended or not yet started campaign", async () => {
    const ids = async () => (await place(ROLES.anon, null, null, 10)).placements.map((p) => p.campaign_id);
    assert.deepEqual((await ids()).sort(), [c1, c2, c3].sort());
    await setStatus(owner2, c2, "paused");
    assert.ok(!(await ids()).includes(c2));
    await setStatus(owner2, c2, "active");
    await sys(db, `update providers set is_verified = false where id = $1`, [provider3]);
    assert.ok(!(await ids()).includes(c3));
    await sys(db, `update providers set is_verified = true where id = $1`, [provider3]);
    await sys(db, `update sponsored_campaigns set starts_on = (now() at time zone 'Asia/Riyadh')::date + 2 where id = $1`, [c1]);
    assert.ok(!(await ids()).includes(c1));
    await sys(db, `update sponsored_campaigns set starts_on = (now() at time zone 'Asia/Riyadh')::date - 5, ends_on = (now() at time zone 'Asia/Riyadh')::date - 1 where id = $1`, [c1]);
    assert.ok(!(await ids()).includes(c1));
    await sys(db, `update sponsored_campaigns set starts_on = (now() at time zone 'Asia/Riyadh')::date - 5, ends_on = null where id = $1`, [c1]);
    assert.deepEqual((await ids()).sort(), [c1, c2, c3].sort());
  });

  it("targets by city and category", async () => {
    for (const id of [c2, c3]) await sys(db, `update sponsored_campaigns set status = 'paused' where id = $1`, [id]);
    await sys(db, `update sponsored_campaigns set category_slug = $2 where id = $1`, [c1, categorySlug]);
    const ids = async (city, cat) => (await place(ROLES.anon, city, cat, 10)).placements.map((p) => p.campaign_id);
    assert.deepEqual(await ids(null, categorySlug), [c1]);
    assert.deepEqual(await ids(null, "all"), [c1]);
    assert.deepEqual(await ids(null, null), [c1]);
    assert.deepEqual(await ids(null, otherCategorySlug), []);
    assert.deepEqual(await ids("Atlantis", null), []);
    assert.deepEqual(await ids("all", categorySlug), [c1]);
    if (branch1City) {
      assert.deepEqual(await ids(branch1City.toUpperCase(), categorySlug), [c1]);
      await sys(db, `update sponsored_campaigns set city = 'Atlantis' where id = $1`, [c1]);
      assert.deepEqual(await ids(branch1City, categorySlug), []);
    }
    for (const id of [c2, c3]) await sys(db, `update sponsored_campaigns set status = 'active' where id = $1`, [id]);
    await sys(db, `update sponsored_campaigns set category_slug = null, city = null where id = $1`, [c1]);
  });

  it("returns only what a visitor may see: names, rating and the label flag", async () => {
    const [p] = (await place(ROLES.anon, null, null, 1)).placements;
    assert.deepEqual(Object.keys(p).sort(), ["branch_id", "branch_name_ar", "branch_name_en", "business_name_ar", "business_name_en", "campaign_id",
      "city", "district", "is_sponsored", "provider_id", "rating", "reviews", "verified_business"]);
    for (const campaign of [c1, c2, c3]) await setStatus(campaign === c1 ? owner1 : campaign === c2 ? owner2 : owner3, campaign, "ended", "placement tests done");
  });
});

describe("clicks: one per campaign, customer and day", () => {
  let campaign;
  let alice; let bob;

  before(async () => {
    campaign = await launch(owner1, SEED.provider1);
    alice = await fresh();
    bob = await fresh();
  });

  it("records a click for a signed-in customer and rate-limits the same day", async () => {
    const first = await click(alice, campaign);
    assert.deepEqual([first.recorded, first.rate_limited], [true, false]);
    const again = await click(alice, campaign);
    assert.deepEqual([again.recorded, again.rate_limited], [false, true]);
    assert.equal((await click(bob, campaign)).recorded, true);
    assert.equal((await sys(db, `select count(*)::int n from sponsored_clicks where campaign_id = $1`, [campaign]))[0].n, 2);
  });

  it("an anonymous visitor writes a click too, once a day per campaign", async () => {
    assert.equal((await click(ROLES.anon, campaign)).recorded, true);
    assert.equal((await click(ROLES.anon, campaign)).rate_limited, true);
    const row = (await sys(db, `select customer_id, provider_id from sponsored_clicks where campaign_id = $1 and customer_id is null`, [campaign]))[0];
    assert.equal(row.provider_id, SEED.provider1);
  });

  it("counts again the next Riyadh day", async () => {
    await sys(db, `update sponsored_clicks set click_day = click_day - 1, clicked_at = clicked_at - interval '1 day' where campaign_id = $1 and customer_id = $2`, [campaign, alice.sub]);
    assert.equal((await click(alice, campaign)).recorded, true);
    assert.equal((await sys(db, `select count(*)::int n from sponsored_clicks where campaign_id = $1 and customer_id = $2`, [campaign, alice.sub]))[0].n, 2);
  });

  it("refuses a campaign that is not live, and direct reads and writes of the table", async () => {
    await expectError(click(alice, "99999999-9999-4999-8999-999999999999"), /Campaign not found/);
    await expectError(click(alice, null), /Campaign not found/);
    await setStatus(owner1, campaign, "paused");
    await expectError(click(alice, campaign), /Campaign not found/);
    await setStatus(owner1, campaign, "active");
    await expectError(as(db, alice, `insert into sponsored_clicks (campaign_id, provider_id, customer_id, click_day) values ($1, $2, $3, current_date)`, [campaign, SEED.provider1, alice.sub]),
      /permission denied|row-level security/i);
    await expectError(as(db, ROLES.anon, `select count(*) from sponsored_clicks`), /permission denied/i);
    assert.deepEqual(await as(db, alice, `select id from sponsored_clicks`), []); // a customer reads nothing, not even their own click
    await setStatus(owner1, campaign, "ended", "click tests done");
  });
});

describe("attribution and accrual", () => {
  let ca;
  let newcomer;

  before(async () => {
    await configure({ price: PRICE, slots: 3, window: 14 });
    ca = await launch(owner1, SEED.provider1, { cap: 1000 });
    newcomer = await fresh();
  });

  it("a new client who clicked, booked and completed accrues the price, once", async () => {
    await click(newcomer, ca);
    const id = await booking(newcomer.sub);
    await complete(id);
    const a = await attributionFor(id);
    assert.equal(a.status, "accrued");
    assert.equal(a.is_new_client, true);
    assert.equal(Number(a.fee_amount_sar), PRICE);
    assert.equal(a.campaign_id, ca);
    assert.equal(a.provider_id, SEED.provider1);
    assert.equal(a.customer_id, newcomer.sub);
    assert.ok(a.accrued_at);
    assert.equal(a.billed_invoice_id, null);
    const [{ same }] = await sys(db, `select a.period_month = date_trunc('month', b.scheduled_at at time zone 'Asia/Riyadh')::date as same from sponsored_attributions a join bookings b on b.id = a.booking_id where a.id = $1`, [a.id]);
    assert.equal(same, true);
    const audit = await sys(db, `select count(*)::int n from admin_audit_logs where action = 'sponsored.attributed' and target_id = $1`, [a.id]);
    assert.equal(audit[0].n, 1);
  });

  it("is idempotent: a booking completed again accrues nothing more", async () => {
    const buyer = await fresh();
    await click(buyer, ca);
    const id = await booking(buyer.sub);
    await complete(id);
    await sys(db, `update bookings set status = 'confirmed' where id = $1`, [id]).catch(() => {});
    await complete(id).catch(() => {});
    const rows = await sys(db, `select id from sponsored_attributions where booking_id = $1`, [id]);
    assert.equal(rows.length, 1);
    await expectError(sys(db, `insert into sponsored_attributions (campaign_id, provider_id, booking_id, customer_id, is_new_client, fee_amount_sar, status, period_month)
      select campaign_id, provider_id, booking_id, customer_id, true, 1, 'accrued', period_month from sponsored_attributions where booking_id = $1`, [id]), /duplicate key|unique/i);
  });

  it("charges nothing for a returning client of that provider", async () => {
    const first = (await sys(db, `select booking_id from sponsored_attributions where customer_id = $1`, [newcomer.sub]))[0].booking_id;
    assert.ok(first);
    const second = await booking(newcomer.sub);
    await complete(second);
    const a = await attributionFor(second);
    assert.deepEqual([a.status, a.status_reason, a.is_new_client, Number(a.fee_amount_sar)], ["waived", "not_new_client", false, 0]);
  });

  it("only a click inside the attribution window counts", async () => {
    const old = await fresh();
    await click(old, ca);
    await sys(db, `update sponsored_clicks set clicked_at = now() - interval '20 days', click_day = click_day - 20 where customer_id = $1`, [old.sub]);
    const oldBooking = await booking(old.sub);
    await complete(oldBooking);
    assert.equal(await attributionFor(oldBooking), undefined);

    const inside = await fresh();
    await click(inside, ca);
    await sys(db, `update sponsored_clicks set clicked_at = now() - interval '13 days', click_day = click_day - 13 where customer_id = $1`, [inside.sub]);
    const insideBooking = await booking(inside.sub);
    await complete(insideBooking);
    assert.equal((await attributionFor(insideBooking)).status, "accrued");
  });

  it("a click after the booking was made, a click on another provider, or no click at all earns nothing", async () => {
    const late = await fresh();
    const lateBooking = await booking(late.sub);
    await click(late, ca);
    await complete(lateBooking);
    assert.equal(await attributionFor(lateBooking), undefined);

    const wrongProvider = await fresh();
    await click(wrongProvider, ca); // a campaign of provider 1 ...
    const elsewhere = await booking(wrongProvider.sub, { employee: employee2 }); // ... and a booking at provider 2
    await complete(elsewhere);
    assert.equal(await attributionFor(elsewhere), undefined);

    const organic = await fresh();
    const organicBooking = await booking(organic.sub);
    await complete(organicBooking);
    assert.equal(await attributionFor(organicBooking), undefined);

    const walkIn = await booking(null);
    await complete(walkIn);
    assert.equal(await attributionFor(walkIn), undefined);
  });

  it("a business never pays for its own visit", async () => {
    await sys(db, `insert into sponsored_clicks (campaign_id, provider_id, customer_id, click_day) values ($1, $2, $3, current_date)`, [ca, SEED.provider1, SEED.owner1]);
    const id = await booking(SEED.owner1);
    await complete(id);
    assert.equal(await attributionFor(id), undefined);
  });

  it("charges the price at the time but never more than the price the provider accepted", async () => {
    await setSetting("sponsored.price_per_new_client_sar", 40);
    const dearer = await fresh();
    const dearBooking = await visit(dearer, ca);
    assert.equal(Number((await attributionFor(dearBooking)).fee_amount_sar), PRICE); // accepted at 25.50

    await setSetting("sponsored.price_per_new_client_sar", 10);
    const cheaper = await fresh();
    const cheapBooking = await visit(cheaper, ca);
    assert.equal(Number((await attributionFor(cheapBooking)).fee_amount_sar), 10);

    // re-activating accepts the price in force
    await setStatus(owner1, ca, "paused");
    await setStatus(owner1, ca, "active");
    assert.equal(Number((await campaignRow(ca)).accepted_price_sar), 10);
    await setSetting("sponsored.price_per_new_client_sar", PRICE);
    const after = await fresh();
    assert.equal(Number((await attributionFor(await visit(after, ca))).fee_amount_sar), 10);
    await setStatus(owner1, ca, "paused");
    await setStatus(owner1, ca, "active");
    assert.equal(Number((await campaignRow(ca)).accepted_price_sar), PRICE);
  });

  it("accrues nothing while the mechanism is off (a click made earlier cannot be billed)", async () => {
    const early = await fresh();
    await click(early, ca);
    await setSetting("sponsored.enabled", false);
    const id = await booking(early.sub);
    await complete(id);
    assert.equal(await attributionFor(id), undefined);
    await setSetting("sponsored.enabled", true);
  });

  it("stops at the monthly cap: the next fee is waived with reason cap, and the campaign leaves the rotation", async () => {
    const capped = await launch(owner3, provider3, { cap: 60 });
    const ids = async () => (await place(ROLES.anon, null, null, 10)).placements.map((p) => p.campaign_id);
    assert.ok((await ids()).includes(capped));
    const customers = [await fresh(), await fresh(), await fresh()];
    const rows = [];
    for (const c of customers) rows.push(await attributionFor(await visit(c, capped, { employee: employee3 })));
    assert.deepEqual(rows.map((r) => [r.status, r.status_reason]), [["accrued", null], ["accrued", null], ["waived", "cap"]]);
    assert.deepEqual(rows.map((r) => Number(r.fee_amount_sar)), [PRICE, PRICE, PRICE]); // the waived row keeps the snapshot, it is just not billed
    assert.ok(!(await ids()).includes(capped)); // 51.00 + 25.50 would pass the 60.00 cap
    const spent = await sys(db, `select sum(fee_amount_sar) filter (where status = 'accrued') s from sponsored_attributions where campaign_id = $1`, [capped]);
    assert.equal(Number(spent[0].s), 51);
    // raising the cap brings it back
    await update(owner3, capped, 200);
    assert.ok((await ids()).includes(capped));
    await update(owner3, capped, 60);
    capturedCapped = capped;
    capturedCappedRows = rows;
  });
});

describe("administrator: void, waive, overview", () => {
  it("voids an accrued fee with a reason, once, and frees the budget", async () => {
    const accrued = capturedCappedRows[0];
    const matrix = [customer, owner1, owner3, employeeUser, reporter, stranger, ROLES.service];
    for (const user of matrix) await expectError(as(db, user, `select admin_void_sponsored_attribution($1, 'void', 'not an admin') r`, [accrued.id]), /Administrator access required/);
    await expectError(as(db, ROLES.anon, `select admin_void_sponsored_attribution($1, 'void', 'anonymous') r`, [accrued.id]), /permission denied/i);
    await expectError(as(db, admin, `select admin_void_sponsored_attribution($1, 'void', 'x') r`, [accrued.id]), /reason/);
    await expectError(as(db, admin, `select admin_void_sponsored_attribution($1, 'refund', 'valid reason') r`, [accrued.id]), /void or waive/);
    await expectError(as(db, admin, `select admin_void_sponsored_attribution('99999999-9999-4999-8999-999999999999', 'void', 'valid reason') r`), /Attribution not found/);
    const r = (await as(db, admin, `select admin_void_sponsored_attribution($1, 'void', 'duplicate customer account') r`, [accrued.id]))[0].r;
    assert.deepEqual([r.status, r.changed], ["void", true]);
    const row = (await sys(db, `select * from sponsored_attributions where id = $1`, [accrued.id]))[0];
    assert.deepEqual([row.status, row.status_reason, row.decided_by], ["void", "duplicate customer account", admin.sub]);
    assert.ok(row.decided_at);
    const again = (await as(db, admin, `select admin_void_sponsored_attribution($1, 'void', 'duplicate customer account') r`, [accrued.id]))[0].r;
    assert.equal(again.changed, false);
    await expectError(as(db, admin, `select admin_void_sponsored_attribution($1, 'waive', 'changed my mind') r`, [accrued.id]), /Only an accrued fee/);
    const audit = await sys(db, `select details from admin_audit_logs where action = 'sponsored.attribution_void' and target_id = $1`, [accrued.id]);
    assert.equal(audit.length, 1);
    assert.equal(audit[0].details.reason, "duplicate customer account");
  });

  it("waives an accrued fee (the fee was right, the platform forgives it)", async () => {
    const accrued = capturedCappedRows[1];
    const r = (await as(db, admin, `select admin_void_sponsored_attribution($1, 'waive', 'goodwill after a complaint') r`, [accrued.id]))[0].r;
    assert.deepEqual([r.status, r.changed], ["waived", true]);
    assert.equal((await sys(db, `select status from sponsored_attributions where id = $1`, [accrued.id]))[0].status, "waived");
    // both are out of billing now, so the capped campaign has its whole budget back
    const spent = await sys(db, `select coalesce(sum(fee_amount_sar), 0) s from sponsored_attributions where campaign_id = $1 and status = 'accrued'`, [capturedCapped]);
    assert.equal(Number(spent[0].s), 0);
  });

  it("the overview adds up to the table, and only an administrator reads it", async () => {
    const o = (await as(db, admin, `select admin_sponsored_overview() r`))[0].r;
    const direct = (await sys(db, `select
        coalesce(sum(fee_amount_sar) filter (where status = 'accrued'), 0) accrued, count(*) filter (where status = 'accrued')::int accrued_n,
        coalesce(sum(fee_amount_sar) filter (where status = 'waived'), 0) waived, count(*) filter (where status = 'waived')::int waived_n,
        coalesce(sum(fee_amount_sar) filter (where status = 'void'), 0) void, count(*) filter (where status = 'void')::int void_n
      from sponsored_attributions where period_month = date_trunc('month', now() at time zone 'Asia/Riyadh')::date`))[0];
    assert.equal(Number(o.totals.accrued_sar), Number(direct.accrued));
    assert.equal(o.totals.new_clients, direct.accrued_n);
    assert.equal(Number(o.totals.waived_sar), Number(direct.waived));
    assert.equal(o.totals.waived_count, direct.waived_n);
    assert.equal(Number(o.totals.void_sar), Number(direct.void));
    assert.equal(o.totals.void_count, direct.void_n);
    assert.equal(o.currency, "SAR");
    assert.equal(o.config.configured, true);
    assert.equal(o.attributions.length, direct.accrued_n + direct.waived_n + direct.void_n);
    for (const user of [customer, owner1, employeeUser, reporter, stranger, ROLES.service]) {
      await expectError(as(db, user, `select admin_sponsored_overview() r`), /Administrator access required/);
    }
    await expectError(as(db, ROLES.anon, `select admin_sponsored_overview() r`), /permission denied/i);
  });
});

describe("the statement and the invoice line", () => {
  let c; let firstVisit; let secondVisit; let thirdVisit; let lateVisit; let invoiceId;
  const lastMonth = () => sys(db, `select to_char(date_trunc('month', now() at time zone 'Asia/Riyadh') - interval '1 month', 'YYYY-MM-DD') d`).then((r) => r[0].d);
  const feesFor = (month) => as(db, admin, `select sponsored_fees_for_month($1, $2::date) r`, [SEED.provider2, month]).then((r) => r[0].r);
  const statement = (user, provider = SEED.provider2, month = null) =>
    as(db, user, `select sponsored_statement($1, $2::date) r`, [provider, month]).then((r) => r[0].r);

  before(async () => {
    c = await launch(owner2, SEED.provider2, { cap: 500 });
    firstVisit = await visit(await fresh(), c, { month: "last", employee: employee2 });
    secondVisit = await visit(await fresh(), c, { month: "last", employee: employee2 });
    thirdVisit = await visit(await fresh(), c, { month: "last", employee: employee2 });
    const third = await attributionFor(thirdVisit);
    await as(db, admin, `select admin_void_sponsored_attribution($1, 'void', 'test: a refunded visit') r`, [third.id]);
  });

  it("the monthly sum is the accrued, unvoided fees of that month (two fees of 25.50)", async () => {
    const m = await lastMonth();
    const sum = await feesFor(m);
    assert.deepEqual([sum.lines, Number(sum.accrued_sar), Number(sum.billed_sar), Number(sum.unbilled_sar)], [2, 51, 0, 51]);
    await expectError(as(db, owner2, `select sponsored_fees_for_month($1, $2::date) r`, [SEED.provider2, m]), /Only administrators or the scheduler/);
    await expectError(as(db, customer, `select sponsored_fees_for_month($1, $2::date) r`, [SEED.provider2, m]), /Only administrators or the scheduler/);
    assert.equal(Number((await as(db, ROLES.service, `select sponsored_fees_for_month($1, $2::date) r`, [SEED.provider2, m]))[0].r.accrued_sar), 51);
  });

  it("the monthly batch puts the sponsored fees on the provider's fee invoice, once", async () => {
    const m = await lastMonth();
    const run = (await as(db, ROLES.service, `select issue_monthly_fee_invoices($1::date) r`, [m]))[0].r;
    assert.ok(run.issued >= 1);
    const inv = (await sys(db, `select * from provider_fee_invoices where provider_id = $1 and period_start = $2::date`, [SEED.provider2, m]))[0];
    invoiceId = inv.id;
    assert.equal(Number(inv.sponsored_fees_sar), 51);
    // the demo bookings carry no commission, so the whole invoice is the sponsored line: 0 + 51.00 and no VAT invented on it
    assert.deepEqual([Number(inv.net_fee_receivable_sar), Number(inv.vat_on_commission_sar), Number(inv.total_invoice_due_sar)], [0, 0, 51]);
    assert.equal(inv.status, "issued"); // it was "settled" at 0 before the sponsored line made it payable
    const lines = await sys(db, `select id, billed_invoice_id from sponsored_attributions where provider_id = $1 and period_month = $2::date and status = 'accrued'`, [SEED.provider2, m]);
    assert.equal(lines.length, 2);
    assert.ok(lines.every((l) => l.billed_invoice_id === invoiceId));
    const sum = await feesFor(m);
    assert.deepEqual([Number(sum.billed_sar), Number(sum.unbilled_sar)], [51, 0]);
    // a repeat run bills nothing twice and rewrites nothing
    const again = (await as(db, ROLES.service, `select issue_monthly_fee_invoices($1::date) r`, [m]))[0].r;
    assert.equal(again.issued, 0);
    const replay = (await as(db, ROLES.service, `select generate_provider_monthly_fee_invoice($1, $2::date) r`, [SEED.provider2, m]))[0].r;
    assert.equal(replay.already_issued, true);
    const after = (await sys(db, `select sponsored_fees_sar, total_invoice_due_sar from provider_fee_invoices where id = $1`, [invoiceId]))[0];
    assert.deepEqual([Number(after.sponsored_fees_sar), Number(after.total_invoice_due_sar)], [51, 51]);
    assert.equal((await sys(db, `select count(*)::int n from admin_audit_logs where action = 'sponsored.billed' and target_id = $1`, [invoiceId]))[0].n, 1);
  });

  it("a fee accrued after the invoice was issued waits for the next invoice; the issued one is never rewritten", async () => {
    const m = await lastMonth();
    lateVisit = await visit(await fresh(), c, { month: "last", employee: employee2 });
    const late = await attributionFor(lateVisit);
    assert.deepEqual([late.status, late.billed_invoice_id], ["accrued", null]);
    const sum = await feesFor(m);
    assert.deepEqual([Number(sum.billed_sar), Number(sum.unbilled_sar), Number(sum.accrued_sar)], [51, PRICE, 76.5]);
    const inv = (await sys(db, `select sponsored_fees_sar, total_invoice_due_sar from provider_fee_invoices where id = $1`, [invoiceId]))[0];
    assert.deepEqual([Number(inv.sponsored_fees_sar), Number(inv.total_invoice_due_sar)], [51, 51]);
  });

  it("a fee already on an issued invoice cannot be voided or waived: the invoice is corrected by a credit", async () => {
    const billed = (await sys(db, `select id from sponsored_attributions where billed_invoice_id = $1 limit 1`, [invoiceId]))[0].id;
    await expectError(as(db, admin, `select admin_void_sponsored_attribution($1, 'void', 'too late') r`, [billed]), /already on an issued invoice/);
    await expectError(as(db, admin, `select admin_void_sponsored_attribution($1, 'waive', 'too late') r`, [billed]), /already on an issued invoice/);
    const late = await attributionFor(lateVisit);
    const r = (await as(db, admin, `select admin_void_sponsored_attribution($1, 'waive', 'billing error on our side') r`, [late.id]))[0].r;
    assert.equal(r.status, "waived");
  });

  it("the statement arithmetic: totals equal the lines, billed plus unbilled equals accrued", async () => {
    const m = await lastMonth();
    const s = await statement(owner2, SEED.provider2, m);
    assert.equal(s.month, m.slice(0, 7));
    assert.equal(s.currency, "SAR");
    const sum = (status) => s.lines.filter((l) => l.status === status).reduce((acc, l) => acc + Number(l.fee_amount_sar), 0);
    assert.equal(s.lines.length, 4);
    assert.equal(Number(s.totals.accrued_sar), sum("accrued"));
    assert.equal(Number(s.totals.accrued_sar), 51);
    assert.equal(Number(s.totals.waived_sar), sum("waived"));
    assert.equal(Number(s.totals.waived_sar), PRICE);
    assert.equal(Number(s.totals.void_sar), sum("void"));
    assert.equal(Number(s.totals.void_sar), PRICE);
    assert.equal(Number(s.totals.billed_sar) + Number(s.totals.unbilled_sar), Number(s.totals.accrued_sar));
    assert.equal(Number(s.totals.billed_sar), 51);
    assert.equal(s.totals.new_clients, 2);
    const billedLines = s.lines.filter((l) => l.status === "accrued");
    assert.ok(billedLines.every((l) => /^FEE-/.test(l.invoice_number)));
    const camp = s.campaigns.find((x) => x.campaign_id === c);
    assert.equal(Number(camp.spent_sar), 51);
    assert.equal(Number(camp.cap_remaining_sar), 500 - 51);
    assert.equal(camp.new_clients, 2);
    // the clicks of this month: four visits clicked now, the statement of the current month counts them
    const now = await statement(owner2);
    assert.equal(now.clicks, 4);
    assert.equal(now.campaigns.find((x) => x.campaign_id === c).clicks, 4);
  });

  it("the statement is for the owner, a delegate with reports, an administrator and the scheduler only", async () => {
    for (const user of [owner1, reporter, admin, ROLES.service]) {
      const s = await statement(user, SEED.provider1);
      assert.equal(s.provider_id, SEED.provider1);
    }
    for (const user of [customer, stranger, owner2, employeeUser, frontDesk]) await expectError(statement(user, SEED.provider1), /Provider not found/);
    await expectError(statement(owner1, "99999999-9999-4999-8999-999999999999"), /Provider not found/);
    await expectError(statement(ROLES.anon), /permission denied|Authentication/i);
    // no personal data in a statement line: no customer id, no name
    const s = await statement(owner2, SEED.provider2, await lastMonth());
    for (const line of s.lines) assert.ok(!("customer_id" in line));
  });
});

describe("row level security on the tables", () => {
  const count = (user, table, provider) =>
    as(db, user, `select count(*)::int n from ${table} where provider_id = $1`, [provider]).then((r) => r[0].n);

  it("the owner, a delegate with reports and an administrator read; everyone else reads nothing", async () => {
    for (const table of ["sponsored_campaigns", "sponsored_clicks", "sponsored_attributions"]) {
      const total = (await sys(db, `select count(*)::int n from ${table} where provider_id = $1`, [SEED.provider1]))[0].n;
      assert.ok(total > 0, `${table} has fixtures`);
      assert.equal(await count(owner1, table, SEED.provider1), total);
      assert.equal(await count(reporter, table, SEED.provider1), total);
      assert.equal(await count(admin, table, SEED.provider1), total);
      for (const user of [owner2, customer, stranger, employeeUser, frontDesk]) assert.equal(await count(user, table, SEED.provider1), 0, `${table} hidden`);
      await expectError(as(db, ROLES.anon, `select count(*) from ${table}`), /permission denied/i);
    }
  });

  it("nobody writes the tables directly", async () => {
    const [target] = await sys(db, `select id from sponsored_campaigns where provider_id = $1 limit 1`, [SEED.provider1]);
    for (const user of [owner1, admin, reporter, customer]) {
      const updated = await as(db, user, `update sponsored_campaigns set monthly_budget_cap_sar = 999999 where id = $1 returning id`, [target.id]).catch(() => []);
      assert.deepEqual(updated, []);
      const deleted = await as(db, user, `delete from sponsored_campaigns where id = $1 returning id`, [target.id]).catch(() => []);
      assert.deepEqual(deleted, []);
      await expectError(as(db, user, `insert into sponsored_campaigns (provider_id, monthly_budget_cap_sar, starts_on) values ($1, 1, current_date)`, [SEED.provider1]),
        /permission denied|row-level security/i);
      const fabricated = await as(db, user, `update sponsored_attributions set fee_amount_sar = 0 where provider_id = $1 returning id`, [SEED.provider1]).catch(() => []);
      assert.deepEqual(fabricated, []);
    }
    assert.notEqual(Number((await campaignRow(target.id)).monthly_budget_cap_sar), 999999);
  });

  it("a campaign id is the only thing a visitor ever receives, and an unknown provider leaks nothing", async () => {
    const [{ r }] = await as(db, ROLES.anon, `select get_sponsored_placements(null, null, 10) r`);
    for (const p of r.placements) assert.ok(!("monthly_budget_cap_sar" in p) && !("accepted_price_sar" in p) && !("customer_id" in p));
  });
});
