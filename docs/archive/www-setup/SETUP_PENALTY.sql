-- Strafkonto: penalty_config (Singleton), penalties, week_closures
-- 2026-05-12
-- Applied via Supabase MCP migration "penalty_system"

CREATE TABLE IF NOT EXISTS penalty_config (
  id           int PRIMARY KEY CHECK (id = 1),
  enabled      bool NOT NULL DEFAULT false,
  rule_mode    text NOT NULL DEFAULT 'per_week_aggregate'
               CHECK (rule_mode IN ('per_challenge','per_week_any','per_week_all','per_week_aggregate')),
  amount_cents int  NOT NULL DEFAULT 500 CHECK (amount_cents > 0),
  currency     text NOT NULL DEFAULT 'EUR',
  updated_at   timestamptz NOT NULL DEFAULT now()
);
INSERT INTO penalty_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS penalties (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start   date NOT NULL,
  athlete      text NOT NULL REFERENCES athletes(name),
  challenge_id uuid REFERENCES weekly_challenges(id) ON DELETE SET NULL,
  amount_cents int  NOT NULL CHECK (amount_cents > 0),
  rule_mode    text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  paid         bool NOT NULL DEFAULT false,
  paid_at      timestamptz,
  paid_by      text REFERENCES athletes(name),
  note         text
);
CREATE INDEX IF NOT EXISTS penalties_week_idx         ON penalties(week_start);
CREATE INDEX IF NOT EXISTS penalties_athlete_paid_idx ON penalties(athlete, paid);
CREATE INDEX IF NOT EXISTS penalties_paid_idx         ON penalties(paid);

CREATE TABLE IF NOT EXISTS week_closures (
  week_start date PRIMARY KEY,
  closed_at  timestamptz NOT NULL DEFAULT now(),
  closed_by  text NOT NULL REFERENCES athletes(name)
);

ALTER TABLE penalty_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE penalties      ENABLE ROW LEVEL SECURITY;
ALTER TABLE week_closures  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY penalty_config_all ON penalty_config FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY penalties_all ON penalties FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY week_closures_all ON week_closures FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Payouts: separate Einzahlungs-Einträge (Ledger). Pot offen = Σ penalties − Σ payouts.
CREATE TABLE IF NOT EXISTS payouts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete      text NOT NULL REFERENCES athletes(name),
  amount_cents int  NOT NULL CHECK (amount_cents > 0),
  paid_at      timestamptz NOT NULL DEFAULT now(),
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payouts_paid_at_idx ON payouts(paid_at DESC);
CREATE INDEX IF NOT EXISTS payouts_athlete_idx ON payouts(athlete);

ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY payouts_all ON payouts FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
