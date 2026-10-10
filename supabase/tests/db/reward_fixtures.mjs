// Fixtures for the D-Q7 referral and loyalty controls. The values below are TEST values for the test database only; the
// release path keeps every programme value unset until the owner sets it (reward_programs starts disabled and empty).
import { as, createUser, ROLES } from "./harness.mjs";

const TERMS_EN = "Test terms for the automated test suite only. ".repeat(6);
const TERMS_AR = "شروط اختبار للاختبارات الآلية فقط وليست شروطاً منشورة. ".repeat(6);

const people = new WeakMap();
// A finance proposer and a second owner who approves, created once per database.
export async function governancePair(db) {
  let pair = people.get(db);
  if (!pair) {
    pair = {
      proposer: ROLES.user(await createUser(db, { role: "admin", adminRole: "finance" })),
      approver: ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" })),
    };
    people.set(db, pair);
  }
  return pair;
}

let version = 0;
// Publishes terms, proposes the programme with these values and approves it with a different owner (the governed path).
export async function enableProgramme(db, program, values = {}) {
  const { proposer, approver } = await governancePair(db);
  version += 1;
  const terms = `test-${program}-${version}`;
  await as(db, proposer, `select admin_publish_reward_terms($1, $2, $3, $4, 'Publishing the test terms')`, [program, terms, TERMS_EN, TERMS_AR]);
  const v = { reward: 10, cap: 100, budget: 100000, expiry: 90, ...values };
  const [asked] = await as(db, proposer,
    `select admin_propose_reward_program($1, true, $2, $3, $4, $5, $6, 'Launching the programme in the test database', $7, $8, $9) r`,
    [program, v.reward, v.cap, v.budget, v.expiry, terms, program === "loyalty" ? v.pointsPerSar ?? 1 : null,
     program === "loyalty" ? v.minRedeem ?? 100 : null, v.minQualifying ?? null]);
  const [done] = await as(db, approver, `select admin_decide_approval($1, 'approve', 'Second owner approves the launch') r`, [asked.r.approval_id]);
  return { terms, result: done.r };
}

export async function disableProgramme(db, program) {
  const { proposer, approver } = await governancePair(db);
  const [asked] = await as(db, proposer, `select admin_propose_reward_program($1, false, null, null, null, null, null, 'Switching the programme off') r`, [program]);
  await as(db, approver, `select admin_decide_approval($1, 'approve', 'Second owner approves') r`, [asked.r.approval_id]);
}

export async function acceptTerms(db, user, program) {
  const [status] = await as(db, user, `select reward_program_status($1) s`, [program]);
  await as(db, user, `select accept_reward_terms($1, $2, 'en')`, [program, status.s.terms_version]);
}
