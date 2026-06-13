# Development Backlog & Sprint Plan

This document organizes development execution into Epics, Features, and structured 2-week Sprints to build the MVP.

---

## 1. High-Level Epics

* **EP1: User Foundation & Auth**: OTP login (WhatsApp), Profiles (Customer, Salon, Freelancer), RLS Policies.
* **EP2: Search & Discovery Engine**: GPS Geolocation searching, category filters, portfolio gallery, ratings/reviews.
* **EP3: Provider Portal**: Salon branch management, staff profiles & schedules, service menus, pricing variants.
* **EP4: Booking Engine**: Slot generation matrix, Riyadh prayer-time blocking, home service travel calculations.
* **EP5: Payment Splits & Wallet**: Tap/Moyasar integration, Mada/Apple Pay support, platform fees, payouts.
* **EP6: Messaging & Alerts**: In-app chat, automated WhatsApp confirmations/reminders.

---

## 2. Sprint Roadmap (12-Week MVP Build)

Each sprint runs for 2 weeks.

### Sprint 1: Foundation, DB, & Auth
* **Goal**: Establish DB schema, setup Supabase, and implement WhatsApp OTP auth.
* **Backlog Items**:
  - Set up PostgreSQL schema, tables, triggers, and migrations.
  - Implement profiles registration & roles database triggers.
  - Deploy OTP authentication edge function.

### Sprint 2: Provider Dashboard Core
* **Goal**: Enable salons and freelancers to build profiles, menus, and staff rosters.
* **Backlog Items**:
  - Build UI for profile setup & CR document uploads.
  - Implement service catalog manager (add categories, service items, variants).
  - Create staff manager & basic calendar view.

### Sprint 3: Booking & Availability Engine
* **Goal**: Implement calendar slot generation, prayer-time exclusions, and travel calculations.
* **Backlog Items**:
  - Write SQL logic for slot calculations.
  - Integrate prayer time calculations for Riyadh.
  - Implement Google Maps dynamic travel time calculations.

### Sprint 4: Search & Discovery UI
* **Goal**: Build the consumer-facing mobile app search, details, and checkout flow.
* **Backlog Items**:
  - Build geofenced filter controls for home vs in-store.
  - Build salon profile layout with booking selection flow.
  - Build checkout summary card.

### Sprint 5: Payment Gateway & Webhooks
* **Goal**: Implement payment processing, escrow hold, and automated split payout ledgering.
* **Backlog Items**:
  - Integrate Tap Payments / Moyasar SDK.
  - Build webhook listener for payments.
  - Write transaction split routing ledger.

### Sprint 6: WhatsApp Notifications & QA
* **Goal**: Integrate Unifonic/Twilio notifications, perform end-to-end booking tests, and deploy.
* **Backlog Items**:
  - Connect WhatsApp templates for confirmations and reminders.
  - Perform stress tests on concurrency slot reservation locks.
  - Final staging checks, RLS audits, and deployment to production.

---

## 3. Priority Matrix

```
       High Impact, Low Effort (Do First)      │       High Impact, High Effort (Build Next)
  ┌────────────────────────────────────────────┼────────────────────────────────────────────┐
  │ • Mobile Phone WhatsApp OTP login          │ • Dynamic scheduling engine with prayer    │
  │ • Simple Geolocation listing & map search  │   time and travel buffers                  │
  │ • Cash/Card payment option at venue        │ • Automatic payout split ledgers           │
  │ • Verification check for freelanceCRs      │ • Multi-branch staff roster synchronization│
  └────────────────────────────────────────────┴────────────────────────────────────────────┘
  ─────────────────────────────────────────────┼─────────────────────────────────────────────
       Low Impact, Low Effort (Do Later)       │       Low Impact, High Effort (Avoid/Phase 2)
  ┌────────────────────────────────────────────┼────────────────────────────────────────────┐
  │ • Dynamic dark/light mode toggle in UI     │ • In-app messaging translations            │
  │ • Saved address directory manager          │ • AI style search recommendation system    │
  │ • Manual support chat bot                  │ • Wholesale salon product supplier store   │
  └────────────────────────────────────────────┴────────────────────────────────────────────┘
```
