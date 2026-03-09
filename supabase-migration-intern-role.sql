-- ============================================================
-- B1G HRIS — Migration: Add Intern Role
-- Intern has same permissions as Rank and File (employee)
-- Safe to re-run: uses IF NOT EXISTS
-- ============================================================

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'intern';
