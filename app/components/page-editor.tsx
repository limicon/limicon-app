import { useState } from "react";
import { Form, Link, useNavigation } from "react-router";

import { dangerButton, FieldError, inputClass, primaryButton, secondaryButton } from "~/components/admin-ui";
import { ImageUploadField } from "~/components/image-upload-field";
import { RichTextEditor } from "~/components/rich-text-editor";
import { SectionBody, SectionShell } from "~/components/site-sections";
import type { EventDetails } from "~/lib/event.server";
import {
  BACKGROUNDS,
  BUTTONS_MAX,
  MENU_LABEL_MAX,
  newSection,
  SECTION_KINDS,
  SECTIONS_MAX,
  slugFromTitle,
  TITLE_MAX,
  type PageErrors,
  type PageMeta,
  type Section,
  type SectionType,
} from "~/lib/site-pages";

/**
 * Builds a page from sections, laid out as the page will look: add a section anywhere, move it
 * up or down, remove it, and fill it in place. Saving posts the whole page to the current route;
 * Cancel goes to `cancelHref` and drops the changes. Used on the page itself and in the console.
 */
export function PageEditor({
  meta,
  sections: initial,
  isHome,
  isNew = false,
  event,
  errors = {},
  cancelHref,
}: {
  meta: PageMeta;
  sections: Section[];
  isHome: boolean;
  isNew?: boolean;
  event: EventDetails | null;
  errors?: PageErrors;
  cancelHref: string;
}) {
  const busy = useNavigation().state !== "idle";
  const [sections, setSections] = useState(initial);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [slug, setSlug] = useState(meta.slug);
  const [adding, setAdding] = useState<number | null>(null);

  const add = (index: number, type: SectionType) => {
    setSections((all) => [...all.slice(0, index), newSection(type, crypto.randomUUID().slice(0, 12)), ...all.slice(index)]);
    setAdding(null);
  };
  const move = (index: number, by: -1 | 1) =>
    setSections((all) => {
      const next = [...all];
      const [s] = next.splice(index, 1);
      next.splice(index + by, 0, s!);
      return next;
    });
  const sectionErrors = errors.section ?? {};

  const Adder = ({ index }: { index: number }) =>
    adding === index ? (
      <div className="mx-auto my-3 max-w-5xl rounded-lg border-2 border-dashed border-[#2E6B78] bg-white p-4 dark:bg-[#12201F]">
        <p className="mb-3 font-semibold">Add a section</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SECTION_KINDS.map((k) => (
            <button key={k.type} type="button" onClick={() => add(index, k.type)} className="rounded border border-[#C9DADC] p-3 text-left hover:border-[#15383F] dark:border-[#24363B]">
              <span className="block font-semibold">{k.label}</span>
              <span className="block text-sm opacity-80">{k.help}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setAdding(null)} className="mt-3 text-sm underline">Cancel</button>
      </div>
    ) : (
      <div className="group relative mx-auto flex max-w-5xl justify-center py-1">
        <button
          type="button"
          disabled={sections.length >= SECTIONS_MAX}
          onClick={() => setAdding(index)}
          className="rounded-full border border-dashed border-[#2E6B78] bg-white px-3 py-1 text-sm font-semibold text-[#15383F] hover:bg-[#E6F5F6] dark:bg-[#12201F] dark:text-[#E3EEF0]"
        >
          + Add section
        </button>
      </div>
    );

  return (
    <Form method="post" className="pb-24">
      <input type="hidden" name="intent" value="save-page" />
      <input type="hidden" name="sections" value={JSON.stringify(sections.map(({ id, type }) => ({ id, type })))} />

      <div className="sticky top-0 z-20 border-b border-[#C9DADC] bg-[#FFF8E1] px-4 py-3 shadow-sm dark:border-[#24363B] dark:bg-[#3A3214]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
          <p className="mr-auto font-semibold">
            Editing {isNew ? "a new page" : `“${meta.title}”`}
            <span className="ml-2 font-normal opacity-80">Changes show once you save.</span>
          </p>
          <button type="submit" disabled={busy} className={primaryButton}>{busy ? "Saving…" : "Save"}</button>
          <Link to={cancelHref} className={secondaryButton}>Cancel</Link>
        </div>
      </div>

      {(Object.keys(errors).length > 0) && (
        <p role="alert" className="mx-auto mt-4 max-w-5xl rounded border border-[#B3261E] bg-white p-3 font-medium text-[#B3261E] dark:bg-[#12201F] dark:text-[#F2B8B5]">
          {errors.sections ?? "Some things need fixing. They're marked below."}
        </p>
      )}

      <details open={isNew || Boolean(errors.title || errors.slug || errors.menuLabel)} className="mx-auto mt-4 max-w-5xl rounded-lg border border-[#C9DADC] bg-white p-4 dark:border-[#24363B] dark:bg-[#12201F]">
        <summary className="cursor-pointer font-semibold">Page settings</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="page-title" className="block text-sm font-medium">Title</label>
            <input
              id="page-title"
              name="title"
              maxLength={TITLE_MAX}
              defaultValue={meta.title}
              onChange={(event) => {
                if (!slugTouched) setSlug(slugFromTitle(event.target.value));
              }}
              className={`${inputClass} mt-1`}
              {...(errors.title ? { "aria-invalid": true, "aria-describedby": "page-title-error" } : {})}
            />
            <FieldError id="page-title-error" message={errors.title} />
          </div>
          {!isHome && (
            <div>
              <label htmlFor="page-slug" className="block text-sm font-medium">Address</label>
              <div className="mt-1 flex items-center gap-1">
                <span className="opacity-70">/</span>
                <input
                  id="page-slug"
                  name="slug"
                  value={slug}
                  onChange={(event) => {
                    setSlugTouched(true);
                    setSlug(event.target.value.toLowerCase());
                  }}
                  className={inputClass}
                  {...(errors.slug ? { "aria-invalid": true, "aria-describedby": "page-slug-error" } : {})}
                />
              </div>
              <FieldError id="page-slug-error" message={errors.slug} />
            </div>
          )}
          {!isHome && (
            <>
              <div>
                <label htmlFor="page-menu" className="block text-sm font-medium">Name in the menu <span className="font-normal">(optional)</span></label>
                <input id="page-menu" name="menuLabel" maxLength={MENU_LABEL_MAX} defaultValue={meta.menuLabel} placeholder="The title" className={`${inputClass} mt-1`} />
                <FieldError id="page-menu-error" message={errors.menuLabel} />
              </div>
              <div className="grid content-end gap-2">
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="inMenu" defaultChecked={meta.inMenu} className="size-4" />
                  Show in the site menu
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="published" defaultChecked={meta.published} className="size-4" />
                  Published: anyone can see this page
                </label>
              </div>
            </>
          )}
          {isHome && <p className="text-sm opacity-80 sm:self-end">The front page is always published, at the site's main address.</p>}
        </div>
      </details>

      <div className="mt-4">
        <Adder index={0} />
        {sections.map((section, index) => (
          <div key={section.id}>
            <div className="relative outline-2 outline-offset-[-2px] outline-[#2E6B78]/40 outline-dashed">
              <SectionToolbar
                section={section}
                index={index}
                count={sections.length}
                onMove={(by) => move(index, by)}
                onRemove={() => setSections((all) => all.filter((s) => s.id !== section.id))}
              />
              <EditableSection section={section} event={event} />
              {sectionErrors[section.id] && (
                <p role="alert" className="mx-auto max-w-5xl px-4 pb-4 font-medium text-[#B3261E] dark:text-[#F2B8B5]">{sectionErrors[section.id]}</p>
              )}
            </div>
            <Adder index={index + 1} />
          </div>
        ))}
        {sections.length === 0 && <p className="mx-auto max-w-5xl px-4 py-6 text-center opacity-80">This page is empty. Add a section to start.</p>}
      </div>
    </Form>
  );
}

function SectionToolbar({
  section,
  index,
  count,
  onMove,
  onRemove,
}: {
  section: Section;
  index: number;
  count: number;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const kind = SECTION_KINDS.find((k) => k.type === section.type)!;
  return (
    <div className="flex flex-wrap items-center gap-2 bg-[#2E6B78] px-3 py-1.5 text-sm text-white">
      <span className="mr-auto font-semibold">{kind.label}</span>
      <label className="flex items-center gap-1">
        Background
        <select name={`background:${section.id}`} defaultValue={section.background} className="rounded px-1 py-0.5 text-[#15383F]">
          {BACKGROUNDS.map((b) => (
            <option key={b.value} value={b.value}>{b.label}</option>
          ))}
        </select>
      </label>
      <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Move this ${kind.label.toLowerCase()} section up`} className="rounded px-2 hover:bg-white/20 disabled:opacity-40">↑</button>
      <button type="button" onClick={() => onMove(1)} disabled={index === count - 1} aria-label={`Move this ${kind.label.toLowerCase()} section down`} className="rounded px-2 hover:bg-white/20 disabled:opacity-40">↓</button>
      <button type="button" onClick={onRemove} className="rounded px-2 font-semibold hover:bg-white/20">Remove</button>
    </div>
  );
}

/** A section's fields, laid out where its content will appear. */
function EditableSection({ section, event }: { section: Section; event: EventDetails | null }) {
  const id = section.id;
  switch (section.type) {
    case "event":
      return (
        <SectionShell background={section.background}>
          <div className="pointer-events-none opacity-90">
            <SectionBody section={section} event={event} signedIn />
          </div>
          <p className="mx-auto mt-4 max-w-3xl rounded bg-[#FFF8E1] p-3 text-sm text-[#3A3214]">
            The event's image, name, teaser, dates and About come from the{" "}
            <Link to="/admin/settings" className="underline">Settings page</Link> in the admin console.
          </p>
        </SectionShell>
      );
    case "text":
      return (
        <SectionShell background={section.background}>
          <div className="max-w-3xl text-[#15383F]">
            <RichTextEditor name={`doc:${id}`} initial={section.doc} label="Text" />
          </div>
        </SectionShell>
      );
    case "image":
      return (
        <SectionShell background={section.background}>
          <div className="mx-auto grid max-w-3xl gap-3">
            <ImageUploadField name={`imageKey:${id}`} initialKey={section.imageKey} label={section.alt || "The image"} />
            <SmallInput name={`alt:${id}`} label="Describe the image, for people who can't see it" defaultValue={section.alt} />
            <SmallInput name={`caption:${id}`} label="Caption (optional)" defaultValue={section.caption} />
            <SmallSelect name={`size:${id}`} label="Width" defaultValue={section.size} options={[{ value: "medium", label: "Medium" }, { value: "full", label: "Full width" }]} />
          </div>
        </SectionShell>
      );
    case "imageText":
      return (
        <SectionShell background={section.background}>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="grid content-start gap-3">
              <ImageUploadField name={`imageKey:${id}`} initialKey={section.imageKey} label={section.alt || "The image"} />
              <SmallInput name={`alt:${id}`} label="Describe the image" defaultValue={section.alt} />
              <SmallSelect name={`imageSide:${id}`} label="Image on the" defaultValue={section.imageSide} options={[{ value: "left", label: "Left" }, { value: "right", label: "Right" }]} />
            </div>
            <div className="text-[#15383F]">
              <RichTextEditor name={`doc:${id}`} initial={section.doc} label="Text beside the image" />
            </div>
          </div>
        </SectionShell>
      );
    case "columns":
      return <ColumnsEditor section={section} />;
    case "buttons":
      return <ButtonsEditor section={section} />;
  }
}

function ColumnsEditor({ section }: { section: Extract<Section, { type: "columns" }> }) {
  const [count, setCount] = useState(section.columns.length);
  return (
    <SectionShell background={section.background}>
      <div className="mb-3 flex items-center gap-2 text-sm">
        <span>Columns:</span>
        {[2, 3].map((n) => (
          <button key={n} type="button" aria-pressed={count === n} onClick={() => setCount(n)} className={`rounded border px-2 py-0.5 ${count === n ? "bg-[#15383F] text-[#F3E6D7]" : ""}`}>
            {n}
          </button>
        ))}
      </div>
      <div className={`grid gap-4 text-[#15383F] ${count === 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
        {Array.from({ length: count }, (_, i) => (
          <RichTextEditor key={i} name={`column:${section.id}`} initial={section.columns[i] ?? null} label={`Column ${i + 1}`} />
        ))}
      </div>
    </SectionShell>
  );
}

function ButtonsEditor({ section }: { section: Extract<Section, { type: "buttons" }> }) {
  const [rows, setRows] = useState(() => section.buttons.map((b, key) => ({ ...b, key })));
  const [next, setNext] = useState(rows.length);
  const id = section.id;
  return (
    <SectionShell background={section.background}>
      <div className="grid gap-3">
        {rows.map((b, i) => (
          <div key={b.key} className="grid items-end gap-2 rounded bg-white/90 p-3 text-[#15383F] sm:grid-cols-[1fr_1.5fr_auto_auto]">
            <SmallInput name={`btnLabel:${id}`} label={`Button ${i + 1} text`} defaultValue={b.label} />
            <SmallInput name={`btnHref:${id}`} label="Links to" defaultValue={b.href} placeholder="/tickets or https://…" />
            <SmallSelect name={`btnStyle:${id}`} label="Style" defaultValue={b.style} options={[{ value: "primary", label: "Filled" }, { value: "secondary", label: "Outline" }]} />
            <button type="button" onClick={() => setRows((all) => all.filter((r) => r.key !== b.key))} className={dangerButton}>Remove</button>
          </div>
        ))}
        <div className="flex flex-wrap items-end gap-3">
          <button
            type="button"
            disabled={rows.length >= BUTTONS_MAX}
            onClick={() => {
              setRows((all) => [...all, { label: "", href: "", style: "primary", key: next }]);
              setNext((n) => n + 1);
            }}
            className={`${secondaryButton} bg-white text-[#15383F]`}
          >
            + Add button
          </button>
          <div className="text-[#15383F]">
            <SmallSelect name={`align:${id}`} label="Line up" defaultValue={section.align} options={[{ value: "left", label: "Left" }, { value: "center", label: "Center" }]} />
          </div>
        </div>
      </div>
    </SectionShell>
  );
}

function SmallInput({ name, label, defaultValue, placeholder }: { name: string; label: string; defaultValue: string; placeholder?: string }) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium">{label}</label>
      <input id={name} name={name} defaultValue={defaultValue} placeholder={placeholder} className={`${inputClass} mt-1 text-[#15383F]`} />
    </div>
  );
}

function SmallSelect({ name, label, defaultValue, options }: { name: string; label: string; defaultValue: string; options: { value: string; label: string }[] }) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium">{label}</label>
      <select id={name} name={name} defaultValue={defaultValue} className={`${inputClass} mt-1 text-[#15383F]`}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
