/**
 * The Users page's filters, shared by its server code and the page itself. Unknown values in the
 * address fall back to the defaults.
 */
export const TICKET_FILTERS = [
  { value: "any", label: "Any ticket status" },
  { value: "holder", label: "Ticket holders" },
  { value: "paid", label: "Paid" },
  { value: "comp", label: "Comp" },
  { value: "refunded", label: "Refunded" },
  { value: "none", label: "No ticket" },
] as const;

export const ROLE_FILTERS = [
  { value: "any", label: "Any role" },
  { value: "admin", label: "Admins" },
  { value: "host", label: "Hosts" },
  { value: "member", label: "No role" },
] as const;

export const ACCOUNT_FILTERS = [
  { value: "active", label: "Active accounts" },
  { value: "deactivated", label: "Deactivated" },
  { value: "all", label: "All accounts" },
] as const;

export const USER_SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name", label: "Name" },
] as const;

type Value<T extends readonly { value: string }[]> = T[number]["value"];

export type UserFilters = {
  q: string;
  ticket: Value<typeof TICKET_FILTERS>;
  role: Value<typeof ROLE_FILTERS>;
  account: Value<typeof ACCOUNT_FILTERS>;
  sort: Value<typeof USER_SORTS>;
  page: number;
};

function pick<T extends readonly { value: string }[]>(options: T, value: string | null): Value<T> {
  return (options.find((o) => o.value === value) ?? options[0]!).value as Value<T>;
}

/** Reads the Users page's filters from its address, falling back to defaults for anything unknown. */
export function readUserFilters(query: URLSearchParams): UserFilters {
  const page = Number(query.get("page"));
  return {
    q: (query.get("q") ?? "").trim().slice(0, 100),
    ticket: pick(TICKET_FILTERS, query.get("ticket")),
    role: pick(ROLE_FILTERS, query.get("role")),
    account: pick(ACCOUNT_FILTERS, query.get("account")),
    sort: pick(USER_SORTS, query.get("sort")),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

export const USERS_PER_PAGE = 50;

