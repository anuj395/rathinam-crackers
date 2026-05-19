import { useEffect } from "react";

type Handler = (e: KeyboardEvent) => void;

export type ShortcutMap = Record<string, Handler>;

function isTypingTarget(target: EventTarget | null) {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useKeyboardShortcuts(map: ShortcutMap, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      const key = e.key;
      const isFn = /^F\d{1,2}$/.test(key);
      if (!isFn && isTypingTarget(e.target)) {
        if (key !== "Escape") return;
      }
      const fn = map[key];
      if (fn) {
        e.preventDefault();
        fn(e);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [map, enabled]);
}
