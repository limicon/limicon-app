import { lazy, Suspense, useEffect, useState } from "react";

import type { RichDoc } from "~/lib/rich-text";

// TipTap can't run in the Worker (its ProseMirror modules load twice there), so the editor is
// fetched in the browser once the page is interactive.
const Editor = lazy(() => import("./rich-text-editor-impl"));

/**
 * A word-processor-style editor posting its document as JSON in a hidden field `name`. See
 * rich-text-editor-impl.tsx for what it offers; `basic` keeps to text formatting for members.
 * `initial` is a saved document, or HTML to start from.
 */
export function RichTextEditor(props: {
  name: string;
  initial: RichDoc | string | null;
  label: string;
  describedBy?: string;
  basic?: boolean;
}) {
  const [inBrowser, setInBrowser] = useState(false);
  useEffect(() => setInBrowser(true), []);
  const placeholder = (
    <div className="rounded border border-[#9DB5B9] bg-white px-3 py-2 dark:border-[#3A5359] dark:bg-[#0F1C1E]">
      {/* Keeps what's saved if the form is posted before the editor arrives. */}
      <input type="hidden" name={props.name} value={props.initial && typeof props.initial !== "string" ? JSON.stringify(props.initial) : ""} />
      <p className="text-sm opacity-70">Loading the editor…</p>
    </div>
  );
  if (!inBrowser) return placeholder;
  return (
    <Suspense fallback={placeholder}>
      <Editor {...props} />
    </Suspense>
  );
}
