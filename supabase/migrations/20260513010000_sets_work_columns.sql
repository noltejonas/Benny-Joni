-- supabase/migrations/20260513010000_sets_work_columns.sql

ALTER TABLE sets
  ADD COLUMN IF NOT EXISTS duration_minutes integer,
  ADD COLUMN IF NOT EXISTS project_tag_id   uuid REFERENCES project_tags(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tool_tag_id      uuid REFERENCES tool_tags(id)    ON DELETE SET NULL;
