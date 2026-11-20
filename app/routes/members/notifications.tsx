import { Link } from "react-router";

import { Avatar } from "~/components/profile-ui";
import { servicesContext } from "~/context";
import { listNotifications, markNotificationsRead, type Notification } from "~/lib/community.server";
import { getViewerZone } from "~/lib/viewer-zone.server";
import type { Route } from "./+types/notifications";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Notifications · Members · Limicon" }];
}

/** The member's notifications. Opening the page marks them all read; new ones stay highlighted this once. */
export async function loader({ request, context }: Route.LoaderArgs) {
  const services = context.get(servicesContext);
  const db = services.db();
  const userId = services.viewer!.userId;
  const [notifications, viewerZone] = await Promise.all([listNotifications(db, userId), getViewerZone(db, userId, request.headers.get("Cookie"))]);
  if (notifications.some((n) => !n.read)) await markNotificationsRead(db, userId);
  return { notifications, zone: viewerZone.zone };
}

const what: Record<Notification["kind"], string> = {
  mention: "mentioned you",
  everyone: "tagged everyone",
  comment: "commented on your post",
  reply: "replied to your comment",
};

function where(n: Notification) {
  if (n.kind === "comment" || n.kind === "reply") return "";
  return n.commentId ? " in a comment" : " in a post";
}

export default function Notifications({ loaderData }: Route.ComponentProps) {
  const { notifications, zone } = loaderData;
  const when = (value: Date | string) =>
    new Intl.DateTimeFormat("en-US", { timeZone: zone, dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-semibold">Notifications</h1>
      <p className="mt-2">When someone mentions you, replies to your comment or comments on your post in Community.</p>
      {notifications.length === 0 ? (
        <p className="mt-8">Nothing yet.</p>
      ) : (
        <ul className="mt-6 grid gap-2">
          {notifications.map((n) => (
            <li key={n.id}>
              <Link
                to={`/members/community?post=${n.postId}${n.commentId ? `#comment-${n.commentId}` : ""}`}
                className={`flex gap-3 rounded-lg border p-4 hover:border-[#15383F] dark:hover:border-[#8CC7D3] ${
                  n.read
                    ? "border-[#C9DADC] bg-white dark:border-[#24363B] dark:bg-[#12201F]"
                    : "border-[#8CC7D3] bg-[#E6F5F6] dark:border-[#3A6E7A] dark:bg-[#15303A]"
                }`}
              >
                <Avatar name={n.actorName} avatarKey={n.actorAvatarKey} className="size-10 text-sm" />
                <span className="min-w-0 flex-1">
                  <span className="block">
                    <span className="font-semibold">{n.actorName}</span> {what[n.kind]}{where(n)}
                    {!n.read && <span className="sr-only"> (new)</span>}
                  </span>
                  {n.excerpt && <span className="mt-0.5 line-clamp-2 block text-sm opacity-80">“{n.excerpt}”</span>}
                  <span className="mt-0.5 block text-sm opacity-70">{when(n.createdAt)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
