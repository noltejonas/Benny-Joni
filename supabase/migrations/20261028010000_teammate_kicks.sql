-- Freiwillige Arschkick-Mitteilungen. Erst diese Migration, dann die Function
-- kick-teammate deployen; keine Migration sendet selbst eine Mitteilung.
--
-- Rückbau: Function aus der App ausblenden, Edge Function entfernen, dann
-- reserve_teammate_kick(uuid, uuid, uuid), teammate_kick_delivery(uuid, uuid),
-- teammate_kicks und profiles.kick_enabled entfernen (verwirft Kick-Historie).

begin;

alter table public.profiles
  add column if not exists kick_enabled boolean not null default true;
grant update (kick_enabled) on public.profiles to authenticated;

create table if not exists public.teammate_kicks (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  day date not null,
  state text not null default 'reserved' check (state in ('reserved', 'sent', 'failed', 'cancelled')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  check (sender_id <> recipient_id)
);

-- Auch über mehrere gemeinsame Challenges nur ein Kick pro Paar und Tag.
-- Ein vor dem Versand abgebrochener Kick belegt keinen Tagesplatz.
create unique index if not exists teammate_kicks_pair_day_idx
  on public.teammate_kicks (sender_id, recipient_id, day)
  where state <> 'cancelled';
create index if not exists teammate_kicks_recipient_day_idx
  on public.teammate_kicks (recipient_id, day) where state <> 'cancelled';

alter table public.teammate_kicks enable row level security;
revoke all on public.teammate_kicks from anon, authenticated;
grant all on public.teammate_kicks to service_role;

-- Ausschließlich die Edge Function ruft diese RPCs mit dem bereits durch
-- auth.getUser verifizierten Sender auf. Clients können keine Tagesplätze
-- direkt reservieren oder den Sender fälschen.
create or replace function public.reserve_teammate_kick(
  p_competition uuid, p_recipient uuid, p_sender uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_local timestamp := now() at time zone 'Europe/Berlin';
  v_enabled boolean;
  v_request uuid;
begin
  if p_sender is null or p_recipient is null or p_competition is null
     or p_sender = p_recipient then
    return jsonb_build_object('reason', 'not_allowed');
  end if;

  -- Ein Empfänger-Lock serialisiert parallele Kicks und seinen Opt-out.
  -- Die Tagesobergrenze kann so auch von vielen Sendern nicht überholt werden.
  select p.kick_enabled into v_enabled from profiles p
    where p.id = p_recipient for update;
  if not found then return jsonb_build_object('reason', 'not_allowed'); end if;

  if not exists (
    select 1 from competitions c
    join competition_members s on s.competition_id = c.id and s.user_id = p_sender and s.left_at is null
    join competition_members r on r.competition_id = c.id and r.user_id = p_recipient and r.left_at is null
    where c.id = p_competition and c.archived_at is null
      and c.start_date <= v_local::date and (c.end_date is null or c.end_date >= v_local::date)
  ) then return jsonb_build_object('reason', 'not_allowed'); end if;

  if not v_enabled or exists (
    select 1 from user_blocks b
    where (b.blocker = p_recipient and b.blocked = p_sender)
       or (b.blocker = p_sender and b.blocked = p_recipient)
  ) then return jsonb_build_object('reason', 'disabled'); end if;

  if extract(hour from v_local) >= 22 or extract(hour from v_local) < 7 then
    return jsonb_build_object('reason', 'quiet_hours');
  end if;
  if not exists (select 1 from device_tokens d where d.user_id = p_recipient and d.platform = 'ios') then
    return jsonb_build_object('reason', 'no_device');
  end if;
  if exists (select 1 from teammate_kicks k where k.sender_id = p_sender
    and k.recipient_id = p_recipient and k.day = v_local::date and k.state <> 'cancelled') then
    return jsonb_build_object('reason', 'already_sent_today');
  end if;
  if (select count(*) from teammate_kicks k where k.recipient_id = p_recipient
    and k.day = v_local::date and k.state <> 'cancelled') >= 3 then
    return jsonb_build_object('reason', 'daily_limit');
  end if;

  insert into teammate_kicks (sender_id, recipient_id, competition_id, day)
    values (p_sender, p_recipient, p_competition, v_local::date)
    returning id into v_request;
  return jsonb_build_object('request_id', v_request);
end;
$$;

-- Erneute Prüfung unmittelbar vor APNs: Ein Opt-out, Austritt, Block oder
-- gelöschtes Geräte-Token zwischen Reservierung und Versand wird berücksichtigt.
create or replace function public.teammate_kick_delivery(p_request uuid, p_sender uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_kick teammate_kicks;
  v_context jsonb;
  v_local timestamp := now() at time zone 'Europe/Berlin';
begin
  select * into v_kick from teammate_kicks k
    where k.id = p_request and k.sender_id = p_sender and k.state = 'reserved'
      and k.created_at > now() - interval '5 minutes';
  if not found then return jsonb_build_object('reason', 'not_allowed'); end if;

  -- Eine Reservierung kurz vor 22 Uhr erlaubt keinen späteren Versand in der
  -- Ruhezeit. Auch ein inzwischen gewechselter Kalendertag braucht einen neuen
  -- Tagesplatz statt den alten zu verwenden.
  if v_kick.day <> v_local::date then
    return jsonb_build_object('reason', 'not_allowed');
  end if;
  if extract(hour from v_local) >= 22 or extract(hour from v_local) < 7 then
    return jsonb_build_object('reason', 'quiet_hours');
  end if;

  if not exists (
    select 1 from competitions c
    join competition_members s on s.competition_id = c.id and s.user_id = v_kick.sender_id and s.left_at is null
    join competition_members r on r.competition_id = c.id and r.user_id = v_kick.recipient_id and r.left_at is null
    where c.id = v_kick.competition_id and c.archived_at is null
      and c.start_date <= v_local::date
      and (c.end_date is null or c.end_date >= v_local::date)
  ) then return jsonb_build_object('reason', 'not_allowed'); end if;
  if not exists (select 1 from profiles p where p.id = v_kick.recipient_id and p.kick_enabled)
    or exists (select 1 from user_blocks b
      where (b.blocker = v_kick.recipient_id and b.blocked = v_kick.sender_id)
         or (b.blocker = v_kick.sender_id and b.blocked = v_kick.recipient_id)) then
    return jsonb_build_object('reason', 'disabled');
  end if;

  select jsonb_build_object(
    'request_id', k.id, 'sender_id', k.sender_id, 'competition_id', k.competition_id,
    'sender_name', s.display_name, 'competition_name', c.name, 'language', r.language,
    'tokens', coalesce((select jsonb_agg(d.token) from device_tokens d
      where d.user_id = k.recipient_id and d.platform = 'ios'), '[]'::jsonb)
  ) into v_context
  from teammate_kicks k
  join profiles s on s.id = k.sender_id
  join profiles r on r.id = k.recipient_id
  join competitions c on c.id = k.competition_id
  where k.id = p_request;
  return v_context;
end;
$$;

revoke execute on function public.reserve_teammate_kick(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.teammate_kick_delivery(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_teammate_kick(uuid, uuid, uuid) to service_role;
grant execute on function public.teammate_kick_delivery(uuid, uuid) to service_role;

commit;
