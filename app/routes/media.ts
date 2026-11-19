import { servicesContext } from "~/context";
import { MEDIA_KEY, MEDIA_TYPES } from "~/lib/media";
import type { Route } from "./+types/media";

/**
 * Serves an uploaded image or file by its key. Keys are random, and files never change once
 * stored, so browsers may cache them for a year.
 */
export async function loader({ params, context }: Route.LoaderArgs) {
  const match = MEDIA_KEY.exec(params.key);
  const kind = match && MEDIA_TYPES[match[1]!];
  if (!kind) return new Response("Not found", { status: 404 });
  const object = await context.get(servicesContext).media.get(params.key);
  if (!object) return new Response("Not found", { status: 404 });
  const filename = (object.customMetadata?.filename ?? params.key).replace(/["\\\r\n]/g, "");
  return new Response(object.body, {
    headers: {
      // The type comes from our own list, never from what the uploader claimed.
      "Content-Type": kind.type,
      "Content-Disposition": `${kind.image || kind.type === "application/pdf" ? "inline" : "attachment"}; filename="${filename}"`,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      ETag: object.httpEtag,
    },
  });
}
