import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router";

import { Avatar, Icon } from "~/components/profile-ui";

/** The bell beside the member's picture, with how many notifications they haven't seen, such as "(3)". */
export function NotificationBell({ count, tone = "light" }: { count: number; tone?: "light" | "dark" }) {
  return (
    <Link
      to="/members/notifications"
      aria-label={count ? `Notifications, ${count} new` : "Notifications"}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-2 font-semibold ${tone === "dark" ? "hover:bg-white/10" : "hover:bg-[#15383F]/10 dark:hover:bg-white/10"}`}
    >
      <Icon name="bell" className="size-6" />
      {count > 0 && (
        <span aria-hidden="true" className="rounded-full bg-[#B3261E] px-1.5 text-sm leading-5 text-white">({count > 99 ? "99+" : count})</span>
      )}
    </Link>
  );
}

/**
 * The signed-in member's picture, top right of every Members page. Choosing it opens View Profile,
 * Edit Profile and Settings; Escape, a click elsewhere or following a link closes it.
 */
export function ProfileMenu({ me, tone = "light" }: { me: { id: string; name: string; avatarKey: string | null }; tone?: "light" | "dark" }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname, location.search]);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = "block px-4 py-2 font-medium hover:bg-[#15383F]/10 focus-visible:bg-[#15383F]/10 dark:hover:bg-white/10";
  return (
    <div ref={box} className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Your account: ${me.name}`}
        onClick={() => setOpen(!open)}
        className={`block rounded-full ring-offset-2 hover:ring-2 focus-visible:ring-2 ${tone === "dark" ? "ring-2 ring-[#F3E6D7]/70 ring-offset-[#15383F] hover:ring-[#F3E6D7]" : "ring-[#15383F] dark:ring-[#8CC7D3] dark:ring-offset-[#0B1417]"}`}
      >
        <Avatar name={me.name} avatarKey={me.avatarKey} className="size-10 text-sm" />
      </button>
      {open && (
        <div
          id={menuId}
          className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-lg border border-[#C9DADC] bg-white py-1 text-[#15383F] shadow-lg dark:border-[#24363B] dark:bg-[#12201F] dark:text-[#E3EEF0]"
        >
          <p className="truncate border-b border-[#C9DADC] px-4 py-2 text-sm opacity-80 dark:border-[#24363B]">{me.name}</p>
          <ul>
            <li><Link to={`/members/people/${me.id}`} className={item}>View Profile</Link></li>
            <li><Link to="/members/profile" className={item}>Edit Profile</Link></li>
            <li><Link to="/members/settings" className={item}>Settings</Link></li>
          </ul>
        </div>
      )}
    </div>
  );
}
