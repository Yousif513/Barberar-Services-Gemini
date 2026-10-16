// Pure display rules for payout requests and the audited IBAN reveal (no React, no Supabase), tested in
// tests/payout-display.test.mjs. The server decides who may reveal or pay; these only decide what the screen can offer and say.

// A request can be revealed only when it names a provider and a bank account is recorded on it (shown masked).
export function canRevealRequest(request) {
  return Boolean(request && request.provider_id && typeof request.iban_masked === "string" && request.iban_masked.trim() !== "");
}

// What a reveal answered: "none" when the provider has no payout account on file, "pending_only" when the only account is
// waiting for approval (masked, never payable), "active" when an approved account was revealed.
export function revealOutcome(shown) {
  if (!shown) return "none";
  if (shown.active) return "active";
  if (shown.pending) return "pending_only";
  return "none";
}

// The seconds left before a revealed IBAN is hidden (never negative, never more than the 60-second window).
export function secondsLeft(expiresAt, now) {
  return Math.max(0, Math.min(60, Math.ceil((expiresAt - now) / 1000)));
}
