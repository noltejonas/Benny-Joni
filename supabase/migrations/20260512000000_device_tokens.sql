-- Push notification device tokens (APNs etc.)
create table if not exists device_tokens (
  token text primary key,
  athlete text references athletes(name) not null,
  platform text not null check (platform in ('ios','web')),
  last_seen timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists device_tokens_athlete_idx on device_tokens(athlete);

alter table device_tokens enable row level security;

create policy "public read device_tokens" on device_tokens
  for select using (true);
create policy "public insert device_tokens" on device_tokens
  for insert with check (true);
create policy "public update device_tokens" on device_tokens
  for update using (true);
create policy "public delete device_tokens" on device_tokens
  for delete using (true);
