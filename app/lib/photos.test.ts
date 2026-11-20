import { describe, expect, test } from "vitest";

import { looksLikeImage } from "./media";
import { LOGO_SRC, sessionPhoto } from "./photos";

const photoKey = "3f2a1b4c-0000-4000-8000-000000000001.jpg";
const avatarKey = "3f2a1b4c-0000-4000-8000-000000000002.png";

describe("sessionPhoto", () => {
  test("shows the session's own photo first", () => {
    expect(sessionPhoto({ title: "Deep listening", imageKey: photoKey, hostAvatarKey: avatarKey, hostName: "Ada Lovelace" })).toEqual({
      src: `/media/${photoKey}`,
      alt: "Photo for Deep listening",
      kind: "session",
    });
  });

  test("falls back to the host's profile picture", () => {
    expect(sessionPhoto({ title: "Deep listening", imageKey: null, hostAvatarKey: avatarKey, hostName: "Ada Lovelace" })).toEqual({
      src: `/media/${avatarKey}`,
      alt: "Ada Lovelace, the host",
      kind: "host",
    });
    expect(sessionPhoto({ title: "Deep listening", imageKey: null, hostAvatarKey: avatarKey, hostName: null }).alt).toBe("The host");
  });

  test("falls back to the logo when the host has no picture", () => {
    expect(sessionPhoto({ title: "Deep listening", imageKey: null, hostAvatarKey: null, hostName: "Ada Lovelace" })).toEqual({
      src: LOGO_SRC,
      alt: "Limicon logo",
      kind: "logo",
    });
  });

  test("ignores keys that aren't stored images", () => {
    const photo = sessionPhoto({ title: "x", imageKey: "../secret.pdf", hostAvatarKey: "https://example.org/a.png", hostName: null });
    expect(photo.kind).toBe("logo");
  });
});

describe("looksLikeImage", () => {
  const bytes = (...values: number[]) => new Uint8Array(values);
  const ascii = (text: string) => new Uint8Array([...text].map((c) => c.charCodeAt(0)));

  test("recognizes each image type by its first bytes", () => {
    expect(looksLikeImage("png", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe(true);
    expect(looksLikeImage("jpg", bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(looksLikeImage("jpeg", bytes(0xff, 0xd8, 0xff, 0xdb))).toBe(true);
    expect(looksLikeImage("gif", ascii("GIF89a"))).toBe(true);
    expect(looksLikeImage("webp", ascii("RIFF\0\0\0\0WEBP"))).toBe(true);
  });

  test("refuses files whose bytes don't match their extension", () => {
    expect(looksLikeImage("png", ascii("<html><script>"))).toBe(false);
    expect(looksLikeImage("jpg", bytes(0x89, 0x50, 0x4e, 0x47))).toBe(false);
    expect(looksLikeImage("pdf", ascii("%PDF-1.7"))).toBe(false);
  });
});
