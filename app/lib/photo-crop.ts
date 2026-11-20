/**
 * The square photo cropper's geometry (app/components/photo-cropper.tsx). Everything is measured in
 * frames: 1 is the width of the square the schedule shows, so the math doesn't depend on the
 * screen. `x` and `y` place the photo's top-left corner relative to the frame's.
 */

export type Crop = { zoom: number; x: number; y: number; fit: boolean };
export type Layout = { x: number; y: number; width: number; height: number };

export const ZOOM_MAX = 4;
/** The square's side, in pixels, of the photo the cropper uploads. */
export const OUTPUT_SIZE = 800;
/** The background behind a photo shown whole: the site's dark teal. */
export const FIT_BACKGROUND = "#15383F";

/** The photo's size in frames: covering the frame at zoom 1, or fitting inside it whole. */
export function photoSize(natural: { width: number; height: number }, crop: Pick<Crop, "zoom" | "fit">) {
  const { width, height } = natural;
  const scale = crop.fit ? 1 / Math.max(width, height) : crop.zoom / Math.min(width, height);
  return { width: width * scale, height: height * scale };
}

/** Keeps a covering photo over the whole frame, so no gap shows at an edge. */
export function clampOffset(size: { width: number; height: number }, x: number, y: number) {
  return { x: Math.min(0, Math.max(1 - size.width, x)), y: Math.min(0, Math.max(1 - size.height, y)) };
}

/** Where the photo sits: centered when shown whole, else where the member moved it. */
export function layout(natural: { width: number; height: number }, crop: Crop): Layout {
  const size = photoSize(natural, crop);
  if (crop.fit) return { x: (1 - size.width) / 2, y: (1 - size.height) / 2, ...size };
  return { ...clampOffset(size, crop.x, crop.y), ...size };
}

/** A new crop centered on the photo, covering the frame. */
export function initialCrop(natural: { width: number; height: number }): Crop {
  const size = photoSize(natural, { zoom: 1, fit: false });
  return { zoom: 1, fit: false, x: (1 - size.width) / 2, y: (1 - size.height) / 2 };
}

/** Zooms, keeping the point at the frame's center where it is. */
export function zoomTo(natural: { width: number; height: number }, crop: Crop, zoom: number): Crop {
  const next = Math.min(ZOOM_MAX, Math.max(1, zoom));
  const ratio = next / crop.zoom;
  const x = 0.5 - (0.5 - crop.x) * ratio;
  const y = 0.5 - (0.5 - crop.y) * ratio;
  return { ...crop, zoom: next, ...clampOffset(photoSize(natural, { zoom: next, fit: false }), x, y) };
}

/** Moves the photo by `dx` and `dy` frames. */
export function moveBy(natural: { width: number; height: number }, crop: Crop, dx: number, dy: number): Crop {
  return { ...crop, ...clampOffset(photoSize(natural, crop), crop.x + dx, crop.y + dy) };
}
