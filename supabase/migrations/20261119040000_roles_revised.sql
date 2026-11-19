-- Revised admin roles (AUTH-5). The built-in role is now Admin, with every privilege, and people
-- may hold several roles, whose privileges add up. Bookkeeper is the first role with a single
-- privilege. app/lib/admin-roles.ts lists the privileges.

update public.admin_roles
set name = 'Admin', privileges = '{admin,orders,settings,inbox,email,website,updates}'
where key = 'full';

-- Keep only privileges that still exist on any other role.
update public.admin_roles
set privileges = array(
  select p from unnest(privileges) p where p in ('orders', 'settings', 'inbox', 'email', 'website', 'updates')
)
where not built_in;

insert into public.admin_roles (key, name, privileges)
values ('bookkeeper', 'Bookkeeper', '{orders}')
on conflict (key) do nothing;

-- Several roles per person, and per invited address.
drop index public.admin_permissions_one_role;
drop index public.admin_invitations_one_role;
