# Community

The Members area's Community page (`/members/community`) works like a Facebook group for Limicon: any member posts, and everyone likes and comments. It opens with the Limicon logo and a **View all members** button, then a search bar, a box for writing a post, and everyone's posts, newest first.

## Who can do what

| Who | Can |
| --- | --- |
| Every member (ticket holders and admins) | Post, with an optional photo; like; comment and reply; @mention members; edit and delete their own posts and comments |
| Roles with the `admin` privilege | Also tag @everyone, and delete anyone's post or comment |

The page checks each of these in its action; `app/lib/community.server.ts` touches a member's own rows only, unless the caller says they moderate.

## Posts

Posts are plain text up to 5,000 characters, with line breaks kept, and an optional photo uploaded through `/upload/photo`. Comments are plain text up to 2,000 characters. Edited posts and comments say "edited". The feed shows 30 posts at a time, with **Older posts** below. A post's time links to that post alone (`?post=<id>`), which is where profiles' Recent activity points.

## Replies

Every comment has **Reply**. Replies sit under the comment they answer, one level deep as on Facebook: replying to a reply joins the same thread. The reply box starts with "@Name" of the person being answered, so they're mentioned.

## @mentions

Typing "@" and part of a name suggests current members (names and pictures only, from `/members/community/mentions`); arrow keys and Enter or a click choose one, which writes "@Full Name". The text keeps "@Name", and each post and comment stores who its names are in `mentions` (`app/lib/mentions.ts`), so pages link each name to its profile. The server keeps only current members whose "@Name" is still in the text.

Admins also get **@everyone**, which tags every current member. When anyone else writes "@everyone", the post or comment isn't saved and they're told only admins can use it.

## Notifications

A bell beside the member's picture, top right of every Members page, shows "(n)" for notifications they haven't seen, and opens `/members/notifications`. Members are told when someone:

- mentions them in a post or comment,
- tags @everyone,
- comments on their post (the post's author is notified automatically, without being typed in), or
- replies to their comment.

Each person gets one notification per post or comment, for the most specific reason (a mention, then a reply, then a comment on their post, then @everyone), and never for their own. Editing a post or comment notifies only people newly mentioned. Opening the Notifications page marks them all read; new ones stay highlighted that once. Each links to its post, scrolled to the comment. Deleting a post or comment removes its notifications.

## Search

The search bar (`?q=`) finds posts whose text, comments or author's name contain the words, ignoring case, and opens their comments.

## All members

**View all members** opens `/members/people`, everyone A to Z by first name, with a search bar for names and skill, interest or project keywords. docs/feature-profiles.md covers it and the profiles it links to.

## The profile menu

Every Members page shows the member's picture (or initials) in the top right, beside the bell. Choosing it opens **View Profile**, **Edit Profile** and **Settings** (`/members/settings`), where members choose whether their profile shows their email, whether others can message them and whether they're listed under All members.
