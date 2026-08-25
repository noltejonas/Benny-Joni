-- supabase/migrations/20260513000000_work_tags.sql

-- 1. Add kind discriminator to categories
ALTER TABLE categories ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'sports';
UPDATE categories SET kind = 'sports' WHERE kind IS NULL OR kind = '';

-- 2. project_tags table
CREATE TABLE IF NOT EXISTS project_tags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  emoji       text NOT NULL DEFAULT '📁',
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE project_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read project_tags"  ON project_tags FOR SELECT USING (true);
CREATE POLICY "public write project_tags" ON project_tags FOR INSERT WITH CHECK (true);
CREATE POLICY "public update project_tags" ON project_tags FOR UPDATE USING (true);
CREATE POLICY "public delete project_tags" ON project_tags FOR DELETE USING (true);

-- 3. tool_tags table
CREATE TABLE IF NOT EXISTS tool_tags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  emoji       text NOT NULL DEFAULT '🔧',
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE tool_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read tool_tags"  ON tool_tags FOR SELECT USING (true);
CREATE POLICY "public write tool_tags" ON tool_tags FOR INSERT WITH CHECK (true);
CREATE POLICY "public update tool_tags" ON tool_tags FOR UPDATE USING (true);
CREATE POLICY "public delete tool_tags" ON tool_tags FOR DELETE USING (true);

-- 4. Seed default tags
INSERT INTO project_tags (name, emoji) VALUES
  ('IBM', '🏢'),
  ('Bauerlieferant', '🚜'),
  ('FarmerOS', '🌱')
ON CONFLICT DO NOTHING;

INSERT INTO tool_tags (name, emoji) VALUES
  ('Claude Code', '🤖'),
  ('Codex', '⚡'),
  ('Bob', '🦾')
ON CONFLICT DO NOTHING;
