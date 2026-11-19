import { useRef } from "react";

import { primaryButton, secondaryButton } from "~/components/admin-ui";

/**
 * A Download button that opens a small panel: a checkbox per column, all ticked to start, and a
 * choice between every row and only those the current filters show. It downloads a CSV from
 * `action`.
 */
export function DownloadPanel({
  action,
  columns,
  params,
  what,
}: {
  action: string;
  columns: readonly { key: string; label: string }[];
  /** The page's current search and filters, passed on when "only these rows" is ticked. */
  params: URLSearchParams;
  what: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const kept = [...params.entries()].filter(([name]) => !["sort", "dir", "page"].includes(name));
  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className={secondaryButton}>
        Download
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="download-title"
        className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-lg p-6 backdrop:bg-black/50 dark:bg-[#12201F] dark:text-[#E3EEF0]"
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <form method="get" action={action} onSubmit={() => dialog.current?.close()}>
          <h2 id="download-title" className="text-lg font-semibold">Download {what}</h2>
          <fieldset className="mt-4">
            <legend className="font-medium">Columns to include</legend>
            <div className="mt-2 grid gap-1">
              {columns.map((c) => (
                <label key={c.key} className="flex items-center gap-2">
                  <input type="checkbox" name="col" value={c.key} defaultChecked className="size-4" />
                  {c.label}
                </label>
              ))}
            </div>
          </fieldset>
          {kept.length > 0 && (
            <label className="mt-4 flex items-start gap-2">
              <input type="checkbox" name="filtered" value="1" className="mt-1 size-4" />
              <span>Only the rows the current search and filters show</span>
            </label>
          )}
          {kept.map(([name, value], i) => (
            <input key={`${name}-${i}`} type="hidden" name={name} value={value} />
          ))}
          <p className="mt-4 text-sm opacity-80">It downloads as a CSV file, which opens in Excel, Numbers or Google Sheets.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="submit" className={primaryButton}>Download</button>
            <button type="button" onClick={() => dialog.current?.close()} className={secondaryButton}>Cancel</button>
          </div>
        </form>
      </dialog>
    </>
  );
}

/** A table heading that sorts by its column, showing the current direction. */
export function SortHeading({
  label,
  href,
  active,
  dir,
}: {
  label: string;
  href: string;
  active: boolean;
  dir: "asc" | "desc";
}) {
  return (
    <th scope="col" aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"} className="px-3 py-2 font-semibold">
      <a href={href} className="inline-flex items-center gap-1 hover:underline">
        {label}
        <span aria-hidden="true" className={active ? "" : "opacity-30"}>{active ? (dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </a>
    </th>
  );
}
