import { IMAGE_KEY, mediaUrl } from "~/lib/media";

/** Limicon's square logo, for sessions whose host has no picture either. */
export const LOGO_SRC = "/logo-square.png";

export type SessionPhoto = {
  src: string;
  alt: string;
  /** Which picture it is, so the page can fit it: a photo fills its box, the logo sits inside it. */
  kind: "session" | "host" | "logo";
};

/**
 * The picture a session shows on the schedule: its own photo, or else the profile picture of the
 * host who created it, or else Limicon's logo.
 */
export function sessionPhoto(session: {
  title: string;
  imageKey: string | null;
  hostAvatarKey: string | null;
  hostName: string | null;
}): SessionPhoto {
  if (session.imageKey && IMAGE_KEY.test(session.imageKey)) {
    return { src: mediaUrl(session.imageKey), alt: `Photo for ${session.title}`, kind: "session" };
  }
  if (session.hostAvatarKey && IMAGE_KEY.test(session.hostAvatarKey)) {
    return {
      src: mediaUrl(session.hostAvatarKey),
      alt: session.hostName ? `${session.hostName}, the host` : "The host",
      kind: "host",
    };
  }
  return { src: LOGO_SRC, alt: "Limicon logo", kind: "logo" };
}
