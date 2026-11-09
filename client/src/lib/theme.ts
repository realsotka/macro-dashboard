import { useEffect, useState } from "react";

export type ThemeId = "default" | "premium" | "matrix" | "paper";
export const THEMES: { id: ThemeId; label: string }[] = [
  { id: "default", label: "Поточна" },
  { id: "premium", label: "Преміум" },
  { id: "matrix",  label: "Матриця" },
  { id: "paper",   label: "Газета" },
];
const KEY = "macro-theme";

function initialTheme(): ThemeId {
  const ids = THEMES.map(t => t.id) as string[];
  try {
    let q = new URLSearchParams(window.location.search).get("theme");
    if (q === "retro") q = "matrix";
    if (q && ids.includes(q)) return q as ThemeId;
    if (!import.meta.env.VITE_PREVIEW) {
      let s = window.localStorage.getItem(KEY);
      if (s === "retro") s = "matrix";
      if (s && ids.includes(s)) return s as ThemeId;
    }
  } catch {}
  return "default";
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeId>(initialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (!import.meta.env.VITE_PREVIEW) {
      try { window.localStorage.setItem(KEY, theme); } catch {}
    }
  }, [theme]);
  return { theme, setTheme };
}
