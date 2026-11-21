import { useEffect, useId, useRef, useState } from "react";

import type { Person } from "~/lib/session-form";

type Match = Person & { hint: string };

/**
 * Picks co-hosts the way an email app picks recipients: type @ and a name, and each person
 * chosen from the matches becomes a tag. Only tags are posted (as hidden `coHosts` fields), so
 * typed text never becomes a co-host. Enter, Tab or a comma takes the highlighted match.
 */
export function CoHostField({
  initial,
  excludeIds,
  error,
  describedBy,
}: {
  initial: Person[];
  /** People who can't be added, such as the session's host. */
  excludeIds: string[];
  error?: string;
  describedBy: string;
}) {
  const id = useId();
  const [people, setPeople] = useState<Person[]>(initial);
  const [text, setText] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [active, setActive] = useState(0);
  // The query the current matches answer, so stale or pending results aren't taken as final.
  const [resultsFor, setResultsFor] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const query = text.replace(/^@/, "").trim();
  const taken = new Set([...excludeIds, ...people.map((person) => person.id)]);
  const shown = (query ? matches : []).filter((match) => !taken.has(match.id));

  useEffect(() => {
    if (!query) {
      setMatches([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/members/host/people?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        const result = (await response.json()) as { people: Match[] };
        setMatches(result.people);
        setResultsFor(query);
        setActive(0);
      } catch {
        // A newer search replaced this one, or the network failed; the next keystroke tries again.
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function add(person: Person) {
    setPeople((current) => [...current, { id: person.id, name: person.name }]);
    setText("");
    setMatches([]);
    setProblem(null);
    input.current?.focus();
  }

  /** Takes the highlighted match, or explains why the typed name can't be added. */
  function commit(): boolean {
    if (!query) return false;
    const match = shown[active];
    if (match) {
      add(match);
      return true;
    }
    setProblem(resultsFor !== query ? "Still searching. Try again in a moment." : `No registered member matches “${query}”. Co-hosts need a Limicon ticket.`);
    return false;
  }

  const listId = `${id}-matches`;
  const searched = resultsFor === query;
  const open = query !== "" && (shown.length > 0 || searched);
  const messageId = `${id}-message`;

  return (
    <div className="relative">
      {people.map((person) => (
        <input key={person.id} type="hidden" name="coHosts" value={JSON.stringify(person)} />
      ))}
      <div
        className={`flex min-h-11 flex-wrap items-center gap-2 rounded border bg-white px-2 py-1.5 focus-within:outline-2 focus-within:outline-[#15383F] dark:bg-[#0F1C1E] dark:focus-within:outline-[#8CC7D3] ${
          error ? "border-[#B3261E]" : "border-[#9DB5B9] dark:border-[#3A5359]"
        }`}
        onClick={() => input.current?.focus()}
      >
        <ul className="contents" aria-label="Co-hosts added">
          {people.map((person) => (
            <li key={person.id} className="flex items-center gap-1 rounded-full bg-[#E6F5F6] py-0.5 pr-1 pl-3 text-sm font-semibold text-[#15383F]">
              {person.name}
              <button
                type="button"
                aria-label={`Remove ${person.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!confirm(`Remove ${person.name} as a co-host?`)) return;
                  setPeople((current) => current.filter((p) => p.id !== person.id));
                  input.current?.focus();
                }}
                className="flex size-6 items-center justify-center rounded-full hover:bg-[#15383F]/10"
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
        <input
          ref={input}
          id="coHosts"
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && shown[active] ? `${id}-option-${active}` : undefined}
          aria-describedby={[describedBy, problem ? messageId : "", error ? "coHosts-error" : ""].filter(Boolean).join(" ")}
          aria-invalid={error ? true : undefined}
          value={text}
          placeholder={people.length ? "" : "@name"}
          onChange={(event) => {
            const value = event.target.value;
            // A comma takes the highlighted match, like an email app's recipient field.
            if (value.endsWith(",")) {
              if (!commit()) setText(value.slice(0, -1));
              return;
            }
            setText(value);
            setProblem(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && shown.length) {
              event.preventDefault();
              setActive((active + 1) % shown.length);
            } else if (event.key === "ArrowUp" && shown.length) {
              event.preventDefault();
              setActive((active - 1 + shown.length) % shown.length);
            } else if (event.key === "Enter") {
              // Never submits the form from here.
              event.preventDefault();
              commit();
            } else if (event.key === "Tab" && query && shown[active]) {
              event.preventDefault();
              commit();
            } else if (event.key === "Escape") {
              setText("");
              setMatches([]);
            } else if (event.key === "Backspace" && !text && people.length) {
              setPeople((current) => current.slice(0, -1));
            }
          }}
          onBlur={() => {
            if (query) setProblem(`“${query}” wasn't added. Choose a person from the list, or clear the text.`);
          }}
          className="min-w-40 flex-1 bg-transparent px-1 py-1 outline-none"
        />
      </div>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Matching members"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded border border-[#9DB5B9] bg-white shadow-lg dark:border-[#3A5359] dark:bg-[#0F1C1E]"
        >
          {shown.length === 0 ? (
            <li className="px-3 py-2 text-sm">No registered member matches “{query}”.</li>
          ) : (
            shown.map((match, index) => (
              <li
                key={match.id}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={index === active}
                // Keeps focus in the text box, so the blur message doesn't flash.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => add(match)}
                onMouseEnter={() => setActive(index)}
                className={`cursor-pointer px-3 py-2 ${index === active ? "bg-[#E6F5F6] text-[#15383F]" : ""}`}
              >
                <span className="block font-medium">{match.name}</span>
                {match.hint && <span className="block text-sm opacity-75">{match.hint}</span>}
              </li>
            ))
          )}
        </ul>
      )}
      {problem && (
        <p id={messageId} role="status" className="mt-1 text-sm font-medium text-[#B3261E] dark:text-[#F2B8B5]">
          {problem}
        </p>
      )}
    </div>
  );
}
