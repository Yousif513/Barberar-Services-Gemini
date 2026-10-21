# Checkout reconciliation implementation

Mode: repair. Profile: regulated. Agent: impl-checkout-reconciliation.

Updated payment-checkout only: read branch_id from the owner-scoped booking, resolve branches.provider_id and verify the current seller through provider_is_selling. Refuse failed booking/branch reads, non-finite amounts and unavailable/malformed routing configuration before gateway dispatch. Enabled marketplace splits remain refused without destinations. No price, commission, VAT, role, permission or provider contract was changed.

The new payment-checkout.test.mjs executes the actual handler with isolated auth/database/config boundaries and intercepted fetch. Thirteen cases pass and the root test:edge script includes the suite. Three additional checkout_schema_contract cases execute that handler's actual queries against migrated PGlite, including an actual created booking, owner filtering and the real seller-eligibility function. The first draft incorrectly selected bookings.provider_id; root review found the absent column, corrected the branch relationship and added the schema-backed tripwire before release. The initial mock shape and review were insufficient. Tests do not prove live JWT/RLS/PostgREST/Deno/provider behavior or resolve durable checkout attempts. Updated independent review is security-checkout-reconciliation.md.

No hosted write, charge, refund, deployment or company-agent activation was performed. Next action: implement durable checkout attempt and explicit unknown-outcome reconciliation in a separate bounded payment slice.
