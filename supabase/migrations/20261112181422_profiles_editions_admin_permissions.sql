-- Server code reaches these tables through Hyperdrive, as a role that bypasses row-level
-- security, and checks permissions itself. Every table enables RLS with no policies, so the
-- Data API and any other client that connects as anon or authenticated read nothing.

-- One row per person, linked to their sign-in account. Accounts persist across editions.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text,
  last_name text,
  time_zone text,
  allow_messages boolean not null default true,
  show_in_directory boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- One row per Limicon year.
create table public.editions (
  id bigint generated always as identity primary key,
  year integer not null unique,
  starts_on date,
  ends_on date,
  registration_open boolean not null default false,
  calendar_open boolean not null default false,
  miro_url text,
  castalia_url text,
  created_at timestamptz not null default now(),
  constraint editions_dates_in_order check (starts_on is null or ends_on is null or ends_on >= starts_on)
);

alter table public.editions enable row level security;

-- Named admin permissions (AUTH-5). Permission names stay free text until the Organizing Team
-- settles which ones exist (PRD open question 2).
create table public.admin_permissions (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  permission text not null,
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (profile_id, permission)
);

alter table public.admin_permissions enable row level security;

-- Give every new account a profile, with the name Google supplies when there is one.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, first_name, last_name)
  values (
    new.id,
    new.raw_user_meta_data ->> 'given_name',
    new.raw_user_meta_data ->> 'family_name'
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
