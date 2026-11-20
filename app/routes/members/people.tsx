import { Form, Link } from "react-router";

import { card, inputClass, primaryButton, secondaryButton } from "~/components/admin-ui";
import { Avatar, KeywordChip } from "~/components/profile-ui";
import { servicesContext } from "~/context";
import { listDirectory, listPopularKeywords } from "~/lib/profiles.server";
import type { Route } from "./+types/people";

export function meta({}: Route.MetaArgs) {
  return [{ title: "All members · Community · Members · Limicon" }];
}

/** Members who list themselves, searchable by name and keyword. Emails never appear here (PRD PRO-2). */
export async function loader({ request, context }: Route.LoaderArgs) {
  const services = context.get(servicesContext);
  const db = services.db();
  const url = new URL(request.url);
  const keyword = url.searchParams.get("keyword")?.trim().slice(0, 150) || null;
  const query = url.searchParams.get("q")?.trim().slice(0, 100) || null;
  const [members, keywords] = await Promise.all([listDirectory(db, { keyword, query }), listPopularKeywords(db)]);
  return { members, keywords, keyword, query, userId: services.viewer!.userId };
}

export default function People({ loaderData }: Route.ComponentProps) {
  const { members, keywords, keyword, query, userId } = loaderData;
  const filtered = Boolean(keyword || query);

  return (
    <div className="max-w-5xl">
      <Link to="/members/community" className="text-sm underline">← Back to Community</Link>
      <header className="mt-3 mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">All members</h1>
          <p className="mt-2 max-w-[68ch]">Everyone in Limicon, A to Z. Search by name or by a skill, interest or project keyword.</p>
        </div>
        <Link to={`/members/people/${userId}`} className={secondaryButton}>Your profile</Link>
      </header>

      <Form method="get" role="search" className="flex max-w-xl flex-wrap gap-2">
        <label htmlFor="q" className="sr-only">Search members</label>
        <input id="q" name="q" type="search" defaultValue={query ?? ""} placeholder="Search by name or keyword" className={`${inputClass} min-w-0 flex-1`} />
        <button type="submit" className={primaryButton}>Search</button>
      </Form>

      {keywords.length > 0 && (
        <section aria-labelledby="keywords-heading" className="mt-6">
          <h2 id="keywords-heading" className="font-semibold">Skills and interests members share</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {keywords.map((k) => (
              <li key={k.key}>
                <KeywordChip keyword={k.keyword} />
                <span className="sr-only">, {k.count} {k.count === 1 ? "member" : "members"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="members-heading" className="mt-8">
        <h2 id="members-heading" className="text-xl font-semibold" aria-live="polite">
          {keyword ? <>Members with “{keyword}”</> : query ? <>Members matching “{query}”</> : "Members"}
          <span className="ml-2 text-base font-normal opacity-75">{members.length}</span>
        </h2>
        {filtered && <Link to="/members/people" className="mt-1 inline-block underline">Show everyone</Link>}
        {members.length === 0 ? (
          <p className="mt-4">{filtered ? "No members match yet." : "No members have listed themselves yet."}</p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {members.map((member) => (
              <li key={member.id} className={`${card} flex gap-4`}>
                <Avatar name={member.name} avatarKey={member.avatarKey} className="size-14 text-lg" />
                <div className="min-w-0">
                  <Link to={`/members/people/${member.id}`} className="text-lg font-semibold underline-offset-2 hover:underline">
                    {member.name}
                  </Link>
                  {member.headline && <p className="line-clamp-2">{member.headline}</p>}
                  {member.location && <p className="text-sm opacity-75">{member.location}</p>}
                  {member.keywords.length > 0 && (
                    <p className="mt-1 line-clamp-1 text-sm opacity-80">{member.keywords.slice(0, 6).join(" · ")}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
