import { useEffect, useRef, useState } from "react";
import {
  loadScannerSettings,
  type ScannerSettings,
} from "@/lib/barcode-scanner-settings";

export type ScanEvent = {
  code: string;
  rawCode: string;
  durationMs: number;
  averageInterKeyMs: number;
  terminator: "Enter" | "Tab" | "auto-flush";
};

type Options = {
  onScan: (e: ScanEvent) => void;
  enabled?: boolean;
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

function stripWrap(s: string, prefix: string, suffix: string): string {
  let out = s;
  if (prefix && out.startsWith(prefix)) out = out.slice(prefix.length);
  if (suffix && out.endsWith(suffix)) out = out.slice(0, -suffix.length);
  return out;
}

function playBeep(): void {
  try {
    const Ctor =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ??
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 1800;
    gain.gain.value = 0.06;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.07);
    osc.onended = () => ctx.close().catch(() => {});
  } catch {
    /* audio blocked */
  }
}

/**
 * Global HID-scanner detector.
 *
 * Most retail barcode scanners (USB & Bluetooth, Honeywell / Zebra / Symbol /
 * Datalogic / generic) act as a HID keyboard and "type" the scanned code very
 * quickly, ending with a configurable terminator (Enter / Tab / CR).
 *
 * This hook listens to keystrokes globally and recognises a scan when the
 * keys arrive within `interKeyTimeoutMs` of each other and end with a
 * terminator (or, in 'auto' mode, after the timeout expires).
 *
 * It intentionally does NOT preventDefault on individual keys — so manual
 * typing in the barcode field still works the old way; only completed scans
 * are forwarded to `onScan`.
 */
export function useBarcodeScanner({ onScan, enabled = true }: Options): {
  settings: ScannerSettings;
} {
  const [settings, setSettings] = useState<ScannerSettings>(loadScannerSettings);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ScannerSettings>).detail;
      if (detail) setSettings(detail);
    };
    window.addEventListener("pos-scanner-settings-changed", handler);
    return () => window.removeEventListener("pos-scanner-settings-changed", handler);
  }, []);

  useEffect(() => {
    if (!enabled || !settings.enabled) return;

    let buffer = "";
    let firstAt = 0;
    let lastAt = 0;
    let interKeySum = 0;
    let interKeyCount = 0;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const reset = () => {
      buffer = "";
      firstAt = 0;
      lastAt = 0;
      interKeySum = 0;
      interKeyCount = 0;
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
    };

    const finish = (terminator: ScanEvent["terminator"]) => {
      const raw = buffer;
      const code = stripWrap(raw, settings.prefix, settings.suffix).trim();
      const durationMs = lastAt - firstAt;
      const avg = interKeyCount > 0 ? interKeySum / interKeyCount : 0;
      reset();
      if (code.length < settings.minLength || code.length > settings.maxLength) return;
      if (settings.beepOnScan) playBeep();
      if (settings.vibrateOnScan && typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          (navigator as Navigator).vibrate?.(40);
        } catch { /* noop */ }
      }
      onScanRef.current({ code, rawCode: raw, durationMs, averageInterKeyMs: avg, terminator });
    };

    const scheduleAutoFlush = () => {
      if (settings.terminator !== "auto" && settings.terminator !== "none") return;
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = setTimeout(() => {
        if (buffer.length >= settings.minLength) finish("auto-flush");
        else reset();
      }, Math.max(settings.interKeyTimeoutMs * 3, 80));
    };

    const handler = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;

      const focusedTyping = isTypingTarget(ev.target);
      if (focusedTyping && !settings.captureWhenInputFocused) {
        // Manual typing path: don't intercept. The barcode <input> on the
        // sale screen has its own onKeyDown that handles Enter explicitly.
        return;
      }

      const now = performance.now();
      const sinceLast = lastAt === 0 ? 0 : now - lastAt;

      // If the gap is too long, treat it as the start of a new scan, not a
      // continuation. This is what differentiates a HID scanner (very fast)
      // from a human typing.
      if (sinceLast > settings.interKeyTimeoutMs) {
        if (buffer.length > 0) reset();
        firstAt = now;
      }

      // Terminator handling.
      const isEnter = ev.key === "Enter";
      const isTab = ev.key === "Tab";
      const wantEnter = settings.terminator === "enter" || settings.terminator === "auto";
      const wantTab = settings.terminator === "tab" || settings.terminator === "auto";

      if ((isEnter && wantEnter) || (isTab && wantTab)) {
        if (buffer.length >= settings.minLength) {
          // Looks like a real scan — swallow the terminator so it doesn't
          // bubble into other handlers (e.g. submitting a form).
          ev.preventDefault();
          ev.stopPropagation();
          lastAt = now;
          finish(isEnter ? "Enter" : "Tab");
          return;
        }
        // Not enough chars for a scan — let the keypress through.
        reset();
        return;
      }

      // Only single visible characters belong in a scan.
      if (ev.key.length !== 1) return;

      if (interKeyCount >= 0 && lastAt !== 0) {
        interKeySum += sinceLast;
        interKeyCount += 1;
      }
      buffer += ev.key;
      lastAt = now;

      if (buffer.length > settings.maxLength) {
        reset();
        return;
      }

      scheduleAutoFlush();
    };

    window.addEventListener("keydown", handler, true);
    return () => {
      window.removeEventListener("keydown", handler, true);
      if (flushTimer) clearTimeout(flushTimer);
    };
  }, [enabled, settings]);

  return { settings };
}
