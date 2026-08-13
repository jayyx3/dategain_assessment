-- ============================================
-- Seed data: a pre-resolved round for demo/testing
-- Run AFTER db-setup.sql
-- ============================================

-- Insert yesterday's resolved round (for demo purposes)
INSERT INTO daily_rounds (date, lock_price, resolved, resolved_price, status)
VALUES (
  (current_date - interval '1 day')::date,
  67542.30,
  true,
  68105.80,
  'RESOLVED'
) ON CONFLICT (date) DO NOTHING;

-- Insert today's active round
INSERT INTO daily_rounds (date, lock_price, resolved, resolved_price, status)
VALUES (
  current_date,
  68105.80,
  false,
  null,
  'PENDING'
) ON CONFLICT (date) DO NOTHING;
