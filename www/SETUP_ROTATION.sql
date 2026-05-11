-- Run this in your Supabase SQL editor to add the rotation plan feature.

create table if not exists plan_slots (
  id uuid primary key default gen_random_uuid(),
  week_index int not null,           -- 0-based position in the rotation cycle
  category_id uuid references categories(id) on delete cascade,
  start_target int not null default 100,
  growth_pct numeric not null default 10,  -- % growth per completed cycle
  position int not null default 0,   -- ordering within the same week
  created_at timestamptz default now()
);

create table if not exists rotation_config (
  id int primary key default 1,
  start_date date,                   -- the Monday the plan starts applying
  enabled boolean default true,
  updated_at timestamptz default now()
);

-- Singleton row
insert into rotation_config (id, start_date, enabled)
  values (1, date_trunc('week', current_date)::date, true)
  on conflict (id) do nothing;

alter table plan_slots enable row level security;
alter table rotation_config enable row level security;

create policy "public read plan_slots" on plan_slots for select using (true);
create policy "public write plan_slots" on plan_slots for all using (true) with check (true);
create policy "public read rotation_config" on rotation_config for select using (true);
create policy "public write rotation_config" on rotation_config for all using (true) with check (true);

-- Add to realtime
alter publication supabase_realtime add table plan_slots;
alter publication supabase_realtime add table rotation_config;
