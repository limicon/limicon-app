/**
 * Admin roles (AUTH-5): what each privilege allows, and checking a role posted from its form.
 * The privileges are a first draft for the Organizing Team to revise (PRD open question 2).
 */

export const PRIVILEGES = [
  {
    key: "settings",
    label: "Run the event",
    help: "Settings: the event's details, the registration form, comp tickets, ticket tiers, switches and member links.",
  },
  {
    key: "people",
    label: "See and look after people",
    help: "Users and Guests: everyone's details and registration answers, names, deactivating accounts, notes, and downloads.",
  },
  {
    key: "orders",
    label: "See orders and money",
    help: "Orders, revenue, recent buyers and incomplete purchases, and downloading orders.",
  },
  {
    key: "sessions",
    label: "Manage sessions",
    help: "Sessions: edit, publish, take off the calendar or delete any session, and mark co-creation meetings.",
  },
  {
    key: "website",
    label: "Edit the website",
    help: "Website pages on the site and in the console, the FAQ and the policies, and uploading images and files.",
  },
  {
    key: "roles",
    label: "Manage roles and admins",
    help: "Create and change roles, give people roles or take them away, and invite admins on the Team page.",
  },
] as const;

export type Privilege = (typeof PRIVILEGES)[number]["key"];
export const ALL_PRIVILEGES: Privilege[] = PRIVILEGES.map((p) => p.key);

export function isPrivilege(value: unknown): value is Privilege {
  return ALL_PRIVILEGES.includes(value as Privilege);
}

/** The built-in role that has every privilege, including ones added later. */
export const FULL_ROLE = "full";

export type Role = { key: string; name: string; privileges: Privilege[]; builtIn: boolean; holders: number };

export const ROLE_NAME_MAX = 60;

/** A role's name and ticked privileges, from its form. */
export function checkRoleForm(form: { get(name: string): unknown; getAll(name: string): unknown[] }):
  | { ok: true; name: string; privileges: Privilege[] }
  | { ok: false; input: { name: string; privileges: string[] }; errors: { name?: string; privileges?: string } } {
  const name = typeof form.get("name") === "string" ? (form.get("name") as string).trim() : "";
  const ticked = form.getAll("privilege").filter((p): p is string => typeof p === "string");
  const privileges = ALL_PRIVILEGES.filter((p) => ticked.includes(p));
  const errors: { name?: string; privileges?: string } = {};
  if (!name) errors.name = "Give the role a name.";
  else if ([...name].length > ROLE_NAME_MAX) errors.name = `Keep the name to ${ROLE_NAME_MAX} characters.`;
  if (!privileges.length) errors.privileges = "Tick at least one thing this role can do.";
  if (errors.name || errors.privileges) return { ok: false, input: { name, privileges: ticked }, errors };
  return { ok: true, name, privileges };
}

/** A key for a new role from its name, such as "Site editor" → `site_editor`, unique among `taken`. */
export function roleKeyFromName(name: string, taken: Set<string>) {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^(\d)/, "r_$1")
      .slice(0, 30) || "role";
  let key = base;
  for (let n = 2; taken.has(key); n++) key = `${base}_${n}`;
  return key;
}
