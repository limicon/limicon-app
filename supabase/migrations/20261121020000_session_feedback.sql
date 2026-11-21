-- Feedback after a session ends: the Session Host Feedback form, which each host and co-host
-- fills in, and the Session Harvest form, which each registered participant fills in.
-- docs/feature-sessions.md covers who gets which form and when. One row per person per session;
-- people can come back and edit their answers. Like every table, RLS is enabled with no policies.

create table public.host_feedback (
  session_id uuid not null references public.sessions (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  participant_count integer check (participant_count between 0 and 100000),
  -- "What was the experience like?": keys from app/lib/feedback.ts, plus free text for Other.
  experience text[] not null check (experience <> '{}' or experience_other is not null),
  experience_other text check (char_length(experience_other) <= 500),
  how_it_went text check (char_length(how_it_went) <= 10000),
  organizer_feedback text check (char_length(organizer_feedback) <= 10000),
  had_tensions boolean not null,
  tensions text[] not null default '{}',
  tensions_other text check (char_length(tensions_other) <= 500),
  tensions_description text check (char_length(tensions_description) <= 10000),
  -- Whether the host wants the Organizing Team to email them about the tensions.
  wants_support boolean,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (session_id, profile_id),
  constraint host_feedback_tension_answers check (
    case when had_tensions
      then (tensions <> '{}' or tensions_other is not null) and wants_support is not null
      else tensions = '{}' and tensions_other is null and tensions_description is null and wants_support is null
    end
  )
);

alter table public.host_feedback enable row level security;

create index host_feedback_by_profile on public.host_feedback (profile_id);

create table public.session_harvests (
  session_id uuid not null references public.sessions (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  takeaway text check (char_length(takeaway) <= 10000),
  feed_back text check (char_length(feed_back) <= 10000),
  attracted_repelled text check (char_length(attracted_repelled) <= 10000),
  one_word text check (char_length(one_word) <= 60),
  -- A recorded or uploaded voice note in the media bucket, served only to its author and admins.
  voice_note_key text check (voice_note_key ~ '^voice/[0-9a-f-]{36}\.(webm|m4a|ogg|mp3|wav)$'),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (session_id, profile_id)
);

alter table public.session_harvests enable row level security;

create index session_harvests_by_profile on public.session_harvests (profile_id);
