# Risk Register

This document tracks technical, legal, and operational risks associated with launching the Beauty & Grooming Marketplace in Saudi Arabia.

---

## 1. Risk Matrix

| Risk ID | Category | Description | Probability | Impact | Score | Owner | Mitigation Strategy | Contingency Plan |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :--- | :--- |
| **R-01** | **Business** | **Disintermediation / Back-channeling**: Salons and clients booking offline to avoid platform fees. | High (4) | High (4) | **16** | Growth Mngr | Offer lower commission (5%) on repeat bookings; lock loyalty points to platform bookings; mask customer/provider contact numbers. | Suspend accounts repeatedly flagged for booking cancellations followed by immediate offline visits. |
| **R-02** | **Technical** | **Slot Collision (Double Booking)**: Concurrency failure during peak hours. | Medium (3) | Critical (5) | **15** | Tech Lead | Implement pessimistic row locks (`SELECT FOR UPDATE`) and interval exclusion constraints in PostgreSQL database. | Manually re-allocate customer to alternative provider; platform pays for a 50 SAR discount voucher. |
| **R-03** | **Legal** | **Compliance (Saudi PDPL)**: Personal customer data or phone numbers stored in overseas servers. | Medium (3) | Critical (5) | **15** | Security Lead | Host database strictly on local cloud instances (e.g. Google Cloud Riyadh). Anonymize phone logs. | Immediate migration of storage buckets to local KSA servers. |
| **R-04** | **Legal** | **ZATCA Phase 2 Failure**: Regulatory non-compliance with e-invoicing laws in Saudi Arabia. | Low (2) | High (4) | **8** | PM / Dev | Test ZATCA sandbox APIs early; ensure invoices generate compliant Phase 1 QR codes from day one. | Fallback to certified local third-party ZATCA integration middleware. |
| **R-05** | **Business** | **Cold-Start Problem**: Lack of providers in search, leading to poor customer retention. | High (4) | Medium (3) | **12** | Founder | Offer 3-month free SaaS trial for early partner salons; provide professional photography assets. | Limit consumer launch strictly to one district (Al-Malqa) to artificially group demand/supply. |

---

## 2. Risk Scoring Key
* **Score = Probability (1-5) x Impact (1-5)**.
* **Score 15-25**: Critical. Immediate architectural or strategic mitigation required.
* **Score 8-12**: Moderate. Monitored closely during sprints.
* **Score 1-6**: Low. Standard operational monitoring.
