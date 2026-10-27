"use client";
import { useCallback, useEffect, useState } from "react";
type Theme = "dark" | "light";
export function useTheme() {
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => {
    let active = true;
    let saved: Theme = "dark";
    try {
      saved =
        localStorage.getItem("averiq-theme") === "light" ? "light" : "dark";
    } catch {
      /* Theme still works when browser storage is unavailable. */
    }
    Promise.resolve().then(() => {
      if (active) setTheme(saved);
    });
    const sync = (event: StorageEvent) => {
      if (event.key === "averiq-theme")
        setTheme(event.newValue === "light" ? "light" : "dark");
    };
    window.addEventListener("storage", sync);
    return () => {
      active = false;
      window.removeEventListener("storage", sync);
    };
  }, []);
  useEffect(() => {
    if (!theme) return;
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("averiq-theme", theme);
    } catch {
      /* Persistence is optional. */
    }
  }, [theme]);
  const toggleTheme = useCallback(
    () => setTheme((current) => (current === "light" ? "dark" : "light")),
    [],
  );
  return { light: theme === "light", toggleTheme };
}
