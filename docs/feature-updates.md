# Updates

The Members area's Updates page (`/members/updates`) works like a blog: the Organizing Team posts news, and members read, like and comment. Posts run newest first.

## Who can do what

| Who | Can |
| --- | --- |
| Every member (ticket holders and admins) | Read posts, like and unlike them, comment, edit and delete their own comments |
| Roles with the `updates` privilege ("Post updates to the website") | Also add posts, edit their own posts, upload images and files into posts, and see edited comments |
| Admin | Also edit and delete any post, and delete any comment |

Posters can't delete posts, matching the privilege's "add content but not remove it". The page checks each of these in its loader and action; nothing else reads the tables.

## Posts

People who can post see **+ Add new post** at the top of the page. A post has a title and a body written in the same rich text editor as the website's pages: formatting, headings, lists, links, images and files. **Start from** offers a blank post or a template; choosing one replaces what's written, after asking. Templates live in `POST_TEMPLATES` in `app/lib/updates.ts`. Newsletter is a placeholder until its layout is written.

## Likes and comments

Each post has a Like button with its count, and a small comment box underneath: type and press Enter or **Comment**. Comments stay folded away behind **View comments (n)**, which is hidden while a post has none. Comments are plain text, up to 2,000 characters.

## Edited comments

Members can edit their own comments, which then show "edited". Each edit is kept in `update_comment_edits` with the text before and after. Everyone who can post sees a notice at the top of Updates listing unreviewed edits, until one of them presses **Mark as seen**. Email notices can follow once the app sends email (`selection-email.md`).

## Code

- `app/routes/members/updates.tsx`: the page and its actions (like, comment, edit and delete comments, delete posts, mark edits seen).
- `app/routes/members/updates-new.tsx`, `updates-edit.tsx` and `app/components/update-post-form.tsx`: writing and editing posts.
- `app/lib/updates.ts` (form checks, templates) and `app/lib/updates.server.ts` (queries).
- `supabase/migrations/20261119070000_updates_posts.sql`: the tables.
