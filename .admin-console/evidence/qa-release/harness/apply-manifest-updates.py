"""qa-release-claude manifest writes, 2026-10-17. Every change goes through admin_console_manifest.py add/set; the manifest is
re-read from disk before each group so concurrent writes by other agents are kept. Run with --dry to print the plan only."""
import importlib.util, json, subprocess, sys
from pathlib import Path

ROOT = Path(r"C:/Users/Yousif's PC/Desktop/Ai Projects/primora-fix")
MAN = ROOT / ".admin-console/manifest.json"
SCRIPT = r"C:/Users/Yousif's PC/.claude/skills/adminwright/scripts/admin_console_manifest.py"
EV = ".admin-console/evidence/qa-release/"
DRY = "--dry" in sys.argv
ME = "qa-release-claude"
spec = importlib.util.spec_from_file_location("acm", SCRIPT)
acm = importlib.util.module_from_spec(spec); spec.loader.exec_module(acm)
log = []

def load():
    return json.load(open(MAN, encoding="utf-8"))

def run(args):
    if DRY:
        print("DRY", " ".join(a if len(a) < 160 else a[:160] + "..." for a in args)); return 0
    p = subprocess.run([sys.executable, SCRIPT] + args + ["--manifest", str(MAN)], capture_output=True, text=True, encoding="utf-8")
    line = (p.stdout.strip().splitlines() or [""])[-1][:200]
    log.append(f"exit {p.returncode} {args[0]} {args[2] if len(args) > 2 else ''} :: {line} {p.stderr.strip()[:400]}")
    if p.returncode != 0:
        print("FAILED", args[:3], p.stderr.strip()[:800])
    return p.returncode

def set_(path, value):
    v = json.dumps(value, ensure_ascii=False) if isinstance(value, (list, dict)) else ("true" if value is True else "false" if value is False else str(value))
    return run(["set", "--path", path, "--value", v])

def add(kind, objs, entity=None):
    f = ROOT / EV / f"_add-{kind}.json"
    f.write_text(json.dumps(objs, ensure_ascii=False, indent=1), encoding="utf-8")
    args = ["add", "--kind", kind, "--json", "@" + str(f)]
    if entity: args += ["--entity", entity]
    rc = run(args)
    if not DRY: f.unlink()
    return rc

def ok_file(rel):
    p = ROOT / rel.split("#")[0]
    return acm.path_state(p) == "ok" if p.exists() else rel.startswith(("http", "manual:", "command:"))

def cap_path(m, cid):
    for e in m["entities"]:
        for c in e["capabilities"]:
            if c["id"] == cid:
                return f"entities[{e['id']}].capabilities[{cid}]", c
    raise KeyError(cid)

def gap(m, gid):
    return next(g for g in m["gaps"] if g["id"] == gid)

NOTE = "QA-RELEASE (qa-release-claude, 2026-10-17): "

# 0. register
m = load()
if not any(a["id"] == ME for a in m["agents"]):
    add("agent", [{"id": ME, "role": "qa", "ownsCapabilities": [], "ownsScreens": [], "status": "active",
                   "notes": "Release-gate QA pass 2026-10-17 over every domain (money, governance, privacy first; then catalogue, bookings, settings, screens). "
                            "No claim taken; no application, migration or function file edited. Worklog .admin-console/worklog/qa-release-claude.md; report docs/reviews/2026-10-17-qa-release-gate.md."}])

# 1. cross-cutting flags first (flipping capabilities to implemented makes stepUp and capturesSafeBeforeAfter required)
m = load(); cc = m["crossCutting"]
def add_ev(section, files):
    cur = cc[section].get("evidence") or []
    new = cur + [f for f in files if f not in cur]
    if new != cur:
        set_(f"crossCutting.{section}.evidence", new)
add_ev("authentication", [EV + "role-matrix-summary.txt", EV + "session-and-step-up-live.txt"])
for k in ("mfaForPrivilegedRoles", "sessionRevocation", "stepUpForSensitiveActions"):
    set_(f"crossCutting.authentication.{k}", True)
add_ev("audit", [EV + "maker-checker-live.txt", EV + "privileged-reads-live.txt", EV + "audit-before-after-rows.txt"])
for k in ("tamperProtected", "privilegedReadsWhenRequired", "capturesSafeBeforeAfter"):
    set_(f"crossCutting.audit.{k}", True)
add_ev("safety", [EV + "maker-checker-live.txt", EV + "emit-authz-matrix-before.md"])
set_("crossCutting.safety.riskClassifiedActions", True)
add_ev("data", [EV + "privileged-reads-live.txt", EV + "permission-gates.txt"])
set_("crossCutting.data.sensitiveFieldsClassified", True)
add_ev("experience", [EV + "browser-summary.txt"])
add_ev("authorization", [EV + "role-matrix-summary.txt", EV + "permission-gates.txt", EV + "direct-table-writes.txt"])

# 2. capabilities reviewed and implemented
REVIEWED = ["booking.transition", "payout.mark-paid", "customer.clear-profile", "audit.search", "feature-flag.set", "dashboard.overview", "analytics.funnel"]
for cid in REVIEWED:
    m = load(); p, c = cap_path(m, cid)
    if c["status"] == "implemented" and c.get("reviewedBy") == ME:
        continue
    ev = c.get("evidence") or []
    if EV + "capability-review.txt" not in ev:
        set_(p + ".evidence", ev + [EV + "capability-review.txt"])
    set_(p + ".reviewedBy", ME)
    set_(p + ".reviewStatus", "reviewed")
    set_(p + ".rationale", c["rationale"] + " " + NOTE + "independently reviewed against the installed function, its tests and live probes; see .admin-console/evidence/qa-release/capability-review.txt.")
    set_(p + ".status", "implemented")

# 3. capabilities contested
CONTEST = {
    "refund.retry": "refund-outcomes-that-cannot-be-known-have-no-recovery",
    "ropa.view": "ropa-register-ships-in-the-client-bundle",
}
for cid in ["service.upsert", "service.toggle-active", "service.set-price", "service.delete", "service.set-featured", "branch.toggle-active",
            "integration.toggle", "integration.upsert", "integration.delete", "payment-method.toggle", "payment-method.set-default"]:
    CONTEST[cid] = "direct-table-updates-report-success-when-the-row-policy-refuses"

# 4. new gaps (added before contesting so the pairing exists)
NEW_GAPS = [
 {"id": "direct-table-updates-report-success-when-the-row-policy-refuses", "severity": "critical", "status": "open",
  "description": "Console screens that write tables directly (services toggle/featured/price/archive/edit, branches toggle, integrations patch/disable/edit, payment methods toggle/default/edit in the ledger screen, packages toggle) check only the error field of the PostgREST answer. When the console role lacks the table permission, the restrictive row policy matches no row and PostgREST answers 200 with nothing changed, so the screen keeps its optimistic state and reports success. Reproduced in a real browser: the analyst pressed INACTIVE on a service and Deactivate on a branch, finance pressed Disable on an integration; each screen showed the change (the integration screen said 'API integration disabled.'), and a reload showed the stored value unchanged. The server boundary is correct (direct-table-writes.txt); the operator is told a change happened that did not.",
  "rationale": "Found by qa-release-claude. False success is release-blocking (AGENTS.md defect class 1). REMEDY: make every direct update ask for the affected rows (.select() or count) and treat zero rows as a refusal that rolls the optimistic state back and names the missing permission; better, move these writes behind reasoned commands like the rest of the console; and leave the controls out for roles that cannot use them (read-only-roles-see-enabled-write-controls). Add a browser or component test per screen that presses the control as a role without the permission.",
  "evidence": [EV + "browser-summary.txt", EV + "browser-falsesuccess.json", EV + "direct-table-writes.txt", "web_platform/src/app/admin/branches/page.tsx#L126"]},
 {"id": "refused-reads-shown-with-an-empty-state", "severity": "medium", "status": "open",
  "description": "When the database refuses a screen's read (403/42501 injected at the data boundary in a real browser), services, branches, packages, coupons, integrations, activity and reviews show their empty-state text ('No matching services. Add a new service to get started.', 'No branches found yet.', 'No service packages found in database.', 'No activity recorded for this filter yet.') together with, or instead of, the refusal. Services words a load failure as 'Failed to update service catalog.'; integrations tells the operator to apply migrations; packages answers in Arabic on an English screen. A refused or failed read must not look like an empty platform.",
  "rationale": "Found by qa-release-claude (states phase, browser-states.json). REMEDY: render the error or forbidden state instead of the empty state whenever the read failed, with copy that names the reason (permission or outage), role=alert, and a retry; reuse ForbiddenNotice for 42501 as taxes, approvals and the privacy screens already do.",
  "evidence": [EV + "browser-summary.txt", EV + "browser-states.json"]},
 {"id": "axe-critical-unlabelled-controls-on-services-and-integrations", "severity": "medium", "status": "open",
  "description": "axe-core (WCAG 2.x A/AA) reports critical violations in every language and width: /admin/services has 33 inline price/duration inputs without a label and 2 filter selects without a name; /admin/integrations has a select without a name. Screen-reader users cannot tell which service a price field edits.",
  "rationale": "Found by qa-release-claude (a11y phase, 152 runs). REMEDY: aria-label each inline input with the service name and field, label the selects; re-run the axe phase of harness/qa-browser-harness.mjs.",
  "evidence": [EV + "browser-summary.txt", EV + "browser-a11y.json"]},
 {"id": "axe-contrast-and-scroll-region-failures", "severity": "medium", "status": "open",
  "description": "axe-core serious violations: color-contrast at 375 px on coupons, disputes, reviews, reports, packages, refunds, reconciliation and provider inventory (the 8 px #B8952E eyebrow in components/control-center.tsx, 2.84:1), and on /customer/privacy, /become-provider, /privacy and /login/mfa (stone-400/500, #A57C32 and #9B7928 small text, 2.5 to 4.3:1); scrollable-region-focusable on coupons and reports at 375 px, taxes and whatsapp at 1440 px (#admin-main) and provider chain at 375 px, so keyboard users cannot scroll those regions.",
  "rationale": "Found by qa-release-claude. REMEDY: raise the eyebrow and small-text colours to 4.5:1, give scroll containers tabindex=0 with a name (or make their content focusable); re-run the axe phase. Overlaps low-contrast-status-text-and-micro-typography for other elements.",
  "evidence": [EV + "browser-summary.txt", EV + "browser-a11y.json"]},
 {"id": "read-only-roles-see-enabled-write-controls", "severity": "medium", "status": "open",
  "description": "The analyst (read-only) sees enabled write controls on /admin/services (Add service, featured toggles, Edit, status, Archive), /admin/integrations (Add API, environment, Edit, Disable), /admin/branches (Toggle), /admin/coupons (Add coupon) and /admin/sponsored (Switch on, Edit); finance sees the same on services, integrations, branches, coupons and sponsored although it holds neither operations.write nor settings.manage. The server refuses every one (direct-table-writes.txt, permission-gates.txt), and on the direct-write screens the refusal is then reported as success.",
  "rationale": "Found by qa-release-claude (roles phase, browser-roles.json). ux1-navigation-and-actions-not-trimmed-to-console-role fixed navigation and named screens, not these. REMEDY: derive each control from admin_session_state permissions (knownToHold) as approvals and roles already do.",
  "evidence": [EV + "browser-summary.txt", EV + "browser-roles.json"]},
 {"id": "finance-employees-screen-fires-refused-reads", "severity": "low", "status": "open",
  "description": "Finance opening /admin/employees gets the forbidden notice, but the screen still calls admin_list_employees twice and the browser console logs two 403 errors. AGENTS.md requires no console errors on any admin route.",
  "rationale": "Found by qa-release-claude (roles phase). REMEDY: do not start the screen's reads when the layout has decided the route is forbidden.",
  "evidence": [EV + "browser-roles.json"]},
 {"id": "console-refusals-say-administrator-access-required", "severity": "low", "status": "open",
  "description": "Twenty console commands answer a console administrator who lacks the needed permission with 'Administrator access required' or 'Administrator role required' (for example operations calling admin_retry_refund_request, finance calling admin_clear_customer_profile or admin_set_provider_status), which tells an administrator they are not one. Others name the role or permission ('Your console role cannot change bookings').",
  "rationale": "Found by qa-release-claude (permission-gates.txt). REMEDY: use one refusal wording that names the missing permission for console sessions.",
  "evidence": [EV + "permission-gates.txt"]},
 {"id": "dev-server-metadata-routes-break-on-apostrophe-path", "severity": "low", "status": "open",
  "description": "In webpack dev mode (next dev --webpack, Next 16.3.8) a request to /robots.txt or /sitemap.xml fails to compile because next-metadata-route-loader writes the project path into a single-quoted string and the checkout path contains an apostrophe (Yousif's PC). The failed entry then answers every route with 500 for several minutes until it is disposed. Production build is unaffected (build exit 0).",
  "rationale": "Found by qa-release-claude when the harness primed the origin on /robots.txt (the shared dev server returned 500 on every route for about 6 minutes, then recovered without a restart). Local-only. REMEDY: move the checkout to a path without an apostrophe, or serve robots and sitemap as static files in public/ for development.",
  "evidence": [EV + "harness/qa-browser-harness.mjs"]},
 {"id": "ropa-register-ships-in-the-client-bundle", "severity": "low", "status": "open",
  "description": "ropa.view compiles docs/privacy/ropa.md into the browser bundle; the only gate is the client AuthGuard, which is not authorization (AGENTS.md). Anyone who downloads the bundle can read the processing register, including the 21 owner fields once filled.",
  "rationale": "Found by qa-release-claude. Low while the register holds no secrets. REMEDY: serve it from an audited console read (or accept it as public with a confirmed decision).",
  "evidence": [EV + "capability-review.txt"]},
 {"id": "capability-records-incomplete-for-release", "severity": "medium", "status": "open",
  "description": "95 in-progress capabilities cannot be set to implemented without new release-validation errors on their own records: tests that do not name the capability id, a server-operation path or its route (58), evidence or test files the content scan refuses, empty serverOperations or authorizationPolicies, unstated idempotency on commands (31), missing recovery on high and critical commands (23), and capabilities no screen references. These account for most of the 158 release-status-unresolved errors.",
  "rationale": "Found by qa-release-claude by simulating the flip on a copy of the manifest; the per-capability list is in capability-record-deficits.txt. Owner: implementer and architect (QA does not edit implementation fields). Behaviour was swept by the role matrix and permission-gate probes with no authority leak; the remaining work is completing the records, adding tests that name what they prove, and an independent review per capability.",
  "evidence": [EV + "capability-record-deficits.txt", EV + "capability-review.txt"]},
 {"id": "manifest-roles-do-not-model-console-roles", "severity": "medium", "status": "open",
  "description": "roles[] still declares one 'admin' role with scope 'platform-wide, no monetary limit', mfaRequired false and 'no MFA, no step-up', while the built system has owner, finance, operations and analyst console roles with aal2 and step-up (verified live). emit --format authz-matrix therefore cannot express the permission matrix QA verified (permission-gates.txt).",
  "rationale": "Found by qa-release-claude. Owner: architect. REMEDY: model the four console roles with their permissions, scopes, MFA and separation of duties, and map capabilities to them.",
  "evidence": [EV + "emit-authz-matrix-before.md", EV + "permission-gates.txt"]},
 {"id": "coverage-structural-orphans", "severity": "medium", "status": "open",
  "description": "coverage exits 1 with 6 errors: gov.iban-change routes to /provider/wallet and reward-program.enable to /customer/wallet, neither a modelled screen; reconciliation and reward-program have no query capability; reconciliation state 'escalated' is observed by no capability and reached by no command although escalate_reconciliation_breaks exists.",
  "rationale": "Found by qa-release-claude (coverage-before.txt). Owner: architect (model the provider and customer wallet screens, add reconciliation.list and reward-program.list query capabilities, attach the escalation job).",
  "evidence": [EV + "coverage-before.txt"]},
 {"id": "admin-observability-has-no-instrumentation", "severity": "medium", "status": "open",
  "description": "crossCutting.observability has no evidence: no admin API instrumentation, no correlation ids surfaced to operators, no alerting on high-risk actions beyond in-app security alerts, and the scheduled jobs (reconciliation, governance notices, retention purges) have neither a scheduler nor monitoring (see the *-not-scheduled gaps).",
  "rationale": "Found by qa-release-claude. REMEDY: request ids in command answers and audit rows, an error and latency view per admin RPC, and job health for each scheduler once scheduled.",
  "evidence": [EV + "browser-summary.txt"]},
 {"id": "static-screens-lack-required-states", "severity": "low", "status": "open",
  "description": "/admin/help and /admin/ropa render bundled content with no data read, so loading, error and forbidden do not occur and cannot be verified; the release rule requires them listed. /admin/help also carries the hard-coded contacts gap and is blocked.",
  "rationale": "Found by qa-release-claude. Owner: ux-reviewer or architect to record a confirmed decision that these states do not apply, or serve the content through an audited read.",
  "evidence": [EV + "browser-summary.txt"]},
]
m = load()
have = {g["id"] for g in m["gaps"]}
todo = [g for g in NEW_GAPS if g["id"] not in have]
if todo:
    add("gap", todo)

for cid, gid in CONTEST.items():
    m = load(); p, c = cap_path(m, cid)
    if c.get("reviewStatus") == "contested" and c.get("reviewedBy") == ME:
        continue
    set_(p + ".reviewedBy", ME)
    set_(p + ".reviewStatus", "contested")
    set_(p + ".rationale", c["rationale"] + " " + NOTE + f"contested, paired gap {gid}; see .admin-console/evidence/qa-release/capability-review.txt.")

# 5. gaps resolved by this pass's verification
FIX = {
 "admin-sessions-have-no-mfa-or-step-up": ([EV + "role-matrix-summary.txt", EV + "session-and-step-up-live.txt"],
   "verified fixed on the local stack: admin_role() requires aal2 and a live session; an aal1 console owner was refused all 126 console functions it called; sign-out and role removal end console access on an issued token; a code older than 5 minutes is refused with step_up_required. The hosted settings stay on hosted-auth-settings-must-match-gov1."),
 "no-separation-of-duties": ([EV + "maker-checker-live.txt", EV + "permission-gates.txt"],
   "verified fixed: four console roles with distinct permissions (finance cannot change bookings or profiles, operations cannot move money), and the approvals framework refuses self-approval for every role, approvals by roles without the approver permission and blank reasons, live (24/24) and through the UI. Who holds finance and the second owner remain owner items on finance-role-holders-not-yet-approved and sole-owner-cannot-grant-approver-roles."),
 "iban-unmasked-to-every-admin": ([EV + "privileged-reads-live.txt", EV + "permission-gates.txt"],
   "verified fixed: owner and finance sessions are refused a direct SELECT of payout_requests and provider_payout_destinations (42501); reveal_provider_iban refuses operations and asks finance and owner for a ticket reference after step-up (D9 approved by the owner on 2026-10-17)."),
 "referral-and-loyalty-values-self-approved-and-unbounded": ([EV + "reward-program-controls-excerpt.txt"],
   "verified fixed: admin_update_platform_setting refuses the referral and loyalty keys; admin_propose_reward_program needs money.config and step-up, bounds every value, refuses enabling while any value is unset, and files a reward_program approval decided by a rewards.approve holder (owner) other than the requester. The values themselves stay with the owner (V1, V2) and counsel (rewards-counsel-and-tax-before-enablement)."),
}
for gid, (files, text) in FIX.items():
    m = load(); g = gap(m, gid)
    if g["status"] == "fixed":
        continue
    kept = [e for e in g.get("evidence", []) if ok_file(e)]
    dropped = [e for e in g.get("evidence", []) if e not in kept]
    set_(f"gaps[{gid}].evidence", files + kept)
    set_(f"gaps[{gid}].rationale", g["rationale"] + " " + NOTE + text + (f" Earlier evidence not cited because the content scan refuses the file: {', '.join(dropped)}." if dropped else ""))
    set_(f"gaps[{gid}].status", "fixed")

ANNOTATE = {
 "refund-outcomes-that-cannot-be-known-have-no-recovery": "re-read; still open. supabase/functions/_shared/refunds.ts line 53 still records any thrown fetch error as a definite refusal, so refund.retry stays contested. Engineering after Tap confirms idempotency-key behaviour and a refund lookup.",
 "audit-trail-is-not-tamper-evident-beyond-rls": "verified live that the table is append-only to every application credential (owner and finance DELETE and forged INSERT refused 42501; authenticated holds SELECT only, service_role INSERT and SELECT; append-only and no-truncate triggers present). Still open for tamper evidence beyond the database (hash chain or external sink), which this flag does not need.",
 "high-risk-capabilities-missing-safeguard-and-audit-links": "audit.search now has its server operation, policy and tests and was reviewed (it audits its own reads). refund.list still has no safeguards or audit events recorded.",
 "money-capability-reviews-predate-the-money-patches": "payout.mark-paid re-reviewed against the installed admin_release_payout and marked reviewed; refund.retry contested (unknown refund outcomes). ledger.release-payout, payout.approve and refund.execute still need a review once their records pass (capability-records-incomplete-for-release).",
}
for gid, text in ANNOTATE.items():
    m = load(); g = gap(m, gid)
    if NOTE in g["rationale"]:
        continue
    set_(f"gaps[{gid}].rationale", g["rationale"] + " " + NOTE + text)

# 6. scanner false positives on fixed gaps: cite the clean excerpt in place of the refused file
idx = json.load(open(ROOT / EV / "scan-excerpts/index.json"))
for item in idx:
    m = load(); g = gap(m, item["gap"])
    ev = list(g["evidence"])
    i = item["index"]
    if i < len(ev) and ev[i] != item["path"] and not ok_file(ev[i]):
        original = ev[i]
        ev[i] = item["path"]
        set_(f"gaps[{item['gap']}].evidence", ev)
        set_(f"gaps[{item['gap']}].rationale", g["rationale"] + " " + NOTE + f"evidence[{i}] {original} is refused by the content scan for a false positive (see placeholder-scan triage); the excerpt cited in its place quotes the same lines.")

# 7. screens: accessibility, responsive, verified states
A11Y_OK = ["admin-dashboard", "admin-providers", "admin-ledger", "admin-bookings", "admin-customers", "admin-branches", "admin-activity", "admin-employees",
           "admin-settings", "admin-notifications", "admin-help", "admin-supply", "admin-audit-logs", "admin-platform-rules", "admin-roles", "admin-sponsored",
           "admin-privacy", "admin-incidents", "admin-ropa", "admin-approvals", "provider-pricing"]
STATES_ADD = {"admin-providers": ["forbidden"], "admin-ledger": ["forbidden"], "admin-disputes": ["forbidden"], "admin-notifications": ["forbidden"],
              "admin-supply": ["forbidden"], "provider-pricing": ["forbidden"], "customer-privacy-account": ["forbidden"], "become-provider": ["forbidden"],
              "admin-reviews": ["forbidden"], "admin-activity": ["loading"]}
m = load()
for s in m["screens"]:
    sid = s["id"]
    if s.get("status") == "removed":
        continue
    changed = []
    if sid in A11Y_OK and s.get("accessibilityStatus") != "implemented":
        set_(f"screens[{sid}].accessibilityStatus", "implemented"); changed.append("axe clean in EN/AR at 1440 and 375 px, keyboard skip link, focus ring and drawer verified")
    if s.get("responsive") is not True:
        set_(f"screens[{sid}].responsive", True); changed.append("no horizontal overflow at 375 px in EN and AR, phone drawer verified")
    add_states = [x for x in STATES_ADD.get(sid, []) if x not in s.get("states", [])]
    if add_states:
        set_(f"screens[{sid}].states", s["states"] + add_states); changed.append("verified states " + ", ".join(add_states))
    if changed:
        m2 = load(); s2 = next(x for x in m2["screens"] if x["id"] == sid)
        set_(f"screens[{sid}].rationale", s2["rationale"] + " " + NOTE + "; ".join(changed) + " (.admin-console/evidence/qa-release/browser-summary.txt). Screen-reader review not done.")

# 8. quality gates
GATES = {
 "build": ("passed", [EV + "gate-summary.txt"], "Re-run 2026-10-17 by qa-release-claude: npm run build --workspace=web_platform exit 0 (local Supabase URL in the environment)."),
 "typecheck": ("passed", [EV + "gate-summary.txt"], "Re-run 2026-10-17: typecheck:mobile exit 0 and tsc -p web_platform --noEmit exit 0."),
 "lint": ("passed", [EV + "gate-summary.txt"], "Re-run 2026-10-17: npm run lint exit 0, 0 errors (warnings only)."),
 "tests": ("passed", [EV + "gate-summary.txt"], "Re-run 2026-10-17: test:db 1429/1429, web 753/753, edge 46/46, inventory 10/10, mobile 27/27, ui-schema 0 mismatches, security-core, admin-controls, p3-compat exit 0."),
 "browser": ("failed", [EV + "browser-summary.txt", EV + "browser-workflow.json"], "Run 2026-10-17 by qa-release-claude in headless Chrome against the local stack: the approval workflow passed end to end through the UI for finance and owner (password, /login/mfa, Approvals, decision, reload, database and audit check); analyst, finance, operations and customer sessions were driven over every admin route. Failing: write controls report success when the server refused them (direct-table-updates-report-success-when-the-row-policy-refuses, critical) and finance's employees visit logs two console errors."),
 "accessibility": ("failed", [EV + "browser-summary.txt", EV + "browser-a11y.json"], "Run 2026-10-17: axe-core 4.12.1 on 38 screens in EN and AR at 1440 and 375 px (152 runs) plus keyboard checks. 21 screens clean; critical unlabelled controls on services and integrations; contrast and scroll-region failures on 15 more; no screen-reader review. See axe-critical-unlabelled-controls-on-services-and-integrations and axe-contrast-and-scroll-region-failures."),
 "security": ("failed", [EV + "role-matrix-summary.txt", EV + "permission-gates.txt", EV + "maker-checker-live.txt", EV + "session-and-step-up-live.txt", EV + "privileged-reads-live.txt", EV + "direct-table-writes.txt"], "Run 2026-10-17 against local PostgREST with real tokens: 137 console functions refused anonymous, customer, provider and aal1 owner callers; the analyst reached reads only; permission gates per console role as designed; maker-checker, replay, revocation, stale role, step-up window, privileged reads and direct table writes all held. Still failing on open findings: refund outcomes that cannot be known (high), hosted Auth settings unverified (high, owner), false success on refused writes (critical integrity defect), no Content-Security-Policy (medium)."),
 "performance": ("failed", [EV + "browser-summary.txt", EV + "browser-perf-prod-build.json"], "Measured 2026-10-17 on the production build with the local fixture set: worst warm LCP 548 ms, worst data-settled 548 ms, worst cold LCP 860 ms across 38 routes (well inside a 2.5 s LCP budget). Not passed because the threshold is a production-volume budget: the data volume is 20 customers and 15 bookings (fixtures-too-tidy-for-state-coverage), lists are unpaginated (no-pagination-or-server-side-filtering), and the owner has not set a budget."),
}
m = load()
for g in m["qualityGates"]:
    if g["id"] in GATES:
        st, ev, why = GATES[g["id"]]
        set_(f"qualityGates[{g['id']}].evidence", ev)
        set_(f"qualityGates[{g['id']}].status", st)
        set_(f"qualityGates[{g['id']}].rationale", why)

# 9. feedback to the skill
FEEDBACK = [
 {"id": "qa-release-content-scan-ignores-line-anchors", "category": "tooling", "status": "open",
  "observation": "17 release errors were fixed gaps whose evidence files the content scan refused for one token each: SQL uuid and byte generator defaults (12), an input-hint translation key (2), a test title asserting the opposite, and letters spanning two words in a comment or sort-key list. The cited path#Lnn anchor is ignored, so the whole file is refused.",
  "proposedChange": "Scan only the anchored line range when an evidence entry carries #Lnn, and exempt SQL identifiers such as gen_random_uuid and gen_random_bytes; until then document the excerpt pattern (cite a QA excerpt that quotes the anchored lines) in verification.md.",
  "evidence": [EV + "scan-excerpts/index.json"]},
 {"id": "qa-release-token-match-blocks-honest-flips", "category": "friction", "status": "open",
  "observation": "Simulating every in-progress capability as implemented raised validate from 299 to 461 errors: 58 evidence-token-match because database suites name the SQL function, not the migration path cited in serverOperations, plus refused files and missing idempotency or recovery statements. QA can only flip the 7 records that are already complete.",
  "proposedChange": "Accept the function name found at the cited migration line as a capability token, and add a 'simulate --flip' command that reports, per capability, what flipping it would add.",
  "evidence": [EV + "capability-record-deficits.txt"]},
 {"id": "qa-release-cdp-harness-pattern", "category": "new-pattern", "status": "open",
  "observation": "Without Playwright, a single Node script driving headless Chrome over the DevTools protocol covered axe (injected from node_modules), overflow, keyboard, state injection (Fetch domain: hold, empty, 503, 403), real console-role sweeps, a UI workflow with TOTP from the local factor secret, and navigation timing. Isolated browser contexts per role avoided touching the person's own browser sessions.",
  "proposedChange": "Add the pattern to verification.md (browser verification) with the warning to prime the origin on a static public file, not a framework metadata route.",
  "evidence": [EV + "harness/qa-browser-harness.mjs", EV + "browser-summary.txt"]},
 {"id": "qa-release-false-success-probe", "category": "gap", "status": "open",
  "observation": "Every server check held, yet the console told a read-only operator that a service was archived and an integration disabled: PostgREST answers 200 with no rows when a restrictive row policy filters an UPDATE. The adversarial table has no row for 'press each write control as a role without the permission, then reload'.",
  "proposedChange": "Add to the adversarial QA table: hidden-control bypass in the UI direction (refused write reported as success); pass condition: the screen shows the refusal and the reload agrees.",
  "evidence": [EV + "browser-falsesuccess.json", EV + "direct-table-writes.txt"]},
 {"id": "qa-release-dev-server-shared-hazard", "category": "tooling", "status": "open",
  "observation": "A QA probe of /robots.txt took the shared Next.js dev server (used by a parallel UX reviewer) down for about six minutes because the project path contains an apostrophe. The server recovered after the failing entry aged out; no restart was allowed.",
  "proposedChange": "multi-agent.md: when agents share one dev server, QA browser probes must not request framework-generated routes speculatively, and a broken shared server must be reported to the coordinator at once.",
  "evidence": [EV + "harness/qa-browser-harness.mjs"]},
]
m = load()
haveF = {f["id"] for f in m["feedback"]}
todoF = [f for f in FEEDBACK if f["id"] not in haveF]
if todoF:
    add("feedback", todoF)

(ROOT / EV / "manifest-write-log.txt").write_text("\n".join(log) + "\n", encoding="utf-8")
print(f"{len(log)} script calls; failures: {sum(1 for l in log if not l.startswith('exit 0'))}")
