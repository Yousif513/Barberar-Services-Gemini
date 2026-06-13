# Launch Plan & Acquisition Strategy

This document maps out the operational sequence for testing, piloting, and scaling the marketplace in Riyadh.

---

## 1. Beta Testing & QA Strategy

### A. QA Validation Phase
Before onboarding pilot providers:
1. **Automated Concurrency Checks**: Simulate 500 concurrent checkout attempts on a single provider calendar slot to verify SQL exclusion triggers.
2. **Webhook Verification**: Test payment webhook listeners with mock payloads representing transaction failures, card declines, and split payouts.
3. **Responsive Design Verification**: Cross-browser tests (Safari, Chrome, iOS Safari, Android Chrome) for the Provider and Admin dashboards.

### B. Closed Beta Program (1 Month)
* **Supply Cohort**: 10 handpicked salons and 10 freelancers in Olaya.
* **Demand Cohort**: 200 family & friend invites.
* **Testing Targets**: 
  - Ensure payment gateways route ledger splits correctly.
  - Verify that WhatsApp OTP codes arrive within 10 seconds.
  - Test the booking calendar with actual local Riyadh prayer times.

---

## 2. Pilot Launch Strategy (Al-Malqa & Al-Olaya)
To avoid diluting marketing spend, the public launch is restricted to two adjacent, high-income districts: **Al-Malqa** (heavy residential demand) and **Al-Olaya** (high commercial salon density).

* **Duration**: 2 Months.
* **Launch Gate Criteria**: 20 active salon branches and 30 active freelancers fully verified on the platform.
* **Marketing Budget Allocation**: 80% geofenced Snapchat and TikTok ads targeting users within a 5km radius of partner salons.

---

## 3. Riyadh Launch Strategy (Cultural Localization)
* **Prayer buffers**: Automatically adjust calendar listings around daily prayer shifts.
* **Payment Methods**: Primary focus on Apple Pay and Mada debit cards (which represent over 80% of digital transactions in Saudi Arabia).
* **WhatsApp Communications**: Replace standard transactional email notifications with localized Arabic and English WhatsApp updates.

---

## 4. Acquisition & Recruitment Execution

### A. Provider Recruitment Strategy
* **Direct Outreach**: A dedicated offline sales agent visits salons in Riyadh, presenting the provider dashboard and offering free onboarding.
* **Visual Concierge Service**: We send a professional photographer to document the salon's space and work for free, uploading it directly to their listing.
* **Zero SaaS Fees**: Guarantee the CRM tool remains free for the first 3 months of the pilot.

### B. Customer Acquisition Strategy
* **Snapchat & TikTok Influencers**: Hire Riyadh-based micro-influencers to film video walkthroughs of their booking experience and the resulting service.
* **The "Riyadh First" Promo**: Offer a 20% discount on the customer's first booking (subsidized by the platform up to 30 SAR).
* **Double-Sided Referral Program**: Users share their code; if their friend books, both receive 20 SAR platform credits.
