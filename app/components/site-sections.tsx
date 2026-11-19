import { Link } from "react-router";

import { EventWhen } from "~/components/event-when";
import { RichText } from "~/components/rich-text";
import type { EventDetails } from "~/lib/event.server";
import { mediaUrl } from "~/lib/media";
import type { Background, Section } from "~/lib/site-pages";

const backgroundClass: Record<Background, string> = {
  plain: "",
  tint: "bg-[#EEF3F3] dark:bg-[#12201F]",
  dark: "bg-[#15383F] text-[#F3E6D7] [&_a]:text-[#F3E6D7]",
};

/** A page's sections, each across the full width with its background and centered content. */
export function SiteSections({ sections, event, signedIn }: { sections: Section[]; event: EventDetails | null; signedIn: boolean }) {
  return (
    <>
      {sections.map((section) => (
        <SectionShell key={section.id} background={section.background}>
          <SectionBody section={section} event={event} signedIn={signedIn} />
        </SectionShell>
      ))}
    </>
  );
}

export function SectionShell({ background, children }: { background: Background; children: React.ReactNode }) {
  return (
    <section className={`px-4 py-10 ${backgroundClass[background]}`}>
      <div className="mx-auto max-w-5xl">{children}</div>
    </section>
  );
}

export function SectionBody({ section, event, signedIn }: { section: Section; event: EventDetails | null; signedIn: boolean }) {
  switch (section.type) {
    case "event":
      return <EventSection event={event} signedIn={signedIn} />;
    case "text":
      return section.doc ? <RichText doc={section.doc} className="max-w-3xl" /> : null;
    case "image":
      return section.imageKey ? (
        <figure className={section.size === "full" ? "" : "mx-auto max-w-3xl"}>
          <img src={mediaUrl(section.imageKey)} alt={section.alt} className="w-full rounded-lg" loading="lazy" />
          {section.caption && <figcaption className="mt-2 text-sm opacity-80">{section.caption}</figcaption>}
        </figure>
      ) : null;
    case "imageText":
      return (
        <div className={`grid items-center gap-8 md:grid-cols-2 ${section.imageSide === "right" ? "md:[&>*:first-child]:order-2" : ""}`}>
          <div>{section.imageKey && <img src={mediaUrl(section.imageKey)} alt={section.alt} className="w-full rounded-lg" loading="lazy" />}</div>
          <div>{section.doc && <RichText doc={section.doc} />}</div>
        </div>
      );
    case "columns":
      return (
        <div className={`grid gap-8 ${section.columns.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
          {section.columns.map((doc, i) => (
            <div key={i}>{doc && <RichText doc={doc} />}</div>
          ))}
        </div>
      );
    case "buttons":
      return (
        <div className={`flex flex-wrap gap-3 ${section.align === "center" ? "justify-center" : ""}`}>
          {section.buttons.map((b, i) => (
            <SiteButtonLink key={i} {...b} />
          ))}
        </div>
      );
  }
}

function SiteButtonLink({ label, href, style }: { label: string; href: string; style: "primary" | "secondary" }) {
  const className =
    style === "primary"
      ? "rounded bg-[#1F5F68] px-5 py-2.5 font-semibold text-white no-underline hover:bg-[#15383F]"
      : "rounded border-2 border-current px-5 py-2 font-semibold no-underline";
  return href.startsWith("/") ? (
    <Link to={href} className={className}>{label}</Link>
  ) : (
    <a href={href} className={className} {...(/^https?:/.test(href) ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {label}
    </a>
  );
}

/** The event as admins describe it on the console's Edit page. */
function EventSection({ event, signedIn }: { event: EventDetails | null; signedIn: boolean }) {
  return (
    <div className="mx-auto max-w-3xl">
      {event?.imageKey && <img src={mediaUrl(event.imageKey)} alt="" className="mb-8 aspect-[16/9] w-full rounded-lg object-cover" />}
      <h1 className="text-4xl font-semibold">{event?.name ?? "Limicon"}</h1>
      {event?.teaser && <p className="mt-3 text-lg">{event.teaser}</p>}
      {event?.startsAt && event.startTimeZone && (
        <EventWhen startsAt={event.startsAt} endsAt={event.endsAt} zone={event.startTimeZone} className="mt-3 font-medium" />
      )}
      <p className="mt-6 flex flex-wrap items-center gap-4">
        <Link className="rounded bg-[#1F5F68] px-5 py-2.5 font-semibold text-white hover:bg-[#15383F]" to="/tickets">
          Register
        </Link>
        {!signedIn && (
          <Link className="underline" to="/sign-in">
            Sign in or create an account
          </Link>
        )}
      </p>
      {event?.about && (
        <div className="mt-10">
          <RichText doc={event.about} />
        </div>
      )}
    </div>
  );
}
