# MVP Definition & Product Roadmap

To guarantee a successful, focused launch in Riyadh, we apply the **MoSCoW** prioritization framework to define our Minimum Viable Product (MVP) and map our long-term roadmap.

---

## 1. MVP Scope Definition (MoSCoW Matrix)

### A. Website & Mobile App (Customer Facing)
* **Must Have**:
  - User registration via mobile OTP (WhatsApp/SMS).
  - Geolocation-based search and filters (price, rating, service type).
  - In-store vs. Home Service toggles.
  - Multi-variant checkout (e.g. choice of haircut length, styling options).
  - Credit Card / Mada / Apple Pay gateway integration (Tap or Moyasar).
  - Booking confirmation & cancellations.
* **Should Have**:
  - Verification checkmarks for freelance licensing.
  - WhatsApp booking confirmations and reminders.
  - Real-time location tracking for home service providers.
* **Could Have**:
  - Multi-service cart (booking a haircut and manicure in a single check-out from different providers).
  - Loyalty point rewards system.
* **Won't Have (Future Phases)**:
  - AI-based style recommendations based on uploaded photos.

### B. Provider Dashboard (Salons & Freelancers)
* **Must Have**:
  - Business profile builder (hours, location, description, gallery).
  - Staff management: roster creation, assign services, and custom schedules.
  - Interactive calendar: add, edit, and cancel bookings manually.
  - Set custom booking policies: deposit requirements (20%-100%) and cancellation windows (e.g., 24h).
  - Basic sales reports (total bookings, revenue, top staff).
* **Should Have**:
  - Shift-swapping templates.
  - Automated staff commission splits and payout ledgers.
* **Could Have**:
  - Inventory management (shampoo, styling wax stock levels).
* **Won't Have (Future Phases)**:
  - Automated tax invoice integrations with ZATCA (Phase 2).

### C. Admin Portal
* **Must Have**:
  - Provider onboarding approval gate (CR and ID document review).
  - Dispute management (issue refunds, capture security deposits).
  - Global configuration: platform fee percentages, adding new service categories.
  - Basic platform performance reports (GMV, net commission, active users).
* **Should Have**:
  - Fraud detection flags (multiple cancellations, duplicate card details).
* **Could Have**:
  - Automated push notification campaign builder.
* **Won't Have (Future Phases)**:
  - Third-party advertising manager.

---

## 2. Product Roadmap & Expansion Phases

```
   Phase 1 (Months 1-6)             Phase 2 (Months 7-12)             Phase 3 (Months 13-18)            Phase 4 (Months 19+)
   --------------------             --------------------              ----------------------            --------------------
  [Beauty & Grooming]              [Beauty & Wellness]               [Home & Personal Services]       [Full Service Marketplace]
  • Launch Riyadh platform         • Expand to Spas & Gyms           • Launch Home Cleaning,           • Open API Platform for third-
  • Core Booking Engine            • Wellness Centers & Spas         • Maintenance, Events,             party service integrations
  • Mada, Apple Pay splits         • Tiered smart-pricing             and Photography                  • Micro-logistics scheduling
  • WhatsApp notifications         • Package bookings (e.g., gym)    • Real-time geographic routing    • AI-based matches
```

---

## 3. Release Plan

* **Milestone 1: Alpha (Month 3)**:
  - Internal sandbox testing. 
  - Complete DB schema validation and scheduling slot generation logic testing.
* **Milestone 2: Closed Beta (Month 4)**:
  - Invite-only release.
  - 10 Riyadh salons and 10 freelance nail/makeup artists.
  - 200 select customers to test transaction splits and booking stability.
* **Milestone 3: Pilot Launch (Month 5)**:
  - Public release restricted to **Al-Malqa** and **Al-Olaya** districts.
  - Active digital ads on Snapchat/TikTok.
* **Milestone 4: General Launch (Month 6)**:
  - Open platform-wide registration for all providers in Riyadh.
  - Full influencer push.
