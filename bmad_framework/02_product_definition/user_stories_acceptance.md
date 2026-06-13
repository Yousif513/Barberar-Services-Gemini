# User Stories & Acceptance Criteria

This document details key User Stories categorized by role, complete with Gherkin-style (`Given-When-Then`) Acceptance Criteria.

---

## 1. Customer User Stories

### US1.1: Double-Sided Online Booking
* **As a** Customer,
* **I want to** select either a specific stylist/barber or simply book a service,
* **So that** I have flexibility depending on whether I care about the specific professional or just want the earliest slot.
* **Acceptance Criteria**:
  * **Given** I am on the booking screen of "Elite Cut & Groom",
  * **When** I choose the "Men's Haircut" service,
  * **Then** the system must show me a list of available service providers (staff) who perform this service, alongside an "Any Provider" option.
  * **When** I choose "Any Provider",
  * **Then** the calendar must display the union of all available time slots across all qualified staff.

### US1.2: Booking In-Store vs. Home Service
* **As a** Customer,
* **I want to** toggle between in-salon and home service booking,
* **So that** I can receive grooming in my preferred location.
* **Acceptance Criteria**:
  * **Given** I have selected a service that is marked as eligible for home service,
  * **When** I select "Home Service",
  * **Then** the system must prompt me to input/confirm my Riyadh address and verify if it falls within the provider's active geofenced service radius.
  * **Given** the address is valid, the booking engine must automatically add a dynamic travel buffer to the provider’s availability schedule.

---

## 2. Salon / Barber Shop User Stories

### US2.1: Multi-Branch Staff Management
* **As a** Salon Owner,
* **I want to** add multiple branches and assign employee shifts to specific branches,
* **So that** I can manage my entire franchise operations from a single dashboard.
* **Acceptance Criteria**:
  * **Given** I am logged into the Salon Admin Dashboard,
  * **When** I navigate to the "Branches" tab and add a new branch with a physical address,
  * **Then** I must be able to assign existing or new staff members to this branch and configure their weekly shift schedules.
  * **Given** a staff member is assigned to Branch A on Sundays, their calendar slot for Branch B must automatically show as blocked on that day.

### US2.2: Automated Commission Split Calculation
* **As a** Salon Owner,
* **I want the system to** automatically calculate staff commission payouts,
* **So that** I do not have to manually reconcile bookings at the end of the month.
* **Acceptance Criteria**:
  * **Given** I have set a 40% commission rate for "Stylist Sarah" on hair-coloring services,
  * **When** a client completes and pays for a 500 SAR hair-coloring appointment with Sarah,
  * **Then** the system must record 200 SAR in Sarah's payout balance and 300 SAR in the Salon's operational balance, deducting the platform's acquisition fee if applicable.

---

## 3. Freelance Service Provider User Stories

### US3.1: Geofenced Service Area Definition
* **As a** Freelance Service Provider,
* **I want to** define my active service radius in Riyadh,
* **So that** I do not receive home-service requests from areas that are too far away.
* **Acceptance Criteria**:
  * **Given** I am editing my Freelancer profile,
  * **When** I input my base location (coordinates) and set a service radius (e.g., 15 kilometers),
  * **Then** clients located 16 kilometers away must see my profile as "Unavailable for Home Service" or not find me in search results for their location.

---

## 4. Platform Admin User Stories

### US4.1: Provider Verification Gate
* **As a** Platform Admin,
* **I want to** review and approve salon trade licenses and freelancer permits,
* **So that** we ensure only legally compliant and high-quality providers are visible on the platform.
* **Acceptance Criteria**:
  * **Given** a new provider registers and uploads their commercial registration (CR) or Freelance Permit (Wathiqa),
  * **When** they submit, their status must be marked as `pending_verification`, and they must be hidden from search.
  * **When** I approve the documents in the Admin Panel, their status must transition to `active`, triggering a WhatsApp welcome notification and enabling their search visibility.
