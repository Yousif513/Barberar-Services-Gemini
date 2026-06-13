# Booking & Scheduling Engine Architecture

The scheduling engine is the core transactional component of the platform. It must handle high write-concurrency while respecting complex operational constraints: staff shifts, existing bookings, prayer times, and travel-time buffers.

---

## 1. The Slot Generation Algorithm

When a client queries available slots for a service, the engine performs the following processing pipeline:

```
[Determine Target Date & Duration] 
               │
               ▼
[Fetch Staff Shift Schedule (Start/End times)]
               │
               ▼
[Subtract Existing Bookings (Confirmed/Pending)]
               │
               ▼
[Subtract Static Buffers (20-min Prayer Times in Riyadh)]
               │
               ▼
[Subtract Dynamic Travel Buffer (If Home Service selected)]
               │
               ▼
[Slice remaining time blocks into Service Duration increments]
               │
               ▼
[Return Available Slot Array to UI]
```

---

## 2. Prayer-Time Buffer Logic
To respect Saudi operational norms, the calendar dynamically blocks 20 minutes around local prayer times (Fajr, Dhuhr, Asr, Maghrib, Isha).
* **Execution**: A background worker fetches the daily prayer coordinates for Riyadh (`Umm Al-Qura` calculation method).
* **Blocking Rule**: If a prayer time falls at 12:15 PM, the system inserts a block from `12:10 PM - 12:30 PM`. 
* **Database Check**: When generating slots:
  ```sql
  -- Ensure slot [slot_start, slot_end] does not overlap with prayer time [p_start, p_end]
  NOT (slot_start < p_end AND slot_end > p_start)
  ```

---

## 3. Dynamic Home Service Travel Buffer

For freelance service providers (or salon employees dispatched to homes), travel buffer calculations prevent late arrivals:

1. **Calculate Routing Distance**:
   - Query the Google Maps Distance Matrix API:
     `origin = provider_location (last known or virtual branch coords)`
     `destination = customer_home_coords`
   - Retrieve `duration_in_seconds` and add a **20% traffic buffer**.
2. **Calendar Injection**:
   - If travel time is calculated as 30 minutes, the engine blocks a **30-minute travel window** BEFORE the booking starts, and a **30-minute return window** AFTER the booking ends.
   - *Example*: A 60-minute haircut booked at 3:00 PM requires blocking the stylist's calendar from 2:30 PM to 4:30 PM.

---

## 4. Preventing Double-Booking (Concurrency Control)

To prevent two customers from booking the same slot simultaneously:

* **Step 1: Pessimistic Row Locking**:
  When a user starts checkout, the system attempts to lock the slot for 5 minutes:
  ```sql
  -- Use SELECT FOR UPDATE to temporarily block concurrent transactions
  SELECT id FROM bookings 
  WHERE employee_id = target_employee_id 
    AND status IN ('confirmed', 'pending_payment')
    AND scheduled_at = target_scheduled_at
  FOR UPDATE;
  ```
* **Step 2: Database Constraints**:
  Implement an exclusion constraint to enforce slot separation at the database layer:
  ```sql
  -- Prevents overlapping confirmed time intervals for the same employee
  ALTER TABLE bookings ADD CONSTRAINT no_overlapping_confirmed_bookings 
  EXCLUDE USING gist (
    employee_id WITH =,
    tsrange(scheduled_at, scheduled_at + (duration_minutes || ' minutes')::interval) WITH &&
  ) WHERE (status = 'confirmed');
  ```
