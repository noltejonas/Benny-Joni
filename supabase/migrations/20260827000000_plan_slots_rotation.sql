-- ── Plan Slots & Rotation Config ─────────────────────────────────────────────
-- Run this in the Supabase Dashboard SQL editor after 20260826000000_challenge_type.sql

-- plan_slots table (if not already exists)
CREATE TABLE IF NOT EXISTS plan_slots (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  week_index  int  NOT NULL DEFAULT 0,
  category_id text NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  start_target int NOT NULL DEFAULT 100,
  bonus_max   int NOT NULL DEFAULT 0,
  growth_pct  int NOT NULL DEFAULT 0,
  position    int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- rotation_config table (singleton row, id=1)
CREATE TABLE IF NOT EXISTS rotation_config (
  id          int  PRIMARY KEY DEFAULT 1,
  start_date  date NOT NULL DEFAULT CURRENT_DATE,
  enabled     boolean NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Seed rotation_config (start this week monday)
INSERT INTO rotation_config (id, start_date, enabled)
VALUES (1, date_trunc('week', CURRENT_DATE)::date, true)
ON CONFLICT (id) DO NOTHING;

-- Seed plan_slots — 2-week rotation
-- Week 0: Klimmzüge + Dips Fokus
-- Week 1: Liegestütze + Leg Raises Fokus
-- HSPU always regular, Tom Holland + Bring Sally Up always Pflicht

-- Note: Replace the category UUIDs below with the actual IDs from your categories table.
-- You can get them with: SELECT id, name FROM categories ORDER BY name;
-- Then substitute in the inserts below.

-- For reference the demo IDs are:
--   Liegestütze = c1, Klimmzüge = c2, Leg Raises = c6, HSPU = c7, Dips = c8
--   Tom Holland = c9, Bring Sally Up = c10
-- If you seeded via 20260826000000_challenge_type.sql, look up the real UUIDs.

-- Uncomment and fill in real IDs before running:
/*
INSERT INTO plan_slots (week_index, category_id, start_target, bonus_max, growth_pct, position) VALUES
  -- Week 0: Klimmzüge + Dips Fokus
  (0, '<KLIMMZÜGE_ID>',      50, 0, 0, 1),
  (0, '<DIPS_ID>',           50, 0, 0, 2),
  (0, '<LIEGESTÜTZE_ID>',    30, 0, 0, 3),
  (0, '<LEG_RAISES_ID>',     30, 0, 0, 4),
  (0, '<HSPU_ID>',           20, 0, 0, 5),
  (0, '<TOM_HOLLAND_ID>',     1, 0, 0, 6),
  (0, '<BRING_SALLY_UP_ID>', 1, 0, 0, 7),
  -- Week 1: Liegestütze + Leg Raises Fokus
  (1, '<LIEGESTÜTZE_ID>',    80, 0, 0, 1),
  (1, '<LEG_RAISES_ID>',     50, 0, 0, 2),
  (1, '<KLIMMZÜGE_ID>',      30, 0, 0, 3),
  (1, '<DIPS_ID>',           40, 0, 0, 4),
  (1, '<HSPU_ID>',           20, 0, 0, 5),
  (1, '<TOM_HOLLAND_ID>',     1, 0, 0, 6),
  (1, '<BRING_SALLY_UP_ID>', 1, 0, 0, 7)
ON CONFLICT DO NOTHING;
*/
