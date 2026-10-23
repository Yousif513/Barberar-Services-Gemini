# HQ-NEXT-04 — synthetic Access operator guide

This tooling is authorized for newly owned, positively marked synthetic fixtures only. It has not been applied to the active preview, existing real HQ database, founder seat or launcher. The legacy default startup/session behavior is unchanged. The full management Headquarters remains under development.

## Operations and custody

`npm run hq:access -- --help` documents `init`, `adopt`, `resume` and `permit`. The exact schema and wire contract are in [volabi-access-contract.md](volabi-access-contract.md) and [volabi-access-api.json](volabi-access-api.json). Run commands from this isolated checkout. Use only a fixture root whose independent marker, owner-only native permissions and workspace proofs satisfy the contract. The CLI refuses project/live roots. Never point these commands at real data.

Fresh initialization and offline legacy fixture adoption are distinct. Fresh initialization requires an already marked empty root and allocates one synthetic seat without a general session. Adoption requires the original valid synthetic session through masked terminal input; a missing cookie does not authorize guessing a legacy seat. The CLI asks for the exact root confirmation and synthetic-only acknowledgement. It deliberately displays a restricted bootstrap or permit once. Do not copy terminal output into Git, reports or chat. The bootstrap can only enroll the first recovery factor. An already adopted ordinary session additionally needs the local operator permit to enroll.

If initialization/adoption stops before completion, use only the reported nonsecret operation UUID with `resume` on the same owned root. This checks durable intent and supported partial state; it does not find a different database or take another seat. Legacy adoption resume still needs its original valid session proof. Normal startup never resumes or repairs anything.

To run an already prepared fixture, use `npm run hq:access:fixture -- --root <owned-marked-fixture-root> --port 3136`. The launcher accepts only the development port range3130–3199, opens an existing positively guarded fixture and uses the separate `.next-access-fixture` output directory. It does not replace `start-volabi-local.mjs`, initialize storage or enroll a seat. Stop its foreground process normally; it tracks only its own spawned child tree. Confirm its listener is gone before removing only that fixture's known temporary files.

Use a separate ephemeral browser profile/context for fixture testing. Ports do not isolate cookies on the same host. Do not navigate a normal browser profile holding real HQ cookies to the fixture server, and do not copy any existing real cookie into a test. Automated browser tests create their own isolated context and block external requests.

## Access page and three dialogs

Open `/hq/access` in the fixture browser. The page bypasses ordinary workspace bootstrap. First enrollment uses restricted bootstrap proof, or the exact ordinary session plus local permit. The recovery factor is shown once; save it separately and re-enter the saved copy to confirm custody. Cancel or expiry leaves the previous factor/session state intact. Credentials are not automatically copied, downloaded or saved in browser storage.

Recovery proves the exact previously enrolled instance/workspace and rotates the factor. Rotation requires the current session, CSRF and current factor. The old factor stays valid until confirmed commit; the replacement becomes the reconnect method afterward. A lost final response is an unknown result, not success: check the scoped receipt, then reconnect using the saved replacement. Replaying a committed operation returns its redacted receipt without recreating a cookie.

The third dialog offers current-session sign-out or all-session revocation. Revocation requires current recovery proof and explicit acknowledgement. These operations have in-memory client operation proofs for uncertain-response receipt checks. Revocation does not delete business history or change the original actor/workspace. Return navigation accepts only existing approved HQ routes.

If storage is missing, altered, unsupported, inert or insecure, stop. A retry only checks status. It never creates a database/workspace, rebinds a guard, repairs permissions, follows a replacement path or claims a successful recovery. A safe diagnostic ID says whether a bounded separate diagnostic was actually recorded. If both the enrolled factor and session are lost there is no automatic override in this slice.

## Backup compatibility and limits

HQ-NEXT-03 accepts the single exact supported access-control table in a synthetic source, then rebuilds a fresh v1 portable database excluding the entire control table, sessions and native authentication pages. Original business records, versions, receipts and historical audit remain. Restore stays inert and non-enrollable. Unknown schema refuses. Older v1 packages remain inspectable; dependencies not captured in older inventories remain explicit gaps, not a full-fidelity claim.

A local recovery factor proves prior enrollment, not legal CEO identity, MFA or business authority. The guard detects accidents/replacement under local OS custody; an administrator who coherently changes all files and the final operating-system path race are outside that assurance. No production identity, cloud backup, legal retention or forensic erasure claim is made.

No real seat enrollment/reclamation, live migration/replacement, real backup/restore, production merge/deployment, employee activation, business permission, external business write or financial transaction is authorized here. Azure/audio remains deferred. Saudi male/Lebanese female voices and the original single SAR10 all-in,100,000 aggregate characters,maximum3rounds allowance remain unchanged. New paid services/native reviews require separate approval.
