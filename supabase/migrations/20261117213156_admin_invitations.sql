-- Admin access granted by email before the person has an account. The first time someone signs
-- in with an invited address, their new account gets the invited permissions and the invitations
-- are used up. Addresses live only in the database, never in the repository.
create table public.admin_invitations (
  email text not null check (email = lower(email)),
  permission text not null,
  invited_by uuid references public.profiles (id) on delete set null,
  invited_at timestamptz not null default now(),
  primary key (email, permission)
);

alter table public.admin_invitations enable row level security;

-- Give every new account a profile, with the name Google supplies when there is one, and turn
-- any admin invitations for its email address into permissions.
create or replace function public.handle_new_user()
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

  with used as (
    delete from public.admin_invitations
    where email = lower(new.email)
    returning permission, invited_by
  )
  insert into public.admin_permissions (profile_id, permission, granted_by)
  select new.id, permission, invited_by from used;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
