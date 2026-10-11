import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, ROLES, sys } from "./harness.mjs";

// GoTrue creates the auth user first and confirms the phone later, when the one-time code is entered. The profile must
// follow the auth row: these tests do what GoTrue does (insert, then update) instead of editing the profile by hand.

let db;
before(async () => {
  db = await createMigratedDb();
});

const newId = (n) => `d1000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const profile = async (id) => (await sys(db, `select phone_number, phone_verified, phone_verified_at from profiles where id = $1`, [id]))[0];
const outcome = (promise) => promise.then(() => "ok", (error) => error.code ?? error.message);

describe("phone verification follows the sign-in service", () => {
  it("keeps the number unverified at sign-up and verifies it, in international form, when the code is confirmed", async () => {
    const id = newId(1);
    await sys(db, `insert into auth.users (id, phone) values ($1, '966501110001')`, [id]);
    assert.deepEqual(await profile(id), { phone_number: "+966501110001", phone_verified: false, phone_verified_at: null });

    await sys(db, `update auth.users set phone_confirmed_at = now() where id = $1`, [id]);
    const verified = await profile(id);
    assert.equal(verified.phone_number, "+966501110001");
    assert.equal(verified.phone_verified, true);
    assert.ok(verified.phone_verified_at, "the time of verification is recorded");
  });

  it("takes a number that arrives already confirmed in international form", async () => {
    const id = newId(2);
    await sys(db, `insert into auth.users (id, phone, phone_confirmed_at) values ($1, '966501110002', now())`, [id]);
    assert.deepEqual({ ...(await profile(id)), phone_verified_at: undefined }, { phone_number: "+966501110002", phone_verified: true, phone_verified_at: undefined });
  });

  it("un-verifies a profile whose number changes until the new number is confirmed", async () => {
    const id = newId(3);
    await sys(db, `insert into auth.users (id, phone, phone_confirmed_at) values ($1, '966501110003', now())`, [id]);
    await sys(db, `update auth.users set phone = '966501110099', phone_confirmed_at = null where id = $1`, [id]);
    assert.deepEqual(await profile(id), { phone_number: "+966501110099", phone_verified: false, phone_verified_at: null });
    await sys(db, `update auth.users set phone_confirmed_at = now() where id = $1`, [id]);
    assert.equal((await profile(id)).phone_verified, true);
  });

  it("leaves e-mail sign-ups without a phone alone", async () => {
    const id = newId(4);
    await sys(db, `insert into auth.users (id, email) values ($1, 'nophone@test.local')`, [id]);
    await sys(db, `update auth.users set email_confirmed_at = now() where id = $1`, [id]);
    assert.deepEqual(await profile(id), { phone_number: null, phone_verified: false, phone_verified_at: null });
  });

  it("lets a verified phone enable the messages that require one", async () => {
    const id = newId(5);
    await sys(db, `insert into auth.users (id, phone) values ($1, '966501110005')`, [id]);
    await sys(db, `update auth.users set phone_confirmed_at = now() where id = $1`, [id]);
    assert.equal((await sys(db, `select phone_verified from profiles where id = $1`, [id]))[0].phone_verified, true);
  });
});

describe("a phone number belongs to whoever verified it", () => {
  it("lets anyone type any number into their own profile without blocking its owner", async () => {
    const squatter = newId(10);
    const owner = newId(11);
    await sys(db, `insert into auth.users (id, email) values ($1, 'squatter@test.local')`, [squatter]);
    await sys(db, `update profiles set phone_number = '+966501110010' where id = $1`, [squatter]);
    // The real owner signs up with the same number and confirms it.
    await sys(db, `insert into auth.users (id, phone) values ($1, '966501110010')`, [owner]);
    await sys(db, `update auth.users set phone_confirmed_at = now() where id = $1`, [owner]);
    assert.equal((await profile(owner)).phone_verified, true);
  });

  it("refuses to verify the same number on two accounts", async () => {
    const first = newId(20);
    const second = newId(21);
    await sys(db, `insert into auth.users (id, phone, phone_confirmed_at) values ($1, '966501110020', now())`, [first]);
    await sys(db, `insert into auth.users (id, phone) values ($1, '966501110099')`, [second]);
    await sys(db, `update profiles set phone_number = '+966501110020' where id = $1`, [second]);
    assert.equal(await outcome(sys(db, `update profiles set phone_verified = true where id = $1`, [second])), "23505");
  });

  it("does not let a signed-in user mark their own phone verified", async () => {
    const id = newId(30);
    await sys(db, `insert into auth.users (id, email) values ($1, 'self@test.local')`, [id]);
    await as(db, ROLES.user(id), `update profiles set phone_number = '+966501110030' where id = $1`, [id]).catch(() => {});
    const after = await profile(id);
    assert.equal(after.phone_verified, false);
  });
});
