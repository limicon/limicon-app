-- Admin roles (AUTH-5): named sets of privileges that admins define in the console. A person holds
-- at most one role; holding any opens the console and the Members area. Like every table, RLS is
-- enabled with no policies.
create table public.admin_roles (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  name text not null unique check (char_length(name) between 1 and 60),
  -- What the role may do; app/lib/admin-roles.ts lists the privileges. The built-in Full access
  -- role always has every privilege, including ones added later, whatever is stored here.
  privileges text[] not null default '{}',
  built_in boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.admin_roles enable row level security;

insert into public.admin_roles (key, name, privileges, built_in)
values ('full', 'Full access', '{settings,people,orders,sessions,website,roles}', true);

-- Any role name already granted or invited becomes a role, so the constraints below hold.
insert into public.admin_roles (key, name, privileges)
select distinct permission, initcap(replace(permission, '_', ' ')), '{}'::text[]
from (select permission from public.admin_permissions union select permission from public.admin_invitations) used
where permission not in (select key from public.admin_roles) and permission ~ '^[a-z][a-z0-9_]{0,39}$';

-- admin_permissions.permission and admin_invitations.permission now name a role.
alter table public.admin_permissions
  add constraint admin_permissions_role foreign key (permission) references public.admin_roles (key) on update cascade;
alter table public.admin_invitations
  add constraint admin_invitations_role foreign key (permission) references public.admin_roles (key) on update cascade;

-- One role per person, and per invited address.
create unique index admin_permissions_one_role on public.admin_permissions (profile_id);
create unique index admin_invitations_one_role on public.admin_invitations (email);
