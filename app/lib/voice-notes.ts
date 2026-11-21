/**
 * Voice notes on a Session Harvest: recorded in the browser or uploaded from a phone's voice memos.
 * They're kept under `voice/` in the media bucket and served only to their author and admins, never
 * at the public /media/ address. Shared by the upload route, the playback route and the form.
 */

/** About 25 minutes of a phone's voice memo, and far more of a browser recording. */
export const VOICE_MAX_BYTES = 25 * 1024 * 1024;

/** The longest recording the form makes, in seconds. */
export const VOICE_MAX_SECONDS = 15 * 60;

export const VOICE_TYPES: Record<string, string> = {
  webm: "audio/webm",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

/** File types the upload button offers. Phones save voice memos as .m4a. */
export const VOICE_ACCEPT = "audio/*,.m4a,.mp4,.webm,.ogg,.mp3,.wav";

/** A stored voice note's key, such as `voice/3f2a….webm`. Matches the database's own check. */
export const VOICE_KEY = /^voice\/[0-9a-f-]{36}\.(webm|m4a|ogg|mp3|wav)$/;

/** The address a voice note plays from. */
export function voiceNoteUrl(key: string) {
  return `/members/feedback/voice/${key.slice("voice/".length)}`;
}

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.slice(from, to));

/**
 * The extension a file's first bytes say it is, or null when they aren't an audio type we keep.
 * Browsers record WebM (Chrome, Firefox) or MP4 (Safari); MP4 audio is stored as .m4a.
 */
export function audioExtension(head: Uint8Array): string | null {
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return "webm";
  if (ascii(head, 4, 8) === "ftyp") return "m4a";
  if (ascii(head, 0, 4) === "OggS") return "ogg";
  if (ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 12) === "WAVE") return "wav";
  if (ascii(head, 0, 3) === "ID3" || (head[0] === 0xff && ((head[1] ?? 0) & 0xe0) === 0xe0)) return "mp3";
  return null;
}
