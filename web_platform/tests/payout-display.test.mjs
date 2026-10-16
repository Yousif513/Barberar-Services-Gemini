import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canRevealRequest, revealOutcome, secondsLeft } from "../src/lib/payout-display.mjs";

// UXFIX (ux1-iban-reveal-and-payout-flows-not-exercisable-locally): the payout list and the audited IBAN reveal have no rows on
// the local stack, so their states are proven here and on the screen's source instead of with invented payout data.
const ledger = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "src", "app", "admin", "ledger", "page.tsx"), "utf8");

describe("payout request reveal rules", () => {
  it("offers a reveal only when the request names a provider and carries a masked bank account", () => {
    assert.equal(canRevealRequest({ provider_id: "p1", iban_masked: "SA03 **** 7519" }), true);
    assert.equal(canRevealRequest({ provider_id: "p1", iban_masked: "" }), false);
    assert.equal(canRevealRequest({ provider_id: "p1", iban_masked: null }), false);
    assert.equal(canRevealRequest({ iban_masked: "SA03 **** 7519" }), false);
    assert.equal(canRevealRequest(null), false);
  });

  it("names what a reveal answered: an approved account, only a pending one, or nothing on file", () => {
    assert.equal(revealOutcome({ active: { iban: "SA0380000000608010167519" }, pending: null }), "active");
    assert.equal(revealOutcome({ active: null, pending: { iban_masked: "SA03 ****", approved: false } }), "pending_only");
    assert.equal(revealOutcome({ active: null, pending: null }), "none");
    assert.equal(revealOutcome(null), "none");
  });

  it("counts the 60-second window down without going negative or past 60", () => {
    assert.equal(secondsLeft(61_000, 0), 60);
    assert.equal(secondsLeft(30_500, 0), 31);
    assert.equal(secondsLeft(0, 5_000), 0);
  });
});

describe("payout and reveal screen states", () => {
  it("has loading, error with retry, empty and populated states for payout requests", () => {
    assert.match(ledger, /requestsLoading \? \(/);
    assert.match(ledger, /requestsError \? \(/);
    assert.match(ledger, /onClick=\{\(\) => void loadPayoutRequests\(\)\}/);
    assert.match(ledger, /payoutRequests\.length === 0 \? \(/);
    assert.match(ledger, /\{t\.noPayoutRequests\}/);
  });

  it("says when a request has no bank account and when the provider has no account on file, instead of revealing nothing silently", () => {
    assert.match(ledger, /!canRevealRequest\(request\) \? <p[^>]*>\{t\.noBankOnRequest\}/);
    assert.match(ledger, /outcome === "none" \? <p role="status"[^>]*>\{t\.noAccountOnFile\}/);
    assert.match(ledger, /noAccountOnFile: "لا يوجد حساب صرف مسجل/);
  });

  it("offers reveal and payout decisions only to roles that hold them; the server still decides", () => {
    assert.match(ledger, /const canReveal = knownToHold\(session, \["iban\.reveal"\]\)/);
    assert.match(ledger, /const canDecidePayouts = knownToHold\(session, \["money\.payout"\]\)/);
    assert.match(ledger, /\{canReveal && <button/);
    assert.match(ledger, /canDecidePayouts && !isClosed/);
  });

  it("shows the reveal limit and the countdown in the page's numerals", () => {
    assert.match(ledger, /revealLimit\.replace\("\{n\}", count\(shown\.ceiling \?\? 0\)\)/);
    assert.match(ledger, /revealedExpires\.replace\("\{n\}", count\(seconds\)\)/);
  });
});
