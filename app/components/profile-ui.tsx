import { Link } from "react-router";

import { ICONS, type IconName } from "~/lib/icons";
import { mediaUrl } from "~/lib/media";

/** One of the profile icons, sized by `className` and colored by the text color. Decorative. */
export function Icon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  const icon = ICONS[name];
  return (
    <svg viewBox={`0 0 ${icon.width} 512`} className={className} fill="currentColor" aria-hidden="true" focusable="false">
      <path d={icon.path} />
    </svg>
  );
}

/** A member's round picture, or their initials when they haven't added one. */
export function Avatar({ name, avatarKey, className }: { name: string; avatarKey: string | null; className: string }) {
  if (avatarKey) {
    return <img src={mediaUrl(avatarKey)} alt="" loading="lazy" className={`${className} shrink-0 rounded-full border border-[#C9DADC] object-cover dark:border-[#24363B]`} />;
  }
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  return (
    <span aria-hidden="true" className={`${className} grid shrink-0 place-items-center rounded-full bg-[#15383F] font-semibold text-[#F3E6D7] dark:bg-[#F3E6D7] dark:text-[#15383F]`}>
      {initials || "?"}
    </span>
  );
}

/** "(admin)" beside the name of someone who holds the Admin role, on their comments. */
export function AdminTag() {
  return <span className="ml-1 text-sm font-semibold text-[#1F6F86] dark:text-[#8CC7D3]">(admin)</span>;
}

/** A keyword chip that opens the directory filtered to everyone sharing it. */
export function KeywordChip({ keyword }: { keyword: string }) {
  return (
    <Link
      to={`/members/people?keyword=${encodeURIComponent(keyword.toLowerCase())}`}
      className="inline-block rounded-full bg-[#E1EEF0] px-3 py-1 text-sm font-medium text-[#15383F] hover:bg-[#C9DFE3] dark:bg-[#1C3238] dark:text-[#E3EEF0] dark:hover:bg-[#24414A]"
    >
      {keyword}
    </Link>
  );
}
