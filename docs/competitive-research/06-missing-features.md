# 06 — Missing Features and "Things PRIMORA Has Not Considered"

> **Research date:** 2026-10-03. This report lists what is absent from the codebase (report 01) and, separately, the mechanics the product has not designed for at all.
> Each item says **what it is**, **why it matters for a Saudi marketplace**, **how competitors handle it** (with the source report), and **the recommended approach**. Nothing here has been implemented.

---

## Part 1 — Missing features by audience

### 1.1 Customer side

| Feature | Exists? | Why it matters | Competitor handling | Recommendation | Priority |
|---|---|---|---|---|---|
| Phone + OTP sign-up | ✗ (email/password; fake phone generated) | Saudi consumer apps are phone-first; WhatsApp needs a real number | Samha, Laha, BeautyBook phone-first | Phone OTP via WhatsApp/SMS authentication template (~SAR 0.04) | P0 |
| Map / near-me discovery | ✗ web; mobile pins over mock data | Customers choose by distance and district | Glamiva map; Fresha map | Distance sort from branch coordinates first, map second | P1 |
| "First available professional" | ✗ (translation key only) | Removes a decision, increases conversion | Fresha, Booksy | Aggregate staff slots | P1 |
| Reschedule | ✗ (label only) | Customers move appointments instead of cancelling | SPOT one-tap | Atomic reschedule RPC | P1 |
| Reminders | ✗ | No-shows | All majors | WhatsApp utility template | P0 |
| Favourites | ✗ (UI only, no table) | Re-booking shortcut | Fresha, Booksy | `customer_favorites` table | P2 |
| Waitlist | ✗ | Demand capture on full days | Booksy, Fresha, SQUIRE | Time-frame waitlist + notify | P2 |
| Gift an appointment | ✗ | Eid, weddings, Mother's Day | BeautyBook, Booksy, Fresha | Gift credit redeemable at a provider | P2 |
| Loyalty / referral | ✗ | Repeat and organic growth | StyleSeat referral 15 %, Vagaro loyalty | Referral credit first, loyalty later | P2 |
| Notifications inbox | ✗ (table never created) | Status changes are invisible | All | Create table; write from server events | P1 |
| Receipts / invoices | △ invoice number only | Tax-compliant receipt for VAT | Glamera Pay invoices | Compliant invoice per booking (report 09) | P1 |
| Account deletion / data export | ✗ | PDPL rights | — | Self-serve request + 30-day workflow | P0 |
| Accessibility needs (wheelchair, female-only staff preference) | ✗ | Inclusive and culturally relevant filters | Partial (gender-only apps) | Branch amenity tags | P3 |

### 1.2 Business owner side

| Feature | Exists? | Why it matters | Competitor handling | Recommendation | Priority |
|---|---|---|---|---|---|
| Self-serve signup + verification | ✗ | **Supply cannot join** | Fresha/Booksy trials; SPOT assisted | Application → CR check → approval | P0 |
| Booking link / QR / Instagram / WhatsApp button | ✗ | Brings existing clients; zero CAC | Fresha, Booksy, SPOT, SQUIRE | Public URL + QR + share | P0 |
| Cancellation / no-show policy settings | ✗ | Provider protection | SPOT (window + fee ≤ 100 %) | Policy per provider, enforced server-side | P0 |
| Client import | ✗ | Switching cost from Glamera/Fresha/paper | SQUIRE "client transfer"; Zenoti 48 h migration | CSV import with consent flag | P1 |
| Time off / closures / holidays | ✗ | Eid, Ramadan, staff leave | Booksy time off | Leave and closure table read by slot engine | P1 |
| Buffers / processing time | ✗ | Hair colour, cleaning time | Booksy padding/processing | Per-service before/after buffers | P1 |
| Walk-in / quick sale | ✗ | Most barbershop revenue is walk-in | SPOT walk-in; Glamera POS | Light walk-in entry (no hardware) | P2 |
| Real reports | ✗ (mock charts) | Shows PRIMORA's value | Booksy 16 reports; SPOT chair occupancy | Revenue, utilization, no-show, repeat rate, source | P2 |
| Staff commission & payroll export | ✗ | Saudi salons pay staff by commission | Glamera commission tracking; SQUIRE | Commission rules + export | P2 |
| Multi-branch management | △ branches table, no branch switching | Chains | SPOT "three branches, one dashboard" | Branch selector + per-branch hours | P2 |
| Subscription billing | ✗ (simulated) | SaaS revenue | All SaaS competitors | Real subscription via PSP, only when plans are real | P1 |
| ZATCA Phase 2 invoices | ✗ | Wave 25 deadline 2027-02-01 | Glamera | Certified partner integration | P1 |
| Promotions that work | ✗ (`provider_promos` never created) | Fill quiet hours | Glamiva time-limited offers with live uptake | Off-peak discounts redeemed at booking | P2 |
| Customer notes (CRM) | ✗ (`provider_customer_notes` never created) | Repeat-service quality | Booksy client notes + photos | Notes table with RLS scoped to provider | P1 |

### 1.3 Employee / professional side

| Feature | Exists? | Why it matters | Competitor handling | Recommendation | Priority |
|---|---|---|---|---|---|
| Own schedule & bookings | ✗ (pages owner-scoped) | Staff run the day | Glamera One app; Fresha Team | Employee dashboard | P1 |
| Status updates (start, complete, no-show) | ✗ (trigger allows owner only) | Real-time operations | Fresha | Allow assigned employee to complete / no-show | P1 |
| Earnings & tips | ✗ | Professional motivation | Fresha, SPOT tips 100 % | Earnings view + tips | P2 |
| Public profile & portfolio | ✗ | Professionals carry followers | Booksy portfolio, StyleSeat, Glamiva | Pro page with photos and ratings | P1 |
| Time-off requests | ✗ | Scheduling | Fresha Team plan | Request → owner approval | P2 |
| Moving between salons with own clients | ✗ | Barbers in KSA move often; their clients follow them | StyleSeat (independent pros) | Professional identity independent of employer (see 1.4) | P3 |

### 1.4 Admin / platform side

| Feature | Exists? | Recommendation | Priority |
|---|---|---|---|
| Provider application review queue | ✗ | Queue with documents, CR result, decision, reason | P0 |
| Audit log of admin actions | ✗ (3 of ~30 mutations) | Append-only, same-transaction | P0 |
| Refund / dispute workflow | ✗ (broken) | Case → evidence → decision → PSP refund | P0 |
| Reconciliation (PSP vs ledger) | ✗ | Daily match with exceptions queue | P1 |
| Review moderation | ✗ | Report → hide → appeal | P1 |
| Customer / provider suspension | ✗ | Rule-based + manual with reason | P1 |
| Payout exceptions | △ (`process-payout` unused) | Exceptions only; normal payouts via PSP cycle | P1 |
| Content management for categories & banners | △ | Admin-editable discovery content | P2 |

---

## Part 2 — Things PRIMORA has not considered (Report 9)

These are mechanics that are **absent from the design**, not just unimplemented features. Each is a decision the owner needs to make.

### 2.1 Marketplace mechanics

| Mechanic | Current state | Why it matters | How competitors handle it | Recommended approach |
|---|---|---|---|---|
| **Customer ownership** | Undefined; commission on everyone | Determines whether providers trust the platform | Fresha/StyleSeat/Treatwell: provider owns returning clients; SQUIRE: "your clients won't be sold or shown to other businesses" | Hybrid: provider owns clients they bring; PRIMORA owns marketplace discovery and is paid once for it |
| **Source attribution** | No `source` on bookings | Without it, any fair pricing is impossible | StyleSeat refunds the fee if the client came by word of mouth | Tag every booking: marketplace / link / QR / WhatsApp / walk-in / imported |
| **Commission leakage** | Ignored | 10–15 % on regulars is a strong incentive to move bookings to WhatsApp | First-visit-only fees remove the incentive | Fee only where PRIMORA created the demand |
| **Ranking & fairness** | Rating-sorted mock lists | Ranking is the marketplace's main lever and liability | Booksy Boost (paid), Fresha (algorithmic) | Transparent ranking factors: distance, availability, rating with minimum count, response; paid placement clearly labelled |
| **Liquidity per micro-market** | Not tracked | A marketplace is many local markets | Treatwell, Fresha grow city by city | Launch district by district; measure fill rate per district |
| **Supply quality floor** | None | One bad experience damages the brand | Samha/Laha "curated salons" | Minimum photo, pricing, response-time and rating standards |
| **Cold-start ratings** | New provider shows nothing | New providers lose to established ones | Booksy/StyleSeat import reviews | "New on PRIMORA" badge + launch boost for the first 30 days |
| **Price transparency** | Prices fixed; "final amount may be adjusted" not handled | Hair length, extras | SPOT: final amount may be adjusted at visit | "From" pricing + variants + final adjustment with customer acknowledgement |
| **Disintermediation via chat** | Chat can share phone numbers | Leakage | Most marketplaces mask contact details until booking | Mask contacts before first booking; fair pricing reduces the motive |

### 2.2 Booking mechanics

| Mechanic | Current state | Recommended approach |
|---|---|---|
| Payment-hold timeout | Unpaid bookings never expire | Expire `pending_payment` (e.g., 15 min — to validate) |
| Overnight shifts | Produce zero slots | Shift model with end-time on the next day |
| Ramadan hours | Not modelled | Seasonal schedule templates (night hours to ~02:00–03:00) |
| Eid peaks | Not modelled | Surge capacity, pre-booking windows, deposit 100 % option |
| Prayer windows on customer slots | Provider calendar only | Show "paused for prayer" on customer side |
| Same-day / last-minute | No lead-time rule | Minimum notice per provider (Booksy booking rules) |
| Late arrival | Not modelled | Grace period then shortened service or no-show |
| Service duration variance | Fixed duration | Variants (short/long hair), processing time |
| Home-service travel | Distance calc with mock fallback | Travel radius + fee; time blocks include travel |
| Timezone | `+03` hardcoded in 6 migrations | Per-branch IANA timezone before GCC expansion |

### 2.3 Financial mechanics

| Mechanic | Current state | Recommended approach |
|---|---|---|
| Who is merchant of record | Unclear; copy says PRIMORA "escrow" | Provider is merchant of record; PRIMORA invoices its fee — **requires legal & tax confirmation** |
| Fund custody | PRIMORA described as holding funds | PSP split-settlement (Tap Marketplace) so PRIMORA never holds customer funds |
| VAT on commission | Not modelled | PRIMORA's fee to provider is itself a taxable supply — **confirm with tax advisor** |
| VAT registration of providers | Not captured | Capture VAT number; drives invoice type |
| Refund funding | Undefined | Rule matrix: who pays for provider-cancelled vs customer-cancelled vs dispute |
| Chargebacks | Undefined | Liability shift to sub-merchant (Tap supports on request) |
| Deposits vs full prepayment | Deposit only (default 20 %) | Provider choice: none / deposit / full; full for Eid and home service |
| Payment-processing cost pass-through | Not disclosed | Publish processing rate separately from commission |
| Discount funding | Coupons never redeemed | Record who funds each discount (PRIMORA vs provider) |
| Reconciliation | None | Daily PSP ↔ ledger match; exceptions queue |

### 2.4 Trust & safety mechanics

| Mechanic | Current state | Recommended approach |
|---|---|---|
| Provider verification | Licence URL + IBAN only | CR via Wathq (SAR 2–12/call), municipality licence document review, IBAN-name match via PSP KYC |
| Home-service safety | Address visible early | Address revealed after acceptance (Salon Station), verified specialists, women-for-women matching option |
| Customer abuse | None | No-show strike rules; provider block list (SPOT, Booksy) |
| Review abuse | Verified ✓; no moderation | Report → review → hide with reason; provider response |
| Photos of people | No rules | Consent for before/after photos; minors never shown |
| Health-sensitive services (skin, laser, henna allergy) | None | Intake forms + patch test flag; health data needs explicit consent under PDPL |
| Unbacked public claims | ZATCA, SMS, instant payout, SAMA, hygiene audits | Remove or make true before launch (report 01 claim register) |
| Fraud | No velocity limits | Limits on accounts, bookings, cards per device/phone |

---

## Part 3 — Missing features that look important but should wait

See report 12 "Deliberately not build yet": full POS hardware, inventory, payroll, white-label native apps, memberships, AI voice receptionist, own payment license, multi-country. They are real competitor features, but they do not move PRIMORA's first 12-month outcomes.
