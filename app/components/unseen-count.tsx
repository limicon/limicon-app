/** "3 New Updates" in red beside Updates: posts the member hasn't seen, or nothing when none. */
export function UnseenCount({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-2 inline-block rounded-full bg-[#B3261E] px-2 py-0.5 text-xs font-bold whitespace-nowrap text-white">
      {count} New {count === 1 ? "Update" : "Updates"}
    </span>
  );
}
