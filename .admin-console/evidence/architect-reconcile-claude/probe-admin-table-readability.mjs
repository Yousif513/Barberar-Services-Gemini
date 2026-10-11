import { createMigratedDb, as, sys, createUser, ROLES, SEED } from "../../../supabase/tests/db/harness.mjs";
const db = await createMigratedDb();
const admin = ROLES.user(await createUser(db, { role: "admin" }));
const tabs = ["psp_reconciliation_runs","provider_fee_invoices","monthly_vat_summary","provider_settlement_summary","employee_earnings_summary","admin_employee_performance","admin_branch_performance","admin_provider_applications_view","invoices","payment_disputes","message_templates","integration_audit_log","platform_settings","platform_feature_flags","data_subject_requests","consents","payout_requests","transactional_ledger","refund_requests","fee_rules","admin_audit_logs","reviews","branches","services","providers","bookings","employees","profiles","categories","integrations","payment_methods","promotional_codes"];
for (const t of tabs) {
  const r = await as(db, admin, `select * from ${t} limit 1`).then(()=> "ok", e=>"ERR "+e.message.slice(0,70));
  console.log(t.padEnd(36), r);
}
process.exit(0);
