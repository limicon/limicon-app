-- Who was removed from which admin role, by whom, when and why (docs/feature-admin-console.md).
-- The role's name is copied at removal so the record still reads after the role is renamed or
-- deleted. Like every table, RLS is enabled with no policies.
create table public.admin_role_removals (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role_key text not null,
  role_name text not null,
  removed_by uuid references public.profiles (id) on delete set null,
  reason text not null check (length(trim(reason)) between 1 and 300),
  removed_at timestamptz not null default now()
);

create index admin_role_removals_profile on public.admin_role_removals (profile_id, removed_at desc);

alter table public.admin_role_removals enable row level security;
