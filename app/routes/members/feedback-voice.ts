import { data } from "react-router";

import { servicesContext } from "~/context";
import { audioExtension, VOICE_KEY, VOICE_MAX_BYTES, VOICE_TYPES } from "~/lib/voice-notes";
import type { Route } from "./+types/feedback-voice";

/**
 * Plays a voice note to its author, or to an admin. Anyone else gets "Not found", so a key alone
 * never reveals someone's recording. Before the harvest is sent, only the uploader can play it.
 */
export async function loader({ params, context }: Route.LoaderArgs) {
  const key = `voice/${params.key}`;
  const match = VOICE_KEY.exec(key);
  if (!match) return new Response("Not found", { status: 404 });
  const services = context.get(servicesContext);
  const { isAdmin } = await services.membership();
  const object = await services.media.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  if (!isAdmin && object.customMetadata?.uploadedBy !== services.viewer!.userId) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(object.body, {
    headers: {
      // The type comes from our own list, never from what the uploader claimed.
      "Content-Type": VOICE_TYPES[match[1]!]!,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      ETag: object.httpEtag,
    },
  });
}

/**
 * Stores a voice note and answers with its key. Only audio, up to 25 MB, whose first bytes match a
 * type we keep. Attaching it to a harvest is the form's own Send, which checks the uploader.
 */
export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") return data({ error: "Post a voice note." }, { status: 405 });
  const services = context.get(servicesContext);
  const tooBig = "Voice notes can be up to 25 MB, about 25 minutes from a phone.";
  const length = Number(request.headers.get("Content-Length") ?? 0);
  if (length > VOICE_MAX_BYTES + 64 * 1024) return data({ error: tooBig }, { status: 413 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return data({ error: "That recording was empty. Try again." }, { status: 400 });
  if (file.size > VOICE_MAX_BYTES) return data({ error: tooBig }, { status: 413 });
  const ext = audioExtension(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  if (!ext) return data({ error: "That file isn't a recording we can play. Use an MP3, M4A, WAV, OGG or WebM file." }, { status: 400 });

  const key = `voice/${crypto.randomUUID()}.${ext}`;
  await services.media.put(key, file.stream(), {
    httpMetadata: { contentType: VOICE_TYPES[ext] },
    customMetadata: { uploadedBy: services.viewer!.userId },
  });
  return { key };
}
