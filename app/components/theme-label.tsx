import { themeColor } from "~/lib/themes";

/** A theme's color dot and name. The name keeps the coding readable without color (CAL-11). */
export function ThemeLabel({ theme }: { theme: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: themeColor(theme) }} />
      <span>{theme ?? "No theme"}</span>
    </span>
  );
}
