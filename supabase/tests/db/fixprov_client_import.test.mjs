import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, sys } from "./harness.mjs";

// FIX-PROV R36: import_provider_clients takes the phone forms people paste, refuses rows without a usable number, and stays owner-only.
let db;
const owner1 = ROLES.user(SEED.owner1);
const owner2 = ROLES.user(SEED.owner2);
const customer = ROLES.user(SEED.customer);

const importClients = (user, clients, consent = true, provider = SEED.provider1) => as(db, user,
  `select import_provider_clients($1, $2::jsonb, $3) r`, [provider, JSON.stringify(clients), consent]).then((rows) => rows[0].r);
const stored = (provider = SEED.provider1) => sys(db, `select full_name, phone, notes from provider_client_contacts where provider_id = $1 order by phone`, [provider]);

before(async () => {
  db = await createMigratedDb();
});

describe("import_provider_clients phone forms (R36)", () => {
  it("normalizes 05, 5, 966, 00966, +966 and Arabic-Indic numbers to +9665XXXXXXXX", async () => {
    const result = await importClients(owner1, [
      { name: "A", phone: "050 123 4561" },
      { name: "B", phone: "966501234562" },
      { name: "C", phone: "00966501234563" },
      { name: "D", phone: "501234564" },
      { name: "E", phone: "٠٥٠١٢٣٤٥٦٥" },
      { name: "F", phone: "+966 50 123 4566", notes: "likes oil" },
    ]);
    assert.equal(result.successful_rows, 6);
    assert.equal(result.skipped_rows, 0);
    assert.deepEqual((await stored()).map((r) => r.phone), ["+966501234561", "+966501234562", "+966501234563", "+966501234564", "+966501234565", "+966501234566"]);
  });

  it("skips a row with no phone, a non-Saudi number, a short number or no name instead of storing it", async () => {
    const before = (await stored()).length;
    const result = await importClients(owner1, [
      { name: "No phone" },
      { name: "Empty phone", phone: "" },
      { name: "Letters", phone: "abc" },
      { name: "Short", phone: "12345" },
      { name: "Abroad", phone: "+971501234567" },
      { name: "", phone: "0501234577" },
      { name: "Good", phone: "0501234578" },
    ]);
    assert.equal(result.successful_rows, 1);
    assert.equal(result.skipped_rows, 6);
    assert.equal((await stored()).length, before + 1);
    assert.equal((await sys(db, `select count(*)::int n from provider_client_contacts where phone is null`))[0].n, 0, "no contact without a phone");
  });

  it("is idempotent: the same list again updates rows and creates no duplicates", async () => {
    const list = [{ name: "Sara", phone: "0501234590", notes: "first" }];
    await importClients(owner1, list);
    const count = (await stored()).length;
    const again = await importClients(owner1, [{ name: "Sara Updated", phone: "966501234590" }]);
    assert.equal(again.successful_rows, 1);
    assert.equal((await stored()).length, count);
    const row = (await stored()).find((r) => r.phone === "+966501234590");
    assert.equal(row.full_name, "Sara Updated");
    assert.equal(row.notes, "first", "an empty note does not erase the stored one");
  });

  it("requires consent and at least one row, and refuses more than 2000", async () => {
    await expectError(importClients(owner1, [{ name: "X", phone: "0501234591" }], false), /agreed to be contacted/);
    await expectError(importClients(owner1, []), /at least one/i);
    await expectError(importClients(owner1, Array.from({ length: 2001 }, (_, i) => ({ name: `n${i}`, phone: "0501234592" }))), /at most 2000/);
  });

  it("is refused to anonymous visitors, customers, an employee and another provider's owner", async () => {
    const list = [{ name: "Intruder", phone: "0501234599" }];
    await assert.rejects(importClients(ROLES.anon, list), (e) => e.code === "42501");
    await expectError(importClients(customer, list), /Only the provider owner/);
    await expectError(importClients(owner2, list), /Only the provider owner/);
    const stylist = ROLES.user(await createUser(db, { role: "provider_employee" }));
    await sys(db, `update employees set profile_id = $1 where id = $2`, [stylist.sub, SEED.employee1]);
    await expectError(importClients(stylist, list), /Only the provider owner/);
    assert.equal((await stored()).filter((r) => r.full_name === "Intruder").length, 0);
  });

  it("keeps the imported contacts out of every other provider's and customer's reach", async () => {
    assert.equal((await as(db, owner2, `select 1 from provider_client_contacts`)).length, 0);
    assert.equal((await as(db, customer, `select 1 from provider_client_contacts`)).length, 0);
    assert.ok((await as(db, owner1, `select 1 from provider_client_contacts`)).length > 0);
  });
});
