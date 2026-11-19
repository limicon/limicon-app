import { Form, useSubmit } from "react-router";

import { inputClass } from "~/components/admin-ui";

/**
 * A person's admin role as a menu that saves as soon as it changes. "Member" means no role.
 * Without JavaScript, a Save button does the same.
 */
export function RoleSelect({
  profileId,
  current,
  roles,
  label,
}: {
  profileId: string;
  current: string;
  roles: { key: string; name: string }[];
  label: string;
}) {
  const submit = useSubmit();
  return (
    <Form method="post" className="flex items-center gap-2" onChange={(event) => submit(event.currentTarget)}>
      <input type="hidden" name="profileId" value={profileId} />
      <select name="role" defaultValue={current} aria-label={label} className={`${inputClass} w-auto py-1 text-sm`}>
        <option value="">Member (no admin role)</option>
        {roles.map((r) => (
          <option key={r.key} value={r.key}>{r.name}</option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="text-sm underline">Save</button>
      </noscript>
    </Form>
  );
}
