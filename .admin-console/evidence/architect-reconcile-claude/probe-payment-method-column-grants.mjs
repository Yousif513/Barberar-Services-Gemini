import { createMigratedDb, as, ROLES, SEED, createUser } from "../../../supabase/tests/db/harness.mjs";
const db = await createMigratedDb();
const q = async (sql) => { try { return (await db.query(sql)).rows; } catch (e) { return String(e.message); } };
console.log(JSON.stringify(await q(`select has_column_privilege('authenticated','public.payment_methods','admin_note','SELECT') a, has_column_privilege('authenticated','public.payment_methods','gateway_key','SELECT') g, has_column_privilege('anon','public.payment_methods','admin_note','SELECT') an`)));
console.log(JSON.stringify(await q(`select polname, pg_get_expr(polqual, polrelid) q, polroles::regrole[]::text r from pg_policy where polrelid='public.payment_methods'::regclass`)));
console.log(JSON.stringify(await q(`select column_name from information_schema.columns where table_name='payment_methods' and table_schema='public'`)));
process.exit(0);
