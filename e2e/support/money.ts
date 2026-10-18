// Money fixtures: provider bank accounts and payout requests arranged directly in the local database (the provider-side
// request flow is not under test here), and test IBANs that pass the ISO 13616 mod-97 check.

import { randomInt } from "node:crypto";
import { lit, written } from "./db";

/** A Saudi IBAN (SA, 2 check digits, a 2-digit bank code and an 18-digit account: 24 characters) with valid check digits; the account part is random per call. */
export function testIban(): string {
  const bban = `80${Array.from({ length: 18 }, () => randomInt(10)).join("")}`;
  // Letters to numbers: S = 28, A = 10; the country code and "00" move to the end.
  const remainder = BigInt(`${bban}281000`) % 97n;
  return `SA${String(98n - remainder).padStart(2, "0")}${bban}`;
}

export type PayoutFixture = { destinationId: string; requestId: string; iban: string; ibanMasked: string; bankName: string };

/** An approved (active) payout account for the provider and one open payout request against it. */
export function payoutRequest(providerId: string, ownerId: string, amount = 250): PayoutFixture {
  const iban = testIban();
  const bankName = "Al Rajhi Bank";
  const destination = written<{ id: string }>(`
    insert into public.provider_payout_destinations (provider_id, bank_name, account_holder_name, iban, status, requested_by, approved_at)
    values (${lit(providerId)}, ${lit(bankName)}, 'E2E Account Holder', ${lit(iban)}, 'active', ${lit(ownerId)}, now()) returning json_build_object('id', id)`);
  const request = written<{ id: string; iban_masked: string }>(`
    insert into public.payout_requests (provider_id, requested_by, amount, bank_name, iban, destination_id)
    values (${lit(providerId)}, ${lit(ownerId)}, ${amount}, ${lit(bankName)}, ${lit(iban)}, ${lit(destination.id)}) returning json_build_object('id', id, 'iban_masked', iban_masked)`);
  return { destinationId: destination.id, requestId: request.id, iban, ibanMasked: request.iban_masked, bankName };
}
