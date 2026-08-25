-- Performance indexes for work tracking columns
CREATE INDEX IF NOT EXISTS sets_project_tag_id_idx ON sets(project_tag_id);
CREATE INDEX IF NOT EXISTS sets_tool_tag_id_idx ON sets(tool_tag_id);
CREATE INDEX IF NOT EXISTS categories_kind_idx ON categories(kind);

-- Fix ON CONFLICT in seeds to use explicit unique index
CREATE UNIQUE INDEX IF NOT EXISTS project_tags_name_idx ON project_tags(name);
CREATE UNIQUE INDEX IF NOT EXISTS tool_tags_name_idx ON tool_tags(name);
