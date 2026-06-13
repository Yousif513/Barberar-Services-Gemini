# Customer Journey Maps & User Flows

This document visualizes the step-by-step experience of both consumers and service providers, showing how they interact with the platform.

---

## 1. Customer Journey Map (Noura: Booking Home Beauty Service)

| Phase | 1. Discovery | 2. Evaluation | 3. Booking | 4. Delivery | 5. Post-Service |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Actions** | Searches for "Nail Tech Home Service" in Al-Malqa. | Browses profiles, checks portfolios, reviews ratings and pricing. | Selects date/time, inputs address, pays 50 SAR deposit via Apple Pay. | Stylist arrives at home on time, performs nail manicure. | Receives WhatsApp invoice, leaves 5-star rating and tip. |
| **Thoughts** | "Is there a platform that has actual slots instead of Instagram DMs?" | "This freelancer has great nail-art photos and 4.8 stars. The price is clear." | "Apple Pay worked instantly. Booking is confirmed. Booking details are on WhatsApp." | "The stylist was punctual and professional. The dynamic travel calculation worked." | "I can re-book her easily. I also earned 10 loyalty points for next time." |
| **Pain Points** | Hard to find freelancers with real portfolios. | Worried if portfolio photos are stolen or fake. | Afraid freelancer might cancel last minute and take deposit. | Traffic delay in Riyadh causing late arrival. | Forgetting to leave a review or losing booking history. |
| **Platform Solution** | Localized search and geofencing filter. | Verified customer reviews and watermarked photos. | Escrow deposits and secure payment refunds on cancellations. | Real-time map tracking and dynamic traffic routing buffers. | Automatic WhatsApp review prompt and easy "Book Again" button. |

---

## 2. Customer Search & Booking User Flow

The following Mermaid diagram maps the decision paths a client takes from landing on the app to booking confirmation:

```mermaid
flowchart TD
    A[Start: Open App] --> B{Choose Booking Type}
    B -- In-Store --> C[Search Salons near current GPS]
    B -- Home Service --> D[Input Home Address / Geofence Check]
    
    C --> E[Filter by Service/Price/Rating/Availability]
    D --> E
    
    E --> F[Select Service Provider Profile]
    F --> G[Select Service & Service Variant]
    G --> H{Select Booking Flow}
    
    H -- Specific Employee --> I[Select Stylist/Barber]
    H -- Any Employee --> J[Auto-allocate first available]
    
    I --> K[Select Calendar Date & Time Slot]
    J --> K
    
    K --> L{Requires Deposit?}
    L -- Yes --> M[Process Payment via Mada/Apple Pay]
    L -- No --> N[Confirm Booking Cash/Card at Venue]
    
    M --> O[System Reserves Slot & Holds Escrow]
    N --> P[System Reserves Slot]
    
    O --> Q[Send WhatsApp Confirmation to Customer & Provider]
    P --> Q
    Q --> R[End]
```

---

## 3. Provider Order Fulfillment User Flow

The following Mermaid diagram maps how a provider handles a booking from receipt to payout:

```mermaid
flowchart TD
    A[Receive New Booking Notification] --> B{Auto-Accept Enabled?}
    B -- Yes --> C[Status: Confirmed]
    B -- No --> D{Accept or Reject within 1 Hour?}
    
    D -- Accept --> C
    D -- Reject --> E[Status: Cancelled & Deposit Refunded]
    
    C --> F[Block Calendar Slot & Assign Staff]
    F --> G[Send Reminder Notification 24h & 2h prior]
    
    G --> H{Service Rendered?}
    H -- Yes --> I[Mark Completed in Dashboard]
    H -- No Show (Client) --> J[Claim Escrow Deposit via Cancellation Policy]
    
    I --> K{Online Payment Split?}
    K -- Yes --> L[Gateway Splits Funds to Shop & Stylist Ledgers]
    K -- No (Cash at Venue) --> M[Log Cash Payment & Invoice Platform Fee]
    
    L --> N[Payout processed to Bank Account]
    M --> O[Platform invoices shop ledger balance]
    
    N --> P[Request Review via WhatsApp]
    O --> P
    P --> Q[End]
```
