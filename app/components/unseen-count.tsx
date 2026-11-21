/**
 * "3 New Updates" in red beside a heading: things the member hasn't seen or done yet, or nothing
 * when there are none. The noun is singular and plural, such as ["Form", "Forms"].
 */
export function UnseenCount({ count, noun = ["Update", "Updates"] }: { count: number; noun?: [string, string] }) {
  if (count <= 0) return null;
  return (
    <span className="ml-2 inline-block rounded-full bg-[#B3261E] px-2 py-0.5 text-xs font-bold whitespace-nowrap text-white">
      {count} New {count === 1 ? noun[0] : noun[1]}
    </span>
  );
}
