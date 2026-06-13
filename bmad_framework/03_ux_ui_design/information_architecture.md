# Information Architecture & Navigation Structure

This document details the navigation hierarchies, user paths, and the complete screen inventory for all portals.

---

## 1. Customer Navigation Map

```
                     [Customer Landing Page / App Root]
                                     |
    +------------------+-------------+-------------+------------------+
    |                  |                           |                  |
[Search & Discovery] [My Bookings]            [Inbox / Chat]    [Profile / Wallet]
    |                  |                           |                  |
    |-- Salon Profile  |-- Active Bookings         |-- Provider Chat  |-- Wallet Balance
    |-- Booking Flow   |-- Booking History         |-- Support Bots   |-- Saved Cards
    |-- Checkout Pay   |-- Re-book / Review Page                      |-- Settings (Language)
```

---

## 2. Navigation Structure by Portal

### A. Customer Mobile App
* **Navigation Type**: Sticky Bottom Tab Bar (5 tabs).
* **Tabs**:
  1. **Explore (Home)**: Search bar, category filters, featured salons, promo banners.
  2. **Bookings**: Toggle between `Upcoming` and `Past` appointments.
  3. **Inbox**: Chat listing with service providers and customer support.
  4. **Wallet**: Quick-top, saved payment methods, transaction receipts.
  5. **Profile**: Personal info, address book, language toggle (AR/EN), freelance license upload.

### B. Provider Dashboard (Salons & Freelancers)
* **Navigation Type**: Left Sidebar Navigation (Desktop) / Collapsible Drawer (Tablet/Mobile).
* **Menu Items**:
  1. **Dashboard**: Daily overview, upcoming slots, quick stats.
  2. **Calendar**: Schedule view (Day/Week/Month), manual slot blocking, drag-and-drop rescheduling.
  3. **Bookings List**: Manage appointments (accept, reject, edit).
  4. **Services Menu**: Define service categories, variants, pricing, and duration.
  5. **Team (Salons only)**: Add staff members, manage roles, shift schedules, and commission structures.
  6. **Wallet & Payouts**: Real-time balance, automatic payout settings, cash invoice reconciliations.
  7. **Analytics**: Revenue reports, bookings frequency, staff performance rankings.

### C. Admin Dashboard
* **Navigation Type**: Flat Left Sidebar.
* **Menu Items**:
  1. **Overview**: Live platform health metrics (Active bookings, GMV, new signups).
  2. **Verification Center**: Review pending salon registrations and freelancer licenses.
  3. **Users Directory**: Manage customer, salon, and freelancer profiles.
  4. **Disputes & Refunds**: Action refund requests, manage deposit transfers.
  5. **Categories Manager**: Dynamic list editing of categories, subcategories, and search tags.
  6. **Financial Panel**: Commission percentages, payout schedules, system financial reports.

---

## 3. Screen Inventory

### B2C Customer Portal
1. **SCR-C01: Splash & Onboarding**: Lang selection (AR/EN), market intro.
2. **SCR-C02: OTP Auth**: Phone input & WhatsApp verification code screen.
3. **SCR-C03: Search & Discovery**: Map view & listing view with advanced filter controls.
4. **SCR-C04: Provider Profile**: Details, catalog, reviews grid, stylist photos.
5. **SCR-C05: Booking & Date Selection**: Double-sided selection, calendar date/time picker.
6. **SCR-C06: Checkout & Pay**: Summary, payment options (Mada, Apple Pay, Wallet, Pay at Venue).
7. **SCR-C07: Booking Detail / Status**: Live booking status, map tracking for home service.
8. **SCR-C08: Review & Rating**: Post-service feedback slider and image upload.

### B2B Provider Portal
1. **SCR-P01: Registration**: Multi-step onboarding (Business CR/Wathiqa upload, base location setup).
2. **SCR-P02: Interactive Calendar**: Multi-roster visual scheduling calendar.
3. **SCR-P03: Staff Profile Manager**: Custom pricing & duration adjustments per staff.
4. **SCR-P04: Wallet Ledgers**: Payout transaction statements & invoice list.
