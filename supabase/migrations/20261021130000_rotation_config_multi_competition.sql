-- The legacy rotation config allowed only id = 1. Multi-user challenges each
-- need their own row; the existing UNIQUE (competition_id) remains in place.
-- The legacy constraint name differs from the one handled by migration A.
begin;

do $$
declare
  v_constraint record;
begin
  select c.contype, pg_catalog.pg_get_expr(c.conbin, c.conrelid) as expression
    into v_constraint
    from pg_catalog.pg_constraint c
   where c.conrelid = 'public.rotation_config'::regclass
     and c.conname = 'single_row';

  if found then
    if v_constraint.contype <> 'c'
       or pg_catalog.regexp_replace(
         pg_catalog.lower(v_constraint.expression), '[()[:space:]]', '', 'g'
       ) is distinct from 'id=1' then
      raise exception 'Unexpected rotation_config.single_row constraint; inspect before changing it';
    end if;

    alter table public.rotation_config drop constraint single_row;
  end if;
end;
$$;

commit;
