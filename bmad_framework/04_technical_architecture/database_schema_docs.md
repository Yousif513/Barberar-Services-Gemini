# Database Documentation & Access Control

This document explains the entity relationships, performance indexing strategies, and Row-Level Security (RLS) configurations for our PostgreSQL database.

---

## 1. Entity Relationships (ERD Description)
* **Dynamic Taxonomy**: The `categories` table uses a self-referencing `parent_id` hierarchy. A service category (e.g., "Men's Grooming") can house subcategories (e.g., "Haircuts"), which allows the platform to expand to Spas, Wellness, Home Cleaning, or Maintenance without any DDL modifications.
* **Unified Provider Structure**: The `providers` table holds metadata for both salons and freelancers. Freelancers are represented as a provider with `type = 'freelancer'`. They have one virtual entry in `branches` to anchor their coordinates and geofence radius.
* **Granular Booking Allocation**: The `bookings` table links a customer (`profiles`), a shop location (`branches`), a service provider (`employees`), and the specific item (`services`). This allows multi-dimensional schedule constraints.

---

## 2. High-Performance Indexing Strategy

To support lightning-fast geolocation search and prevent concurrent slot collisions:

### A. Geolocation Spatial Indexes (PostGIS / earthdistance)
For filtering listings within a customer's radius:
```sql
-- Create index on branch latitude and longitude coordinates
CREATE INDEX idx_branches_coords 
ON branches (latitude, longitude);
```
*(If PostGIS is enabled, use a GiST index on a geometry `point` field).*

### B. Booking Slot Collision Index
To speed up calendar lookups during appointment booking:
```sql
CREATE INDEX idx_bookings_schedule 
ON bookings (employee_id, scheduled_at, status)
WHERE status IN ('confirmed', 'pending_payment');
```

---

## 3. PostgreSQL Row-Level Security (RLS) Policies

To protect competitive data between rival salons and guarantee customer privacy, RLS is enabled on all tables.

### A. Profiles Table Policies
```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Allow users to read and update only their own profile
CREATE POLICY "Users can manage their own profiles"
ON profiles FOR ALL
USING (auth.uid() = id);

-- Allow admins to read all profiles
CREATE POLICY "Admins can view all profiles"
ON profiles FOR SELECT
USING (auth.jwt() ->> 'role' = 'admin');
```

### B. Bookings Table Policies
```sql
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Customers can view only their own bookings
CREATE POLICY "Customers view own bookings"
ON bookings FOR SELECT
USING (auth.uid() = customer_id);

-- Salon Owners/Managers can view bookings belonging to their branches
CREATE POLICY "Providers view own branch bookings"
ON bookings FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM branches b
    JOIN providers p ON b.provider_id = p.id
    WHERE b.id = bookings.branch_id AND p.owner_id = auth.uid()
  )
);
```
