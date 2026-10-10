// Fixtures for the GOV-1 controls (payout accounts and payable ledger rows), set up as the database owner.
import { as, createUser, ROLES, sys } from "./harness.mjs";

let seq = 0;

// An approved payout account for the provider whose 48-hour hold has passed, as finance would have left it two days ago.
// Payout requests for the provider with this IBAN link to it automatically (trg_fill_payout_request_destination).
export async function approvedDestination(db, providerId, iban, { holdUntil = "now() - interval '1 minute'" } = {}) {
  const [existing] = await sys(db, `select id from provider_payout_destinations where provider_id = $1 and status = 'active'`, [providerId]);
  if (existing) {
    await sys(db, `update provider_payout_destinations set status = 'superseded', closed_at = now() where id = $1`, [existing.id]);
  }
  const [row] = await sys(db, `insert into provider_payout_destinations (provider_id, bank_name, account_holder_name, iban, status, requested_by,
      approved_at, hold_until)
    select $1, 'Test Bank', 'Registered Holder', $2, 'active', p.owner_id, now() - interval '3 days', ${holdUntil}
      from providers p where p.id = $1 returning id`, [providerId, iban]);
  await sys(db, `update payout_requests set destination_id = $2 where provider_id = $1 and iban = $3 and destination_id is null`, [providerId, row.id, iban]);
  return row.id;
}

// A ledger row the provider can be paid from (a package sale is payable at once).
export async function payableLedger(db, providerId, amount) {
  seq += 1;
  return (await sys(db, `insert into transactional_ledger (provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share, payout_status)
    values ($1, 'package_sale', $2, $3, 0, $3, 'pending') returning id`, [providerId, `chg_gov_fixture_${Date.now()}_${seq}`, amount]))[0].id;
}

// D-Q5: every payout release needs a second administrator. The maker asks; a finance user created once per database approves,
// which runs the release in the approver's session. Answers what admin_release_payout answers when it runs.
const approvers = new WeakMap();
export async function releaseWithApproval(db, maker, payoutId, key, reason, note = null) {
  const [first] = await as(db, maker, `select admin_release_payout($1, $2, $3, $4) r`, [payoutId, key, reason, note]);
  if (first.r?.status !== "pending_approval") return first.r;
  let checker = approvers.get(db);
  if (!checker) {
    checker = ROLES.user(await createUser(db, { role: "admin", adminRole: "finance" }));
    approvers.set(db, checker);
  }
  const [done] = await as(db, checker, `select admin_decide_approval($1, 'approve', 'Second approval (four eyes)') r`, [first.r.approval_id]);
  return done.r.result;
}
