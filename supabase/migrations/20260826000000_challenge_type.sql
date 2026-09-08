-- Add challenge_type to categories
ALTER TABLE categories ADD COLUMN IF NOT EXISTS challenge_type text NOT NULL DEFAULT 'standard';

-- Seed the new calisthenics + obligatory categories
INSERT INTO categories (name, emoji, kind, challenge_type) VALUES
  ('Leg Raises',     '🦵', 'sports', 'standard'),
  ('HSPU',           '🤸', 'sports', 'standard'),
  ('Dips',           '🔽', 'sports', 'standard'),
  ('Tom Holland',    '🦸', 'sports', 'tom_holland'),
  ('Bring Sally Up', '🌸', 'sports', 'bring_sally_up')
ON CONFLICT DO NOTHING;
