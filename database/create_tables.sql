-- DDL Schema for operating slots, follow-ups, M-Pesa payments, and settings
-- Run this script in your Supabase SQL Editor

-- 1. Nurse Schedule Operating Hours
CREATE TABLE IF NOT EXISTS "sanCodeNurse_schedule" (
    id SERIAL PRIMARY KEY,
    day_of_week VARCHAR(20) NOT NULL, -- e.g. 'Monday', 'Tuesday'
    start_time TIME NOT NULL,        -- e.g. '07:00:00'
    end_time TIME NOT NULL,          -- e.g. '08:00:00'
    slot_name VARCHAR(50) NOT NULL,   -- e.g. 'Morning Medicine'
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Student Follow-ups / Scheduled Returns
CREATE TABLE IF NOT EXISTS "sanCodeFollow_ups" (
    id SERIAL PRIMARY KEY,
    adm_no INTEGER NOT NULL,          -- references student admission number
    scheduled_time TIMESTAMP WITH TIME ZONE NOT NULL,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'PENDING', -- 'PENDING', 'COMPLETED', 'MISSED'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. M-Pesa Payments (Daily / Access Session Logs)
CREATE TABLE IF NOT EXISTS "sanCodeMpesa_payments" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    adm_no INTEGER NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    amount NUMERIC(10, 2) NOT NULL DEFAULT 50.00,
    mpesa_receipt_number VARCHAR(30) UNIQUE,
    status VARCHAR(20) DEFAULT 'PENDING', -- 'PENDING', 'COMPLETED', 'FAILED'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Global Settings Store (Nurse Passcode)
CREATE TABLE IF NOT EXISTS "sanCodeSettings" (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed default settings
INSERT INTO "sanCodeSettings" (key, value) 
VALUES ('teacher_passcode', 'staff123') 
ON CONFLICT (key) DO NOTHING;

-- Seed default nurse schedule slots (4 times a day: Morning, Lunch, Evening, After Dinner, After Preps)
INSERT INTO "sanCodeNurse_schedule" (day_of_week, start_time, end_time, slot_name, description) VALUES
('Monday', '07:00:00', '08:00:00', 'Morning Medicine', 'Morning medication check and distribution'),
('Monday', '12:30:00', '14:00:00', 'Lunch Time Medicine', 'Lunch hour check-ups and dispensing'),
('Monday', '16:00:00', '17:30:00', 'Evening Medicine', 'After class check-ups'),
('Monday', '20:00:00', '21:30:00', 'After Preps Medicine', 'Bedtime doses and emergency check-ups'),
('Tuesday', '07:00:00', '08:00:00', 'Morning Medicine', 'Morning medication check and distribution'),
('Tuesday', '12:30:00', '14:00:00', 'Lunch Time Medicine', 'Lunch hour check-ups and dispensing'),
('Tuesday', '16:00:00', '17:30:00', 'Evening Medicine', 'After class check-ups'),
('Tuesday', '20:00:00', '21:30:00', 'After Preps Medicine', 'Bedtime doses and emergency check-ups'),
('Wednesday', '07:00:00', '08:00:00', 'Morning Medicine', 'Morning medication check and distribution'),
('Wednesday', '12:30:00', '14:00:00', 'Lunch Time Medicine', 'Lunch hour check-ups and dispensing'),
('Wednesday', '16:00:00', '17:30:00', 'Evening Medicine', 'After class check-ups'),
('Wednesday', '20:00:00', '21:30:00', 'After Preps Medicine', 'Bedtime doses and emergency check-ups'),
('Thursday', '07:00:00', '08:00:00', 'Morning Medicine', 'Morning medication check and distribution'),
('Thursday', '12:30:00', '14:00:00', 'Lunch Time Medicine', 'Lunch hour check-ups and dispensing'),
('Thursday', '16:00:00', '17:30:00', 'Evening Medicine', 'After class check-ups'),
('Thursday', '20:00:00', '21:30:00', 'After Preps Medicine', 'Bedtime doses and emergency check-ups'),
('Friday', '07:00:00', '08:00:00', 'Morning Medicine', 'Morning medication check and distribution'),
('Friday', '12:30:00', '14:00:00', 'Lunch Time Medicine', 'Lunch hour check-ups and dispensing'),
('Friday', '16:00:00', '17:30:00', 'Evening Medicine', 'After class check-ups'),
('Friday', '20:00:00', '21:30:00', 'After Preps Medicine', 'Bedtime doses and emergency check-ups');
