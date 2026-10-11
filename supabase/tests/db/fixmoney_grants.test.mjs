// FIX-MONEY: M-22 (confirm_booking_payment is service-role only) and M-23 (write privileges follow the policies).
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, sys } from "./harness.mjs";

let db;
const IBAN = "SA0380000000608010167519";

before(async () => {
  db = await createMigratedDb();
});

describe("M-22: confirm_booking_payment", () => {
  it("is executable by the service role only", async () => {
    const r = (await sys(db, `select has_function_privilege('authenticated', 'public.confirm_booking_payment(uuid,text,numeric)', 'EXECUTE') a,
                                     has_function_privilege('anon', 'public.confirm_booking_payment(uuid,text,numeric)', 'EXECUTE') n,
                                     has_function_privilege('service_role', 'public.confirm_booking_payment(uuid,text,numeric)', 'EXECUTE') s`))[0];
    assert.deepEqual(r, { a: false, n: false, s: true });
    const admin = ROLES.user(await createUser(db, { role: "admin" }));
    for (const who of [ROLES.anon, ROLES.user(SEED.customer), ROLES.user(SEED.owner1), admin]) {
      await expectError(as(db, who, `select confirm_booking_payment('00000000-0000-4000-8000-000000000001', 'chg_x', 1)`), /permission denied/);
    }
  });
});

describe("M-23: write privileges of signed-in users follow the policies", () => {
  it("no table grants INSERT, UPDATE or DELETE to authenticated without a permissive policy for that command", async () => {
    const rows = await sys(db, `
      with auth as (select oid from pg_roles where rolname = 'authenticated'),
      t as (select c.oid, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p')),
      pol as (select p.polrelid, p.polcmd from pg_policy p, auth where p.polpermissive and (p.polroles = '{0}'::oid[] or auth.oid = any (p.polroles)))
      select t.relname, cmd.name
        from t cross join (values ('INSERT', array['a', '*']), ('UPDATE', array['w', '*']), ('DELETE', array['d', '*'])) as cmd(name, cmds)
       where (case cmd.name when 'DELETE' then has_table_privilege('authenticated', t.oid, 'DELETE') else has_any_column_privilege('authenticated', t.oid, cmd.name) end)
         and not exists (select 1 from pol where pol.polrelid = t.oid and pol.polcmd::text = any (cmd.cmds))
       order by 1, 2`);
    assert.deepEqual(rows, [], `write privileges without a policy: ${JSON.stringify(rows)}`);
  });

  it("payout requests can no longer be inserted directly; the command still works", async () => {
    assert.equal((await sys(db, `select has_table_privilege('authenticated', 'public.payout_requests', 'INSERT') p`))[0].p, false);
    const owner = ROLES.user(SEED.owner1);
    await assert.rejects(as(db, owner, `insert into payout_requests (provider_id, requested_by, amount, bank_name, iban, status) values ($1, $2, 5, 'Bank', $3, 'requested')`, [SEED.provider1, SEED.owner1, IBAN]), /permission denied/);
    await expectError(as(db, owner, `select * from request_provider_payout($1, 5, 'Bank', $2)`, [SEED.provider1, IBAN]), /exceeds the available balance/);
  });
});
