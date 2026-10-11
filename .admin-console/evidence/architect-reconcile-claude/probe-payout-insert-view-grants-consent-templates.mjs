import { createMigratedDb, as, sys, createUser, ROLES, SEED } from "../../../supabase/tests/db/harness.mjs";
const db = await createMigratedDb();
const q = async (s, p=[]) => { try { return (await db.query(s,p)).rows; } catch(e){ return "ERR "+e.message; } };
console.log("payout_requests policies:", JSON.stringify(await q(`select policyname, cmd, roles::text from pg_policies where tablename='payout_requests'`)));
console.log("payout insert priv:", JSON.stringify(await q(`select has_table_privilege('authenticated','public.payout_requests','INSERT') i`)));
for (const v of ["admin_data_subject_requests_view","admin_provider_applications_view","admin_provider_performance","employee_earnings_summary","monthly_vat_summary","provider_settlement_summary"]) {
  console.log(v, JSON.stringify(await q(`select has_table_privilege('anon','public.${v}','SELECT') anon_sel, has_table_privilege('authenticated','public.${v}','INSERT') auth_ins, has_table_privilege('authenticated','public.${v}','UPDATE') auth_upd`)));
}
console.log("has_active_consent:", JSON.stringify(await q(`select pg_get_functiondef('public.has_active_consent(uuid,text)'::regprocedure) d`)).slice(0,700));
console.log("templates read anon:", JSON.stringify(await q(`select has_table_privilege('anon','public.message_templates','SELECT') s`)), JSON.stringify(await q(`select policyname, roles::text from pg_policies where tablename='message_templates'`)));
console.log("platform_settings anon policy:", JSON.stringify(await q(`select policyname, roles::text, qual from pg_policies where tablename='platform_settings'`)));
process.exit(0);
