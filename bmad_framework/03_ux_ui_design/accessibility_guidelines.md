# UX Guidelines & Accessibility Requirements

To deliver an inclusive experience that respects the cultural and physical requirements of all users in Saudi Arabia, the platform follows strict accessibility and internationalization standards.

---

## 1. Right-to-Left (RTL) Mirroring Logic
Arabic is the official language of Saudi Arabia. The platform must fully support RTL layouts:
* **Layout Direction**: Use CSS logical properties (e.g. `margin-inline-start` instead of `margin-left`) or apply `dir="rtl"` dynamically on the HTML root element.
* **Component Flipping**: 
  - Icons that indicate direction (like back buttons or forward arrows) must be mirrored.
  - Progression bars, calendars, and tables must read from right to left in Arabic.
  - Brand logos and non-directional symbols (like search magnifying glasses) remain unmirrored.

---

## 2. Accessibility Guidelines (WCAG 2.1 AA Compliance)

### A. Color Contrast
* **Text Contrast**: Ensure all text elements meet WCAG 2.1 AA contrast ratios of at least **4.5:1** for normal text and **3:1** for large text against their background.
* **Gold Accent Text**: Since gold (`var(--color-luxury-gold)`) on light backgrounds has poor contrast, the system must use dark charcoal/black text over gold buttons, and deep gold over white backgrounds.

### B. Keyboard & Screen Reader Navigation
* **Semantic HTML**: Utilize native HTML5 tags (`<nav>`, `<main>`, `<header>`, `<button>`, `<input>`) to ensure screen readers (VoiceOver, TalkBack) parse layouts correctly.
* **Focus States**: Never disable focus outlines. Implement a high-visibility gold ring focus outline for users navigating via physical keyboard or accessibility switch.
* **Aria Attributes**: All interactive elements must have semantic descriptions.
  - *Example*: A button displaying a calendar date picker must include `aria-expanded="false" aria-label="Select appointment date"`.

---

## 3. Micro-interactions & Visual Feedback
* **Booking State Changes**: When a user clicks "Book Now", disable the button and show a loading spinner with text `Processing... / جاري المعالجة...` to prevent double-click submissions.
* **Tactile Haptics**: For mobile applications, trigger a light haptic tap on successful selection (e.g., choosing a time slot) and a double-vibe on payment errors or verification failures.
* **Skeleton Loaders**: Utilize animated skeleton cards during catalog searching to reduce perceived wait times, rather than blank screens or generic blocking spinners.
