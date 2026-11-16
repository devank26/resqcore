begin;

create table public.incident_tracking_updates (
  incident_id text primary key references public.incidents(id) on delete cascade,
  status text not null,
  assigned_team text,
  eta text,
  response_summary text not null default '',
  response_detail text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.incident_tracking_updates enable row level security;
revoke all on public.incident_tracking_updates from anon, authenticated;
grant select on public.incident_tracking_updates to anon, authenticated;

create policy incident_tracking_owner_read on public.incident_tracking_updates
  for select to anon
  using ((select public.can_read_incident_tracking()));

create policy incident_tracking_staff_read on public.incident_tracking_updates
  for select to authenticated
  using (
    (select public.has_any_role(array['command_admin', 'command_operator']))
    or exists (
      select 1 from public.incidents i
      where i.id = incident_id
        and i.team_id is not null
        and (select public.has_team_access(i.team_id))
    )
  );

create or replace function public.sync_incident_tracking_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.incident_tracking_updates (
    incident_id, status, assigned_team, eta, response_summary, response_detail, updated_at
  ) values (
    new.id, new.status, new.assigned_team, new.eta,
    new.response_summary, new.response_detail, coalesce(new.updated_at, now())
  )
  on conflict (incident_id) do update set
    status = excluded.status,
    assigned_team = excluded.assigned_team,
    eta = excluded.eta,
    response_summary = excluded.response_summary,
    response_detail = excluded.response_detail,
    updated_at = excluded.updated_at;

  return new;
end;
$$;

create trigger incidents_sync_tracking_update
  after insert or update on public.incidents
  for each row execute function public.sync_incident_tracking_update();

revoke all on function public.sync_incident_tracking_update() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'incident_tracking_updates'
  ) then
    execute 'alter publication supabase_realtime add table public.incident_tracking_updates';
  end if;
end;
$$;

commit;
