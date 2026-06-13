# Payments, Notifications, & Security Architecture

This document establishes the specifications for transactional payments, automated communications, and national regulatory compliance.

---

## 1. Regional Payment Gateways & Split Architecture

To serve the Saudi market, we integrate with regional gateways (**Tap Payments** or **Moyasar**) which provide out-of-the-box support for **Mada** (local debit cards) and **Apple Pay**.

### Transaction Split Logic
Upon a successful payment, the gateway triggers our webhook. We utilize the gateway's split payment API (e.g. Tap Connect / Marketplace API) to distribute the funds:
1. **Total Booking Cost**: e.g., 200 SAR paid by customer.
2. **Gateway MDR Deduction**: (e.g., Mada fee 1% + 0.25 SAR = 2.25 SAR). Remainder = 197.75 SAR.
3. **Platform Fee Split**: 15% marketplace commission calculated on the base price (30 SAR) is routed directly to the Platform Account.
4. **Provider Split**: The remaining 167.75 SAR is routed to the Salon/Provider merchant sub-account.
5. **Staff Payouts**: The provider dashboard triggers internal transfers to the employee ledger if commission rules apply.

---

## 2. Notification & Communication Architecture

Instead of email, which has low open rates in Saudi Arabia, our system is **WhatsApp-First**.

* **WhatsApp Gateway Provider**: Twilio WhatsApp API or **Unifonic** (local Saudi telecom provider).
* **Communication Rules**:
  - **OTP Verification**: Triggered on login/signup (expires in 3 minutes).
  - **Booking Confirmed**: Triggered immediately upon payment capture.
  - **Reminders**: Automated triggers sent 24 hours and 2 hours before the appointment.
  - **Cancellation Alert**: Sent if a customer or provider cancels the booking.

---

## 3. Regulatory Security & Compliance in KSA

### A. Personal Data Protection Law (PDPL)
* **Data Residency**: All customer PII (Personally Identifiable Information) and financial records must be hosted on local cloud databases (e.g., Google Cloud Riyadh Region).
* **Encryption**: AES-256 encryption at rest; TLS 1.3 transit encryption.

### B. ZATCA e-Invoicing Compliance
Under the regulations of the Zakat, Tax and Customs Authority (ZATCA):
* **Phase 1 (Simplification)**: The platform must automatically generate a tax invoice in PDF/HTML with a compliant QR code containing:
  - Seller's Name (Salon/Provider name).
  - Seller's VAT Registration Number.
  - Invoice Timestamp and Total (including 15% VAT).
* **Phase 2 (Integration)**: Secure integration via API to submit electronic invoices directly to ZATCA's platform for cryptographic signing.
