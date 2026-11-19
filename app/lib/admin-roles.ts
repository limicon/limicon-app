/**
 * Admin roles (AUTH-5). Admins hold the built-in Admin role, which can do everything. Other roles
 * give a person particular privileges, such as a Bookkeeper seeing orders and money. A person may
 * hold several roles, and their privileges add up.
 */

/** The privileges a role can be given, shown as checkboxes when adding or editing a role. */
export const PRIVILEGES = [
  { key: "orders", label: "See orders and money", help: "Orders, revenue, recent buyers and incomplete purchases, and downloading orders." },
  { key: "settings", label: "Edit settings", help: "The event's details, the registration form, comp tickets, ticket tiers, switches and member links." },
  { key: "inbox", label: "View and reply to team@limicon.org emails", help: "The team inbox, once it's built in the app." },
  { key: "email", label: "Send emails from team@limicon.org", help: "Emails to members and lists, once sending is built in the app." },
  { key: "website", label: "Edit website", help: "Website pages on the site and in the console, the FAQ and the policies, and uploading images and files." },
  { key: "updates", label: "Post updates to the website", help: "Posts on the Members area's Updates page, such as the newsletter: adding and editing their own posts but not deleting any, and seeing when members edit comments." },
] as const;

/** `admin` belongs only to the Admin role: the people, sessions, roles and team pages. */
export type Privilege = (typeof PRIVILEGES)[number]["key"] | "admin";
export const ALL_PRIVILEGES: Privilege[] = ["admin", ...PRIVILEGES.map((p) => p.key)];

export function isPrivilege(value: unknown): value is Privilege {
  return ALL_PRIVILEGES.includes(value as Privilege);
}

/** The built-in Admin role, which has every privilege, including ones added later. */
export const ADMIN_ROLE = "full";

export type Role = { key: string; name: string; privileges: Privilege[]; builtIn: boolean; holders: number };

export const ROLE_NAME_MAX = 60;

/** A role's name and ticked privileges, from its form. Only the Admin role has `admin`. */
export function checkRoleForm(form: { get(name: string): unknown; getAll(name: string): unknown[] }):
  | { ok: true; name: string; privileges: Privilege[] }
  | { ok: false; input: { name: string; privileges: string[] }; errors: { name?: string; privileges?: string } } {
  const name = typeof form.get("name") === "string" ? (form.get("name") as string).trim() : "";
  const ticked = form.getAll("privilege").filter((p): p is string => typeof p === "string");
  const privileges = PRIVILEGES.map((p) => p.key).filter((p) => ticked.includes(p));
  const errors: { name?: string; privileges?: string } = {};
  if (!name) errors.name = "Give the role a name.";
  else if ([...name].length > ROLE_NAME_MAX) errors.name = `Keep the name to ${ROLE_NAME_MAX} characters.`;
  else if (name.toLowerCase() === "admin") errors.name = "Admin is the built-in role. Choose another name.";
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

/**
 * Checks a change to a person's roles by an admin. Admins may give anyone the Admin role but may
 * take it away only from themselves, and only while another admin remains.
 */
export function checkRoleChange(args: {
  current: string[];
  next: string[];
  isSelf: boolean;
  otherAdmins: number;
}): { ok: true } | { ok: false; problem: string } {
  const losingAdmin = args.current.includes(ADMIN_ROLE) && !args.next.includes(ADMIN_ROLE);
  if (losingAdmin && !args.isSelf) return { ok: false, problem: "Admins can't remove admin status from someone else." };
  if (losingAdmin && args.otherAdmins === 0) return { ok: false, problem: "You're the only admin, so you can't step down until someone else is one." };
  return { ok: true };
}
