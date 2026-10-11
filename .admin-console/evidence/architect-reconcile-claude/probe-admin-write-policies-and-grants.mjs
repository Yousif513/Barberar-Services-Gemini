import { createMigratedDb } from "../../../supabase/tests/db/harness.mjs";
const db = await createMigratedDb();
const r = await db.query(`
select tablename, policyname, cmd, roles::text, left(coalesce(qual,''),70) q from pg_policies
 where schemaname='public' and cmd in ('ALL','INSERT','UPDATE','DELETE') and (coalesce(qual,'')||coalesce(with_check,'')) ilike '%is_admin%'
 order by tablename, cmd`);
for (const x of r.rows) console.log(x.tablename.padEnd(34), x.cmd.padEnd(7), x.policyname.slice(0,48));
const g = await db.query(`select table_name, string_agg(distinct privilege_type, ',') p from information_schema.role_table_grants where grantee='authenticated' and table_schema='public' and privilege_type in ('INSERT','UPDATE','DELETE') and table_name in ('transactional_ledger','wallet_credits','gift_cards','payout_requests','loyalty_points_ledger','payment_methods','integrations','services','branches','reviews','promotional_codes','platform_settings','invoices','fee_rules','refund_requests','providers') group by 1 order by 1`);
console.log(JSON.stringify(g.rows));
const s = await db.query(`select tablename, policyname, cmd from pg_policies where schemaname='public' and cmd in ('SELECT','ALL') and (coalesce(qual,'')) ilike '%is_admin%' and tablename in ('profiles','consents','data_subject_requests','payout_requests','transactional_ledger','employees') order by 1`);
console.log(JSON.stringify(s.rows));
process.exit(0);
