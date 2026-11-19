import { data } from "react-router";

import { servicesContext } from "~/context";
import { extensionOf, MEDIA_MAX_BYTES, MEDIA_TYPES, mediaUrl } from "~/lib/media";
import { requireAdmin } from "~/middleware/services.server";
import type { Route } from "./+types/upload";

export const middleware: Route.MiddlewareFunction[] = [requireAdmin];

/** Uploads serve the event image (settings) and the website's pages and policies (website). */
async function mayUpload(context: Route.ActionArgs["context"]) {
  const privileges = await context.get(servicesContext).privileges();
  return privileges.has("settings") || privileges.has("website");
}

/**
 * Stores one uploaded file in the media bucket and answers with its address, for the event image
 * and the rich text editors. Only admins upload. Pass `images=1` to accept only images.
 */
export async function action({ request, context }: Route.ActionArgs) {
  if (!(await mayUpload(context))) return data({ error: "Your admin role can't upload files." }, { status: 403 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return data({ error: "Choose a file." }, { status: 400 });
  const ext = extensionOf(file.name);
  const kind = MEDIA_TYPES[ext];
  if (!kind || (form.get("images") === "1" && !kind.image)) {
    return data({ error: "That kind of file can't be uploaded. Use an image, PDF or office document." }, { status: 400 });
  }
  if (file.size > MEDIA_MAX_BYTES) return data({ error: "Files can be up to 10 MB." }, { status: 400 });

  const key = `${crypto.randomUUID()}.${ext}`;
  const services = context.get(servicesContext);
  await services.media.put(key, file.stream(), {
    httpMetadata: { contentType: kind.type },
    customMetadata: { filename: file.name.slice(0, 200), uploadedBy: services.viewer!.userId },
  });
  return { url: mediaUrl(key), name: file.name, image: kind.image };
}
