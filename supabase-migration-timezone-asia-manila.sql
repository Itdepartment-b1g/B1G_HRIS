-- ============================================================
-- B1G HRIS — Migration: Set Database Timezone to Asia/Manila
-- Run this in Supabase SQL Editor
-- ============================================================
-- This ensures CURRENT_DATE, now(), and timestamp display use
-- Philippines time (UTC+8) for consistency with your business.
-- ============================================================

-- Set database default timezone to Asia/Manila
-- Supabase typically uses 'postgres' as the database name. If this fails,
-- check Project Settings > Database for your actual database name.
ALTER DATABASE postgres SET timezone TO 'Asia/Manila';

-- New connections will use Asia/Manila. Existing connections may need to reconnect.
-- Verify after running: SHOW timezone;  (expected: Asia/Manila)
