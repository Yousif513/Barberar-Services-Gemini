# FIX-PUB report (branch wp/fixpub)

Package scope: public pages and the booking page (`shop`, `login`, `discover`, `services`, `become-provider`, `privacy`, `terms`, `about`,
`security`, landing). No migrations were written. R25/R26 (global locale provider, double RTL mirroring) are skipped by instruction; the
integrator does them after all merges.

## Status per defect

| Defect | Status | Commit | Test / proof |
|---|---|---|---|
| D-17 login i18n + dir | fixed | group 1 | `tsc`, eslint, schema check (see Verification) |
| D-11 / D-23 login consent via `record_consents` | fixed (login) | group 1 | UI-vs-schema check |

(The table is appended after every commit group.)

## Group 1: login (D-17, D-11 login half, D-23 login half)

- `web_platform/src/app/login/page.tsx`: full EN/AR translation table, `dir`/`lang` on the root element, language switch button, logical
  utilities (`ps-`/`pe-`/`end-`), `dir="ltr"` on phone/email/password/code inputs, labelled password field, named show/hide button,
  `aria-pressed` on the toggles, focus-visible outlines.
- Consent: the terms/privacy checkbox now exists in BOTH the phone and the email sign-up forms (it was missing in the email form). The checkbox
  shows the version of the published `customer_terms` agreement (read from `legal_agreements`, which is publicly readable when published). Sign-up is
  blocked with an explicit message while no `customer_terms` is published or when the lookup fails. Consent is written with
  `rpc("record_consents", { p_purposes, p_status: "granted", p_document_version: <published version>, p_method: "web_auth_form" })`; the
  literal `v1.0` is gone from the client. A failed write is shown in an alert with a "retry saving consent" button and the person is NOT routed on.
- New shared pieces: `web_platform/src/lib/published-agreement.ts` (published agreement lookup, reused by the shop page and become-provider) and
  `web_platform/src/lib/use-page-locale.ts` (`primora_lang` via `useSyncExternalStore`, keeps `<html lang dir>`; no timer, no setState-in-effect).
- Limitation, not fixed here: when email sign-up needs confirmation (no session yet) there is no `auth.uid()`, so no consent can be written; the
  message tells the person that the choices are saved only after signing in and accepting again. A post-confirmation consent gate belongs to the
  customer portal package.

## Needs from other packages

- `record_consent` (patched in `20261007010400`) still falls back to the literal `'v1.0'` when no `customer_terms` row is published and the caller
  passes no version. The screens now refuse to record when nothing is published, but the database should raise instead of defaulting.
