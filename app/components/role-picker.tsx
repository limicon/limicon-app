import { useEffect, useState } from "react";
import { Form, useLocation, useNavigation } from "react-router";

import { Badge, primaryButton } from "~/components/admin-ui";
import { ADMIN_ROLE } from "~/lib/admin-roles";

type RoleOption = { key: string; name: string };

/** A person's roles as badges, Admin first. "Member" when they hold none. */
export function RoleBadges({ current, roles }: { current: string[]; roles: RoleOption[] }) {
  const held = roles.filter((r) => current.includes(r.key));
  if (!held.length) return <span className="opacity-60">Member</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {held.map((r) => (
        <Badge key={r.key} tone={r.key === ADMIN_ROLE ? "amber" : "blue"}>{r.name}</Badge>
      ))}
    </span>
  );
}

/**
 * A checkbox per role, for an admin to set what a person holds; their privileges add up. Admin
 * can be given to anyone but only removed by the person themselves, so for anyone else it stays
 * ticked. `compact` folds the boxes under the person's badges, for a table row.
 */
export function RolePicker({
  profileId,
  current,
  roles,
  isSelf,
  compact = false,
}: {
  profileId: string;
  current: string[];
  roles: RoleOption[];
  isSelf: boolean;
  compact?: boolean;
}) {
  const busy = useNavigation().state !== "idle";
  // A saved change comes back as a new page, which starts the boxes and their Save button afresh
  // and closes the row's box. A refused save returns no new page, so the box stays open beside the problem.
  const pageKey = useLocation().key;
  const [changed, setChanged] = useState(false);
  useEffect(() => setChanged(false), [pageKey]);
  const lockedAdmin = current.includes(ADMIN_ROLE) && !isSelf;
  const form = (
    <Form method="post" className="grid gap-2" key={`${current.join(",")} ${pageKey}`} onChange={() => setChanged(true)}>
      <input type="hidden" name="intent" value="set-roles" />
      <input type="hidden" name="profileId" value={profileId} />
      {/* A disabled box doesn't post, so a locked Admin role posts here instead. */}
      {lockedAdmin && <input type="hidden" name="role" value={ADMIN_ROLE} />}
      <fieldset className="grid gap-1">
        <legend className="sr-only">Roles</legend>
        {roles.map((r) => {
          const locked = r.key === ADMIN_ROLE && lockedAdmin;
          return (
            <label key={r.key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="role" value={r.key} defaultChecked={current.includes(r.key)} disabled={locked} className="size-4" />
              {r.name}
              {locked && <span className="text-xs opacity-70">(only they can remove it)</span>}
            </label>
          );
        })}
      </fieldset>
      <div>
        <button type="submit" disabled={busy || !changed} className={`${primaryButton} px-3 py-1 text-sm`}>Save roles</button>
      </div>
    </Form>
  );
  if (!compact) return form;
  return (
    <details className="group" key={pageKey}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 [&::-webkit-details-marker]:hidden">
        <RoleBadges current={current} roles={roles} />
        <span className="text-xs underline">Change</span>
      </summary>
      <div className="mt-2 rounded border border-[#C9DADC] bg-white p-3 dark:border-[#24363B] dark:bg-[#12201F]">{form}</div>
    </details>
  );
}
