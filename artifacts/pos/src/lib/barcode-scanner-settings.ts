export type ScannerTerminator = "enter" | "tab" | "auto" | "none";

export type ScannerSettings = {
  enabled: boolean;
  terminator: ScannerTerminator;
  prefix: string;
  suffix: string;
  minLength: number;
  maxLength: number;
  interKeyTimeoutMs: number;
  captureWhenInputFocused: boolean;
  beepOnScan: boolean;
  vibrateOnScan: boolean;
};

export const DEFAULT_SCANNER_SETTINGS: ScannerSettings = {
  enabled: true,
  terminator: "auto",
  prefix: "",
  suffix: "",
  minLength: 3,
  maxLength: 64,
  interKeyTimeoutMs: 50,
  captureWhenInputFocused: false,
  beepOnScan: true,
  vibrateOnScan: false,
};

const STORAGE_KEY = "pos_scanner_settings_v1";

export function loadScannerSettings(): ScannerSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SCANNER_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<ScannerSettings>;
    return { ...DEFAULT_SCANNER_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SCANNER_SETTINGS };
  }
}

export function saveScannerSettings(s: ScannerSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    window.dispatchEvent(new CustomEvent("pos-scanner-settings-changed", { detail: s }));
  } catch {
    /* storage unavailable */
  }
}
