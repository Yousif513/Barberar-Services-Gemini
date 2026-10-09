import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, ROLES, SEED, sys } from "./harness.mjs";

// FIX-PRIV P-12: professional handles that impersonate the platform are reserved by pattern; anonymous visitors learn nothing about handles.
let db;
let pro;
const check = async (user, handle) => (await as(db, user, `select professional_handle_available($1) r`, [handle]))[0].r;

before(async () => {
  db = await createMigratedDb();
  const sub = await createUser(db, { role: "provider_employee" });
  await sys(db, `insert into employees (branch_id, profile_id, name_en, name_ar) values ($1, $2, 'Omar', 'عمر')`, [SEED.branch1, sub]);
  pro = ROLES.user(sub);
});

describe("P-12 reserved handle patterns", () => {
  it("rejects the platform name anywhere in a handle and reserved words as whole parts", async () => {
    for (const handle of ["primora-official", "primoraofficial", "the-primora-team", "admin-support", "salon-staff", "official-omar", "verified-pro"]) {
      assert.deepEqual(await check(pro, handle), { available: false, problem: "reserved" }, handle);
    }
  });
  it("still accepts ordinary handles, including words that merely contain a reserved word", async () => {
    for (const handle of ["omar-barber", "badminton-coach", "supporter-nails", "administrative-art"]) {
      assert.deepEqual(await check(pro, handle), { available: true, problem: null }, handle);
    }
  });
  it("refuses to save a reserved handle through the command", async () => {
    await assert.rejects(
      as(db, pro, `select save_professional_profile('primora-official', 'Omar', 'عمر', 'Barber', 'حلاق', null, null, array['fade']::text[], array['en']::text[]) r`),
      /reserved|not available|handle/i,
    );
  });
  it("lets a new pattern be added with one insert and nothing else", async () => {
    await sys(db, `insert into professional_reserved_handle_patterns (pattern, match_kind, reason) values ('glowco', 'substring', 'brand')`);
    assert.deepEqual(await check(pro, "my-glowco-studio"), { available: false, problem: "reserved" });
  });
  it("gives an anonymous visitor no way to test whether a handle exists", async () => {
    await assert.rejects(as(db, ROLES.anon, `select professional_handle_available('omar-barber')`), /permission denied/);
    await assert.rejects(as(db, ROLES.anon, `select professional_handle_problem('omar-barber', null)`), /permission denied/);
    const unknown = (await as(db, ROLES.anon, `select public_professional_profile('no-such-handle-here') r`))[0].r;
    assert.equal(unknown, null);
    await assert.rejects(as(db, ROLES.anon, `select pattern from professional_reserved_handle_patterns`), /permission denied/);
    await assert.rejects(as(db, ROLES.anon, `select handle from professional_reserved_handles`), /permission denied/);
  });
});
