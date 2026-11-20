import { describe, expect, test } from "vitest";

import { ICONS } from "./icons";
import { linkUrl, PLATFORMS } from "./profile-links";

describe("linkUrl", () => {
  test("turns handles and usernames into profile addresses", () => {
    expect(linkUrl("instagram", "@limicon")).toBe("https://www.instagram.com/limicon");
    expect(linkUrl("x", "limicon")).toBe("https://x.com/limicon");
    expect(linkUrl("bluesky", "@limicon.bsky.social")).toBe("https://bsky.app/profile/limicon.bsky.social");
    expect(linkUrl("youtube", "@limicon")).toBe("https://www.youtube.com/@limicon");
    expect(linkUrl("mastodon", "@ada@social.coop")).toBe("https://social.coop/@ada");
  });

  test("accepts the platform's own addresses, with or without https://", () => {
    expect(linkUrl("linkedin", "linkedin.com/in/ada")).toBe("https://linkedin.com/in/ada");
    expect(linkUrl("linkedin", "https://www.linkedin.com/in/ada/")).toBe("https://www.linkedin.com/in/ada/");
    expect(linkUrl("facebook", "http://facebook.com/ada")).toBe("https://facebook.com/ada");
  });

  test("refuses addresses on another site", () => {
    expect(linkUrl("linkedin", "https://evil.example/in/ada")).toBeNull();
    expect(linkUrl("linkedin", "https://notlinkedin.com/in/ada")).toBeNull();
  });

  test("websites take any https address, never script", () => {
    expect(linkUrl("website", "example.com")).toBe("https://example.com/");
    expect(linkUrl("website", "https://limicon.org/about")).toBe("https://limicon.org/about");
    expect(linkUrl("website", "javascript:alert(1)")).toBeNull();
    expect(linkUrl("website", "data:text/html,hi")).toBeNull();
    expect(linkUrl("website", "localhost")).toBeNull();
    expect(linkUrl("website", "https://user:pw@example.com")).toBeNull();
    expect(linkUrl("website", "just words")).toBeNull();
  });

  test("refuses unknown platforms and odd usernames", () => {
    expect(linkUrl("myspace", "ada")).toBeNull();
    expect(linkUrl("instagram", "<script>")).toBeNull();
    expect(linkUrl("instagram", "")).toBeNull();
  });

  test("every platform has an icon", () => {
    for (const platform of PLATFORMS) expect(ICONS[platform.icon]).toBeDefined();
  });
});
