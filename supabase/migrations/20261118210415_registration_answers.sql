-- Answers to the registration questions (REG-2). A person answers once per edition, before they
-- pay, so answers belong to the profile and edition rather than to a ticket. The questions live in
-- app/lib/registration-form.ts and are named by a stable key, so their wording can change without
-- touching stored answers. Like every table, RLS is enabled with no policies.
create table public.registration_answers (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  edition_id bigint not null references public.editions (id) on delete cascade,
  question text not null,
  answer text not null,
  -- When this answer was first given. For agreements it is the time the person agreed.
  answered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (profile_id, edition_id, question)
);

alter table public.registration_answers enable row level security;
