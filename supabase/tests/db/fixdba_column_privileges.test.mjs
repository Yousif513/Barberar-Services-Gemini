import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, ROLES, SEED, sys } from "./harness.mjs";

// R10: signed-in users no longer read the internal columns of providers and employees; the people who may see them have commands.

let db;
let admin;
let settingsManager;
let staffManager;
let stylist;
let stranger;
const owner1 = ROLES.user(SEED.owner1);
const owner2 = ROLES.user(SEED.owner2);
const customer = ROLES.user(SEED.customer);
const code = (promise) => promise.then(() => "ok", (error) => error.code ?? error.message);
const profile = async (user, id = null) => (await as(db, user, `select get_provider_private_profile($1) r`, [id]))[0].r;

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  stranger = ROLES.user(await createUser(db, { role: "customer" }));
  const member = async (role, permissions, branch = null) => {
    const id = await createUser(db, { role: "customer" });
    await sys(db, `insert into provider_memberships (user_id, provider_id, branch_id, role, permissions) values ($1, $2, $3, $4, $5::jsonb)`,
      [id, SEED.provider1, branch, role, JSON.stringify(permissions)]);
    return ROLES.user(id);
  };
  settingsManager = await member("manager", { settings: true });
  staffManager = await member("manager", { staff: true });
  stylist = await member("stylist", {});
  await sys(db, `update providers set vat_number = '300012345600003', cr_number = '1010202020', contact_phone = '+966500001111', contact_email = 'owner@elite.test',
    admin_notes = 'internal: slow payer', trade_license_url = 'https://files.example.com/licence.pdf', commission_percentage = 12.5 where id = $1`, [SEED.provider1]);
  await sys(db, `update employees set phone = '+966500002222', email = 'stylist@elite.test' where id = $1`, [SEED.employee1]);
});

describe("R10: the internal columns are not readable by signed-in users", () => {
  const hiddenProvider = ["vat_number", "cr_number", "admin_notes", "contact_phone", "contact_email", "commission_percentage", "trade_license_url", "cr_wathq_data", "last_activity_at"];
  it("refuses each hidden provider column to a customer, a stranger, another business and the business itself", async () => {
    for (const user of [customer, stranger, owner2, owner1, admin]) {
      for (const column of hiddenProvider) {
        assert.equal(await code(as(db, user, `select ${column} from providers where id = $1`, [SEED.provider1])), "42501", column);
      }
      assert.equal(await code(as(db, user, `select * from providers`)), "42501", "select * is refused too");
    }
  });
  it("still serves the public columns, the policy columns and the filters the screens use", async () => {
    const rows = await as(db, customer, `select id, owner_id, business_name_en, is_verified, deposit_percentage, free_cancellation_hours, status, policy_confirmed_at from providers where owner_id is not null`);
    assert.ok(rows.length >= 2);
    assert.equal((await as(db, owner1, `select id from providers where owner_id = $1`, [SEED.owner1])).length, 1);
  });
  it("refuses phone and email of every employee, and serves the rest", async () => {
    for (const user of [customer, stranger, owner2, owner1]) {
      assert.equal(await code(as(db, user, `select phone from employees`)), "42501");
      assert.equal(await code(as(db, user, `select email from employees where id = $1`, [SEED.employee1])), "42501");
    }
    assert.ok((await as(db, customer, `select id, name_en, title_en, photo_url, profile_id, bio_en, instagram_handle from employees`)).length > 0);
  });
  it("leaves writes to the owner as they were", async () => {
    await as(db, owner1, `update providers set contact_phone = '+966500003333' where id = $1`, [SEED.provider1]);
    assert.equal((await sys(db, `select contact_phone from providers where id = $1`, [SEED.provider1]))[0].contact_phone, "+966500003333");
    await as(db, owner1, `update employees set phone = '+966500004444' where id = $1`, [SEED.employee1]);
    assert.equal((await sys(db, `select phone from employees where id = $1`, [SEED.employee1]))[0].phone, "+966500004444");
  });
  it("keeps the administrator performance view working without showing commission to anyone else", async () => {
    const cell = async (user, id) => (await as(db, user, `select commission_percentage::float8 c, last_activity_at from admin_provider_performance where provider_id = $1`, [id]))[0];
    assert.equal((await cell(admin, SEED.provider1)).c, 12.5);
    assert.equal((await cell(owner1, SEED.provider1)).c, 12.5);
    assert.equal((await cell(owner2, SEED.provider1)).c, null);
    assert.equal((await cell(customer, SEED.provider1)).c, null);
  });
});

describe("R10: get_provider_private_profile", () => {
  it("gives the owner their own internals, without the administrator's notes", async () => {
    const r = await profile(owner1);
    assert.equal(r.provider_id, SEED.provider1);
    assert.equal(r.vat_number, "300012345600003");
    assert.equal(r.contact_phone, "+966500003333");
    assert.equal(r.commission_percentage, 12.5);
    assert.ok(!("admin_notes" in r));
    assert.equal((await profile(owner1, SEED.provider1)).cr_number, "1010202020");
  });
  it("gives a business-wide manager with the settings permission the same view, and nobody else on the staff", async () => {
    assert.equal((await profile(settingsManager, SEED.provider1)).vat_number, "300012345600003");
    for (const user of [staffManager, stylist, owner2, customer, stranger]) assert.equal(await code(profile(user, SEED.provider1)), "P0002");
    assert.equal(await code(profile(ROLES.anon, SEED.provider1)), "42501");
    assert.equal(await code(profile(ROLES.service, SEED.provider1)), "28000");
    assert.equal(await code(profile(owner1, "99999999-9999-4999-8999-999999999999")), "P0002");
    assert.equal(await code(profile(customer)), "P0002", "a customer has no provider of their own");
  });
  it("gives an administrator the notes and records the view", async () => {
    const r = await profile(admin, SEED.provider1);
    assert.equal(r.admin_notes, "internal: slow payer");
    assert.equal((await sys(db, `select count(*)::int c from admin_audit_logs where action = 'provider.private_profile_viewed' and target_id = $1`, [SEED.provider1]))[0].c, 1);
  });
});

describe("R10: admin_provider_private_directory", () => {
  it("returns every provider's internals to an administrator and records it", async () => {
    const rows = await as(db, admin, `select * from admin_provider_private_directory()`);
    assert.ok(rows.length >= 2);
    const mine = rows.find((r) => r.provider_id === SEED.provider1);
    assert.equal(mine.admin_notes, "internal: slow payer");
    assert.equal(mine.vat_number, "300012345600003");
    assert.equal(Number(mine.commission_percentage), 12.5);
    assert.equal((await sys(db, `select count(*)::int c from admin_audit_logs where action = 'provider.private_directory_viewed'`))[0].c, 1);
  });
  it("is refused to everyone else", async () => {
    for (const user of [customer, stranger, owner1, owner2, settingsManager, stylist]) {
      assert.equal(await code(as(db, user, `select * from admin_provider_private_directory()`)), "42501");
    }
    assert.equal(await code(as(db, ROLES.anon, `select * from admin_provider_private_directory()`)), "42501");
    assert.equal(await code(as(db, ROLES.service, `select * from admin_provider_private_directory()`)), "42501");
  });
});

describe("R10: get_provider_staff_contacts", () => {
  const contacts = (user, id = null) => as(db, user, `select * from get_provider_staff_contacts($1)`, [id]);
  it("gives the owner and a delegate with the staff permission the phone and email of the business's employees", async () => {
    const ownerRows = await contacts(owner1);
    assert.equal(ownerRows.find((r) => r.employee_id === SEED.employee1).email, "stylist@elite.test");
    assert.equal((await contacts(staffManager, SEED.provider1)).find((r) => r.employee_id === SEED.employee1).phone, "+966500004444");
  });
  it("refuses everyone else, answering 'not found'", async () => {
    for (const user of [settingsManager, stylist, owner2, customer, stranger]) assert.equal(await code(contacts(user, SEED.provider1)), "P0002");
    assert.equal(await code(contacts(ROLES.anon, SEED.provider1)), "42501");
    assert.equal(await code(contacts(ROLES.service, SEED.provider1)), "28000");
  });
  it("lets an administrator read and records it, and never returns another business's staff to an owner", async () => {
    assert.ok((await contacts(admin, SEED.provider1)).length > 0);
    assert.equal((await sys(db, `select count(*)::int c from admin_audit_logs where action = 'provider.staff_contacts_viewed' and target_id = $1`, [SEED.provider1]))[0].c, 1);
    const own2 = await contacts(owner2);
    assert.ok(own2.every((r) => r.employee_id !== SEED.employee1));
  });
});
