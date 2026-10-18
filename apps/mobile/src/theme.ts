import { BRAND_BLUE, contrastText } from "./logic/colors";
export { luminance, contrastText } from "./logic/colors";
import { useSyncExternalStore } from "react";
import { useColorScheme } from "react-native";

// Base themes follow the host; mobile chat colors are shared across presets.
export const THEMES = {
  deepseek: {
    name: "DeepSeek",
    light: [
      "#ffffff",
      "#fafafa",
      "#f2f2f2",
      "#ffffff",
      "#141414",
      "#070707",
      "#fcfcfc",
      BRAND_BLUE,
    ],
    dark: [
      "#141414",
      "#1b1b1b",
      "#262626",
      "#1f1f1f",
      "#f2f2f2",
      "#f2f2f2",
      "#141414",
      BRAND_BLUE,
    ],
  },
  mono: {
    name: "Mono",
    light: [
      "#ffffff",
      "#f9f9f9",
      "#f0f0f0",
      "#ffffff",
      "#0d0d0d",
      "#0d0d0d",
      "#ffffff",
      "#0d0d0d",
    ],
    dark: [
      "#0f0f0f",
      "#171717",
      "#242424",
      "#1c1c1c",
      "#f4f4f4",
      "#f4f4f4",
      "#0f0f0f",
      "#f4f4f4",
    ],
  },
  paper: {
    name: "Paper",
    light: [
      "#faf9f5",
      "#f3f0e8",
      "#ebe7dc",
      "#ffffff",
      "#1f1e1b",
      "#2b2a26",
      "#faf9f5",
      "#d97757",
    ],
    dark: [
      "#1f1e1b",
      "#262521",
      "#34322d",
      "#2a2925",
      "#f3f0e8",
      "#f3f0e8",
      "#1f1e1b",
      "#e08a6d",
    ],
  },
  moonlight: {
    name: "Moonlight",
    light: [
      "#f7f9fc",
      "#eef2f8",
      "#e5ebf5",
      "#ffffff",
      "#121826",
      "#1e3a8a",
      "#ffffff",
      BRAND_BLUE,
    ],
    dark: [
      "#0b1020",
      "#10172a",
      "#1a2340",
      "#141c33",
      "#e8edf7",
      "#3b6fd8",
      "#ffffff",
      BRAND_BLUE,
    ],
  },
};
let preferences: Record<string, unknown> = {};
const listeners = new Set<() => void>();
const subscribe = (callback: () => void) => {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
};
export function setThemePreferences(value: Record<string, unknown> = {}) {
  if (
    ["theme", "accent", "motion"].every(
      (key) => value[key] === preferences[key],
    )
  )
    return;
  preferences = value;
  listeners.forEach((callback) => callback());
}
function alpha(hex: string, opacity: number) {
  return `rgba(${[1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16)).join(",")},${opacity})`;
}
export function useTheme() {
  const dark = useColorScheme() === "dark";
  const prefs = useSyncExternalStore(
    subscribe,
    () => preferences,
    () => preferences,
  );
  const key =
    typeof prefs.theme === "string" && Object.hasOwn(THEMES,prefs.theme)
      ? (prefs.theme as keyof typeof THEMES)
      : "deepseek";
  const [bg, sidebar, bubble, surface, ink, user, userText, baseAccent] =
    THEMES[key][dark ? "dark" : "light"];
  const accent =
    typeof prefs.accent === "string" && /^#[0-9a-f]{6}$/i.test(prefs.accent)
      ? prefs.accent
      : baseAccent;
  return {
    dark,
    bg,
    sidebar,
    bubble,
    messageBubble: dark ? "#f4f4f4" : "#111111",
    messageText: dark ? "#141414" : "#FFFFFF",
    surface,
    ink,
    user,
    userText,
    accent,
    link: dark ? "#91aeff" : "#2858b4",
    accentText: contrastText(accent),
    muted: alpha(ink, 0.6),
    faint: alpha(ink, 0.36),
    line: alpha(ink, 0.08),
    lineStrong: alpha(ink, 0.15),
    hover: dark ? "rgba(160,160,160,.12)" : "rgba(119,119,119,.09)",
    active: dark ? "rgba(160,160,160,.2)" : "rgba(119,119,119,.17)",
    soft: alpha(accent, 0.1),
    tagBg: alpha(ink, dark ? 0.09 : 0.06),
    tagInk: alpha(ink, 0.58),
    error: dark ? "#ff7078" : "#c93942",
    motion: typeof prefs.motion === "string" ? prefs.motion : "normal",
  };
}
export type Theme = ReturnType<typeof useTheme>;
