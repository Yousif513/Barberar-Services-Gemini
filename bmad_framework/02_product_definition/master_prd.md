# Master Product Requirements Document (PRD)

## 1. Document Control
* **Title**: Beauty & Grooming Marketplace Platform - Master PRD
* **Status**: Approved / Ready for Design & Technical Mapping
* **Target Region**: Saudi Arabia (Launch in Riyadh)
* **Author**: Senior Product Manager & Technical Lead

---

## 2. Objective & Scope
The goal is to build a high-performance, double-sided **Beauty & Grooming Marketplace Platform** connecting Customers, Salons / Barber Shops, and Freelance Service Providers. The platform is designed from day one with a flexible database schema and access controls to seamlessly expand into wellness, fitness, and home maintenance services in subsequent phases.

---

## 3. User Classes & Roles

1. **Customers (B2C)**: Browse, search, select booking type (in-store or home), choose service variants, select provider/employee, select date and time, make online deposits/payments, track bookings, leave ratings, and earn loyalty points.
2. **Salons / Barber Shops (B2B - Shop)**: Create a business profile, set up multiple branches, configure staff roles and custom schedules, define service catalogs, assign services to staff, manage bookings, view financial ledgers, and set up cancellation/deposit rules.
3. **Freelance Service Providers (B2B - Freelancer)**: Set up personal portfolios, configure mobile services, set a geofenced travel radius, manage personal schedules, collect customer deposits, and receive split payouts.
4. **Platform Admin**: Onboard and verify providers, manage commissions and payout rules, manage dispute resolution, review platform-wide analytics, and customize service categories.

---

## 4. Key Functional Features

### A. Customer Search & Discovery Engine
* **Geolocation Filtering**: Real-time listing of nearby salons/freelancers with distance estimates.
* **Smart Filtering**: Filter by location, price, service category (e.g., haircut, coloring, bridal makeup), customer rating, availability slot, and service type (in-store vs. home service).
* **Portfolio & Reviews**: High-quality visual grid of past work and verified client reviews.

### B. Booking & Availability Engine
* **Double-Sided Booking**: Allow booking by business (with automatic staff allocation) or booking a specific employee/stylist.
* **Prayer-Time Buffers**: Automatically block 20-minute windows in calendars for local Riyadh prayer times based on daily calculations.
* **Home Service travel-buffer**: Add dynamic travel buffers based on routing distances between the freelancer's current location and the customer's address.

### C. Financials & Payment Splits
* **Escrow Deposits**: Secure upfront collection of booking deposits (e.g., 20% or 100%) held until appointment verification.
* **Split Routing (Tap / Moyasar)**: Split payments at the transaction layer:
  - Marketplace fee goes to Platform account.
  - Shop lease fee goes to Salon.
  - Service fee goes to the Service Provider (Employee or Freelancer).
* **Payment Methods**: Mandatory support for Apple Pay, Mada, Visa/Mastercard, and STC Pay.

### D. Communication Hub
* **WhatsApp Business Integration**: Send OTP auth codes, real-time booking confirmations, cancellation alerts, and 24-hour reminder messages.
* **Two-way Client Messaging**: In-app chat between client and provider for consultations or location coordinates.

---

## 5. Non-Functional Requirements (NFRs)

* **Scalability**: High database write-concurrency during peak hours (e.g., Thursday afternoons). Database must support category extensions (e.g., Spa, Wellness, Fitness, Cleaning, Events) without schema modifications.
* **Security & RLS**: Strict Row-Level Security (RLS) in PostgreSQL/Supabase to prevent data leakage between competing salons.
* **Localization**: Fully bilingual English/Arabic UI. Dynamic date formatting matching Gregorian and Hijri calendar preferences.
* **Performance**: API latency under 200ms; homepage load time under 1.5 seconds under 3G/4G networks in Riyadh.

---

## 6. Regulatory & Compliance (Saudi Arabia)
* **Freelance Licenses**: Integration check with the Ministry of Human Resources (MHRSD) or Balady self-employed license register.
* **VAT Compliance**: Platform invoices must generate compliant ZATCA (Zakat, Tax and Customs Authority) e-invoicing QR codes for businesses.
* **Data Residency**: Customer personal and transaction data must reside within localized cloud infrastructure (e.g., Google Cloud Riyadh Region or local server providers in KSA).
