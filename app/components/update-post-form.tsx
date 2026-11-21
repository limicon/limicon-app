import { useRef, useState } from "react";
import { Form, Link, useNavigation } from "react-router";

import { FieldError, inputClass, primaryButton, secondaryButton } from "~/components/admin-ui";
import { RichTextEditor } from "~/components/rich-text-editor";
import { readRichText, richTextToPlain, type RichDoc } from "~/lib/rich-text";
import { POST_TEMPLATES, POST_TITLE_MAX } from "~/lib/updates";

/**
 * The form for writing an update: a title and a body in the rich text editor, with images, files,
 * links and formatting. A new post can start from scratch or from a template.
 */
export function UpdatePostForm(props: {
  initial: { title: string; body: RichDoc | null };
  errors?: { title?: string; body?: string };
  submitLabel: string;
  chooseTemplate?: boolean;
}) {
  const [start, setStart] = useState({ key: "", title: props.initial.title, body: props.initial.body });
  const [title, setTitle] = useState(props.initial.title);
  const busy = useNavigation().state !== "idle";
  const form = useRef<HTMLFormElement>(null);

  function pickTemplate(key: string) {
    const template = POST_TEMPLATES.find((t) => t.key === key);
    const written = form.current?.querySelector<HTMLInputElement>('input[name="body"]')?.value ?? "";
    const hasWriting = title.trim() !== "" || richTextToPlain(readRichText(written)).trim() !== "";
    if (hasWriting && !confirm("Start over from this choice? What you've written in the post so far will be replaced.")) return;
    setStart({ key, title: template?.title ?? "", body: template?.body ?? null });
    setTitle(template?.title ?? "");
  }

  return (
    <Form ref={form} method="post" className="grid gap-5">
      {props.chooseTemplate && (
        <div>
          <label htmlFor="template" className="block font-semibold">Start from</label>
          <select
            id="template"
            name="template"
            value={start.key}
            onChange={(event) => pickTemplate(event.target.value)}
            className={`${inputClass} mt-1 max-w-xs`}
          >
            <option value="">Blank post</option>
            {POST_TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
      )}
      <div>
        <label htmlFor="title" className="block font-semibold">Title</label>
        <input
          id="title"
          name="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={POST_TITLE_MAX}
          aria-invalid={Boolean(props.errors?.title)}
          aria-describedby={props.errors?.title ? "title-error" : undefined}
          className={`${inputClass} mt-1`}
        />
        <FieldError id="title-error" message={props.errors?.title} />
      </div>
      <div>
        <span id="body-label" className="block font-semibold">Post</span>
        <p id="body-help" className="text-sm opacity-80">Add images, files, links, headings and formatting from the toolbar.</p>
        <div className="mt-1">
          {/* A new key starts the editor afresh when a template is chosen. */}
          <RichTextEditor key={start.key} name="body" initial={start.body} label="Post" describedBy="body-help" />
        </div>
        <FieldError id="body-error" message={props.errors?.body} />
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy} className={primaryButton}>{busy ? "Saving…" : props.submitLabel}</button>
        <Link to="/members/updates" className={secondaryButton}>Cancel</Link>
      </div>
    </Form>
  );
}
