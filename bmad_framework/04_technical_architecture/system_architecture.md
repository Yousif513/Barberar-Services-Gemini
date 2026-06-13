# System Architecture, API, & Authentication

This document details the high-level technical architecture, API designs, and authentication systems.

---

## 1. System Architecture

We utilize a **Serverless-First / Managed Backend** architecture built on **Supabase** (PostgreSQL, Realtime, Storage, Auth) and edge deployment engines (Vercel, AWS Lambda) to keep latency minimal in Saudi Arabia.

```
       [Client Layer]                      [API Gateway / Edge Router]               [Backend / Storage Layer]
  +----------------------+                 +--------------------------+              +-------------------------+
  |  • iOS/Android App   |                 |                          |              |                         |
  |    (React Native)    | ===============>|      Supabase API /      | ===========> |   Supabase PostgreSQL   |
  |  • Next.js Website   |                 |      GraphQL Edge        |              |  (DB with RLS Policies) |
  |  • Admin/Provider DB |                 |                          |              |                         |
  +----------------------+                 +--------------------------+              +-------------------------+
                                                         ||                                       ||
                                                         \/                                       \/
                                               [Edge Serverless Hooks]                     [Storage Bucket]
                                            +--------------------------+              +-------------------------+
                                            |  • WhatsApp API Engine   |              |  • Portfolios / CRs     |
                                            |  • Payment Split Routing |              |  • Invoices (S3 / OSS)  |
                                            |  • Prayer Time Scheduler |              |                         |
                                            +--------------------------+              +-------------------------+
```

---

## 2. API Architecture (REST & Webhooks)

We use a RESTful API pattern generated automatically via PostgREST (Supabase native) for standard CRUD, combined with secure Edge Functions (TypeScript) for complex marketplace logic.

### Standard Response Format
```json
{
  "success": true,
  "data": {},
  "error": null,
  "meta": {
    "timestamp": "2026-06-13T12:00:00Z"
  }
}
```

### Key Edge Endpoints

* **POST `/api/v1/bookings/create`**:
  - Validates staff availability, checks prayer-time and travel-time buffers, creates a pending booking, and initializes a payment session.
* **POST `/api/v1/webhooks/payments`**:
  - Secure webhook called by the payment gateway (Tap/Moyasar) to confirm deposit collection, update booking status to `confirmed`, and trigger a WhatsApp confirmation.
* **POST `/api/v1/providers/verify`**:
  - Admin endpoint to verify commercial documents and activate provider search listing.

---

## 3. Authentication System (OTP & OAuth)

To align with consumer habits in Saudi Arabia, where password-less phone registration is standard:

* **Primary Auth Flow**: Passwordless SMS / WhatsApp OTP (One-Time Password).
  - Users input their Saudi mobile number (`+9665xxxxxxxx`).
  - System invokes a Supabase Auth Edge Hook which sends a 6-digit OTP code via **WhatsApp Business API** (falling back to SMS if WhatsApp fails).
  - User submits the code to verify their JWT token.
* **Alternative Auth**: Apple Sign-In and Google Sign-In for quick B2C registration.
* **JWT Claims & RBAC**:
  - The JWT contains user role claims (`customer`, `provider_owner`, `provider_employee`, `admin`).
  - PostgreSQL uses these JWT claims to enforce Row-Level Security (RLS) policies directly on database rows.
