import { useEffect } from "react";
import { useRevalidator } from "react-router";

import { ZONE_COOKIE } from "~/lib/viewer-zone";

const CHECK_EVERY_MS = 10_000;

/**
 * Keeps an open calendar page current (CAL-4): while the tab is visible, asks every 10 seconds
 * whether the calendar has changed, and reloads the page's data when it has. Each check is one
 * small request; a hidden tab doesn't check.
 */
export function useScheduleRefresh(version: string) {
  const revalidator = useRevalidator();
  useEffect(() => {
    let stopped = false;
    const check = async () => {
      if (document.visibilityState !== "visible" || revalidator.state !== "idle") return;
      try {
        const response = await fetch("/members/schedule/version", { headers: { Accept: "application/json" } });
        if (!response.ok) return;
        const latest = (await response.json()) as { version: string };
        if (!stopped && latest.version !== version) await revalidator.revalidate();
      } catch {
        // Offline or between deploys: the next check tries again.
      }
    };
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [version, revalidator]);
}

/**
 * For a member who hasn't picked a time zone: tells the server the browser's own, once, so times
 * show in it from then on.
 */
export function useBrowserZone(source: "profile" | "browser" | "fallback", shownZone: string) {
  const revalidator = useRevalidator();
  useEffect(() => {
    if (source === "profile") return;
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!browserZone || browserZone === shownZone) return;
    document.cookie = `${ZONE_COOKIE}=${encodeURIComponent(browserZone)}; path=/; max-age=31536000; samesite=lax`;
    void revalidator.revalidate();
    // Only when the page first appears with a zone that isn't the browser's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
