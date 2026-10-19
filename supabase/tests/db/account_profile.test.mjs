import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, ROLES, sys } from "./harness.mjs";
import { persistCustomerProfile, providerApplicationType } from "../../../web_platform/src/lib/account-flow.mjs";

let db;
before(async () => { db = await createMigratedDb(); });
after(async () => { await db?.close(); });

// The production save helper is exercised against the migrated database with actual row policies and triggers. The
// adapter replaces only the HTTP transport; the update, ownership predicate and returned columns execute in Postgres.
function profileClient(actor) {
  return { from(table) {
    assert.equal(table, "profiles");
    return { update(values) { return { eq(column, id) {
      assert.equal(column, "id");
      return { async select(columns) {
        assert.equal(columns, "first_name, last_name, phone_number, phone_verified");
        try {
          return { data: await as(db, ROLES.user(actor), `update public.profiles set first_name = $1, last_name = $2, phone_number = $3
            where id = $4 returning first_name, last_name, phone_number, phone_verified`, [values.first_name, values.last_name, values.phone_number, id]), error: null };
        } catch (error) { return { data: null, error }; }
      } };
    } }; } };
  } };
}

describe("customer profile persistence", () => {
  it("returns persisted names and the cleared verification status after the number changes", async () => {
    const customer = await createUser(db, { phone: "+966501110701", verified: true });
    const saved = await persistCustomerProfile(profileClient(customer), customer, { firstName: "  Amal ", lastName: " Ali ", phone: "+966501110702" }, "en");
    assert.deepEqual(saved, { firstName: "Amal", lastName: "Ali", phone: "+966501110702", phoneVerified: false });
    const [reloaded] = await as(db, ROLES.user(customer), "select first_name, last_name, phone_number, phone_verified from profiles where id = $1", [customer]);
    assert.deepEqual(reloaded, { first_name: "Amal", last_name: "Ali", phone_number: "+966501110702", phone_verified: false });
  });
  it("refuses a zero-row cross-account write and leaves the other account unchanged", async () => {
    const customer = await createUser(db);
    const stranger = await createUser(db);
    await assert.rejects(persistCustomerProfile(profileClient(customer), stranger, { firstName: "Changed", lastName: "", phone: "" }, "en"), error => error.code === "no_rows");
    const [other] = await sys(db, "select first_name, phone_number from profiles where id = $1", [stranger]);
    assert.equal(other.first_name, "");
    assert.equal(other.phone_number, null);
  });
  it("every application category produced by the form is accepted by the real enum", async () => {
    for (const label of ["salon", "barbershop", "spa", "freelancer"]) {
      const value = providerApplicationType(label);
      const [row] = await sys(db, "select $1::public.provider_type::text as type", [value]);
      assert.equal(row.type, value);
    }
  });
});
