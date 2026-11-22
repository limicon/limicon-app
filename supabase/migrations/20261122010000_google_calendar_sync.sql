-- Google Calendar sync (docs/feature-calendaring.md → Google Calendar). Published sessions are
-- copied to the public Limicon Schedule calendar, and each member going to a session gets a Google
-- invite for it. The app syncs from state: triggers queue a session whenever anything that shapes
-- its calendar events changes, and the sync compares what each event should hold with what was
-- last sent. Like every table, RLS is enabled with no policies.

-- Sessions waiting to be synced. No foreign key, so a deleted session stays queued until its events
-- are removed.
create table public.calendar_sync_queue (
  session_id uuid primary key,
  queued_at timestamptz not null default now(),
  -- A sync run holds the row until then, so two runs don't sync one session at once.
  claimed_until timestamptz,
  attempts integer not null default 0,
  last_error text
);

alter table public.calendar_sync_queue enable row level security;

-- What the app last sent Google for each session: one row for its event on the Limicon Schedule
-- calendar (profile_id null), and one per member holding an invite. `content_hash` covers what the
-- event says, so a sync updates only events whose content changed. No foreign keys, so the app can
-- still cancel invites after a session or profile is deleted.
create table public.calendar_events (
  session_id uuid not null,
  profile_id uuid,
  email text,
  content_hash text not null,
  synced_at timestamptz not null default now()
);

alter table public.calendar_events enable row level security;

create unique index calendar_events_one_per_member
  on public.calendar_events (session_id, coalesce(profile_id, '00000000-0000-0000-0000-000000000000'::uuid));

create function public.queue_calendar_sync(session uuid) returns void
language sql as $$
  insert into public.calendar_sync_queue (session_id) values (session)
  on conflict (session_id) do update set queued_at = now(), attempts = 0, last_error = null;
$$;

create function public.queue_calendar_sync_for_row() returns trigger
language plpgsql as $$
begin
  if tg_table_name = 'sessions' then
    perform public.queue_calendar_sync(coalesce(new.id, old.id));
  else
    perform public.queue_calendar_sync(coalesce(new.session_id, old.session_id));
    if tg_op = 'UPDATE' and new.session_id <> old.session_id then
      perform public.queue_calendar_sync(old.session_id);
    end if;
  end if;
  return null;
end;
$$;

create trigger sessions_queue_calendar_sync
  after insert or update or delete on public.sessions
  for each row execute function public.queue_calendar_sync_for_row();

create trigger session_rsvps_queue_calendar_sync
  after insert or update or delete on public.session_rsvps
  for each row execute function public.queue_calendar_sync_for_row();

create trigger session_hosts_queue_calendar_sync
  after insert or update or delete on public.session_hosts
  for each row execute function public.queue_calendar_sync_for_row();

-- A name shows on the Limicon Schedule calendar as a host, and deactivating a member cancels
-- their invites, so both requeue the member's sessions.
create function public.queue_calendar_sync_for_profile() returns trigger
language plpgsql as $$
begin
  insert into public.calendar_sync_queue (session_id)
  select session_id from public.session_hosts where profile_id = new.id
  union
  select session_id from public.session_rsvps where profile_id = new.id
  on conflict (session_id) do update set queued_at = now(), attempts = 0, last_error = null;
  return null;
end;
$$;

create trigger profiles_queue_calendar_sync
  after update of first_name, last_name, deactivated_at on public.profiles
  for each row
  when (
    old.first_name is distinct from new.first_name
    or old.last_name is distinct from new.last_name
    or old.deactivated_at is distinct from new.deactivated_at
  )
  execute function public.queue_calendar_sync_for_profile();

-- Sessions published before the sync existed.
insert into public.calendar_sync_queue (session_id)
select id from public.sessions where published
on conflict do nothing;
