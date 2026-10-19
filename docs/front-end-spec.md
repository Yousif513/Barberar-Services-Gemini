# Existing booking and account repair scope

Approved by the user on 2026-10-19: repair these existing flows and retain their
current visual design, English/Arabic translations and RTL behavior. No new
pages, commercial terms, AI workforce or production deployment is included.

## Existing screens

- /shop/[id] — Salon booking
- /login — Account sign-in
- /become-provider — Salon application
- /customer/settings — Customer profile

## Salon booking

Availability must describe every service in the cart, including the server's
staff qualifications, effective durations, buffers and conflict rules. The same
server query supports a named professional and any qualified professional.
Changing the cart, date or specialist invalidates the selected time. A response
for an older selection cannot replace the current schedule or enable checkout.
Loading, empty and failed queries remain distinct. Guest authentication retains
the full selected cart and revalidates its time before booking.

## Account sign-in

Guests keep the safe internal destination through authentication and email
confirmation. Phone sign-in cannot silently create an account. Signup choices
are drafts until the customer explicitly accepts the published terms; drafts
contain neither credentials nor personal details and expire. Provider applicants
go directly to the existing public salon application.

## Salon application

The visible business categories map to the existing database enum. Submitting
the form never assigns an approved provider role; existing review controls apply.

## Customer profile

A successful save must return the affected profile. A row-policy refusal is a
failure. The phone verification indicator comes from the saved server record.

## Verification and boundaries

Use the existing local-only browser fixtures and isolated database tests.
Do not reset shared databases, contact hosted services, or change rates. Existing
persisted booking and confirmation commands remain the source of truth.
The broader site's navigation and operational release gaps remain outside this
bounded regression repair; this document does not claim whole-site completion.
