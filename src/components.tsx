import { useId, useState } from "react";
import type { KeyboardEvent } from "react";

export function NymkeepMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <path className="mark-left" d="M8 4 15 9v22l-7 5V4Z" />
      <path className="mark-right" d="m25 9 7-5v22l-7 5V9Z" />
      <path className="mark-alias" d="m17 14 6 4.5V25l-6-4.5V14Z" />
      <path className="mark-return" d="m25 22 7 5v9l-7-5v-9Z" />
    </svg>
  );
}

export type IconName =
  | "shield"
  | "restore"
  | "session"
  | "settings"
  | "copy"
  | "arrow"
  | "check"
  | "close"
  | "eye"
  | "lock"
  | "clipboard"
  | "image";
const paths: Record<IconName, string> = {
  shield: "M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z M8 12l3 3 5-6",
  restore: "M4 10a8 8 0 1 1 1 8 M4 4v6h6",
  session: "M4 7h16v13H4V7Z M8 7V4h8v3 M8 12h8 M8 16h5",
  settings: "M4 7h16 M4 17h16 M8 4v6 M16 14v6",
  copy: "M8 8h12v12H8V8Z M16 8V4H4v12h4",
  arrow: "M4 12h16 M14 6l6 6-6 6",
  check: "m5 12 4 4L19 6",
  close: "m6 6 12 12 M6 18 18 6",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  lock: "M6 10h12v11H6V10Z M8 10V7a4 4 0 0 1 8 0v3 M12 14v3",
  clipboard: "M9 4H5v17h14V4h-4 M9 2h6v5H9V2Z",
  image: "M4 5h16v14H4V5Z M8 10a1.5 1.5 0 1 0 .01 0 M4 17l5-5 4 4 3-3 4 4",
};
export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
export function Keys({ value }: { value: string }) {
  const parts = (value ?? "").split("+").filter((key) => key !== "");
  return (
    <span className="keys">
      {parts.map((key, i) => (
        <kbd key={i}>{key}</kbd>
      ))}
    </span>
  );
}
export function ShortcutRecorder({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const [recording, setRecording] = useState(false);
  function capture(e: KeyboardEvent<HTMLButtonElement>) {
    if (!recording) return;
    if (e.key === "Escape") {
      e.preventDefault();
      setRecording(false);
      return;
    }
    if (e.key === "Tab" && !e.altKey && !e.ctrlKey && !e.metaKey) {
      setRecording(false);
      return;
    }
    e.preventDefault();
    const mods = [
      e.ctrlKey && "Ctrl",
      e.altKey && "Alt",
      e.shiftKey && "Shift",
      e.metaKey && "Super",
    ].filter(Boolean);
    let key = e.key === " " ? "Space" : e.key;
    if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
    if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5);
    const punctuation: Record<string, string> = {
      Semicolon: ";",
      Quote: "'",
      Comma: ",",
      Period: ".",
      Slash: "/",
      Backslash: "\\",
      BracketLeft: "[",
      BracketRight: "]",
      Minus: "-",
      Equal: "=",
      Backquote: "`",
    };
    key = punctuation[e.code] ?? key;
    if (
      mods.length &&
      (/^[a-z0-9;,./'\\\[\]\-=`]$/i.test(key) ||
        /^(F[1-9]|F1[0-2]|Space|Tab|Enter)$/.test(key))
    ) {
      onChange([...mods, key.length === 1 ? key.toUpperCase() : key].join("+"));
      setRecording(false);
    }
  }
  return (
    <div className="shortcut-field">
      <label id={id}>{label}</label>
      <button
        className={`secondary recorder ${recording ? "recording" : ""}`}
        disabled={disabled}
        aria-labelledby={id}
        aria-describedby={`${id}-help`}
        onClick={() => setRecording(true)}
        onBlur={() => setRecording(false)}
        onKeyDown={capture}
      >
        {recording ? "Press a combination…" : <Keys value={value} />}
      </button>
      <span id={`${id}-help`} className="muted small">
        {recording
          ? "Escape cancels. Tab leaves the field."
          : "Click to record"}
      </span>
    </div>
  );
}
