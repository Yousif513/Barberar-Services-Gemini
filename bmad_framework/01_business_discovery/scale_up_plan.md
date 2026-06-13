# Scale-Up & Category Expansion Plan

This document details how the platform's business model and software architecture will scale from Beauty & Grooming to a multi-vertical lifestyle service marketplace.

---

## 1. Vertical Expansion Roadmap

The system is engineered to scale across four distinct expansion stages:

```
   Phase 1: Beauty & Grooming        Phase 2: Beauty & Wellness        Phase 3: Home & Events            Phase 4: Full Marketplace
   ──────────────────────────        ──────────────────────────        ──────────────────────            ─────────────────────────
  • Salons / Barber Shops           • Spas & Massage Centers          • Home Cleaning                   • Medical Home Care
  • Independent Hair Stylists       • Fitness Centers & Gyms          • Maintenance (AC, Plumber)       • Academic Tutors
  • Freelance Makeup Artists        • Personal Trainers               • Photography & Videography       • Pet Care & Grooming
  • Nail Techs & Henna Artists      • Wellness Retainers/Packages     • Event Planners                  • Delivery Services
```

---

## 2. Database & Schema Architectural Readiness

To avoid major DDL migrations as we scale:
* **Hierarchical Taxonomy**: The `categories` table supports nested records. 
  - To add Home Cleaning, we simply insert a root category `Home Services` and a subcategory `Deep Cleaning`. Services link directly to these IDs.
* **Flexible Branch Model**: The `branches` table coordinates geolocation.
  - A fitness trainer has a "virtual branch" with their GPS coordinate and service radius, similar to a freelance makeup artist. A gym has a physical branch.
* **Metadata Schema Pattern**:
  - The bookings and services tables will utilize a PostgreSQL `jsonb` field (e.g. `metadata jsonb DEFAULT '{}'`) to store vertical-specific data (e.g., number of rooms for a home cleaning booking, gym package durations, or camera kit details for a photographer) without modifying columns.

---

## 3. Permissions & API Scaling (RBAC/ABAC)

* **Role-Based Access Control (RBAC)**:
  - The role claims (`customer`, `provider_owner`, `provider_employee`, `admin`) remain constant.
  - To support different industries, we add granular capability permissions mapping (e.g., `can_receive_dispatch`, `requires_resource_reservation`).
* **Resource Matching Engine**:
  - Phase 2 (Spas/Wellness) requires room allocation. We extend the scheduling engine's block checking logic from checking just `employee_id` to verifying `resource_id` (e.g., massage room, yoga studio slot) to prevent double-booking spatial resources.
* **Bidding & Dispatch API Gateway**:
  - Phase 3 (Home Cleaning/Maintenance) utilizes a "dispatch" model (similar to Uber) rather than a calendar list booking. The Edge Functions API will support a "job broadcast" pattern, where customers list jobs and providers in a 10km radius bid or accept them immediately.
