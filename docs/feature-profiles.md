# Profiles and All members

Each member has a profile that other members see (PRD PRO-1 to PRO-4). Profiles are never public: they live in the Members area, which only current ticket holders and admins can open, and only current members' profiles open.

## Pages

| Address | What it is |
| --- | --- |
| `/members/people` | All members, A to Z by first name, from Community's **View all members**: search by name or keyword, the skills and interests members share, and everyone who lists themselves |
| `/members/people?keyword=…` | Everyone with that skill, interest or project keyword |
| `/members/people/:profileId` | A member's profile |
| `/members/profile` | The signed-in member's profile editor |
| `/members/settings` | Whether their profile shows their email, whether others can message them, and whether they're listed under All members |

The picture menu at the top right of every Members page (docs/feature-community.md) opens View Profile, Edit Profile and Settings. Names on Community and Updates posts and comments link to their profiles.

## The profile page

From the top:

- **Picture, name, headline, titles and business, location.** Titles (up to five) show joined with "·", followed by "at" and the business name when there is one. The business name is optional and hidden when blank. Members without a picture show their initials.
- **Buttons.** Message, when the member allows messages (disabled until messaging is built, PRD MSG-1); Email, only when the member ticked "Show my email address on my profile" (off by default); Visit website, for their first link set to Website. On their own profile, members see Edit your profile instead of Message.
- **Link icons.** Up to ten links, each with its platform's icon. Members pick the platform from a list and type an address, @handle or username; "Website (full URL)" takes any address and shows a globe. `app/lib/profile-links.ts` holds the platforms and turns what was typed into an https address, refusing addresses on another site for a named platform and anything that isn't http(s). The icons are Font Awesome Free paths copied into `app/lib/icons.ts`.
- **Skills and interests.** Typed freely; Enter or a comma makes each one a chip. They're stored with a lower-cased `key`, so "Permaculture" and "permaculture" are one keyword. Each chip opens All members filtered to that keyword.
- **Projects.** Up to five, each with a few comma-separated keywords (shown as chips that also filter All members) and a description.
- **Recent activity.** The member's ten latest posts and comments in Community and on Updates, linking to the post.

## Privacy choices

Settings holds all three choices: "Show my email address on my profile" (off by default, and also in the editor, where members fill in their profile), "Let members send me private messages" and "List me under All members" (both on by default, PRD PRO-3). Members who aren't listed still have a profile that opens from their name, for example beside a post. All members never shows emails (PRO-2).

## Data

New `profiles` columns: `headline`, `location`, `business_name`, `titles` and `show_email`. `profile_links`, `profile_keywords` and `profile_projects` hold the lists, each in the member's order. Saving the editor replaces the member's whole profile in one transaction, leaving Settings' choices alone. `app/lib/profiles.server.ts` reads and writes them, and `app/lib/profile-form.ts` checks the editor's form.
