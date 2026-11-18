/**
 * An FAQ answer as admins typed it: blank lines start new paragraphs, and web and email addresses
 * become links. Answers are plain text, so nothing an admin types can inject markup.
 */
export function FaqAnswer({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n\s*\n/).map((paragraph, i) => (
        <p key={i} className="mt-2 whitespace-pre-line first:mt-0">
          {linkify(paragraph)}
        </p>
      ))}
    </>
  );
}

const LINK = /(https:\/\/[^\s<>()]+[^\s<>().,;:!?'"]|[\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g;

function linkify(text: string) {
  return text.split(LINK).map((part, i) => {
    if (i % 2 === 0) return part;
    const href = part.includes("@") && !part.startsWith("https://") ? `mailto:${part}` : part;
    return (
      <a key={i} href={href} className="underline" {...(href.startsWith("https://") ? { rel: "noopener noreferrer" } : {})}>
        {part}
      </a>
    );
  });
}
