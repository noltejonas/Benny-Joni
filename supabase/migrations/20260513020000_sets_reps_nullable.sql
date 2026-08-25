-- Allow reps to be NULL for work sessions (which use duration_minutes instead)
ALTER TABLE sets ALTER COLUMN reps DROP NOT NULL;
