import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, ROLES, SEED, sys } from "./harness.mjs";

// G75 professional identity portable across salons, against the full migrated schema.
//   * handle rules, profile validation, publish / unpublish
//   * what an anonymous visitor can learn (one function, nothing private)
//   * the two-sided handshake (invite, accept, decline, withdraw, end) and every role that must be refused
//   * a link ends by itself when the employee row is deactivated, released or removed
//   * moving between salons: the profile and the followers stay, the opted-in followers are told once, rate limited, off until configured
//   * follower privacy, administrator commands (reason required, audited), RLS and the state machine
let db;
let admin;
let pro;           // the professional: employee SEED.employee1 of salon 1
let proTwo;        // a second professional (employee of salon 1) used for the handshake paths
let noProfile;     // an employee of salon 1 who never created a professional profile
let delegateStaff; // delegate of salon 1 holding the staff permission
let delegateBookings; // delegate of salon 1 holding only the bookings permission
let customer;
let customerTwo;
let customerThree;
let stranger;      // a signed-in person with no relation to anything
const owner1 = ROLES.user(SEED.owner1);
const owner2 = ROLES.user(SEED.owner2);
const BRANCH2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2"; // salon 2
let proEmployeeId = SEED.employee1;
let proTwoEmployeeId;
let noProfileEmployeeId;
let inactiveEmployeeId;
let noLoginEmployeeId;

const call = (user, sql, params = []) => as(db, user, sql, params).then((r) => r[0]?.r);
const sqlstate = (promise) => promise.then(() => "ok", (e) => e.code ?? e.message);
const arr = (a) => `{${a.map((x) => `"${x.replace(/(["\\])/g, "\\$1")}"`).join(",")}}`;
const count = async (table, where = "true", params = []) => (await sys(db, `select count(*)::int n from ${table} where ${where}`, params))[0].n;
const setSetting = (key, value) => sys(db,
  `insert into platform_settings (key, value, description) values ($1, $2::jsonb, 'test') on conflict (key) do update set value = excluded.value`,
  [key, JSON.stringify(value)]);
const clearSetting = (key) => sys(db, `delete from platform_settings where key = $1`, [key]);

const save = (user, o = {}) => call(user,
  `select save_professional_profile($1, $2, $3, $4, $5, $6, $7, $8::text[], $9::text[]) r`,
  [o.handle ?? "omar-barber", o.en ?? "Omar Khaled", o.ar ?? "عمر خالد", o.hen ?? "Master barber", o.har ?? "حلاق محترف",
    o.ben ?? "Fades and beards, ten years.", o.bar ?? "قصّات وتشذيب لحية منذ عشر سنوات.", arr(o.spec ?? ["Fade", "Beard"]), arr(o.lang ?? ["ar", "en"])]);
const publish = (user, flag = true) => call(user, `select publish_professional_profile($1) r`, [flag]);
const publicProfile = (user, handle) => call(user, `select public_professional_profile($1) r`, [handle]);
const invite = (user, employeeId) => call(user, `select invite_professional_link($1) r`, [employeeId]);
const respond = (user, id, accept) => call(user, `select respond_professional_invitation($1, $2) r`, [id, accept]);
const endLink = (user, id) => call(user, `select end_professional_link($1) r`, [id]);
const follow = (user, handle, notify = false) => call(user, `select follow_professional($1, $2) r`, [handle, notify]);
const identity = (user) => call(user, `select my_professional_identity() r`);
const workplace = async (id) => (await sys(db, `select * from professional_workplaces where id = $1`, [id]))[0];
const moveNotices = (userId) => sys(db, `select * from notifications where user_id = $1 and type = 'professional_move' order by created_at`, [userId]);

async function newEmployee(branch, profileId, { active = true, name = "Staff Member" } = {}) {
  const [row] = await sys(db,
    `insert into employees (branch_id, profile_id, name_en, name_ar, is_active) values ($1, $2, $3, $4, $5) returning id`,
    [branch, profileId, name, "موظف", active]);
  return row.id;
}

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  pro = ROLES.user(await createUser(db, { role: "provider_employee" }));
  proTwo = ROLES.user(await createUser(db, { role: "provider_employee" }));
  noProfile = ROLES.user(await createUser(db, { role: "provider_employee" }));
  delegateStaff = ROLES.user(await createUser(db, { role: "provider_employee" }));
  delegateBookings = ROLES.user(await createUser(db, { role: "provider_employee" }));
  customer = ROLES.user(await createUser(db));
  customerTwo = ROLES.user(await createUser(db));
  customerThree = ROLES.user(await createUser(db));
  stranger = ROLES.user(await createUser(db));
  await sys(db, `update employees set profile_id = $1 where id = $2`, [pro.sub, proEmployeeId]);
  proTwoEmployeeId = await newEmployee(SEED.branch1, proTwo.sub, { name: "Second Pro" });
  noProfileEmployeeId = await newEmployee(SEED.branch1, noProfile.sub, { name: "No Profile" });
  inactiveEmployeeId = await newEmployee(SEED.branch1, null, { active: false, name: "Inactive" });
  noLoginEmployeeId = await newEmployee(SEED.branch1, null, { name: "No Login" });
  for (const [who, permissions] of [[delegateStaff, { staff: true }], [delegateBookings, { bookings: true }]]) {
    await newEmployee(SEED.branch1, who.sub, { name: "Front Desk" });
    await sys(db, `insert into provider_memberships (provider_id, user_id, role, permissions, is_active) values ($1, $2, 'manager', $3::jsonb, true)`,
      [SEED.provider1, who.sub, JSON.stringify(permissions)]);
  }
});

describe("the test session", () => {
  it("runs in UTC, like a hosted session, and stores moments as timestamptz", async () => {
    assert.equal((await sys(db, `select current_setting('TimeZone') tz`))[0].tz, "UTC");
    const cols = await sys(db, `select column_name, data_type from information_schema.columns
      where table_name = 'professional_workplaces' and column_name in ('invited_at', 'started_at', 'ended_at') order by 1`);
    assert.deepEqual(cols.map((c) => c.data_type), ["timestamp with time zone", "timestamp with time zone", "timestamp with time zone"]);
  });
});

describe("handles", () => {
  it("refuses a handle that is not 3 to 30 lowercase ASCII letters, digits and single hyphens", async () => {
    for (const bad of ["ab", "a".repeat(31), "has_underscore", "has space", "double--hyphen", "-leading", "trailing-", "عمر-حلاق", "dot.dot", "emoji-\u{1F488}", ""]) {
      assert.equal(await sqlstate(save(pro, { handle: bad })), "22023", `"${bad}" must be refused`);
    }
    assert.equal(await count("professional_profiles"), 0);
  });

  it("refuses a reserved word and tells the form why", async () => {
    for (const word of ["admin", "support", "shop", "primora", "Admin"]) {
      assert.equal(await sqlstate(save(pro, { handle: word })), "22023", `"${word}" is reserved`);
    }
    const r = await call(pro, `select professional_handle_available('admin') r`);
    assert.deepEqual(r, { available: false, problem: "reserved" });
    assert.deepEqual(await call(pro, `select professional_handle_available('bad_one') r`), { available: false, problem: "invalid" });
    assert.deepEqual(await call(pro, `select professional_handle_available('omar-barber') r`), { available: true, problem: null });
  });

  it("only a registered professional of a salon can create a profile; anonymous visitors cannot call it at all", async () => {
    assert.equal(await sqlstate(save(customer)), "42501");
    assert.equal(await sqlstate(save(stranger)), "42501");
    assert.equal(await sqlstate(save(owner1)), "42501", "an owner without an employee row is not a professional");
    assert.equal(await sqlstate(save(ROLES.anon)), "42501");
    assert.equal(await sqlstate(save(ROLES.service)), "28000");
    assert.equal(await count("professional_profiles"), 0);
  });

  it("tells a person who is not staff that there is nothing to create, and a member of staff what to prefill", async () => {
    assert.deepEqual(await identity(customer), { can_create: false, suggested_names: null, profile: null, portfolio: [], invitations: [], workplaces: [], follower_count: 0 });
    const staff = await identity(noProfile);
    assert.equal(staff.can_create, true);
    assert.deepEqual(staff.suggested_names, { en: "No Profile", ar: "موظف" });
    assert.equal(staff.profile, null);
    assert.equal(await sqlstate(identity(ROLES.anon)), "42501");
  });

  it("validates the profile fields in both languages", async () => {
    assert.equal(await sqlstate(save(pro, { en: "  " })), "22023");
    assert.equal(await sqlstate(save(pro, { ar: "" })), "22023");
    assert.equal(await sqlstate(save(pro, { en: "x".repeat(81) })), "22023");
    assert.equal(await sqlstate(save(pro, { hen: "x".repeat(121) })), "22023");
    assert.equal(await sqlstate(save(pro, { ben: "x".repeat(1001) })), "22023");
    assert.equal(await sqlstate(save(pro, { lang: ["arabic"] })), "22023");
    assert.equal(await sqlstate(save(pro, { lang: ["ar", "EN!"] })), "22023");
    assert.equal(await sqlstate(save(pro, { spec: ["x"] })), "22023");
    assert.equal(await sqlstate(save(pro, { spec: Array.from({ length: 21 }, (_, i) => `Skill ${i}`) })), "22023");
    assert.equal(await count("professional_profiles"), 0);
  });

  it("creates the profile, trims and de-duplicates the lists, and edits it again without creating a second one", async () => {
    const created = await save(pro, { handle: "  Omar-Barber ", spec: [" Fade ", "Beard", "Fade", ""], lang: ["AR", "en", "ar"] });
    assert.deepEqual(created, { handle: "omar-barber", created: true });
    const mine = (await identity(pro)).profile;
    assert.deepEqual(mine.specialties, ["Fade", "Beard"]);
    assert.deepEqual(mine.languages, ["ar", "en"]);
    assert.equal(mine.is_published, false);
    const again = await save(pro, { handle: "omar-barber", hen: "Head barber" });
    assert.deepEqual(again, { handle: "omar-barber", created: false });
    assert.equal(await count("professional_profiles"), 1);
    assert.equal((await identity(pro)).profile.headline_en, "Head barber");
  });

  it("refuses a taken handle, and a second profile cannot reuse it", async () => {
    assert.equal(await sqlstate(save(proTwo, { handle: "omar-barber", en: "Second", ar: "الثاني" })), "23505");
    assert.deepEqual(await call(proTwo, `select professional_handle_available('omar-barber') r`), { available: false, problem: "taken" });
  });

  it("lets the owner rename an unpublished handle, then locks it once published", async () => {
    assert.equal((await save(pro, { handle: "omar-cuts" })).handle, "omar-cuts");
    assert.equal((await save(pro, { handle: "omar-barber" })).handle, "omar-barber");
    await publish(pro);
    assert.equal(await sqlstate(save(pro, { handle: "omar-cuts" })), "22023");
    await publish(pro, false);
    assert.equal(await sqlstate(save(pro, { handle: "omar-cuts" })), "22023", "unpublishing does not unlock a handle that was public");
    assert.equal((await identity(pro)).profile.handle_locked, true);
  });
});

describe("the public page", () => {
  it("answers nothing for a profile that is not published", async () => {
    assert.equal(await publicProfile(ROLES.anon, "omar-barber"), null);
    assert.equal(await publicProfile(customer, "omar-barber"), null);
    assert.equal(await publicProfile(pro, "omar-barber"), null, "even the owner sees the preview on the identity page, not here");
    assert.equal(await publicProfile(ROLES.anon, "no-such-handle"), null);
    assert.equal(await publicProfile(ROLES.anon, "x".repeat(200)), null);
  });

  it("publishes, and an anonymous visitor reads exactly the public fields", async () => {
    assert.deepEqual(await publish(pro), { handle: "omar-barber", is_published: true });
    assert.deepEqual(await publish(pro), { handle: "omar-barber", is_published: true }, "publishing again changes nothing");
    const page = await publicProfile(ROLES.anon, "OMAR-BARBER");
    assert.deepEqual(Object.keys(page).sort(), ["bio_ar", "bio_en", "display_name_ar", "display_name_en", "handle", "headline_ar", "headline_en",
      "languages", "portfolio", "specialties", "viewer", "workplaces"]);
    assert.equal(page.display_name_ar, "عمر خالد");
    assert.deepEqual(page.workplaces, []);
    assert.deepEqual(page.viewer, { signed_in: false, is_self: false, follows: false, notify_on_move: false });
  });

  it("leaks nothing private: no phone, email, address, internal id or login", async () => {
    const text = JSON.stringify(await publicProfile(ROLES.anon, "omar-barber"));
    const [emp] = await sys(db, `select id, phone, email from employees where id = $1`, [proEmployeeId]);
    const [branch] = await sys(db, `select id, address_text_en, address_text_ar from branches where id = $1`, [SEED.branch1]);
    for (const secret of [pro.sub, emp.id, emp.phone, emp.email, branch.address_text_en, branch.address_text_ar, SEED.owner1, SEED.provider1]) {
      assert.ok(secret && !text.includes(secret), `the public page must not contain ${secret}`);
    }
    assert.ok(!/follower|phone|email|profile_id|owner_id|employee_id/i.test(text));
  });

  it("is the only professional function an anonymous visitor can run, and reads no table", async () => {
    const rows = await sys(db, `select p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace
      and (p.proname like '%professional%') and p.prorettype <> 'trigger'::regtype and has_function_privilege('anon', p.oid, 'EXECUTE') order by 1`);
    assert.deepEqual(rows.map((r) => r.proname), ["public_professional_profile"]);
    for (const table of ["professional_profiles", "professional_workplaces", "professional_follows", "professional_portfolio_items",
      "professional_handle_redirects", "professional_reserved_handles"]) {
      assert.equal(await sqlstate(as(db, ROLES.anon, `select count(*) from ${table}`)), "42501", `anonymous select on ${table}`);
    }
  });
});

describe("portfolio links", () => {
  it("accepts https links only and requires a profile", async () => {
    const add = (user, url, title = "Fade") => call(user, `select add_professional_portfolio_item($1, $2, $3) r`, [title, "قصة", url]);
    for (const bad of ["http://example.com/a", "javascript:alert(1)", "https://has space.com", "ftp://x.com/y", "", "https://" + "a".repeat(500) + ".com"]) {
      assert.equal(await sqlstate(add(pro, bad)), "22023", `"${bad.slice(0, 30)}" must be refused`);
    }
    assert.equal(await sqlstate(add(pro, "https://example.com/a", "x".repeat(101))), "22023");
    assert.equal(await sqlstate(add(customer, "https://example.com/a")), "P0002");
    assert.equal(await sqlstate(add(ROLES.anon, "https://example.com/a")), "42501");
    const one = await add(pro, "https://example.com/work/1");
    await add(pro, "https://example.com/work/2");
    const page = await publicProfile(ROLES.anon, "omar-barber");
    assert.deepEqual(page.portfolio.map((p) => p.url), ["https://example.com/work/1", "https://example.com/work/2"]);
    assert.ok(one.id);
  });

  it("has no limit until pro.max_portfolio_items is set, then enforces it", async () => {
    const add = (url) => call(pro, `select add_professional_portfolio_item('t', 't', $1) r`, [url]);
    await add("https://example.com/work/3");
    await setSetting("pro.max_portfolio_items", 3);
    assert.equal(await sqlstate(add("https://example.com/work/4")), "22023");
    await setSetting("pro.max_portfolio_items", 4);
    await add("https://example.com/work/4");
    await clearSetting("pro.max_portfolio_items");
  });

  it("removes only your own link", async () => {
    const items = (await identity(pro)).portfolio;
    assert.equal(await sqlstate(call(proTwo, `select remove_professional_portfolio_item($1) r`, [items[0].id])), "P0002");
    assert.equal(await sqlstate(call(customer, `select remove_professional_portfolio_item($1) r`, [items[0].id])), "P0002");
    assert.equal(await sqlstate(call(ROLES.anon, `select remove_professional_portfolio_item($1) r`, [items[0].id])), "42501");
    assert.deepEqual(await call(pro, `select remove_professional_portfolio_item($1) r`, [items[0].id]), { removed: true });
    assert.equal(await sqlstate(call(pro, `select remove_professional_portfolio_item($1) r`, [items[0].id])), "P0002");
  });
});

describe("the handshake", () => {
  let link;

  it("lets the salon owner invite an employee row that has a login and a profile, and tells the professional", async () => {
    const result = await invite(owner1, proEmployeeId);
    assert.equal(result.status, "invited");
    assert.equal(result.replayed, false);
    link = result.workplace_id;
    const [note] = await sys(db, `select * from notifications where user_id = $1 and type = 'professional_link'`, [pro.sub]);
    assert.ok(note.title_en && note.title_ar && note.body_en && note.body_ar);
    assert.equal(note.data.url, "/provider/identity");
    assert.equal((await publicProfile(ROLES.anon, "omar-barber")).workplaces.length, 0, "a pending invitation is not a workplace");
  });

  it("replays an invitation without creating another", async () => {
    const again = await invite(owner1, proEmployeeId);
    assert.equal(again.workplace_id, link);
    assert.equal(again.replayed, true);
    assert.equal(await count("professional_workplaces", "employee_id = $1", [proEmployeeId]), 1);
  });

  it("refuses everybody who is not that salon's owner or a delegate with the staff permission", async () => {
    // Another salon's owner, a customer, a stranger, an employee, a bookings-only delegate and an administrator all get "not found".
    for (const who of [owner2, customer, stranger, proTwo, delegateBookings, admin]) {
      assert.equal(await sqlstate(invite(who, proTwoEmployeeId)), "P0002");
    }
    assert.equal(await sqlstate(invite(ROLES.anon, proTwoEmployeeId)), "42501");
    assert.equal(await sqlstate(invite(ROLES.service, proTwoEmployeeId)), "28000");
    assert.equal(await sqlstate(invite(owner1, "00000000-0000-4000-8000-000000000001")), "P0002");
    assert.equal(await count("professional_workplaces", "employee_id = $1", [proTwoEmployeeId]), 0);
  });

  it("refuses to invite an employee who has no profile, no login or is inactive", async () => {
    assert.equal(await sqlstate(invite(owner1, noProfileEmployeeId)), "22023");
    assert.equal(await sqlstate(invite(owner1, noLoginEmployeeId)), "22023");
    assert.equal(await sqlstate(invite(owner1, inactiveEmployeeId)), "22023");
  });

  it("lets a delegate with the staff permission invite", async () => {
    await save(proTwo, { handle: "second-pro", en: "Second Pro", ar: "الثاني" });
    const r = await invite(delegateStaff, proTwoEmployeeId);
    assert.equal(r.status, "invited");
    const row = await workplace(r.workplace_id);
    assert.equal(row.invited_by, delegateStaff.sub);
  });

  it("limits a delegate who holds the staff permission for one branch to that branch's employees", async () => {
    const [branchB] = await sys(db, `insert into branches (provider_id, name_en, name_ar, address_text_en, address_text_ar, latitude, longitude)
      values ($1, 'Second branch', 'الفرع الثاني', 'Test street', 'شارع الاختبار', 24.7, 46.7) returning id`, [SEED.provider1]);
    const branchLead = ROLES.user(await createUser(db, { role: "provider_employee" }));
    await newEmployee(SEED.branch1, branchLead.sub, { name: "Branch Lead" });
    await sys(db, `insert into provider_memberships (provider_id, user_id, branch_id, role, permissions, is_active)
      values ($1, $2, $3, 'branch_manager', '{"staff":true}', true)`, [SEED.provider1, branchLead.sub, branchB.id]);
    const other = ROLES.user(await createUser(db, { role: "provider_employee" }));
    const otherEmployee = await newEmployee(branchB.id, other.sub, { name: "Branch B Pro" });
    await save(other, { handle: "branch-b-pro", en: "Branch B Pro", ar: "محترف الفرع" });

    assert.equal(await sqlstate(invite(branchLead, proTwoEmployeeId)), "P0002", "an employee of another branch is out of scope");
    assert.equal((await invite(branchLead, otherEmployee)).status, "invited");
    const rows = await call(branchLead, `select provider_professional_links($1) r`, [SEED.provider1]);
    assert.deepEqual(rows.map((row) => row.employee_id), [otherEmployee], "the list holds only this branch's employees");
  });

  it("shows the salon the state of each employee without exposing the profile", async () => {
    const rows = await call(owner1, `select provider_professional_links($1) r`, [SEED.provider1]);
    const mine = rows.find((x) => x.employee_id === proEmployeeId);
    assert.equal(mine.link_status, "invited");
    assert.equal(mine.has_profile, true);
    assert.equal(mine.handle, null, "the handle is shown only after the professional accepted");
    assert.equal(rows.find((x) => x.employee_id === noProfileEmployeeId).has_profile, false);
    assert.equal(rows.find((x) => x.employee_id === noLoginEmployeeId).has_login, false);
    assert.ok(!rows.some((x) => x.employee_id === inactiveEmployeeId), "inactive rows are not listed");
    assert.ok(!JSON.stringify(rows).includes(pro.sub), "no login id leaves the function");
    for (const who of [owner2, customer, stranger, proTwo, delegateBookings, admin]) {
      assert.equal(await sqlstate(call(who, `select provider_professional_links($1) r`, [SEED.provider1])), "P0002");
    }
    assert.equal(await sqlstate(call(ROLES.anon, `select provider_professional_links($1) r`, [SEED.provider1])), "42501");
    assert.equal((await call(delegateStaff, `select provider_professional_links($1) r`, [SEED.provider1])).length, rows.length);
  });

  it("shows the professional the invitation on their own screen", async () => {
    const mine = await identity(pro);
    assert.equal(mine.invitations.length, 1);
    assert.equal(mine.invitations[0].id, link);
    assert.ok(mine.invitations[0].name_en && mine.invitations[0].name_ar);
    assert.deepEqual(mine.workplaces, []);
  });

  it("refuses an acceptance by anybody but the professional it is addressed to", async () => {
    for (const who of [owner1, owner2, customer, stranger, proTwo, delegateStaff, admin]) {
      assert.equal(await sqlstate(respond(who, link, true)), "P0002", "impersonating the professional");
    }
    assert.equal(await sqlstate(respond(ROLES.anon, link, true)), "42501");
    assert.equal((await workplace(link)).status, "invited");
  });

  it("starts the link when the professional accepts, and a replay changes nothing", async () => {
    const r = await respond(pro, link, true);
    assert.equal(r.status, "active");
    assert.equal(r.move_notice, "first_link", "the first link is not a move");
    const row = await workplace(link);
    assert.ok(row.started_at && !row.ended_at && row.responded_at);
    assert.deepEqual(await respond(pro, link, true), { workplace_id: link, status: "active", replayed: true });
    assert.equal(await sqlstate(respond(pro, link, false)), "22023", "an active link is ended, not declined");
  });

  it("shows the active workplace on the public page, with the salon's public data only", async () => {
    const page = await publicProfile(ROLES.anon, "omar-barber");
    assert.equal(page.workplaces.length, 1);
    const [w] = page.workplaces;
    assert.deepEqual(Object.keys(w).sort(), ["book_url", "city", "name_ar", "name_en", "shop_url", "since"]);
    assert.equal(w.shop_url, `/shop/${SEED.provider1}`);
    assert.equal(w.book_url, `/shop/${SEED.provider1}?source=link`);
    const text = JSON.stringify(page);
    assert.ok(!text.includes(pro.sub) && !text.includes(proEmployeeId) && !text.includes(link));
    const links = await call(owner1, `select provider_professional_links($1) r`, [SEED.provider1]);
    assert.equal(links.find((x) => x.employee_id === proEmployeeId).handle, "omar-barber");
  });

  it("lets only the two sides end a link, and keeps the row with an end date", async () => {
    for (const who of [owner2, customer, stranger, proTwo, delegateBookings, admin]) {
      assert.equal(await sqlstate(endLink(who, link)), "P0002");
    }
    assert.equal(await sqlstate(endLink(ROLES.anon, link)), "42501");
    const ended = await endLink(owner1, link);
    assert.equal(ended.status, "former");
    const row = await workplace(link);
    assert.equal(row.closed_by, "provider");
    assert.ok(row.ended_at && row.started_at && new Date(row.ended_at) >= new Date(row.started_at));
    assert.equal((await publicProfile(ROLES.anon, "omar-barber")).workplaces.length, 0);
    assert.deepEqual(await endLink(owner1, link), { workplace_id: link, status: "former", replayed: true });
    assert.equal(await sqlstate(endLink(pro, link)), "ok", "the professional can also call it on a finished link; it only reports");
    assert.equal(await count("professional_workplaces", "id = $1", [link]), 1, "history is never deleted");
    const mine = await identity(pro);
    assert.equal(mine.workplaces[0].status, "former");
  });

  it("lets the professional end a running link", async () => {
    const r = await invite(owner1, proEmployeeId);
    await respond(pro, r.workplace_id, true);
    const ended = await endLink(pro, r.workplace_id);
    assert.equal(ended.status, "former");
    assert.equal((await workplace(r.workplace_id)).closed_by, "professional");
  });

  it("lets the professional decline, and lets the salon withdraw a pending invitation", async () => {
    const a = await invite(owner1, proEmployeeId);
    assert.equal((await respond(pro, a.workplace_id, false)).status, "declined");
    assert.deepEqual(await respond(pro, a.workplace_id, false), { workplace_id: a.workplace_id, status: "declined", replayed: true });
    assert.equal(await sqlstate(respond(pro, a.workplace_id, true)), "22023", "a declined invitation cannot be accepted");
    const declined = await workplace(a.workplace_id);
    assert.equal(declined.closed_by, "professional");
    assert.ok(declined.ended_at && !declined.started_at);

    const b = await invite(owner1, proEmployeeId);
    const withdrawn = await endLink(owner1, b.workplace_id);
    assert.equal(withdrawn.status, "declined");
    assert.equal((await workplace(b.workplace_id)).closed_by, "provider");
  });
});

describe("a link lives only while the employee row does", () => {
  it("ends an active link when the employee row is deactivated, and a pending one is closed too", async () => {
    const active = await invite(owner1, proTwoEmployeeId);
    await respond(proTwo, active.workplace_id, true);
    await sys(db, `update employees set is_active = false where id = $1`, [proTwoEmployeeId]);
    const row = await workplace(active.workplace_id);
    assert.equal(row.status, "former");
    assert.equal(row.closed_by, "system");
    assert.equal(row.closed_reason, "employee_deactivated");
    assert.ok(row.ended_at);
    assert.equal(await sqlstate(respond(proTwo, active.workplace_id, true)), "22023");

    // A pending invitation to a row that is switched off is closed as declined; reactivating the row does not revive it.
    await sys(db, `update employees set is_active = true where id = $1`, [proTwoEmployeeId]);
    const pending = await invite(owner1, proTwoEmployeeId);
    await sys(db, `update employees set is_active = false where id = $1`, [proTwoEmployeeId]);
    const closed = await workplace(pending.workplace_id);
    assert.equal(closed.status, "declined");
    assert.equal(closed.closed_by, "system");
    await sys(db, `update employees set is_active = true where id = $1`, [proTwoEmployeeId]);
    assert.equal((await workplace(pending.workplace_id)).status, "declined");
    assert.ok((await sys(db, `select count(*)::int n from admin_audit_logs where action = 'professional.link_closed_by_system'`))[0].n >= 2);
  });

  it("ends the link when the login is released from the row or the row is removed, and keeps the history", async () => {
    const released = await invite(owner1, proTwoEmployeeId);
    await respond(proTwo, released.workplace_id, true);
    await sys(db, `update employees set profile_id = null where id = $1`, [proTwoEmployeeId]);
    assert.equal((await workplace(released.workplace_id)).closed_reason, "login_released");
    await sys(db, `update employees set profile_id = $1 where id = $2`, [proTwo.sub, proTwoEmployeeId]);

    const removed = await invite(owner1, proTwoEmployeeId);
    await respond(proTwo, removed.workplace_id, true);
    await sys(db, `delete from employees where id = $1`, [proTwoEmployeeId]);
    const row = await workplace(removed.workplace_id);
    assert.equal(row.status, "former");
    assert.equal(row.closed_reason, "employee_removed");
    assert.equal(row.employee_id, null, "the finished history row stays, detached from the removed employee");
    assert.equal((await publicProfile(ROLES.anon, "second-pro")), null, "second-pro never published");
  });

  it("does not touch a link when something else about the employee changes", async () => {
    const r = await invite(owner1, proEmployeeId);
    await respond(pro, r.workplace_id, true);
    await sys(db, `update employees set name_en = 'Omar K.', title_en = 'Barber' where id = $1`, [proEmployeeId]);
    assert.equal((await workplace(r.workplace_id)).status, "active");
    await endLink(pro, r.workplace_id);
  });

  it("refuses an illegal state change even from a privileged connection", async () => {
    const [former] = await sys(db, `select id from professional_workplaces where status = 'former' limit 1`);
    assert.equal(await sqlstate(sys(db, `update professional_workplaces set status = 'active' where id = $1`, [former.id])), "22023");
    const [declined] = await sys(db, `select id from professional_workplaces where status = 'declined' limit 1`);
    assert.equal(await sqlstate(sys(db, `update professional_workplaces set status = 'invited' where id = $1`, [declined.id])), "22023");
  });
});

describe("followers", () => {
  it("lets a signed-in person follow a published profile, and nobody else", async () => {
    assert.equal(await sqlstate(follow(ROLES.anon, "omar-barber")), "42501");
    assert.equal(await sqlstate(follow(ROLES.service, "omar-barber")), "28000");
    assert.equal(await sqlstate(follow(customer, "no-such-handle")), "P0002");
    assert.equal(await sqlstate(follow(customer, "second-pro")), "P0002", "an unpublished profile cannot be followed");
    assert.equal(await sqlstate(follow(pro, "omar-barber")), "22023", "nobody follows themselves");
    assert.deepEqual(await follow(customer, "omar-barber", true), { following: true, notify_on_move: true });
    assert.deepEqual(await follow(customerTwo, "omar-barber"), { following: true, notify_on_move: false });
    assert.equal(await count("professional_follows"), 2);
  });

  it("is idempotent, and the follower can change their own notification choice", async () => {
    await follow(customer, "omar-barber", true);
    assert.equal(await count("professional_follows", "follower_id = $1", [customer.sub]), 1);
    await follow(customerThree, "omar-barber", true);
    await follow(customerThree, "omar-barber", false);
    assert.equal((await sys(db, `select notify_on_move from professional_follows where follower_id = $1`, [customerThree.sub]))[0].notify_on_move, false);
    assert.deepEqual((await publicProfile(customer, "omar-barber")).viewer, { signed_in: true, is_self: false, follows: true, notify_on_move: true });
    assert.deepEqual((await publicProfile(pro, "omar-barber")).viewer, { signed_in: true, is_self: true, follows: false, notify_on_move: false });
  });

  it("shows the professional a count and nothing that identifies a follower", async () => {
    const mine = await identity(pro);
    assert.equal(mine.follower_count, 3);
    const text = JSON.stringify(mine);
    for (const f of [customer.sub, customerTwo.sub, customerThree.sub]) assert.ok(!text.includes(f));
    assert.equal(await call(pro, `select count(*)::int r from professional_follows`), 0, "the professional reads no follow row");
    assert.equal(await call(owner1, `select count(*)::int r from professional_follows`), 0, "a salon reads no follow row");
    assert.equal(await call(admin, `select count(*)::int r from professional_follows`), 0, "an administrator reads no follow row");
    assert.equal(await call(customerTwo, `select count(*)::int r from professional_follows`), 1, "a follower reads only their own");
  });

  it("lists what a person follows, and unfollowing is idempotent", async () => {
    const list = await call(customer, `select list_followed_professionals() r`);
    assert.equal(list.length, 1);
    assert.equal(list[0].handle, "omar-barber");
    assert.equal(list[0].available, true);
    assert.equal(list[0].notify_on_move, true);
    assert.equal(await sqlstate(call(ROLES.anon, `select list_followed_professionals() r`)), "42501");
    assert.deepEqual(await call(customerThree, `select unfollow_professional('omar-barber') r`), { following: false });
    assert.deepEqual(await call(customerThree, `select unfollow_professional('omar-barber') r`), { following: false });
    assert.deepEqual(await call(customerThree, `select unfollow_professional('does-not-exist') r`), { following: false });
    assert.equal(await count("professional_follows", "follower_id = $1", [customerThree.sub]), 0);
    assert.equal((await identity(pro)).follower_count, 2);
  });
});

describe("moving between salons", () => {
  // The person moves: the old row is switched off and releases the login, the new salon registers the same login on its own row,
  // invites it, and the professional accepts.
  const state = { employeeId: proEmployeeId, branch: SEED.branch1 };
  async function moveTo(branch, salonOwner) {
    await sys(db, `update employees set is_active = false, profile_id = null where id = $1`, [state.employeeId]);
    state.employeeId = await newEmployee(branch, pro.sub, { name: "Omar Khaled" });
    state.branch = branch;
    const invitation = await invite(salonOwner, state.employeeId);
    return respond(pro, invitation.workplace_id, true);
  }

  it("keeps the profile and the followers, and says what stayed behind", async () => {
    const first = await invite(owner1, proEmployeeId);
    await respond(pro, first.workplace_id, true);
    const before = await sys(db, `select id, handle from professional_profiles where owner_id = $1`, [pro.sub]);
    await sys(db, `update employees set is_active = false, profile_id = null where id = $1`, [proEmployeeId]);
    assert.equal((await workplace(first.workplace_id)).status, "former");
    assert.equal((await publicProfile(ROLES.anon, "omar-barber")).workplaces.length, 0, "between salons: no workplace, the profile stays");

    state.employeeId = await newEmployee(BRANCH2, pro.sub, { name: "Omar Khaled" });
    const invitation = await invite(owner2, state.employeeId);
    const accepted = await respond(pro, invitation.workplace_id, true);
    assert.equal(accepted.status, "active");
    const after = await sys(db, `select id, handle from professional_profiles where owner_id = $1`, [pro.sub]);
    assert.deepEqual(after, before, "the same profile row, the same handle");
    assert.equal(await count("professional_follows", "professional_id = $1", [after[0].id]), 2, "the followers stayed");
    const page = await publicProfile(ROLES.anon, "omar-barber");
    assert.equal(page.workplaces.length, 1);
    assert.equal(page.workplaces[0].shop_url, "/shop/" + (await sys(db, `select provider_id from branches where id = $1`, [BRANCH2]))[0].provider_id);
  });

  it("sends nothing while pro.move_notice_min_days is unset", async () => {
    // The move just made had followers who opted in, and an earlier link had ended: the outcome records why nothing was sent.
    const [row] = await sys(db, `select move_notice_outcome, move_notice_sent_at from professional_workplaces
      where employee_id = $1 and status = 'active'`, [state.employeeId]);
    assert.equal(row.move_notice_outcome, "not_configured");
    assert.equal(row.move_notice_sent_at, null);
    assert.equal((await moveNotices(customer.sub)).length, 0);
  });

  it("tells the opted-in followers once, and only them, when the setting allows it", async () => {
    await setSetting("pro.move_notice_min_days", 30);
    const r = await moveTo(SEED.branch1, owner1);
    assert.equal(r.move_notice, "sent");
    const notes = await moveNotices(customer.sub);
    assert.equal(notes.length, 1, "one notice for the opted-in follower");
    const [n] = notes;
    assert.ok(n.title_en.includes("Omar Khaled") && n.title_ar.includes("عمر خالد"));
    assert.ok(n.body_en && n.body_ar);
    assert.equal(n.data.url, "/pro/omar-barber");
    assert.equal(n.data.book_url, `/shop/${SEED.provider1}?source=link`);
    assert.equal((await moveNotices(customerTwo.sub)).length, 0, "a follower who did not opt in hears nothing");
    assert.equal((await moveNotices(customerThree.sub)).length, 0, "someone who unfollowed hears nothing");
    assert.equal((await moveNotices(pro.sub)).length, 0);
    const replay = await respond(pro, (await sys(db, `select id from professional_workplaces where employee_id = $1 and status = 'active'`, [state.employeeId]))[0].id, true);
    assert.equal(replay.replayed, true);
    assert.equal((await moveNotices(customer.sub)).length, 1, "replaying the acceptance sends nothing more");
  });

  it("rate limits a second notice inside the configured window", async () => {
    const r = await moveTo(BRANCH2, owner2);
    assert.equal(r.move_notice, "rate_limited");
    assert.equal((await moveNotices(customer.sub)).length, 1);
    const [pending] = await sys(db, `select last_move_notice_at from professional_profiles where owner_id = $1`, [pro.sub]);
    assert.ok(pending.last_move_notice_at);
  });

  it("sends again once the window has passed, and with a window of zero days sends every time", async () => {
    await sys(db, `update professional_profiles set last_move_notice_at = now() - interval '31 days' where owner_id = $1`, [pro.sub]);
    const r = await moveTo(SEED.branch1, owner1);
    assert.equal(r.move_notice, "sent");
    assert.equal((await moveNotices(customer.sub)).length, 2);
    await setSetting("pro.move_notice_min_days", 0);
    assert.equal((await moveTo(BRANCH2, owner2)).move_notice, "sent");
    assert.equal((await moveNotices(customer.sub)).length, 3);
  });

  it("treats a missing, non-numeric or negative setting as 'send nothing'", async () => {
    await setSetting("pro.move_notice_min_days", "soon");
    assert.equal((await moveTo(SEED.branch1, owner1)).move_notice, "not_configured");
    await setSetting("pro.move_notice_min_days", -1);
    assert.equal((await moveTo(BRANCH2, owner2)).move_notice, "not_configured");
    await clearSetting("pro.move_notice_min_days");
    assert.equal((await moveTo(SEED.branch1, owner1)).move_notice, "not_configured");
    assert.equal((await moveNotices(customer.sub)).length, 3);
  });

  it("never touches a salon's own records when a person moves", async () => {
    const tables = ["bookings", "invoices", "client_profiles", "reviews", "customer_notes"];
    for (const t of tables) {
      const exists = await sys(db, `select to_regclass($1) is not null as ok`, [`public.${t}`]);
      if (!exists[0].ok) continue;
      const refs = await sys(db, `select count(*)::int n from pg_proc p where p.pronamespace = 'public'::regnamespace
        and p.proname like '%professional%' and p.prosrc ~* $1`, [`\\m(update|insert into|delete from)\\s+(public\\.)?${t}\\M`]);
      assert.equal(refs[0].n, 0, `no professional-identity function writes ${t}`);
    }
  });
});

describe("administrator commands", () => {
  it("refuse every role that is not an administrator", async () => {
    for (const who of [owner1, owner2, pro, customer, stranger, delegateStaff]) {
      assert.equal(await sqlstate(call(who, `select admin_set_professional_visibility('omar-barber', true, 'testing the door') r`)), "42501");
      assert.equal(await sqlstate(call(who, `select admin_change_professional_handle('omar-barber', 'new-omar', 'testing the door') r`)), "42501");
    }
    assert.equal(await sqlstate(call(ROLES.anon, `select admin_set_professional_visibility('omar-barber', true, 'testing the door') r`)), "42501");
    assert.equal(await sqlstate(call(ROLES.anon, `select admin_change_professional_handle('omar-barber', 'new-omar', 'testing the door') r`)), "42501");
    assert.equal((await publicProfile(ROLES.anon, "omar-barber")).handle, "omar-barber");
  });

  it("need a reason of at least three characters", async () => {
    for (const reason of [null, "", "  ", "ab"]) {
      assert.equal(await sqlstate(call(admin, `select admin_set_professional_visibility('omar-barber', true, $1) r`, [reason])), "22023");
      assert.equal(await sqlstate(call(admin, `select admin_change_professional_handle('omar-barber', 'new-omar', $1) r`, [reason])), "22023");
    }
    assert.equal(await sqlstate(call(admin, `select admin_set_professional_visibility('no-such-pro', true, 'a good reason') r`)), "P0002");
    assert.equal((await publicProfile(ROLES.anon, "omar-barber")).handle, "omar-barber");
  });

  it("hide a profile from everyone, stop publishing and following, and restore it; each step is audited with the reason", async () => {
    assert.deepEqual(await call(admin, `select admin_set_professional_visibility('omar-barber', true, 'Reported as impersonation') r`),
      { handle: "omar-barber", hidden: true });
    assert.equal(await publicProfile(ROLES.anon, "omar-barber"), null);
    assert.equal(await sqlstate(publish(pro)), "42501", "the professional cannot publish a hidden profile");
    assert.equal(await sqlstate(follow(customerThree, "omar-barber")), "P0002");
    assert.equal((await identity(pro)).profile.hidden, true);
    const list = await call(customer, `select list_followed_professionals() r`);
    assert.equal(list[0].available, false);
    assert.equal(list[0].display_name_en, null, "a hidden profile shows a follower only its handle");
    assert.deepEqual(list[0].workplaces, []);
    assert.deepEqual(await call(customer, `select unfollow_professional('omar-barber') r`), { following: false });
    await follow(customer, "omar-barber", true).then(() => assert.fail("hidden profiles cannot be followed"), () => {});

    await call(admin, `select admin_set_professional_visibility('omar-barber', false, 'Verified the account') r`);
    assert.equal((await publicProfile(ROLES.anon, "omar-barber")).handle, "omar-barber");
    const audits = await sys(db, `select action, details->>'reason' as reason from admin_audit_logs where action like 'admin.professional\\_%' order by created_at`);
    assert.deepEqual(audits.map((a) => a.action), ["admin.professional_hidden", "admin.professional_restored"]);
    assert.deepEqual(audits.map((a) => a.reason), ["Reported as impersonation", "Verified the account"]);
    await follow(customer, "omar-barber", true);
  });

  it("change a handle, keep the old one as a redirect, and reserve it for the same person", async () => {
    assert.equal(await sqlstate(call(admin, `select admin_change_professional_handle('omar-barber', 'admin', 'reserved word') r`)), "22023");
    assert.equal(await sqlstate(call(admin, `select admin_change_professional_handle('omar-barber', 'second-pro', 'taken by another') r`)), "23505");
    assert.equal(await sqlstate(call(admin, `select admin_change_professional_handle('omar-barber', 'omar-barber', 'same handle') r`)), "22023");
    assert.deepEqual(await call(admin, `select admin_change_professional_handle('omar-barber', 'omar-khaled', 'Brand clash with a salon') r`),
      { handle: "omar-khaled", redirects_from: "omar-barber" });
    assert.deepEqual(await publicProfile(ROLES.anon, "omar-barber"), { redirect_to: "omar-khaled" });
    assert.equal((await publicProfile(ROLES.anon, "omar-khaled")).display_name_en, "Omar Khaled");
    assert.equal(await sqlstate(save(proTwo, { handle: "omar-barber", en: "Second Pro", ar: "الثاني" })), "23505", "the old handle is not free for others");
    assert.deepEqual(await call(proTwo, `select professional_handle_available('omar-barber') r`), { available: false, problem: "taken" });
    assert.equal(await count("professional_follows", "professional_id = (select id from professional_profiles where handle = 'omar-khaled')"), 2, "followers stay");
    assert.equal((await call(customer, `select list_followed_professionals() r`))[0].handle, "omar-khaled");
    assert.deepEqual(await call(customerTwo, `select unfollow_professional('omar-barber') r`), { following: false });
    assert.equal(await count("professional_follows", "follower_id = $1", [customerTwo.sub]), 0, "unfollowing through the old handle works");
    const [audit] = await sys(db, `select details from admin_audit_logs where action = 'admin.professional_handle_changed'`);
    assert.equal(audit.details.reason, "Brand clash with a salon");
    assert.equal(audit.details.from, "omar-barber");
    assert.equal(audit.details.to, "omar-khaled");
  });

  it("let the person go back to a handle they held, which retires the redirect", async () => {
    await call(admin, `select admin_change_professional_handle('omar-khaled', 'omar-barber', 'Dispute settled') r`);
    assert.equal((await publicProfile(ROLES.anon, "omar-barber")).handle, "omar-barber");
    assert.deepEqual(await publicProfile(ROLES.anon, "omar-khaled"), { redirect_to: "omar-barber" });
  });

  it("do not redirect to a profile that is hidden or unpublished", async () => {
    await call(admin, `select admin_set_professional_visibility('omar-barber', true, 'Temporary review') r`);
    assert.equal(await publicProfile(ROLES.anon, "omar-khaled"), null);
    await call(admin, `select admin_set_professional_visibility('omar-barber', false, 'Review finished') r`);
  });
});

describe("row-level security", () => {
  const TABLES = ["professional_profiles", "professional_handle_redirects", "professional_reserved_handles", "professional_portfolio_items",
    "professional_workplaces", "professional_follows"];

  it("shows a stranger nothing in any of the tables", async () => {
    for (const t of TABLES) {
      assert.equal(await call(stranger, `select count(*)::int r from ${t}`), 0, `a stranger reads ${t}`);
      assert.equal(await call(customer, `select count(*)::int r from ${t} where ${t === "professional_follows" ? "follower_id <> auth.uid()" : "true"}`), 0, `another customer reads ${t}`);
    }
    assert.equal(await call(owner2, `select count(*)::int r from professional_workplaces`), 0, "another salon reads no link rows");
    assert.equal(await call(owner1, `select count(*)::int r from professional_profiles`), 0, "a salon reads no profile rows directly");
  });

  it("shows the professional their own rows and an administrator the profile tables", async () => {
    assert.equal(await call(pro, `select count(*)::int r from professional_profiles`), 1);
    assert.ok(await call(pro, `select count(*)::int r from professional_workplaces`) >= 1);
    assert.ok(await call(pro, `select count(*)::int r from professional_portfolio_items`) >= 1);
    assert.equal(await call(proTwo, `select count(*)::int r from professional_profiles`), 1);
    assert.ok(await call(admin, `select count(*)::int r from professional_profiles`) >= 2);
    assert.ok(await call(admin, `select count(*)::int r from professional_reserved_handles`) > 0);
  });

  it("refuses every direct write, whoever is asking", async () => {
    const [p] = await sys(db, `select id from professional_profiles where owner_id = $1`, [pro.sub]);
    for (const who of [pro, customer, owner1, admin, ROLES.anon]) {
      assert.equal(await sqlstate(as(db, who, `update professional_profiles set is_published = true where id = $1`, [p.id])), "42501");
      assert.equal(await sqlstate(as(db, who, `delete from professional_profiles where id = $1`, [p.id])), "42501");
      assert.equal(await sqlstate(as(db, who, `insert into professional_profiles (owner_id, handle, display_name_en, display_name_ar) values ($1, 'forged-pro', 'x', 'x')`, [who.sub ?? SEED.customer])), "42501");
      assert.equal(await sqlstate(as(db, who, `insert into professional_workplaces (professional_id, employee_id, provider_id, status) values ($1, $2, $3, 'active')`, [p.id, proEmployeeId, SEED.provider1])), "42501");
      assert.equal(await sqlstate(as(db, who, `update professional_workplaces set status = 'active'`)), "42501");
      assert.equal(await sqlstate(as(db, who, `insert into professional_follows (professional_id, follower_id) values ($1, $2)`, [p.id, who.sub ?? SEED.customer])), "42501");
      assert.equal(await sqlstate(as(db, who, `insert into professional_portfolio_items (professional_id, url) values ($1, 'https://x.example/y')`, [p.id])), "42501");
      assert.equal(await sqlstate(as(db, who, `insert into professional_reserved_handles (handle) values ('free-for-all')`)), "42501");
      assert.equal(await sqlstate(as(db, who, `insert into professional_handle_redirects (old_handle, professional_id) values ('stolen-one', $1)`, [p.id])), "42501");
    }
    assert.equal(await count("professional_profiles", "handle = 'forged-pro'"), 0);
  });

  it("refuses the commands to a caller without a session", async () => {
    for (const sql of ["save_professional_profile('abc', 'a', 'b', null, null, null, null, '{}', '{}')", "publish_professional_profile(true)",
      "my_professional_identity()", "follow_professional('omar-barber', false)", "list_followed_professionals()", "professional_handle_available('abc')"]) {
      assert.equal(await sqlstate(as(db, ROLES.anon, `select ${sql}`)), "42501", sql);
    }
  });

  it("keeps the internal helpers out of every client's reach", async () => {
    for (const fn of ["professional_handle_problem('abc')", "professional_require_handle('abc')", "professional_staff_authority(null, null)",
      "professional_public_workplaces(gen_random_uuid())"]) {
      for (const who of [ROLES.anon, customer, owner1, admin]) assert.equal(await sqlstate(as(db, who, `select ${fn}`)), "42501", `${fn} as ${who.role}`);
    }
  });
});

describe("the workplace row", () => {
  it("only ever allows one open link per professional and employee row", async () => {
    const [p] = await sys(db, `select id from professional_profiles where owner_id = $1`, [pro.sub]);
    const [open] = await sys(db, `select employee_id, provider_id from professional_workplaces where status = 'active' limit 1`);
    assert.equal(await sqlstate(sys(db, `insert into professional_workplaces (professional_id, employee_id, provider_id, status) values ($1, $2, $3, 'invited')`,
      [p.id, open.employee_id, open.provider_id])), "23505");
  });

  it("rejects rows that contradict their own state", async () => {
    const [p] = await sys(db, `select id from professional_profiles where owner_id = $1`, [pro.sub]);
    const bad = [
      `'active', null, null, null`,
      `'former', now(), null, 'system'`,
      `'declined', null, null, 'system'`,
      `'invited', now(), null, null`,
      `'former', now(), now() - interval '1 day', 'system'`,
    ];
    for (const values of bad) {
      assert.equal(await sqlstate(sys(db,
        `insert into professional_workplaces (professional_id, employee_id, provider_id, status, started_at, ended_at, closed_by)
         values ($1, $2, $3, ${values})`, [p.id, noLoginEmployeeId, SEED.provider1])), "23514", values);
    }
  });
});
