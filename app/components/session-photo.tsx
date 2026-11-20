import { sessionPhoto } from "~/lib/photos";

/**
 * A session's square picture on the schedule: its photo, its host's profile picture, or
 * Limicon's logo (app/lib/photos.ts). `className` sets its size.
 */
export function SessionPhoto({
  session,
  className,
}: {
  session: { title: string; imageKey: string | null; hostAvatarKey: string | null; hostName: string | null };
  className: string;
}) {
  const photo = sessionPhoto(session);
  return (
    <img
      src={photo.src}
      alt={photo.alt}
      data-photo={photo.kind}
      loading="lazy"
      decoding="async"
      width={192}
      height={192}
      className={`${className} shrink-0 rounded-md border border-[#C9DADC] bg-[#0B1417] object-cover dark:border-[#24363B]`}
    />
  );
}
