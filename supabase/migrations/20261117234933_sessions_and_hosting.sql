-- Hosting sessions (SES-1 to SES-10). Like every table, RLS is enabled with no policies; server
-- code reads and writes them through Hyperdrive and checks who may do what.

-- A session or Organizing Team co-creation meeting. A session is either unpublished (a draft,
-- seen only by its hosts and admins) or published (on the calendar); docs/feature-sessions.md
-- covers the lifecycle. Times are instants, with the zone the host entered them in.
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  edition_id bigint not null references public.editions (id),
  title text not null check (char_length(title) between 1 and 60),
  description text,
  intention text,
  theme text,
  -- One or more of the session types hosts know from limicon.org; sessions including
  -- 'in_person' have a city and venue note instead of a meeting link.
  session_types text[] not null default '{}' check (session_types <@ array[
    'presentation', 'dialog', 'collaborating', 'meta', 'practice', 'connecting', 'fun', 'in_person'
  ]),
  -- Participant experience flags, such as 'breakouts' or 'kid_friendly'.
  experience text[] not null default '{}',
  city text,
  venue_note text,
  starts_at timestamptz,
  ends_at timestamptz,
  time_zone text not null,
  meeting_link text,
  max_participants integer check (max_participants > 0),
  waitlist_enabled boolean not null default false,
  -- 'private' means not recorded; the others say who a recording is shared with.
  privacy text not null default 'members'
    check (privacy in ('private', 'participants', 'members', 'public')),
  ai_assistant_allowed boolean not null default false,
  ai_permissions text[] not null default '{}',
  is_cocreation_meeting boolean not null default false,
  published boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sessions_times_together check ((starts_at is null) = (ends_at is null)),
  constraint sessions_at_least_15_minutes check (ends_at >= starts_at + interval '15 minutes'),
  -- What publishing needs (SES-6); drafts may leave these empty.
  constraint sessions_published_complete check (
    not published
    or (theme is not null and session_types <> '{}' and starts_at is not null)
  ),
  constraint sessions_ai_permissions_need_assistant check (
    ai_assistant_allowed or ai_permissions = '{}'
  )
);

alter table public.sessions enable row level security;

create index sessions_by_start on public.sessions (edition_id, starts_at) where published;

-- Who hosts a session. The creator is the host; co-hosts (SES-5) can edit it too.
create table public.session_hosts (
  session_id uuid not null references public.sessions (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('host', 'co-host')),
  primary key (session_id, profile_id)
);

alter table public.session_hosts enable row level security;

create index session_hosts_by_profile on public.session_hosts (profile_id);

-- A host's acceptance of the host guidelines, once per edition (SES-2).
create table public.host_guideline_acceptances (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  edition_id bigint not null references public.editions (id) on delete cascade,
  accepted_at timestamptz not null default now(),
  primary key (profile_id, edition_id)
);

alter table public.host_guideline_acceptances enable row level security;
