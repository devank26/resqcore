begin;

create table if not exists public.teams (
  id text primary key,
  name text not null unique,
  specialization text not null default 'Field Response',
  status text not null default 'Available',
  responders integer not null default 0 check (responders >= 0),
  task text,
  battery integer not null default 100 check (battery between 0 and 100),
  eta text,
  lat double precision,
  lng double precision,
  sector_id text,
  updated_at timestamptz not null default now()
);

create table if not exists public.sectors (
  id text primary key,
  theater text not null,
  name text not null,
  short_name text not null,
  color text not null default '#38BDF8',
  description text not null default '',
  center_lat double precision not null,
  center_lng double precision not null,
  bounds jsonb not null default '[]'::jsonb,
  status text not null default 'Active',
  alert_level text not null default 'Normal',
  created_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('command_admin', 'command_operator', 'rescue_team')),
  email text not null,
  team_id text references public.teams(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role),
  check ((role = 'rescue_team' and team_id is not null) or role <> 'rescue_team')
);

create table if not exists public.admin_bootstrap_allowlist (
  email text primary key,
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);

create table if not exists public.staff_invites (
  email text primary key,
  role text not null check (role in ('command_operator', 'rescue_team')),
  team_id text references public.teams(id) on delete set null,
  invited_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  check ((role = 'rescue_team' and team_id is not null) or role = 'command_operator')
);

create table if not exists public.incidents (
  id text primary key,
  title text not null,
  type text not null default 'General',
  location text not null,
  full_address text not null default '',
  short_location text not null default '',
  area text not null default '',
  affected integer not null default 1 check (affected >= 0),
  severity text not null default 'Medium',
  status text not null default 'Pending',
  response_summary text not null default '',
  response_detail text not null default '',
  description text not null default '',
  field_report text not null default '',
  contact_number text not null default '',
  citizen_name text not null default '',
  assigned_team text,
  team_id text references public.teams(id) on delete set null,
  eta text,
  substatus text not null default '',
  coordinates jsonb not null default '{}'::jsonb,
  sector_id text references public.sectors(id) on delete set null,
  is_citizen_sos boolean not null default false,
  is_rescue_sos boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.incident_tracking_tokens (
  incident_id text primary key references public.incidents(id) on delete cascade,
  nonce text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);

create table if not exists public.sos_rate_limits (
  ip_hash text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 1 check (request_count > 0)
);

create table if not exists public.messages (
  id text primary key,
  channel_id text not null default 'command:all',
  sender text not null,
  role text not null,
  initials text not null default 'HQ',
  is_self boolean not null default false,
  text text not null check (length(text) between 1 and 4000),
  location_tag text not null default '',
  attachment_url text,
  is_alert boolean not null default false,
  team_id text references public.teams(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.alerts (
  id text primary key,
  title text not null,
  code text not null default '',
  subtitle text not null default '',
  severity text not null default 'Info',
  recipients text not null default 'All active units',
  issued_by text not null default 'Command Center',
  sector_id text references public.sectors(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.public_alerts (
  id text primary key references public.alerts(id) on delete cascade,
  title text not null,
  message text not null,
  severity text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.shelters (
  id text primary key,
  name text not null,
  location text not null default '',
  capacity integer not null default 100 check (capacity >= 0),
  occupied integer not null default 0 check (occupied >= 0 and occupied <= capacity),
  lat double precision,
  lng double precision,
  sector_id text references public.sectors(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.volunteers (
  id text primary key,
  name text not null,
  phone text not null default '',
  email text not null default '',
  skills jsonb not null default '[]'::jsonb,
  sector_id text references public.sectors(id) on delete set null,
  status text not null default 'Available',
  lat double precision,
  lng double precision,
  team_id text references public.teams(id) on delete set null,
  registered_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create table if not exists public.telemetry (
  id bigint generated always as identity primary key,
  team_id text not null references public.teams(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  battery integer not null default 100 check (battery between 0 and 100),
  signal text not null default 'Strong',
  status text not null default 'Deployed',
  altitude double precision,
  speed double precision,
  heading double precision,
  recorded_at timestamptz not null default now()
);

create table if not exists public.sos_events (
  id text primary key,
  team_id text references public.teams(id) on delete set null,
  team_name text not null default '',
  operator_name text not null default '',
  lat double precision,
  lng double precision,
  location_text text not null default '',
  notes text not null default '',
  severity text not null default 'Critical',
  resolved boolean not null default false,
  incident_id text references public.incidents(id) on delete set null,
  triggered_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists incidents_status_created_idx on public.incidents(status, created_at desc);
create index if not exists incidents_team_created_idx on public.incidents(team_id, created_at desc);
create index if not exists messages_channel_created_idx on public.messages(channel_id, created_at);
create index if not exists telemetry_team_recorded_idx on public.telemetry(team_id, recorded_at desc);
create index if not exists volunteers_sector_status_idx on public.volunteers(sector_id, status);
create index if not exists sos_events_active_idx on public.sos_events(resolved, triggered_at desc);

create or replace function public.has_any_role(p_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid()) and ur.role = any (p_roles)
  );
$$;

create or replace function public.has_team_access(p_team_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid()) and ur.role = 'rescue_team' and ur.team_id = p_team_id
  );
$$;

create or replace function public.can_read_incident_tracking()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.incident_tracking_tokens t
    where t.incident_id = ((select auth.jwt()) ->> 'incident_id')
      and t.token_hash = ((select auth.jwt()) ->> 'tracking_token_hash')
      and t.expires_at > now()
  );
$$;

create or replace function public.allow_public_sos(p_ip_hash text)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare
  v_count integer;
begin
  insert into public.sos_rate_limits (ip_hash, window_started_at, request_count)
  values (p_ip_hash, now(), 1)
  on conflict (ip_hash) do update
    set window_started_at = case
          when public.sos_rate_limits.window_started_at < now() - interval '5 minutes' then now()
          else public.sos_rate_limits.window_started_at
        end,
        request_count = case
          when public.sos_rate_limits.window_started_at < now() - interval '5 minutes' then 1
          else public.sos_rate_limits.request_count + 1
        end
  returning request_count into v_count;

  return v_count <= 5;
end;
$$;

create or replace function public.bootstrap_verified_staff_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
  v_invite public.staff_invites%rowtype;
begin
  if new.email_confirmed_at is null or new.email is null then return new; end if;
  v_email := lower(new.email);

  if exists (select 1 from public.admin_bootstrap_allowlist a where lower(a.email) = v_email and a.claimed_at is null)
     and not exists (select 1 from public.user_roles r where r.role = 'command_admin') then
    insert into public.user_roles (user_id, role, email) values (new.id, 'command_admin', v_email)
    on conflict (user_id, role) do nothing;
    update public.admin_bootstrap_allowlist set claimed_at = now() where lower(email) = v_email and claimed_at is null;
    return new;
  end if;

  select * into v_invite from public.staff_invites i where lower(i.email) = v_email and i.accepted_at is null limit 1;
  if found then
    insert into public.user_roles (user_id, role, email, team_id)
    values (new.id, v_invite.role, v_email, v_invite.team_id)
    on conflict (user_id, role) do update set email = excluded.email, team_id = excluded.team_id;
    update public.staff_invites set accepted_at = now() where lower(email) = v_email;
  end if;
  return new;
end;
$$;

alter table public.teams enable row level security;
alter table public.sectors enable row level security;
alter table public.user_roles enable row level security;
alter table public.admin_bootstrap_allowlist enable row level security;
alter table public.staff_invites enable row level security;
alter table public.incidents enable row level security;
alter table public.incident_tracking_tokens enable row level security;
alter table public.messages enable row level security;
alter table public.alerts enable row level security;
alter table public.public_alerts enable row level security;
alter table public.shelters enable row level security;
alter table public.volunteers enable row level security;
alter table public.telemetry enable row level security;
alter table public.sos_events enable row level security;

revoke all on public.teams, public.sectors, public.user_roles, public.admin_bootstrap_allowlist,
  public.staff_invites, public.incidents, public.incident_tracking_tokens, public.messages,
  public.alerts, public.public_alerts, public.shelters, public.volunteers, public.telemetry,
  public.sos_events, public.sos_rate_limits
from anon, authenticated;
alter table public.sos_rate_limits enable row level security;
grant select on public.teams, public.sectors, public.user_roles, public.incidents,
  public.messages, public.alerts, public.shelters, public.volunteers, public.telemetry, public.sos_events to authenticated;
grant select on public.public_alerts to anon, authenticated;
grant select, insert, update, delete on public.staff_invites to authenticated;
grant usage, select on sequence public.telemetry_id_seq to service_role;

create policy user_roles_self_or_admin_read on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_any_role(array['command_admin'])));
create policy user_roles_admin_manage on public.user_roles for all to authenticated
  using ((select public.has_any_role(array['command_admin']))) with check ((select public.has_any_role(array['command_admin'])));
create policy staff_invites_admin_manage on public.staff_invites for all to authenticated
  using ((select public.has_any_role(array['command_admin']))) with check ((select public.has_any_role(array['command_admin'])));
create policy incidents_staff_read on public.incidents for select to authenticated
  using ((select public.has_any_role(array['command_admin', 'command_operator'])) or (team_id is not null and (select public.has_team_access(team_id))));
create policy messages_staff_read on public.messages for select to authenticated
  using ((select public.has_any_role(array['command_admin', 'command_operator'])) or (team_id is not null and (select public.has_team_access(team_id))));
create policy alerts_staff_read on public.alerts for select to authenticated
  using ((select public.has_any_role(array['command_admin', 'command_operator', 'rescue_team'])));
create policy public_alerts_public_read on public.public_alerts for select to anon, authenticated using (true);
create policy teams_staff_read on public.teams for select to authenticated
  using ((select public.has_any_role(array['command_admin', 'command_operator'])) or (select public.has_team_access(id)));
create policy sectors_staff_read on public.sectors for select to authenticated
  using ((select public.has_any_role(array['command_admin', 'command_operator', 'rescue_team'])));
create policy shelters_staff_read on public.shelters for select to authenticated
  using ((select public.has_any_role(array['command_admin', 'command_operator', 'rescue_team'])));
create policy volunteers_staff_read on public.volunteers for select to authenticated
  using ((select public.has_any_role(array['command_admin', 'command_operator'])) or (team_id is not null and (select public.has_team_access(team_id))));
create policy telemetry_staff_read on public.telemetry for select to authenticated
  using ((select public.has_any_role(array['command_admin', 'command_operator'])) or (select public.has_team_access(team_id)));
create policy sos_events_staff_read on public.sos_events for select to authenticated
  using ((select public.has_any_role(array['command_admin', 'command_operator'])) or (team_id is not null and (select public.has_team_access(team_id))));

create policy realtime_command_channel_read on realtime.messages for select to authenticated
  using (extension = 'broadcast' and (select realtime.topic()) = 'command:all' and (select public.has_any_role(array['command_admin', 'command_operator'])));
create policy realtime_team_channel_read on realtime.messages for select to authenticated
  using (extension = 'broadcast' and (select realtime.topic()) like 'team:%' and ((select public.has_any_role(array['command_admin', 'command_operator'])) or (select public.has_team_access(split_part((select realtime.topic()), ':', 2)))));
create policy realtime_citizen_tracking_read on realtime.messages for select to anon
  using (
    extension = 'broadcast'
    and (select realtime.topic()) = 'citizen:' || coalesce(((select auth.jwt()) ->> 'incident_id'), '')
    and (select public.can_read_incident_tracking())
  );

create trigger auth_user_insert_bootstrap after insert on auth.users
  for each row execute function public.bootstrap_verified_staff_user();
create trigger auth_user_confirmation_bootstrap after update of email_confirmed_at on auth.users
  for each row when (new.email_confirmed_at is not null)
  execute function public.bootstrap_verified_staff_user();

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'public_alerts') then
    execute 'alter publication supabase_realtime add table public.public_alerts';
  end if;
end;
$$;

revoke all on function public.has_any_role(text[]) from public, anon;
revoke all on function public.has_team_access(text) from public, anon;
revoke all on function public.can_read_incident_tracking() from public, authenticated;
revoke all on function public.allow_public_sos(text) from public, anon, authenticated;
grant execute on function public.has_any_role(text[]) to authenticated;
grant execute on function public.has_team_access(text) to authenticated;
grant execute on function public.can_read_incident_tracking() to anon;
grant execute on function public.allow_public_sos(text) to service_role;

commit;
