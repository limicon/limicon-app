-- Replies and @mentions on Updates comments, notifications about them, and each member's email
-- notification choices (docs/feature-updates.md, docs/feature-profiles.md).

-- A reply belongs to a top-level comment, one level deep, as in Community.
alter table public.update_comments
  add column parent_id uuid references public.update_comments (id) on delete cascade,
  add column mentions jsonb not null default '[]';

create index update_comments_replies on public.update_comments (parent_id, created_at) where parent_id is not null;

-- A notification points at a Community post and comment, or at an Updates post and comment.
alter table public.notifications
  add column update_post_id uuid references public.update_posts (id) on delete cascade,
  add column update_comment_id uuid references public.update_comments (id) on delete cascade;

-- Whether a member wants notifications by email, and which: `update_post` (a new post on Updates),
-- `mention`, `reply`, `comment` (on their Community post) and `everyone`. New posts on Updates
-- are on by default; the rest wait for the member to choose them.
alter table public.profiles
  add column email_notifications boolean not null default true,
  add column email_notify text[] not null default '{update_post}'
    check (email_notify <@ array['update_post', 'mention', 'reply', 'comment', 'everyone']);
