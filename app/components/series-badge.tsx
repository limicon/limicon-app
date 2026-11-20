/** Marks one date of a repeating session on the schedule. */
export function SeriesBadge({ recurring }: { recurring: boolean }) {
  if (!recurring) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#E6F5F6] px-2 py-0.5 text-sm font-semibold text-[#15383F] dark:bg-[#1C3A40] dark:text-[#CDEBEF]">
      <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 6.5A5 5 0 0 0 4 4.2L2.5 5.5M3 9.5a5 5 0 0 0 9 2.3l1.5-1.3" />
        <path d="M2.5 2.5v3h3M13.5 13.5v-3h-3" />
      </svg>
      Recurring session
    </span>
  );
}
