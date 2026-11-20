import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";

import { Avatar } from "~/components/profile-ui";
import { EVERYONE, mentionQuery, mentionsIn, splitMentions, type Mention } from "~/lib/mentions";

type Suggestion = Mention & { avatarKey: string | null };

/**
 * A text box that suggests members while someone types "@" and a name, as Facebook does. Choosing
 * one writes "@Full Name"; each name still in the text posts its member's id as `mention`.
 * Admins also get "@everyone".
 */
export function MentionTextarea({
  name,
  id,
  label,
  defaultValue = "",
  initialMentions = [],
  canMentionEveryone,
  rows = 3,
  maxLength,
  placeholder,
  submitOnEnter = false,
  autoFocus,
  className,
}: {
  name: string;
  id: string;
  label: string;
  defaultValue?: string;
  initialMentions?: Mention[];
  canMentionEveryone: boolean;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  /** Enter sends the form, Shift+Enter starts a new line: for comments. */
  submitOnEnter?: boolean;
  autoFocus?: boolean;
  className: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [mentions, setMentions] = useState<Mention[]>(initialMentions);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(0);
  const [typing, setTyping] = useState<{ query: string; start: number } | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const listId = useId();
  const open = typing !== null && suggestions.length > 0;

  useEffect(() => {
    if (autoFocus && box.current) {
      const end = box.current.value.length;
      box.current.focus();
      box.current.setSelectionRange(end, end);
    }
  }, [autoFocus]);

  useEffect(() => {
    if (!typing?.query) {
      setSuggestions([]);
      return;
    }
    const everyone: Suggestion[] =
      canMentionEveryone && EVERYONE.startsWith(typing.query.toLowerCase()) ? [{ id: EVERYONE, name: EVERYONE, avatarKey: null }] : [];
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/members/community/mentions?q=${encodeURIComponent(typing.query)}`, { signal: controller.signal });
        const { people } = (await response.json()) as { people: Suggestion[] };
        setSuggestions([...everyone, ...people]);
        setActive(0);
      } catch {
        // A newer keystroke replaced this search, or the network failed; the box just shows no suggestions.
      }
    }, 150);
    setSuggestions(everyone);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [typing?.query, canMentionEveryone]);

  function track(text: string, caret: number) {
    setTyping(mentionQuery(text.slice(0, caret)));
  }

  function choose(person: Suggestion) {
    if (!typing || !box.current) return;
    const caret = box.current.selectionStart;
    const insert = `@${person.name} `;
    const next = value.slice(0, typing.start) + insert + value.slice(caret);
    const at = typing.start + insert.length;
    setValue(next);
    if (person.id !== EVERYONE) setMentions((current) => [...current.filter((m) => m.id !== person.id), { id: person.id, name: person.name }]);
    setTyping(null);
    requestAnimationFrame(() => {
      box.current?.focus();
      box.current?.setSelectionRange(at, at);
    });
  }

  const kept = mentionsIn(value, mentions).filter((m) => m.id !== EVERYONE);

  return (
    <div className="relative min-w-0 flex-1">
      <label htmlFor={id} className="sr-only">{label}</label>
      <textarea
        ref={box}
        id={id}
        name={name}
        value={value}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        className={className}
        onChange={(event) => {
          setValue(event.target.value);
          track(event.target.value, event.target.selectionStart);
        }}
        onClick={(event) => track(event.currentTarget.value, event.currentTarget.selectionStart)}
        onBlur={() => setTimeout(() => setTyping(null), 150)}
        onKeyDown={(event) => {
          if (open) {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setActive((i) => (i + (event.key === "ArrowDown" ? 1 : suggestions.length - 1)) % suggestions.length);
              return;
            }
            if (event.key === "Enter" || event.key === "Tab") {
              event.preventDefault();
              choose(suggestions[active]!);
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setTyping(null);
              return;
            }
          }
          if (submitOnEnter && event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (value.trim()) event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      {kept.map((m) => <input key={m.id} type="hidden" name="mention" value={m.id} />)}
      <ul
        id={listId}
        role="listbox"
        aria-label="People to mention"
        hidden={!open}
        className="absolute left-0 z-30 mt-1 w-72 max-w-full overflow-hidden rounded-lg border border-[#C9DADC] bg-white py-1 shadow-lg dark:border-[#24363B] dark:bg-[#12201F]"
      >
        {suggestions.map((person, i) => (
          <li
            key={person.id}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            onMouseDown={(event) => {
              event.preventDefault();
              choose(person);
            }}
            onMouseEnter={() => setActive(i)}
            className={`flex cursor-pointer items-center gap-2 px-3 py-2 ${i === active ? "bg-[#E1EEF0] dark:bg-[#1C3238]" : ""}`}
          >
            {person.id === EVERYONE ? (
              <>
                <span aria-hidden="true" className="grid size-7 place-items-center rounded-full bg-[#F3E6D7] text-sm font-bold text-[#15383F]">@</span>
                <span><span className="font-semibold">@everyone</span> <span className="text-sm opacity-75">· tags all members</span></span>
              </>
            ) : (
              <>
                <Avatar name={person.name} avatarKey={person.avatarKey} className="size-7 text-xs" />
                <span className="font-medium">{person.name}</span>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Text with each "@Name" linked to its profile, and "@everyone" in bold. */
export function MentionText({ body, mentions, className }: { body: string; mentions: Mention[]; className?: string }) {
  return (
    <p className={className}>
      {splitMentions(body, mentions).map((segment, i) =>
        "mention" in segment ? (
          segment.mention.id === EVERYONE ? (
            <strong key={i} className="font-semibold text-[#1F6F86] dark:text-[#8CC7D3]">{segment.text}</strong>
          ) : (
            <Link key={i} to={`/members/people/${segment.mention.id}`} className="font-semibold text-[#1F6F86] hover:underline dark:text-[#8CC7D3]">
              {segment.text}
            </Link>
          )
        ) : (
          segment.text
        ),
      )}
    </p>
  );
}
