-- PostgreSQL Schema for Beauty & Grooming Marketplace Platform (Scalable Design)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USER ROLES ENUM
CREATE TYPE user_role AS ENUM ('customer', 'provider_owner', 'provider_employee', 'admin');
CREATE TYPE booking_status AS ENUM ('pending_payment', 'confirmed', 'completed', 'cancelled', 'no_show');
CREATE TYPE provider_type AS ENUM ('salon_barber_shop', 'freelancer');

-- 2. DYNAMIC SYSTEM CATEGORIES (Designed to support Future Marketplace scale e.g. Spa, Wellness, Home Cleaning)
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id UUID REFERENCES categories(id) ON DELETE SET NULL, -- Self-referencing hierarchical structure
    name_en VARCHAR(100) NOT NULL,
    name_ar VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. USERS TABLE (Linked to Supabase Auth)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role user_role NOT NULL DEFAULT 'customer',
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    email VARCHAR(100) UNIQUE,
    phone_number VARCHAR(20) UNIQUE NOT NULL, -- Format: +9665xxxxxxxx
    language_preference VARCHAR(5) DEFAULT 'ar',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. PROVIDER PROFILES (Handles Salons and Freelancers)
CREATE TABLE providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    type provider_type NOT NULL,
    business_name_en VARCHAR(150) NOT NULL,
    business_name_ar VARCHAR(150) NOT NULL,
    description_en TEXT,
    description_ar TEXT,
    logo_url TEXT,
    cover_image_url TEXT,
    trade_license_url TEXT, -- CR or Freelance Permit URL
    is_verified BOOLEAN DEFAULT FALSE,
    commission_percentage DECIMAL(5,2) DEFAULT 15.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. BRANCHES (For Salons/Barber Shops. Freelancers have 1 virtual branch matching their base geofence)
CREATE TABLE branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    name_en VARCHAR(100) NOT NULL,
    name_ar VARCHAR(100) NOT NULL,
    address_text_en TEXT NOT NULL,
    address_text_ar TEXT NOT NULL,
    latitude DECIMAL(9,6) NOT NULL,
    longitude DECIMAL(9,6) NOT NULL,
    geofence_radius_km DECIMAL(5,2) DEFAULT 0.00, -- Used for Freelancer service radius or Salon home dispatch
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. EMPLOYEES / STAFF
CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    profile_id UUID UNIQUE REFERENCES profiles(id) ON DELETE SET NULL, -- Can link to a user profile
    name_en VARCHAR(100) NOT NULL,
    name_ar VARCHAR(100) NOT NULL,
    title_en VARCHAR(100) DEFAULT 'Stylist',
    title_ar VARCHAR(100) DEFAULT 'أخصائي',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. SERVICES (Offered by Providers)
CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    name_en VARCHAR(150) NOT NULL,
    name_ar VARCHAR(150) NOT NULL,
    description_en TEXT,
    description_ar TEXT,
    base_price DECIMAL(10,2) NOT NULL,
    base_duration_minutes INT NOT NULL,
    is_home_service_eligible BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. EMPLOYEE SERVICES (Custom overrides for specific employees - e.g., Senior Stylist pricing)
CREATE TABLE employee_services (
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    custom_price DECIMAL(10,2),
    custom_duration_minutes INT,
    PRIMARY KEY (employee_id, service_id)
);

-- 9. AVAILABILITY SHIFTS (Weekly schedule blocks)
CREATE TABLE employee_availability (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0 = Sunday, 6 = Saturday
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_working_day BOOLEAN DEFAULT TRUE,
    UNIQUE (employee_id, day_of_week)
);

-- 10. BOOKINGS (Transactions table)
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
    status booking_status NOT NULL DEFAULT 'pending_payment',
    is_home_service BOOLEAN DEFAULT FALSE,
    home_address_lat DECIMAL(9,6),
    home_address_lng DECIMAL(9,6),
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_minutes INT NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    deposit_required DECIMAL(10,2) NOT NULL,
    tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    platform_commission DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. FINANCIAL TRANSACTIONS LEDGER (Splits)
CREATE TABLE transactional_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
    payment_intent_id VARCHAR(255) NOT NULL,
    total_captured DECIMAL(10,2) NOT NULL,
    platform_share DECIMAL(10,2) NOT NULL,
    provider_share DECIMAL(10,2) NOT NULL,
    employee_share DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    payout_status VARCHAR(50) DEFAULT 'pending', -- pending, processed, failed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 12. RATINGS & REVIEWS
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID UNIQUE NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
