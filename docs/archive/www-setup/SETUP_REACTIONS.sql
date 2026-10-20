-- Run this in your Supabase SQL editor to add the reactions feature.

create table if not exists reactions (
  id uuid primary key default gen_random_uuid(),
  set_id uuid references sets(id) on delete cascade not null,
  athlete text references athletes(name) not null,
  emoji text not null,
  created_at timestamptz default now(),
  unique (set_id, athlete, emoji)
);

create index if not exists reactions_set_idx on reactions(set_id);

alter table reactions enable row level security;

create policy "public read reactions" on reactions for select using (true);
create policy "public insert reactions" on reactions for insert with check (true);
create policy "public delete reactions" on reactions for delete using (true);

-- Add to realtime
alter publication supabase_realtime add table reactions;
