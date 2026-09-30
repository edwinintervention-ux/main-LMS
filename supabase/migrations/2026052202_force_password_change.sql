-- Migration: Force Worker Password Change on Temporary Password
-- Created: 2026-05-22
-- ─────────────────────────────────────────────────────────────────────────────

-- Add force_password_change column to workers table
ALTER TABLE public.workers
ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN DEFAULT FALSE;
