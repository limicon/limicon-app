/**
 * The Orders and Guests tables' columns, filters and sorting, read from the page's address.
 * Shared by the pages, their CSV downloads and the queries, so all three agree.
 */

export type SortDir = "asc" | "desc";

export const ORDER_COLUMNS = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "date", label: "Order date" },
  { key: "ticket", label: "Ticket" },
  { key: "status", label: "Status" },
  { key: "price", label: "Price" },
] as const;
export type OrderColumn = (typeof ORDER_COLUMNS)[number]["key"];

export const ORDER_STATUSES = [
  { value: "all", label: "All statuses" },
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Incomplete" },
  { value: "comp", label: "Comped" },
  { value: "refunded", label: "Refunded" },
] as const;

export type OrderFilters = {
  q: string;
  status: (typeof ORDER_STATUSES)[number]["value"];
  tier: number | null;
  sort: OrderColumn;
  dir: SortDir;
};

export function readOrderFilters(query: URLSearchParams): OrderFilters {
  const sort = ORDER_COLUMNS.find((c) => c.key === query.get("sort"))?.key ?? "date";
  const tier = Number(query.get("tier"));
  return {
    q: (query.get("q") ?? "").trim().slice(0, 100),
    status: ORDER_STATUSES.find((s) => s.value === query.get("status"))?.value ?? "all",
    tier: Number.isInteger(tier) && tier > 0 ? tier : null,
    sort,
    dir: readDir(query, sort === "date" ? "desc" : "asc"),
  };
}

export const GUEST_COLUMNS = [
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "email", label: "Email" },
  { key: "address", label: "Address" },
  { key: "profile", label: "Profile link" },
] as const;
export type GuestColumn = (typeof GUEST_COLUMNS)[number]["key"];

export type GuestFilters = { q: string; sort: "first" | "last"; dir: SortDir };

export function readGuestFilters(query: URLSearchParams): GuestFilters {
  return {
    q: (query.get("q") ?? "").trim().slice(0, 100),
    sort: query.get("sort") === "last" ? "last" : "first",
    dir: readDir(query, "asc"),
  };
}

function readDir(query: URLSearchParams, fallback: SortDir): SortDir {
  const dir = query.get("dir");
  return dir === "asc" || dir === "desc" ? dir : fallback;
}

/** The columns ticked in a download form, in table order; every column when none are. */
export function pickColumns<C extends { key: string }>(columns: readonly C[], query: URLSearchParams): C[] {
  const wanted = new Set(query.getAll("col"));
  const picked = columns.filter((c) => wanted.has(c.key));
  return picked.length ? picked : [...columns];
}

/**
 * The address a sortable heading links to: the same page sorted by `key`, ascending first and
 * flipping direction when it's already the sort.
 */
export function sortLink(params: URLSearchParams, key: string, current: { sort: string; dir: SortDir }, firstDir: SortDir = "asc") {
  const next = new URLSearchParams(params);
  next.set("sort", key);
  next.set("dir", current.sort === key ? (current.dir === "asc" ? "desc" : "asc") : firstDir);
  return `?${next}`;
}
