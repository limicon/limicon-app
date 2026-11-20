/**
 * The platforms a profile link can name, and how what a member types becomes an address. Members
 * type an address, @handle or username; the profile shows that platform's icon, linked to the
 * address built here. Only https addresses come out, so a link can't run script.
 */
import type { IconName } from "~/lib/icons";

export type Platform = {
  id: string;
  label: string;
  icon: IconName;
  /** What the field asks for. */
  placeholder: string;
  /** The profile address for a bare username, or null for platforms that need a full address. */
  profile: ((user: string) => string) | null;
  /** Hosts a full address for this platform may use. Any host, for a website. */
  hosts: string[] | null;
};

const at = (base: string) => (user: string) => `${base}${user}`;

export const PLATFORMS: Platform[] = [
  { id: "website", label: "Website (full URL)", icon: "website", placeholder: "https://example.com", profile: null, hosts: null },
  { id: "linkedin", label: "LinkedIn", icon: "linkedin", placeholder: "linkedin.com/in/your-name", profile: at("https://www.linkedin.com/in/"), hosts: ["linkedin.com"] },
  { id: "facebook", label: "Facebook", icon: "facebook", placeholder: "Username or address", profile: at("https://www.facebook.com/"), hosts: ["facebook.com", "fb.com"] },
  { id: "instagram", label: "Instagram", icon: "instagram", placeholder: "@username", profile: at("https://www.instagram.com/"), hosts: ["instagram.com"] },
  { id: "x", label: "X (Twitter)", icon: "x", placeholder: "@username", profile: at("https://x.com/"), hosts: ["x.com", "twitter.com"] },
  { id: "bluesky", label: "Bluesky", icon: "bluesky", placeholder: "@name.bsky.social", profile: at("https://bsky.app/profile/"), hosts: ["bsky.app"] },
  { id: "threads", label: "Threads", icon: "threads", placeholder: "@username", profile: (u) => `https://www.threads.net/@${u}`, hosts: ["threads.net", "threads.com"] },
  { id: "mastodon", label: "Mastodon", icon: "mastodon", placeholder: "@you@server.social", profile: null, hosts: null },
  { id: "youtube", label: "YouTube", icon: "youtube", placeholder: "@channel", profile: (u) => `https://www.youtube.com/@${u}`, hosts: ["youtube.com", "youtu.be"] },
  { id: "tiktok", label: "TikTok", icon: "tiktok", placeholder: "@username", profile: (u) => `https://www.tiktok.com/@${u}`, hosts: ["tiktok.com"] },
  { id: "github", label: "GitHub", icon: "github", placeholder: "username", profile: at("https://github.com/"), hosts: ["github.com"] },
  { id: "medium", label: "Medium", icon: "medium", placeholder: "@username", profile: (u) => `https://medium.com/@${u}`, hosts: ["medium.com"] },
  { id: "patreon", label: "Patreon", icon: "patreon", placeholder: "username", profile: at("https://www.patreon.com/"), hosts: ["patreon.com"] },
  { id: "spotify", label: "Spotify", icon: "spotify", placeholder: "Full address", profile: null, hosts: ["spotify.com"] },
  { id: "pinterest", label: "Pinterest", icon: "pinterest", placeholder: "username", profile: at("https://www.pinterest.com/"), hosts: ["pinterest.com"] },
  { id: "vimeo", label: "Vimeo", icon: "vimeo", placeholder: "username", profile: at("https://vimeo.com/"), hosts: ["vimeo.com"] },
  { id: "etsy", label: "Etsy", icon: "etsy", placeholder: "Shop name", profile: at("https://www.etsy.com/shop/"), hosts: ["etsy.com"] },
  { id: "discord", label: "Discord", icon: "discord", placeholder: "Invite address", profile: null, hosts: ["discord.gg", "discord.com"] },
];

export const MAX_LINKS = 10;

export function platformById(id: string): Platform | undefined {
  return PLATFORMS.find((p) => p.id === id);
}

const onHost = (host: string, allowed: string[]) => allowed.some((h) => host === h || host.endsWith(`.${h}`));

/** Parses a typed address, adding https:// when it was left off. Only http(s) addresses with a dotted host count. */
function parseAddress(value: string): URL | null {
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!url.hostname.includes(".") || url.username || url.password) return null;
  url.protocol = "https:";
  return url;
}

/**
 * The address a link opens, or null when what the member typed doesn't fit the platform. Accepts a
 * full address on the platform's own site, or a bare @handle or username.
 */
export function linkUrl(platformId: string, raw: string): string | null {
  const platform = platformById(platformId);
  const value = raw.trim();
  if (!platform || !value || value.length > 300 || /\s/.test(value)) return null;

  if (platform.id === "mastodon") {
    // @user@server.social, or the profile's own address.
    const handle = /^@?([A-Za-z0-9_]{1,30})@([A-Za-z0-9.-]+\.[A-Za-z]{2,})$/.exec(value);
    if (handle) return `https://${handle[2]!.toLowerCase()}/@${handle[1]}`;
    return parseAddress(value)?.href ?? null;
  }

  const looksLikeAddress = value.includes("/") || (platform.hosts === null && value.includes("."));
  if (looksLikeAddress || !platform.profile) {
    const url = parseAddress(value);
    if (!url) return null;
    if (platform.hosts && !onHost(url.hostname.toLowerCase(), platform.hosts)) return null;
    return url.href;
  }

  const user = value.replace(/^@/, "");
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(user)) return null;
  return platform.profile(user);
}
