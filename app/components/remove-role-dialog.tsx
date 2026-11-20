import { useEffect, useId, useRef, useState } from "react";

import { dangerButton, inputClass, secondaryButton } from "~/components/admin-ui";
import { REMOVAL_REASON_MAX } from "~/lib/admin-roles";

/**
 * Asks why a person is being removed from roles, before the removal goes through. It sits inside
 * the form that removes them: its reason box posts as `reason`, and Remove submits that form,
 * staying disabled until a reason is typed. Cancel and Escape close it without submitting. The
 * server refuses a removal without a reason too (`checkRoleChange`), so this can't be skipped.
 */
export function RemoveRoleDialog({
  open,
  onClose,
  person,
  roleNames,
  busy,
  submitName,
  submitValue,
}: {
  open: boolean;
  onClose: () => void;
  person: string;
  roleNames: string[];
  busy: boolean;
  /** The Remove button's own name and value, such as `intent` and `revoke`, when the form needs them. */
  submitName?: string;
  submitValue?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const id = useId();
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) {
      setReason("");
      el.showModal();
    } else if (!open && el.open) el.close();
  }, [open]);

  const what = roleNames.length === 1 ? `the ${roleNames[0]} role` : `these roles: ${roleNames.join(", ")}`;
  return (
    <dialog
      ref={dialog}
      aria-labelledby={`${id}-title`}
      className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-lg p-6 backdrop:bg-black/50 dark:bg-[#12201F] dark:text-[#E3EEF0]"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <h2 id={`${id}-title`} className="text-lg font-semibold">Remove {roleNames.length === 1 ? "role" : "roles"}?</h2>
      <p className="mt-2 text-sm">
        You're removing {person} from {what}. Say why, for the team's record.
      </p>
      <label htmlFor={`${id}-reason`} className="mt-4 block text-sm font-medium">Reason</label>
      <textarea
        id={`${id}-reason`}
        name="reason"
        rows={2}
        maxLength={REMOVAL_REASON_MAX}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        disabled={!open}
        className={`${inputClass} mt-1 w-full`}
      />
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="submit"
          name={submitName}
          value={submitValue}
          disabled={busy || !reason.trim()}
          className={`${dangerButton} border border-current disabled:opacity-50`}
        >
          Remove
        </button>
        <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
      </div>
    </dialog>
  );
}
