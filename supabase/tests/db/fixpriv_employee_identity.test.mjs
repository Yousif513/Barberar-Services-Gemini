import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, ROLES, SEED, sys } from "./harness.mjs";

// FIX-PRIV P-04: staff auth uuids are not public, and an owner cannot bind an arbitrary user as an employee.
let db;
let victim;
const owner = ROLES.user(SEED.owner1);

before(async () => {
  db = await createMigratedDb();
  victim = await createUser(db, { role: "customer" });
});

describe("P-04 employees.profile_id", () => {
  it("is not readable by visitors, while the public staff columns still are", async () => {
    await assert.rejects(as(db, ROLES.anon, `select profile_id from employees`), /permission denied/);
    assert.ok((await as(db, ROLES.anon, `select id, name_en, photo_url from employees`)).length >= 1);
  });
  it("cannot be set by an owner on insert or update", async () => {
    await assert.rejects(as(db, owner, `insert into employees (branch_id, name_en, name_ar, profile_id) values ($1, 'X', 'س', $2)`, [SEED.branch1, victim]), /permission denied/);
    await assert.rejects(as(db, owner, `update employees set profile_id = $1 where id = $2`, [victim, SEED.employee1]), /permission denied/);
    assert.equal((await sys(db, `select count(*)::int n from employees where profile_id = $1`, [victim]))[0].n, 0);
  });
  it("still lets an owner add and edit staff without a login", async () => {
    const [row] = await as(db, owner, `insert into employees (branch_id, name_en, name_ar, phone) values ($1, 'New', 'جديد', '+966500000001') returning id`, [SEED.branch1]);
    await as(db, owner, `update employees set title_en = 'Senior' where id = $1`, [row.id]);
    assert.equal((await sys(db, `select title_en from employees where id = $1`, [row.id]))[0].title_en, "Senior");
  });
  it("is still linked by the service role", async () => {
    await sys(db, `update employees set profile_id = $1 where id = $2`, [victim, SEED.employee1]);
    assert.equal((await sys(db, `select profile_id from employees where id = $1`, [SEED.employee1]))[0].profile_id, victim);
  });
});
