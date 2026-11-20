-- Community @mentions, replies to comments, and members' notifications
-- (docs/feature-community.md). Like every table, RLS is enabled with no policies.

-- Who a post or comment mentions: [{"id": <profile id or "everyone">, "name": <name as written>}].
-- The text keeps "@Name", and pages link each one to its profile.
alter table public.community_posts add column mentions jsonb not null default '[]';
alter table public.community_comments add column mentions jsonb not null default '[]';

-- A reply belongs to a top-level comment, one level deep, as on Facebook.
alter table public.community_comments
  add column parent_id uuid references public.community_comments (id) on delete cascade;

create index community_comments_replies on public.community_comments (parent_id, created_at) where parent_id is not null;

-- One row per thing a member is told about. Deleting the post or comment removes it.
create table public.notifications (
  id bigint generated always as identity primary key,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete cascade,
  -- mention: named them; everyone: an admin's @everyone; comment: on their post; reply: to their comment.
  kind text not null check (kind in ('mention', 'everyone', 'comment', 'reply')),
  post_id uuid references public.community_posts (id) on delete cascade,
  comment_id uuid references public.community_comments (id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

alter table public.notifications enable row level security;

create index notifications_by_recipient on public.notifications (recipient_id, created_at desc);
create index notifications_unread on public.notifications (recipient_id) where read_at is null;
