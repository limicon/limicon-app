import { data } from "react-router";

import { servicesContext } from "~/context";
import { extensionOf, looksLikeImage, MEDIA_TYPES, mediaUrl, PHOTO_MAX_BYTES } from "~/lib/media";
import { requireViewer } from "~/middleware/services.server";
import type { Route } from "./+types/upload-photo";

export const middleware: Route.MiddlewareFunction[] = [requireViewer];

/**
 * Stores one photo in the media bucket and answers with its address: a session's photo, or a
 * member's profile picture. Members and admins may upload, images only, up to 5 MB, and the
 * file's first bytes must match its type. Saving the photo onto a session or profile is the
 * form's own Save, which checks who may edit it.
 */
export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") return data({ error: "Post a photo." }, { status: 405 });
  const services = context.get(servicesContext);
  const { status } = await services.membership();
  if (status !== "member") return data({ error: "Only Limicon members can add photos." }, { status: 403 });

  // Refuse oversized bodies before reading them.
  const length = Number(request.headers.get("Content-Length") ?? 0);
  if (length > PHOTO_MAX_BYTES + 64 * 1024) return data({ error: "Photos can be up to 5 MB." }, { status: 413 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return data({ error: "Choose a photo." }, { status: 400 });
  const ext = extensionOf(file.name);
  const kind = MEDIA_TYPES[ext];
  if (!kind?.image) return data({ error: "Use a PNG, JPEG, GIF or WebP image." }, { status: 400 });
  if (file.size > PHOTO_MAX_BYTES) return data({ error: "Photos can be up to 5 MB." }, { status: 413 });
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!looksLikeImage(ext, head)) return data({ error: "That file isn't the image its name says. Try another." }, { status: 400 });

  const key = `${crypto.randomUUID()}.${ext}`;
  await services.media.put(key, file.stream(), {
    httpMetadata: { contentType: kind.type },
    customMetadata: { filename: file.name.slice(0, 200), uploadedBy: services.viewer!.userId },
  });
  return { url: mediaUrl(key), name: file.name, image: true };
}
