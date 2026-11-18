-- Members' RSVPs to sessions (CAL-5 to CAL-7). RSVPs live only in the app; docs/feature-sessions.md
-- covers capacity, the waitlist and what happens when a session is unpublished. Like every table,
-- RLS is enabled with no policies.
create table public.session_rsvps (
  session_id uuid not null references public.sessions (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('registered', 'waitlisted')),
  created_at timestamptz not null default now(),
  primary key (session_id, profile_id)
);

alter table public.session_rsvps enable row level security;

-- My Schedule: a member's RSVPs.
create index session_rsvps_by_profile on public.session_rsvps (profile_id);
-- Promoting the earliest waitlisted RSVP when a place opens.
create index session_rsvps_waitlist on public.session_rsvps (session_id, created_at) where status = 'waitlisted';
