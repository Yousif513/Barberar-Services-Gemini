# Design System & Components Library

To deliver a premium, high-end feel that inspires trust and feels luxury-grade, we establish a rigid, modern design system.

---

## 1. Visual Identity & Design Tokens

### A. Color Palette (Elegant HSL Theme)
We avoid basic, flat colors. Instead, we use a sophisticated, high-contrast palette representing luxury and clean grooming.

```css
:root {
  /* Primary Brands */
  --color-luxury-gold: hsl(45, 60%, 55%);     /* Main accent, premium action states */
  --color-slate-black: hsl(220, 15%, 8%);     /* Primary backgrounds, dark text */
  --color-charcoal-dark: hsl(220, 12%, 14%);  /* Card backgrounds, dropdowns */
  
  /* Status Colors */
  --color-emerald-success: hsl(150, 60%, 40%); /* Confirmed bookings, verified checks */
  --color-rose-alert: hsl(355, 75%, 50%);      /* Cancelled bookings, errors, alerts */
  
  /* Text & Interfaces */
  --color-alabaster-white: hsl(0, 0%, 98%);    /* Primary light text, light backgrounds */
  --color-cool-gray: hsl(210, 8%, 65%);       /* Secondary text, borders */
  
  /* Glassmorphism / Acrylic */
  --blur-acrylic: blur(12px);
  --color-glass-fill: hsla(0, 0%, 100%, 0.03);
  --color-glass-border: hsla(0, 0%, 100%, 0.08);
}
```

### B. Typography
Bilingual typography requires fonts that match in visual weight:
* **English Font**: **Inter** (Google Fonts) - Clean, neutral, high readability.
* **Arabic Font**: **Tajawal** (Google Fonts) - Contemporary, elegant geometric sans-serif that pairs perfectly with Inter.
* **Weight Hierarchy**: Regular (400), Medium (500), SemiBold (600), Bold (700).

---

## 2. Component Specifications

### A. Button Component Variant Group
* **Primary Gold Button**:
  - Background: `var(--color-luxury-gold)`
  - Text: `var(--color-slate-black)` (Bold)
  - Radius: `8px`
  - Interaction: Transform scale scale(0.98) on click, transition 150ms ease.
* **Acrylic Glass Button**:
  - Background: `var(--color-glass-fill)`
  - Border: `1px solid var(--color-glass-border)`
  - Text: `var(--color-alabaster-white)`

### B. Time Slot Selection Card
* **Interactive Time Chip**:
  - Unselected: Dark charcoal background, cool gray text, thin border.
  - Hover: Border changes to gold, subtle background highlight.
  - Selected: Gold background, black text.
  - Locked (Prayer Time): Disabled state, low opacity, icon of prayer hands showing "Prayer Time Buffer" as tool-tip.

### C. Booking Summary Card (Responsive)
* Floating glassmorphic card pinned to checkout. Displays selected service, duration, provider name, and clear price breakdown:
  ```
  [ Service Name ]               [ Duration ]
  -------------------------------------------
  Service Cost                     100 SAR
  Home Service Travel Fee           15 SAR
  VAT (15%)                       17.25 SAR
  -------------------------------------------
  Total Payout                    132.25 SAR
  Deposit Required (20%)           26.45 SAR
  ```
