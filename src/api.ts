import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type Mapping = { token: string; original: string; kind: string };
export type Protection = {
  text: string;
  count: number;
  kinds: { kind: string; count: number }[];
  nerActive: boolean;
};
export type Restoration = {
  text: string;
  known: number;
  unknown: number;
  unknownTokens: string[];
};
export type Rules = { always: string[]; never: string[]; moneyDates: boolean };
export type Shortcuts = { protect: string; restore: string; quick: string };
export type ShotBox = { x: number; y: number; w: number; h: number };
export type ShotWord = {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  conf: number;
};
export type ShotRedaction = { token: string; boxes: ShotBox[] };
export type ShotDetect = {
  protectedText: string;
  count: number;
  words: ShotWord[];
  redactions: ShotRedaction[];
  kinds: { kind: string; count: number }[];
  nerActive: boolean;
};
export type ShotStatus = { available: boolean; backend: string };
export type ShotImage = { pngBase64: string; width: number; height: number };
export type Session = { count: number; expiresInSeconds: number | null };
export type CaptureStatus = {
  platform: string;
  backend: string;
  permissionRequired: boolean;
  trusted: boolean;
  implemented: boolean;
};
export const desktop = isTauri();
export const api = {
  protect: (text: string, manualTerms: string[]) =>
    invoke<Protection>("protect_text", { text, manualTerms }),
  restore: (text: string) => invoke<Restoration>("restore_text", { text }),
  session: () => invoke<Session>("get_session_status"),
  mappings: () => invoke<Mapping[]>("get_mappings"),
  clear: () => invoke<void>("clear_mappings"),
  readClipboard: () => invoke<string>("read_clipboard"),
  copy: (text: string) => invoke<void>("write_clipboard", { text }),
  rules: () => invoke<Rules>("get_rules"),
  saveRules: (rules: Rules) => invoke<Rules>("set_rules", { rules }),
  shortcuts: () => invoke<Shortcuts>("get_shortcuts"),
  saveShortcuts: (keys: Shortcuts) =>
    invoke<Shortcuts & { message: string }>("set_shortcuts", keys),
  autostart: () => invoke<boolean>("get_autostart"),
  setAutostart: (enabled: boolean) =>
    invoke<void>("set_autostart", { enabled }),
  ner: () => invoke<boolean>("ner_status"),
  captureStatus: () => invoke<CaptureStatus>("capture_status"),
  requestCapturePermission: () =>
    invoke<CaptureStatus>("request_capture_permission"),
  shots: {
    load: (pngBase64: string) => invoke<ShotImage>("shots_load", { pngBase64 }),
    paste: () => invoke<ShotImage>("shots_read_clipboard"),
    copy: (pngBase64: string, boxes: ShotBox[]) =>
      invoke<void>("shots_copy", { pngBase64, boxes }),
    save: (pngBase64: string, boxes: ShotBox[]) =>
      invoke<boolean>("shots_save", { pngBase64, boxes }),
    status: () => invoke<ShotStatus>("shots_status"),
    detect: (pngBase64: string) =>
      invoke<ShotDetect>("shots_detect", { pngBase64 }),
    redact: (pngBase64: string, boxes: ShotBox[]) =>
      invoke<string>("shots_redact", { pngBase64, boxes }),
  },
  listen: (fn: (status: { kind: string; message: string }) => void) =>
    listen<{ kind: string; message: string }>("nymkeep-status", (e) =>
      fn(e.payload),
    ),
};
export const MAX_BYTES = 100_000;
export const byteLength = (text: string) =>
  new TextEncoder().encode(text).length;
export function termError(
  term: string,
  list: "always" | "never",
  rules: Rules,
): string | null {
  if ([...term].length < 2 || [...term].length > 200)
    return "Use between 2 and 200 characters.";
  const same = (value: string) => value.toLowerCase() === term.toLowerCase();
  if (rules[list].some(same)) return "This term is already in this list.";
  if (rules[list === "always" ? "never" : "always"].some(same))
    return "This term is in the other list. Remove it there first.";
  if (rules[list].length >= 500)
    return "This list has reached its 500-term limit.";
  return null;
}
export const kindName = (kind: string) =>
  ({
    EMAIL: "Email",
    PHONE: "Phone",
    URL: "Link",
    IP: "IP address",
    CARD: "Payment card",
    IBAN: "Bank account",
    KEY: "Secret",
    UUID: "ID",
    PERSON: "Person",
    ORG: "Organization",
    LOC: "Location",
    TERM: "Custom term",
    MONEY: "Amount",
    DATE: "Date",
  })[kind] ?? kind;
