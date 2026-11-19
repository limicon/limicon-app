import { useEffect, useRef, useState } from "react";
import { data, Form, Link, redirect, useNavigation } from "react-router";

import { Notice, PageHeading, primaryButton, secondaryButton } from "~/components/admin-ui";
import { RichTextEditor } from "~/components/rich-text-editor";
import { CodeOfConduct, PrivacyPolicy } from "~/content/policies";
import { servicesContext } from "~/context";
import { readRichText, type RichDoc } from "~/lib/rich-text";
import { getSiteDocument, isPolicySlug, saveSiteDocument } from "~/lib/site-documents.server";
import type { Route } from "./+types/policy-edit";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? "Policy"} · Admin · Limicon` }];
}

async function load(context: Route.LoaderArgs["context"], slug: string) {
  if (!isPolicySlug(slug)) throw data("Not found", { status: 404 });
  const services = context.get(servicesContext);
  const doc = await getSiteDocument(services.db(), slug);
  if (!doc) throw data("Not found", { status: 404 });
  return { services, doc, slug };
}

export async function loader({ context, params }: Route.LoaderArgs) {
  const { doc, slug } = await load(context, params.slug);
  return { slug, title: doc.title, body: doc.body };
}

export async function action({ context, params, request }: Route.ActionArgs) {
  const { services, slug } = await load(context, params.slug);
  const body = readRichText((await request.formData()).get("body"));
  if (!body) return data({ error: "The policy can't be empty." }, { status: 400 });
  await saveSiteDocument(services.db(), slug, body, services.viewer!.userId);
  throw redirect(`/admin/policies?saved=${slug}`);
}

const original = { privacy: PrivacyPolicy, conduct: CodeOfConduct } as const;

/** A policy in the rich text editor, starting from the text that ships with the app until edited. */
export default function AdminPolicyEdit({ loaderData, actionData }: Route.ComponentProps) {
  const { slug, title, body } = loaderData;
  const busy = useNavigation().state !== "idle";
  return (
    <>
      <p>
        <Link to="/admin/policies" className="underline">Back to Policies</Link>
      </p>
      <div className="mt-4">
        <PageHeading title={`Edit the ${title}`}>
          <p>
            Change the text as you would in a document. Remember to update the "Last updated" date in the text.{" "}
            <a href={`/${slug}`} className="underline" target="_blank" rel="noopener">See the public page</a> (opens in a new tab).
          </p>
        </PageHeading>
      </div>
      {actionData?.error && <Notice tone="problem">{actionData.error}</Notice>}
      <Form method="post" className="grid max-w-3xl gap-4">
        {body ? (
          <RichTextEditor name="body" initial={body} label={title} />
        ) : (
          <FromOriginal Original={original[slug as keyof typeof original]} title={title} />
        )}
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={busy} className={primaryButton}>Save</button>
          <Link to="/admin/policies" className={secondaryButton}>Cancel</Link>
        </div>
      </Form>
    </>
  );
}

/**
 * Opens the editor on the policy's built-in text: draws it out of sight, then hands its HTML to
 * the editor, which keeps only what it supports.
 */
function FromOriginal({ Original, title }: { Original: () => React.ReactElement; title: string }) {
  const source = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => setHtml(source.current?.innerHTML ?? ""), []);
  return (
    <>
      <div ref={source} hidden aria-hidden="true">
        <Original />
      </div>
      {html === null ? <p>Loading the editor…</p> : <RichTextEditor name="body" initial={html as string | RichDoc} label={title} />}
    </>
  );
}
