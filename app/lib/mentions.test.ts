import { describe, expect, test } from "vitest";

import { mentionQuery, mentionsEveryone, mentionsIn, splitMentions } from "./mentions";

const ada = { id: "a", name: "Ada Lovelace" };
const adaline = { id: "b", name: "Adaline Ray" };

describe("mentions", () => {
  test("keeps only the names still in the text, each once", () => {
    expect(mentionsIn("Thanks @Ada Lovelace!", [ada, adaline, ada])).toEqual([ada]);
    expect(mentionsIn("Thanks Ada", [ada])).toEqual([]);
    expect(mentionsIn("@Ada Lovelaces", [ada])).toEqual([]);
  });

  test("splits text into plain pieces and linked names, longest name first", () => {
    const short = { id: "c", name: "Ada" };
    expect(splitMentions("Hi @Ada Lovelace and @Ada.", [short, ada])).toEqual([
      { text: "Hi " },
      { text: "@Ada Lovelace", mention: ada },
      { text: " and " },
      { text: "@Ada", mention: short },
      { text: "." },
    ]);
    expect(splitMentions("No one", [])).toEqual([{ text: "No one" }]);
  });

  test("spots @everyone, in any case, as a whole word", () => {
    expect(mentionsEveryone("Hello @everyone!")).toBe(true);
    expect(mentionsEveryone("Hello @Everyone")).toBe(true);
    expect(mentionsEveryone("@everyones")).toBe(false);
    expect(mentionsEveryone("hello everyone")).toBe(false);
  });

  test("finds the name being typed after @", () => {
    expect(mentionQuery("Thanks @Ad")).toEqual({ query: "Ad", start: 7 });
    expect(mentionQuery("@")).toEqual({ query: "", start: 0 });
    expect(mentionQuery("email me@example")).toBeNull();
    expect(mentionQuery("@Ada done")).toBeNull();
  });
});
