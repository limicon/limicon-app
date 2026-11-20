/**
 * Uploaded media: which files admins may upload, and where they're served. Shared by the upload
 * route, the media route and the editors.
 */

export const MEDIA_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Allowed upload types by extension. SVG and HTML are left out: a browser runs scripts inside
 * them, and they'd be served from the app's own origin.
 */
export const MEDIA_TYPES: Record<string, { type: string; image: boolean }> = {
  png: { type: "image/png", image: true },
  jpg: { type: "image/jpeg", image: true },
  jpeg: { type: "image/jpeg", image: true },
  gif: { type: "image/gif", image: true },
  webp: { type: "image/webp", image: true },
  pdf: { type: "application/pdf", image: false },
  txt: { type: "text/plain; charset=utf-8", image: false },
  csv: { type: "text/csv; charset=utf-8", image: false },
  doc: { type: "application/msword", image: false },
  docx: { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", image: false },
  xls: { type: "application/vnd.ms-excel", image: false },
  xlsx: { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", image: false },
  ppt: { type: "application/vnd.ms-powerpoint", image: false },
  pptx: { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation", image: false },
};

export const IMAGE_ACCEPT = Object.entries(MEDIA_TYPES)
  .filter(([, t]) => t.image)
  .map(([ext]) => `.${ext}`)
  .join(",");
export const FILE_ACCEPT = Object.keys(MEDIA_TYPES)
  .map((ext) => `.${ext}`)
  .join(",");

/** A stored file's key: a random name plus its extension, such as `3f2a….png`. */
export const MEDIA_KEY = /^[0-9a-f-]{36}\.([a-z0-9]{2,5})$/;

export function mediaUrl(key: string) {
  return `/media/${key}`;
}

/** The key in a /media/ address, or null when it isn't one of ours. */
export function mediaKeyFromUrl(url: string): string | null {
  const match = /^\/media\/([^/?#]+)$/.exec(url);
  return match && MEDIA_KEY.test(match[1]!) ? match[1]! : null;
}

export function extensionOf(filename: string) {
  return /\.([a-z0-9]+)$/i.exec(filename)?.[1]?.toLowerCase() ?? "";
}

/** The most a member's photo upload may weigh: smaller than admins' files, since any member can add one. */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** A stored image's key, as sessions and profiles save it. Matches the database's own check. */
export const IMAGE_KEY = /^[0-9a-f-]{36}\.(png|jpg|jpeg|gif|webp)$/;

/** The first bytes each image type starts with. */
const IMAGE_SIGNATURES: Record<string, (b: Uint8Array) => boolean> = {
  png: (b) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x),
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  jpeg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  gif: (b) => String.fromCharCode(...b.slice(0, 6)) === "GIF87a" || String.fromCharCode(...b.slice(0, 6)) === "GIF89a",
  webp: (b) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP",
};

/** Whether a file's first bytes are those of the image type its extension names. */
export function looksLikeImage(ext: string, head: Uint8Array): boolean {
  return IMAGE_SIGNATURES[ext]?.(head) ?? false;
}
