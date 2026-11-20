import { describe, expect, test } from "vitest";

import { initialCrop, layout, moveBy, zoomTo, ZOOM_MAX } from "./photo-crop";

const wide = { width: 2000, height: 1000 };
const tall = { width: 600, height: 1200 };

describe("photo cropper", () => {
  test("starts centered, with the photo's short side filling the square", () => {
    expect(layout(wide, initialCrop(wide))).toEqual({ x: -0.5, y: 0, width: 2, height: 1 });
    expect(layout(tall, initialCrop(tall))).toEqual({ x: 0, y: -0.5, width: 1, height: 2 });
  });

  test("moves only as far as keeps the square covered", () => {
    const start = initialCrop(wide);
    expect(layout(wide, moveBy(wide, start, 0.3, 0))).toMatchObject({ x: -0.2, y: 0 });
    expect(layout(wide, moveBy(wide, start, 5, 5))).toMatchObject({ x: 0, y: 0 });
    expect(layout(wide, moveBy(wide, start, -5, -5))).toMatchObject({ x: -1, y: 0 });
  });

  test("zooms around the square's center, between 1 and the most allowed", () => {
    const zoomed = zoomTo(wide, initialCrop(wide), 2);
    expect(layout(wide, zoomed)).toEqual({ x: -1.5, y: -0.5, width: 4, height: 2 });
    expect(zoomTo(wide, zoomed, 99).zoom).toBe(ZOOM_MAX);
    // Zooming back out pulls the photo back over any gap.
    const moved = moveBy(wide, zoomed, -2, -1);
    expect(layout(wide, zoomTo(wide, moved, 1))).toMatchObject({ x: -1, y: 0, width: 2, height: 1 });
  });

  test("shows the whole photo centered when fitted", () => {
    expect(layout(wide, { ...initialCrop(wide), fit: true })).toEqual({ x: 0, y: 0.25, width: 1, height: 0.5 });
    expect(layout(tall, { ...zoomTo(tall, initialCrop(tall), 3), fit: true })).toEqual({ x: 0.25, y: 0, width: 0.5, height: 1 });
  });
});
