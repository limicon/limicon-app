import { useState } from "react";

import { inputClass } from "~/components/admin-ui";
import { cleanKeyword, LIMITS, splitKeywords } from "~/lib/profile-form";

/**
 * Free-typed keywords as removable chips. Enter or a comma turns what's typed into a chip; each
 * chip posts as `name`, and anything still in the box posts as `${name}Draft`, so nothing typed
 * is lost when the member saves without pressing Enter.
 */
export function KeywordInput({
  name,
  label,
  help,
  initial,
  error,
}: {
  name: string;
  label: string;
  help: string;
  initial: string[];
  error?: string;
}) {
  const [keywords, setKeywords] = useState(initial);
  const [draft, setDraft] = useState("");
  const id = `${name}-input`;

  function add(value: string) {
    setKeywords((current) => splitKeywords([...current, value]).slice(0, LIMITS.keywords));
    setDraft("");
  }

  return (
    <div>
      <label htmlFor={id} className="font-medium">{label}</label>
      <p id={`${id}-help`} className="text-sm opacity-80">{help}</p>
      {keywords.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2" aria-label={`Your ${label.toLowerCase()}`}>
          {keywords.map((keyword) => (
            <li key={keyword.toLowerCase()} className="inline-flex items-center gap-1 rounded-full bg-[#E1EEF0] py-1 pr-1 pl-3 text-sm font-medium text-[#15383F] dark:bg-[#1C3238] dark:text-[#E3EEF0]">
              <input type="hidden" name={name} value={keyword} />
              {keyword}
              <button
                type="button"
                onClick={() => confirm(`Remove “${keyword}”?`) && setKeywords((current) => current.filter((k) => k !== keyword))}
                className="grid size-6 place-items-center rounded-full hover:bg-black/10 dark:hover:bg-white/10"
                aria-label={`Remove ${keyword}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        id={id}
        name={`${name}Draft`}
        value={draft}
        maxLength={LIMITS.keyword * 4}
        onChange={(event) => {
          const value = event.target.value;
          if (value.includes(",")) add(value);
          else setDraft(value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (cleanKeyword(draft)) add(draft);
          } else if (event.key === "Backspace" && !draft && keywords.length) {
            setKeywords((current) => current.slice(0, -1));
          }
        }}
        placeholder="Type one, then press Enter"
        aria-describedby={[`${id}-help`, error && `${id}-error`].filter(Boolean).join(" ")}
        aria-invalid={error ? true : undefined}
        className={`${inputClass} mt-2`}
      />
      {error && <p id={`${id}-error`} className="mt-1 text-sm font-medium text-[#B3261E] dark:text-[#F2B8B5]">{error}</p>}
    </div>
  );
}
