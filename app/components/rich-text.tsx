import type { ReactNode } from "react";

import type { RichDoc, RichNode } from "~/lib/rich-text";

/**
 * Draws a cleaned rich text document (see `cleanRichText`). Only the node types listed here are
 * drawn, and links and images were checked when the document was saved.
 */
export function RichText({ doc, className = "" }: { doc: RichDoc; className?: string }) {
  return <div className={`rich-text grid gap-3 leading-relaxed ${className}`}>{doc.content.map(render)}</div>;
}

const alignClass = { left: "", center: "text-center", right: "text-right" } as const;

function render(node: RichNode, key: number): ReactNode {
  const kids = "content" in node && node.content ? node.content.map(render) : null;
  switch (node.type) {
    case "paragraph":
      return (
        <p key={key} className={alignClass[node.attrs?.textAlign ?? "left"]}>
          {kids?.length ? kids : <br />}
        </p>
      );
    case "heading": {
      const Tag = (`h${node.attrs.level}` as "h2");
      const size = node.attrs.level === 2 ? "text-2xl" : node.attrs.level === 3 ? "text-xl" : "text-lg";
      return (
        <Tag key={key} className={`mt-2 font-semibold ${size} ${alignClass[node.attrs.textAlign ?? "left"]}`}>
          {kids}
        </Tag>
      );
    }
    case "bulletList":
      return <ul key={key} className="list-disc space-y-1 pl-6">{kids}</ul>;
    case "orderedList":
      return <ol key={key} start={node.attrs?.start} className="list-decimal space-y-1 pl-6">{kids}</ol>;
    case "listItem":
      return <li key={key} className="[&>p]:inline">{kids}</li>;
    case "blockquote":
      return <blockquote key={key} className="border-l-4 border-current/30 pl-4 italic">{kids}</blockquote>;
    case "hardBreak":
      return <br key={key} />;
    case "horizontalRule":
      return <hr key={key} className="my-2 border-current/20" />;
    case "image":
      return <img key={key} src={node.attrs.src} alt={node.attrs.alt ?? ""} className="max-w-full rounded" loading="lazy" />;
    case "text": {
      let out: ReactNode = node.text;
      for (const mark of node.marks ?? []) {
        if (mark.type === "bold") out = <strong>{out}</strong>;
        else if (mark.type === "italic") out = <em>{out}</em>;
        else if (mark.type === "underline") out = <u>{out}</u>;
        else if (mark.type === "strike") out = <s>{out}</s>;
        else if (mark.type === "link") {
          const external = /^https?:/i.test(mark.attrs.href);
          out = (
            <a href={mark.attrs.href} className="underline" {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
              {out}
            </a>
          );
        }
      }
      return <span key={key}>{out}</span>;
    }
    default:
      return null;
  }
}
