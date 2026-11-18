import { THEMES } from "~/lib/session-form";

/**
 * Each theme's color on the calendar (CAL-11). Colors mark a session with a stripe and a dot, never
 * as text color, and the theme's name always appears beside them, so the coding doesn't rely on
 * color alone. Mid-tones, so they stand out on both light and dark backgrounds.
 */
export const THEME_COLORS: Record<(typeof THEMES)[number], string> = {
  "Collective Sensemaking and Systems Thinking": "#2F7FA8",
  "Spirituality, Ritual and Contemplative Practice": "#8E5BB5",
  "Practical Tools, Skills and Resources": "#5E8B3A",
  "Personal Growth and Inner Work": "#D2742C",
  "Consciousness Exploration": "#4B5BC4",
  "Play, Games and Experimentation": "#D4A21E",
  "Community, Belonging and Relational Culture": "#C2477A",
  "Creative Expression and Storytelling": "#2A9D8F",
  "Conference Meta and Co-Creation Spaces": "#7A6E64",
};

const NO_THEME = "#9AA5A8";

export function themeColor(theme: string | null): string {
  return (theme && THEME_COLORS[theme as keyof typeof THEME_COLORS]) || NO_THEME;
}
