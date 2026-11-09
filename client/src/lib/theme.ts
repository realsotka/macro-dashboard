import { useEffect, useState } from "react";

export type ThemeId = "default" | "premium" | "retro" | "paper";
export const THEMES: { id: ThemeId; label: string }[] = [
  { id: "default", label: "Поточна" },
  { id: "premium", label: "Преміум" },
  { id: "retro",   label: "Ретро" },
  { id: "paper",   label: "Газета" },
];
const KEY = "macro-theme";

function initialTheme(): ThemeId {
  const ids = THEMES.map(t => t.id) as string[];
  try {
    const q = new URLSearchParams(window.location.search).get("theme");
    if (q && ids.includes(q)) return q as ThemeId;
    const s = window.localStorage.getItem(KEY);
    if (s && ids.includes(s)) return s as ThemeId;
  } catch {}
  return "default";
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeId>(initialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { window.localStorage.setItem(KEY, theme); } catch {}
  }, [theme]);
  return { theme, setTheme };
}
