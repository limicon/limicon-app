-- When each member last opened the Updates page, so the Members area can count posts they
-- haven't seen (docs/feature-updates.md). Like every table, RLS is enabled with no policies.
create table public.update_last_seen (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  seen_at timestamptz not null default now()
);

alter table public.update_last_seen enable row level security;
