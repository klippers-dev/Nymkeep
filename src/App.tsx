import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  byteLength,
  desktop,
  kindName,
  MAX_BYTES,
  termError,
} from "./api";
import type {
  Mapping,
  Protection,
  Restoration,
  Rules,
  Session,
  Shortcuts,
  CaptureStatus,
} from "./api";
import ScreenshotView from "./ScreenshotView";
import { Icon, Keys, NymkeepMark, ShortcutRecorder } from "./components";
import type { IconName } from "./components";
import { openUrl } from "@tauri-apps/plugin-opener";
import "./App.css";

type View = "protect" | "restore" | "session" | "settings" | "shots";
type Message = { text: string; error?: boolean } | null;
const defaultRules: Rules = { always: [], never: [], moneyDates: false };
const defaultKeys: Shortcuts = {
  protect: "Alt+C",
  restore: "Alt+R",
  quick: "Alt+J",
};
const BRAND = {
  byline: "A product by Klippers",
  email: "contact.klippers@gmail.com",
  site: "https://theklippers.com",
  version: "0.1.0",
  // Fill these in to activate the Support block. Empty = button stays hidden.
  repo: "",
  follow: "",
  sponsor: "",
};
const examples = [
  {
    label: "Support reply",
    text: "Please draft a reply to alex@example.com about their account. Call +1 415-555-0132 if more details are needed.\n\nKeep the response friendly and brief.",
  },
  {
    label: "Debug a log",
    text: "Help explain this connection failure.\n\nhost: 10.0.0.8\nendpoint: https://example.com/internal/status\nAuthorization: Bearer synthetic_example_token_abcdefgh\n\nThe request timed out after 30 seconds.",
  },
  {
    label: "Client notes",
    text: "Summarize these meeting notes.\n\nContact: jordan@example.com\nProject: Aurora\nBudget: $12,500.00\nNext review: 2026-10-15\n\nHighlight decisions and follow-up actions.",
  },
];

export default function App() {
  const [view, setView] = useState<View>("protect");
  const [input, setInput] = useState("");
  const [answer, setAnswer] = useState("");
  const [protection, setProtection] = useState<Protection | null>(null);
  const [restoration, setRestoration] = useState<Restoration | null>(null);
  const [manualTerms, setManualTerms] = useState<string[]>([]);
  const [selection, setSelection] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef(false);
  const draftEpoch = useRef(0);
  const [message, setMessage] = useState<Message>(null);
  const [rules, setRules] = useState<Rules>(defaultRules);
  const [keys, setKeys] = useState<Shortcuts>(defaultKeys);
  const [keyDraft, setKeyDraft] = useState<Shortcuts>(defaultKeys);
  const [autostart, setAutostart] = useState(false);
  const [ner, setNer] = useState<boolean | null>(null);
  const [capture, setCapture] = useState<CaptureStatus | null>(null);
  const [ready, setReady] = useState(false);
  const [initializing, setInitializing] = useState(desktop);
  const [retry, setRetry] = useState(0);
  const [session, setSession] = useState<Session>({
    count: 0,
    expiresInSeconds: null,
  });
  const [sessionError, setSessionError] = useState(false);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [revealed, setRevealed] = useState(false);
  const revealEpoch = useRef(0);
  const revealRef = useRef(false);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(50);
  const [confirmClear, setConfirmClear] = useState(false);
  const [terms, setTerms] = useState({ always: "", never: "" });
  const [termErrors, setTermErrors] = useState({ always: "", never: "" });
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [shotReset, setShotReset] = useState(0);

  useEffect(() => {
    if (!desktop || view !== "settings") return;
    let active = true;
    api
      .captureStatus()
      .then((status) => {
        if (active) setCapture(status);
      })
      .catch(() => {
        if (active) setCapture(null);
      });
    return () => {
      active = false;
    };
  }, [view]);

  const hideOriginals = useCallback(() => {
    revealEpoch.current += 1;
    revealRef.current = false;
    setRevealed(false);
    setMappings([]);
    setQuery("");
    setLimit(50);
  }, []);
  const clearDrafts = useCallback(() => {
    draftEpoch.current += 1;
    setShotReset((value) => value + 1);
    setInput("");
    setAnswer("");
    setProtection(null);
    setRestoration(null);
    setManualTerms([]);
    setSelection("");
    hideOriginals();
    setConfirmClear(false);
  }, [hideOriginals]);
  const refreshSession = useCallback(async () => {
    try {
      const next = await api.session();
      setSession(next);
      setSessionError(false);
      if (!next.count) hideOriginals();
      else if (revealRef.current) {
        const epoch = revealEpoch.current;
        const rows = await api.mappings();
        if (epoch === revealEpoch.current && revealRef.current)
          setMappings(rows);
      }
    } catch {
      setSessionError(true);
      hideOriginals();
    }
  }, [hideOriginals]);

  useEffect(() => {
    if (!desktop) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    setInitializing(true);
    Promise.allSettled([
      api.rules(),
      api.shortcuts(),
      api.autostart(),
      api.ner(),
    ]).then((results) => {
      if (disposed) return;
      const [r, k, a, n] = results;
      if (r.status === "fulfilled") setRules(r.value);
      if (k.status === "fulfilled") {
        setKeys(k.value);
        setKeyDraft(k.value);
      }
      if (a.status === "fulfilled") setAutostart(a.value);
      if (n.status === "fulfilled") setNer(n.value);
      const ok = results.every((result) => result.status === "fulfilled");
      setReady(ok);
      setInitializing(false);
      if (!ok)
        setMessage({
          text: "Some settings could not be loaded. Retry before changing settings.",
          error: true,
        });
    });
    api
      .listen((status) => {
        if (disposed) return;
        if (status.kind === "clear") clearDrafts();
        setMessage({ text: status.message, error: status.kind === "error" });
        void refreshSession();
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch(() => {
        if (!disposed)
          setMessage({
            text: "Shortcut notifications are unavailable. Session counts will still refresh.",
            error: true,
          });
      });
    void refreshSession();
    const timer = window.setInterval(() => {
      if (!document.hidden) void refreshSession();
    }, 15_000);
    const onFocus = () => {
      void refreshSession();
    };
    const onVisibility = () => {
      if (document.hidden) hideOriginals();
      else void refreshSession();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", hideOriginals);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      unlisten?.();
      window.clearInterval(timer);
      hideOriginals();
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", hideOriginals);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [clearDrafts, hideOriginals, refreshSession, retry]);

  async function run(label: string, work: () => Promise<void>) {
    if (busyRef.current || !desktop) return;
    busyRef.current = true;
    setBusy(label);
    setMessage(null);
    try {
      await work();
    } catch (error) {
      setMessage({
        text:
          typeof error === "string"
            ? error
            : "The action could not finish. Your text is still in the editor. Try again.",
        error: true,
      });
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }
  function navigate(next: View) {
    setView(next);
    setMessage(null);
    setConfirmClear(false);
    hideOriginals();
  }
  async function openExternal(url: string) {
    try {
      await openUrl(url);
    } catch {
      setMessage({
        text: "Could not open the link. Copy it manually: " + url,
        error: true,
      });
    }
  }
  function editInput(value: string) {
    setInput(value);
    setProtection(null);
    setSelection("");
    setManualTerms([]);
    setMessage(null);
  }
  function editAnswer(value: string) {
    setAnswer(value);
    setRestoration(null);
    setMessage(null);
  }
  async function protect(termsForDraft = manualTerms) {
    if (!input.trim() || byteLength(input) > MAX_BYTES) return;
    await run("protect", async () => {
      const epoch = draftEpoch.current;
      setProtection(null);
      const result = await api.protect(input, termsForDraft);
      if (epoch !== draftEpoch.current) return;
      setProtection(result);
      setNer(result.nerActive);
      setManualTerms(termsForDraft);
      setSelection("");
      setMessage({
        text: result.count
          ? `${result.count} replacements made. Review the result before copying.`
          : "No matches found. Review the text; sensitive details may still be present.",
      });
      await refreshSession();
    });
  }
  async function restore() {
    if (!answer.trim() || byteLength(answer) > MAX_BYTES) return;
    await run("restore", async () => {
      const epoch = draftEpoch.current;
      setRestoration(null);
      const result = await api.restore(answer);
      if (epoch !== draftEpoch.current) return;
      setRestoration(result);
      await refreshSession();
    });
  }
  async function paste(target: "protect" | "restore") {
    await run("paste", async () => {
      const text = await api.readClipboard();
      if (!text.trim()) throw "The clipboard is empty. Copy some text first.";
      if (byteLength(text) > MAX_BYTES)
        throw "Clipboard text exceeds 100 kB. Paste a smaller section manually.";
      if (target === "protect") editInput(text);
      else editAnswer(text);
    });
  }
  async function copy(text: string, sensitive: boolean) {
    await run("copy", async () => {
      await api.copy(text);
      setMessage({
        text: sensitive
          ? "Restored text copied. The clipboard now contains original details."
          : "Protected result copied. Keep Nymkeep running to restore the reply.",
      });
    });
  }
  async function saveRules(next: Rules) {
    const applied = await api.saveRules(next);
    setRules(applied);
    setProtection(null);
    setMessage({
      text: "Rules saved on this device. Protect your draft again to apply them.",
    });
  }
  async function addTerm(list: "always" | "never") {
    const term = terms[list].trim();
    const error = termError(term, list, rules);
    setTermErrors((prev) => ({ ...prev, [list]: error ?? "" }));
    if (error) return;
    await run("rules", async () => {
      await saveRules({ ...rules, [list]: [...rules[list], term] });
      setTerms((prev) => ({ ...prev, [list]: "" }));
    });
  }
  const disabled = !!busy || !desktop;
  const settingsDisabled = disabled || !ready;
  const isProtect = view === "protect";
  const draft = isProtect ? input : answer;
  const bytes = byteLength(draft);
  const overLimit = bytes > MAX_BYTES;
  const resultText = isProtect ? protection?.text : restoration?.text;
  const hasResult = isProtect ? !!protection : !!restoration;
  const filtered = mappings.filter((m) =>
    `${m.token} ${m.kind} ${kindName(m.kind)} ${m.original}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const keysChanged =
    keys.protect !== keyDraft.protect ||
    keys.restore !== keyDraft.restore ||
    keys.quick !== keyDraft.quick;
  const nav: { id: View; label: string; icon: IconName }[] = [
    { id: "protect", label: "Protect", icon: "shield" },
    { id: "restore", label: "Restore", icon: "restore" },
    { id: "shots", label: "Screenshot", icon: "image" },
    { id: "session", label: "Session", icon: "session" },
    { id: "settings", label: "Settings", icon: "settings" },
  ];

  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace">
        Skip to workspace
      </a>
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">
            <NymkeepMark />
          </span>
          <div>
            <span className="brand-name">Nymkeep</span>
            <span className="brand-description">Real details stay local.</span>
          </div>
        </div>
        <span className={`local-status ${!desktop ? "preview-status" : ""}`}>
          <Icon name="lock" />
          {desktop ? "On-device processing" : "Browser preview"}
        </span>
      </header>
      <nav className="navigation" aria-label="Workspace">
        {nav.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-item ${view === item.id ? "selected" : ""}`}
            aria-label={
              item.id === "session"
                ? `Session, ${session.count} active mappings`
                : item.label
            }
            aria-current={view === item.id ? "page" : undefined}
            onClick={() => navigate(item.id)}
          >
            <Icon name={item.icon} />
            {item.label}
            {item.id === "session" && (
              <span className="count">
                {sessionError ? "?" : session.count}
              </span>
            )}
          </button>
        ))}
      </nav>
      <main id="workspace" tabIndex={-1}>
        {!desktop && (
          <div className="banner preview-banner">
            <Icon name="lock" />
            <p>
              <strong>Open the desktop app to protect text.</strong> This
              browser preview shows the interface. Protect, Restore, clipboard
              access, and saved settings require Nymkeep for desktop.
            </p>
          </div>
        )}
        {message && (
          <div
            className={`banner feedback ${message.error ? "error" : "success"}`}
            role={message.error ? "alert" : "status"}
          >
            <Icon name={message.error ? "close" : "check"} />
            <p>{message.text}</p>
            <button
              className="icon-button"
              aria-label="Dismiss message"
              onClick={() => setMessage(null)}
            >
              <Icon name="close" />
            </button>
          </div>
        )}
        {(view === "protect" || view === "restore") && (
          <>
            <div className="page-heading">
              <div>
                <h1>
                  {isProtect ? "Protect your text." : "Restore your AI reply."}
                </h1>
                <p>
                  {isProtect
                    ? "Replace sensitive details with reversible placeholders before using AI."
                    : "Paste a reply containing placeholders from this Nymkeep session."}
                </p>
              </div>
              <span className="workflow-label">
                {isProtect ? "Before you share" : "After the reply"}
              </span>
            </div>
            <div className="workflow">
              <span className={isProtect ? "current" : ""}>
                <span className="step-number">1</span>Protect text
              </span>
              <span className="workflow-line" />
              <span>
                <span className="step-number">2</span>Use in any AI
              </span>
              <span className="workflow-line" />
              <span className={!isProtect ? "current" : ""}>
                <span className="step-number">3</span>Restore reply
              </span>
            </div>
            {!isProtect && session.count === 0 && (
              <div className="banner warning">
                <Icon name="session" />
                <p>
                  <strong>No active mappings.</strong> Protect text first.
                  Placeholders from an expired, cleared, or previous app session
                  cannot be restored.
                </p>
              </div>
            )}
            <div
              className="editor-grid"
              aria-busy={busy === "protect" || busy === "restore"}
            >
              <section className="editor-panel" aria-labelledby="input-label">
                <div className="editor-heading">
                  <label id="input-label" htmlFor="draft">
                    {isProtect ? "Original text" : "AI reply"}
                  </label>
                  <span className="subtle-tag">
                    {isProtect ? "Private input" : "With placeholders"}
                  </span>
                </div>
                <textarea
                  ref={inputRef}
                  id="draft"
                  className="editor"
                  value={draft}
                  spellCheck={false}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  disabled={!!busy}
                  aria-describedby="input-help byte-count"
                  aria-invalid={overLimit}
                  onChange={(e) =>
                    isProtect
                      ? editInput(e.target.value)
                      : editAnswer(e.target.value)
                  }
                  onSelect={(e) => {
                    if (isProtect)
                      setSelection(
                        e.currentTarget.value
                          .slice(
                            e.currentTarget.selectionStart,
                            e.currentTarget.selectionEnd,
                          )
                          .trim(),
                      );
                  }}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                      e.preventDefault();
                      void (isProtect ? protect() : restore());
                    }
                  }}
                  placeholder={
                    isProtect
                      ? "Paste an email, a document excerpt, or a log…\n\nSensitive details will be replaced with tokens like EMAIL_1."
                      : "Paste the AI reply here…\n\nKeep placeholders like EMAIL_1 intact so Nymkeep can restore them."
                  }
                />
                <div className="editor-tools">
                  <button
                    className="text-button"
                    disabled={disabled || !!draft}
                    onClick={() =>
                      void paste(isProtect ? "protect" : "restore")
                    }
                    title={
                      draft
                        ? "Clear this draft before pasting clipboard text"
                        : undefined
                    }
                  >
                    <Icon name="clipboard" />
                    Paste clipboard
                  </button>
                  <button
                    className="text-button muted"
                    disabled={!!busy || !draft}
                    onClick={() => (isProtect ? editInput("") : editAnswer(""))}
                  >
                    Clear text
                  </button>
                </div>
                <div className="editor-footer">
                  <span
                    id="byte-count"
                    className={`small ${overLimit ? "danger-text" : "muted"}`}
                  >
                    {(bytes / 1000).toLocaleString(undefined, {
                      maximumFractionDigits: 1,
                    })}{" "}
                    / 100 kB
                  </span>
                  <button
                    className="primary"
                    disabled={disabled || !draft.trim() || overLimit}
                    onClick={() => void (isProtect ? protect() : restore())}
                  >
                    <Icon name={isProtect ? "shield" : "restore"} />
                    {busy === (isProtect ? "protect" : "restore")
                      ? isProtect
                        ? "Protecting…"
                        : "Restoring…"
                      : isProtect
                        ? "Protect text"
                        : "Restore text"}
                    <Icon name="arrow" />
                  </button>
                </div>
              </section>
              <section
                className={`editor-panel result-panel ${hasResult ? "has-result" : ""}`}
                aria-labelledby="output-label"
              >
                <div className="editor-heading">
                  <label id="output-label" htmlFor="result">
                    {isProtect ? "Protected result" : "Restored result"}
                  </label>
                  <span
                    className={`subtle-tag ${hasResult ? (isProtect ? "protected-tag" : "sensitive-tag") : ""}`}
                  >
                    {hasResult
                      ? isProtect
                        ? `${protection?.count} replaced`
                        : "Contains original details"
                      : "Ready after review"}
                  </span>
                </div>
                {hasResult ? (
                  <textarea
                    id="result"
                    className="editor result-editor"
                    readOnly
                    spellCheck={false}
                    value={resultText}
                  />
                ) : (
                  <div className="result-empty">
                    <span className="empty-symbol">
                      <Icon name={isProtect ? "shield" : "restore"} />
                    </span>
                    <h2>
                      {isProtect
                        ? "Your protected text appears here."
                        : "Your reply, with the details restored."}
                    </h2>
                    <p>
                      {isProtect
                        ? "Your wording stays intact. Detected details become placeholders you can reverse later."
                        : "Known placeholders will become their originals. Unknown placeholders stay untouched."}
                    </p>
                    <span className="token-example">
                      {isProtect
                        ? "name@example.com  →  EMAIL_1"
                        : "EMAIL_1  →  name@example.com"}
                    </span>
                  </div>
                )}
                <div className="editor-footer">
                  <span className="small muted">
                    {hasResult
                      ? isProtect
                        ? "Review before sharing"
                        : "Copy only to a trusted destination"
                      : "Processed on your device"}
                  </span>
                  <button
                    className={hasResult ? "primary" : "secondary"}
                    disabled={disabled || !resultText}
                    onClick={() =>
                      resultText && void copy(resultText, !isProtect)
                    }
                  >
                    <Icon name="copy" />
                    {busy === "copy"
                      ? "Copying…"
                      : isProtect
                        ? "Copy protected text"
                        : "Copy restored text"}
                  </button>
                </div>
              </section>
            </div>
            <div id="input-help" className="input-help">
              <span>
                {overLimit
                  ? "This text is too large. Split it into smaller sections."
                  : "Ctrl + Enter runs the current action. Drafts are not saved to disk."}
              </span>
              {isProtect && (
                <span>
                  Name detection:{" "}
                  {ner === null
                    ? desktop
                      ? "checking"
                      : "desktop only"
                    : ner
                      ? "on"
                      : "off"}
                </span>
              )}
            </div>
            {isProtect && protection && (
              <div className="review-summary">
                <div className="inline-row">
                  <strong>
                    {protection.count
                      ? "Review your replacements"
                      : "No matches found"}
                  </strong>
                  <button
                    className="text-button"
                    onClick={() => navigate("session")}
                  >
                    View session mappings
                    <Icon name="arrow" />
                  </button>
                </div>
                {protection.kinds.length > 0 && (
                  <ul className="chips" aria-label="Detected categories">
                    {protection.kinds.map((k) => (
                      <li key={k.kind}>
                        {kindName(k.kind)}
                        <span>{k.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="small muted">
                  Detection can miss details. Select a missed phrase in the
                  original text to protect it for this draft.
                </p>
              </div>
            )}
            {isProtect && (
              <div className="correction-row">
                <div>
                  <strong>Something the detector missed?</strong>
                  <p>
                    {selection
                      ? `${[...selection].length} characters selected. This correction stays in the current draft.`
                      : "Select a name, codename, or phrase in your original text."}
                  </p>
                </div>
                <button
                  className="secondary"
                  disabled={
                    disabled ||
                    [...selection].length < 2 ||
                    [...selection].length > 200 ||
                    manualTerms.length >= 500 ||
                    overLimit
                  }
                  onClick={() =>
                    void protect([...new Set([...manualTerms, selection])])
                  }
                >
                  <Icon name="shield" />
                  Protect selection
                </button>
                {manualTerms.length > 0 && (
                  <span className="small muted">
                    {manualTerms.length} draft{" "}
                    {manualTerms.length === 1 ? "correction" : "corrections"}
                  </span>
                )}
              </div>
            )}
            {!isProtect && restoration && (
              <div
                className={`restore-summary ${restoration.unknown ? "warning" : ""}`}
                role="status"
              >
                <strong>
                  {restoration.known}{" "}
                  {restoration.known === 1 ? "placeholder" : "placeholders"}{" "}
                  restored
                  {restoration.unknown
                    ? ` · ${restoration.unknown} unknown`
                    : ""}
                </strong>
                <p>
                  {restoration.unknown
                    ? "Unknown placeholders were left unchanged. They may have expired, been changed by the AI, or come from another session. Avoid guessing their originals."
                    : restoration.known
                      ? "The result now contains your original details. It is no longer protected."
                      : "No known placeholders were found. Check that you pasted the reply from this session."}
                </p>
                {restoration.unknownTokens.length > 0 && (
                  <ul className="chips" aria-label="Unknown placeholders">
                    {restoration.unknownTokens.map((token) => (
                      <li className="mono" key={token}>
                        {token}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {isProtect && !input && (
              <section className="examples">
                <div>
                  <h2>Try it with sample text</h2>
                  <p>Synthetic examples only. Pick a starting point.</p>
                </div>
                <div className="example-actions">
                  {examples.map((example) => (
                    <button
                      className="secondary"
                      key={example.label}
                      disabled={!!busy}
                      onClick={() => {
                        editInput(example.text);
                        inputRef.current?.focus();
                      }}
                    >
                      {example.label}
                      <Icon name="arrow" />
                    </button>
                  ))}
                </div>
              </section>
            )}
            <div className="shortcut-tip">
              <Icon name="clipboard" />
              <p>
                {isProtect ? (
                  <>
                    For everyday use, select text in another app and press{" "}
                    <Keys value={keys.protect} /> to protect and copy.
                  </>
                ) : (
                  <>
                    Copy the AI reply, then press <Keys value={keys.restore} />{" "}
                    to restore it directly on your clipboard.
                  </>
                )}
                <span>
                  {isProtect ? (
                    <>
                      If selection capture is unavailable, Nymkeep reads your
                      clipboard and labels the fallback. Skip Ctrl+C entirely
                      with <Keys value={keys.quick} /> for quick capture.
                    </>
                  ) : (
                    "Keep Nymkeep running until you finish. Mappings expire after 30 minutes without use."
                  )}
                </span>
              </p>
            </div>
          </>
        )}
        {view === "session" && (
          <>
            <div className="page-heading">
              <div>
                <h1>Your current session</h1>
                <p>
                  The link between your placeholders and their original details.
                </p>
              </div>
              <span className="subtle-tag">
                <Icon name="lock" />
                Memory only
              </span>
            </div>
            <div className="session-overview">
              <div>
                <strong>
                  {sessionError
                    ? "Unavailable"
                    : `${session.count} active mappings`}
                </strong>
                <p>
                  {sessionError
                    ? "Could not read the session. Refresh to try again."
                    : session.expiresInSeconds !== null
                      ? `Next expiry in about ${Math.max(1, Math.ceil(session.expiresInSeconds / 60))} min. Each mapping expires after 30 minutes without use.`
                      : "Protect text to create your first mappings."}
                </p>
              </div>
              <button
                className="secondary"
                disabled={disabled}
                onClick={() => void run("refresh", refreshSession)}
              >
                {busy === "refresh" ? "Refreshing…" : "Refresh session"}
              </button>
            </div>
            <div className="section-toolbar">
              <h2>Placeholder mappings</h2>
              <div className="inline-row">
                <button
                  className="secondary"
                  disabled={disabled || !session.count || sessionError}
                  aria-expanded={revealed}
                  onClick={() => {
                    if (revealed) hideOriginals();
                    else
                      void run("reveal", async () => {
                        const epoch = ++revealEpoch.current;
                        const rows = await api.mappings();
                        if (epoch === revealEpoch.current) {
                          revealRef.current = true;
                          setRevealed(true);
                          setMappings(rows);
                        }
                      });
                  }}
                >
                  <Icon name="eye" />
                  {busy === "reveal"
                    ? "Loading…"
                    : revealed
                      ? "Hide originals"
                      : "Reveal originals"}
                </button>
                <button
                  className="secondary danger-text"
                  disabled={disabled || (!session.count && !input && !answer)}
                  onClick={() => setConfirmClear(true)}
                >
                  Clear session
                </button>
              </div>
            </div>
            {confirmClear && (
              <div className="confirm-panel" role="alert">
                <h3>Clear this session and its drafts?</h3>
                <p>
                  All original mappings will be forgotten. Existing placeholders
                  cannot be restored afterward. Saved rules and the system
                  clipboard are kept.
                </p>
                <div className="inline-row">
                  <button
                    className="danger"
                    disabled={disabled}
                    onClick={() =>
                      void run("clear", async () => {
                        await api.clear();
                        clearDrafts();
                        await refreshSession();
                        setMessage({
                          text: "Session and drafts cleared. Existing clipboard contents were not changed.",
                        });
                      })
                    }
                  >
                    Clear session and drafts
                  </button>
                  <button
                    className="secondary"
                    disabled={!!busy}
                    onClick={() => setConfirmClear(false)}
                  >
                    Keep session
                  </button>
                </div>
              </div>
            )}
            {!revealed ? (
              <div className="session-empty">
                <span className="empty-symbol">
                  <Icon name="lock" />
                </span>
                <h2>
                  {session.count
                    ? "Originals are hidden."
                    : "Your session starts with a protected draft."}
                </h2>
                <p>
                  {session.count
                    ? "Reveal only when you need to review. Originals hide again when you switch views or leave this window."
                    : "Protect text, use the placeholders in any AI, then restore its reply here. Keep this app running for the round trip."}
                </p>
                {!session.count && (
                  <button
                    className="secondary"
                    onClick={() => navigate("protect")}
                  >
                    Go to Protect
                    <Icon name="arrow" />
                  </button>
                )}
              </div>
            ) : (
              <>
                <label className="field-label" htmlFor="mapping-search">
                  Find a mapping
                </label>
                <input
                  id="mapping-search"
                  className="text-input search-input"
                  placeholder="Search token, type, or original…"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setLimit(50);
                  }}
                  autoComplete="off"
                  spellCheck={false}
                />
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Placeholder</th>
                        <th>Original detail</th>
                        <th>Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.slice(0, limit).map((m) => (
                        <tr key={m.token}>
                          <td>
                            <code>{m.token}</code>
                          </td>
                          <td className="original-cell">{m.original}</td>
                          <td>{kindName(m.kind)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!filtered.length && (
                    <p className="table-empty">
                      No matching mappings. Try another search.
                    </p>
                  )}
                </div>
                {filtered.length > limit && (
                  <button
                    className="secondary load-more"
                    onClick={() => setLimit((v) => v + 50)}
                  >
                    Show 50 more ({filtered.length - limit} remaining)
                  </button>
                )}
              </>
            )}
            <p className="session-note">
              <Icon name="session" />
              Clearing mappings, quitting the app, or letting them expire ends
              the ability to restore those details. Restore replies in the same
              app session that protected them.
            </p>
          </>
        )}
        {view === "shots" && (
          <ScreenshotView key={shotReset} onSessionChange={refreshSession} />
        )}
        {view === "settings" && (
          <>
            <div className="page-heading">
              <div>
                <h1>Your Nymkeep preferences.</h1>
                <p>Control what gets protected and how you reach Nymkeep.</p>
              </div>
            </div>
            {initializing && (
              <div className="loading-line" role="status">
                Loading your settings…
              </div>
            )}
            {desktop && !ready && !initializing && (
              <div className="banner error">
                <p>
                  Settings are unavailable. Your saved preferences have not been
                  overwritten.
                </p>
                <button
                  className="secondary"
                  onClick={() => setRetry((v) => v + 1)}
                >
                  Retry loading
                </button>
              </div>
            )}
            <section className="settings-section">
              <div className="section-description">
                <h2>Global shortcuts</h2>
                <p>
                  Use Nymkeep without switching windows. Changes apply after
                  saving.
                </p>
              </div>
              <div className="section-content">
                <div className="shortcut-fields">
                  <ShortcutRecorder
                    label="Protect and copy"
                    value={keyDraft.protect}
                    disabled={settingsDisabled}
                    onChange={(value) =>
                      setKeyDraft((prev) => ({ ...prev, protect: value }))
                    }
                  />
                  <ShortcutRecorder
                    label="Restore and copy"
                    value={keyDraft.restore}
                    disabled={settingsDisabled}
                    onChange={(value) =>
                      setKeyDraft((prev) => ({ ...prev, restore: value }))
                    }
                  />
                  <ShortcutRecorder
                    label="Quick capture"
                    value={keyDraft.quick}
                    disabled={settingsDisabled}
                    onChange={(value) =>
                      setKeyDraft((prev) => ({ ...prev, quick: value }))
                    }
                  />
                </div>
                <p className="small muted">
                  Tired of pressing Ctrl+C first? Press{" "}
                  <Keys value={keys.quick} /> anywhere: it copies and protects
                  in one step. Your clipboard history may keep the original, so
                  for maximum privacy copy manually first, then use Protect.
                </p>
                <div className="inline-row">
                  <button
                    className="primary"
                    disabled={settingsDisabled || !keysChanged}
                    onClick={() =>
                      void run("shortcuts", async () => {
                        const applied = await api.saveShortcuts(keyDraft);
                        setKeys(applied);
                        setKeyDraft(applied);
                        setMessage({ text: applied.message });
                      })
                    }
                  >
                    {busy === "shortcuts" ? "Saving…" : "Save shortcuts"}
                  </button>
                  <button
                    className="text-button"
                    disabled={settingsDisabled}
                    onClick={() => setKeyDraft(defaultKeys)}
                  >
                    Use defaults
                  </button>
                  {keysChanged && (
                    <span className="small muted">Unsaved changes</span>
                  )}
                </div>
              </div>
            </section>
            <section className="settings-section">
              <div className="section-description">
                <h2>Selection capture</h2>
                <p>
                  Read selected text in the focused app. Clipboard fallback is
                  used when the app cannot expose its selection.
                </p>
              </div>
              <div className="section-content">
                <div className="setting-row">
                  <div>
                    <strong>
                      {capture?.permissionRequired
                        ? "macOS Accessibility access"
                        : "Direct text selection"}
                    </strong>
                    <p>
                      {!capture
                        ? "Selection capture status is unavailable. Copied text can still be protected."
                        : capture.permissionRequired
                          ? capture.trusted
                            ? "Accessibility access is on. Only selected text is read."
                            : "Allow Nymkeep in System Settings → Privacy & Security → Accessibility to read selected text in other apps. Copied text works without permission."
                          : capture.implemented
                            ? "Available when the focused app exposes its selection."
                            : "Use copied text while the native selection adapter is being completed."}
                    </p>
                  </div>
                  <span className="subtle-tag">
                    {!capture
                      ? "Unavailable"
                      : capture.permissionRequired
                        ? capture.trusted
                          ? "Allowed"
                          : "Permission needed"
                        : capture.implemented
                          ? "Available"
                          : "Clipboard fallback"}
                  </span>
                </div>
                {capture?.permissionRequired && (
                  <div className="inline-row">
                    {!capture.trusted && (
                      <button
                        className="primary"
                        disabled={settingsDisabled}
                        onClick={() =>
                          void run("capture", async () => {
                            const status = await api.requestCapturePermission();
                            setCapture(status);
                            setMessage({
                              text: status.trusted
                                ? "Accessibility access is on."
                                : "Complete the macOS permission prompt, then check permission again.",
                            });
                          })
                        }
                      >
                        Request Accessibility access
                      </button>
                    )}
                    <button
                      className="secondary"
                      disabled={settingsDisabled}
                      onClick={() =>
                        void run("capture", async () => {
                          setCapture(await api.captureStatus());
                        })
                      }
                    >
                      Check permission
                    </button>
                  </div>
                )}
              </div>
            </section>
            <section className="settings-section">
              <div className="section-description">
                <h2>Detection</h2>
                <p>
                  Patterns run locally. Name detection assists with people,
                  organizations, and places.
                </p>
              </div>
              <div className="section-content">
                <div className="setting-row">
                  <div>
                    <strong>Local name detection</strong>
                    <p>
                      {ner === null
                        ? "Available in the desktop app."
                        : ner
                          ? "Local model loaded. Review results for missed details."
                          : "Model unavailable. Patterns and custom terms still work."}
                    </p>
                  </div>
                  <span className="subtle-tag">
                    {ner === null ? "Unavailable" : ner ? "On" : "Off"}
                  </span>
                </div>
                <label className="setting-row">
                  <div>
                    <strong>Protect amounts and dates</strong>
                    <p>Include money amounts and numeric dates in detection.</p>
                  </div>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={rules.moneyDates}
                    disabled={settingsDisabled}
                    onChange={() =>
                      void run("rules", () =>
                        saveRules({ ...rules, moneyDates: !rules.moneyDates }),
                      )
                    }
                  />
                </label>
              </div>
            </section>
            <section className="settings-section terms-section">
              <div className="section-description">
                <h2>Custom terms</h2>
                <p>
                  Teach Nymkeep about client names and project codenames.
                  Matching ignores case.
                </p>
                <p className="small">
                  These terms are saved as text on this device. Use “Protect
                  selection” for a correction that stays only in your current
                  draft.
                </p>
              </div>
              <div className="section-content terms-columns">
                {(["always", "never"] as const).map((list) => (
                  <div key={list}>
                    <h3>
                      {list === "always" ? "Always protect" : "Never protect"}
                    </h3>
                    <p className="small muted">
                      {list === "always"
                        ? "Names and terms that should become placeholders."
                        : "Public details you want to keep readable."}
                    </p>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void addTerm(list);
                      }}
                    >
                      <label className="sr-only" htmlFor={`term-${list}`}>
                        {list === "always"
                          ? "Always protect term"
                          : "Never protect term"}
                      </label>
                      <div className="term-add">
                        <input
                          id={`term-${list}`}
                          className="text-input"
                          placeholder={
                            list === "always"
                              ? "e.g. Project Aurora"
                              : "e.g. public@example.com"
                          }
                          value={terms[list]}
                          maxLength={400}
                          autoComplete="off"
                          spellCheck={false}
                          disabled={settingsDisabled}
                          aria-invalid={!!termErrors[list]}
                          aria-describedby={`error-${list}`}
                          onChange={(e) => {
                            setTerms((prev) => ({
                              ...prev,
                              [list]: e.target.value,
                            }));
                            setTermErrors((prev) => ({ ...prev, [list]: "" }));
                          }}
                        />
                        <button
                          className="secondary"
                          disabled={settingsDisabled || !terms[list].trim()}
                          type="submit"
                          aria-label={
                            list === "always"
                              ? "Add always-protect term"
                              : "Add never-protect term"
                          }
                        >
                          Add
                        </button>
                      </div>
                      <p
                        id={`error-${list}`}
                        className="field-error"
                        role={termErrors[list] ? "alert" : undefined}
                      >
                        {termErrors[list]}
                      </p>
                    </form>
                    <ul className="term-list">
                      {rules[list].map((term, i) => (
                        <li key={term}>
                          <span>{term}</span>
                          <button
                            className="icon-button"
                            aria-label={`Remove ${list === "always" ? "always-protect" : "never-protect"} term ${i + 1}`}
                            disabled={settingsDisabled}
                            onClick={() =>
                              void run("rules", () =>
                                saveRules({
                                  ...rules,
                                  [list]: rules[list].filter((t) => t !== term),
                                }),
                              )
                            }
                          >
                            <Icon name="close" />
                          </button>
                        </li>
                      ))}
                      {!rules[list].length && (
                        <li className="muted small">No custom terms yet.</li>
                      )}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
            <section className="settings-section">
              <div className="section-description">
                <h2>Desktop behavior</h2>
                <p>Keep the utility close at hand.</p>
              </div>
              <div className="section-content">
                <label className="setting-row">
                  <div>
                    <strong>Launch at login</strong>
                    <p>Start Nymkeep when you sign in to this device.</p>
                  </div>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={autostart}
                    disabled={settingsDisabled}
                    onChange={() =>
                      void run("autostart", async () => {
                        await api.setAutostart(!autostart);
                        setAutostart(!autostart);
                        setMessage({ text: "Login preference saved." });
                      })
                    }
                  />
                </label>
                <div className="setting-row">
                  <div>
                    <strong>Keep running in the tray</strong>
                    <p>
                      Closing the window keeps shortcuts and mappings available.
                      Use Quit in the tray menu to end the session.
                    </p>
                  </div>
                </div>
              </div>
            </section>
            <section
              className="settings-section"
              aria-labelledby="about-heading"
            >
              <div className="section-description">
                <h2 id="about-heading">About</h2>
                <p>
                  Nymkeep {BRAND.version} — {BRAND.byline}.
                </p>
              </div>
              <div className="section-content">
                <div className="setting-row">
                  <div>
                    <strong>Contact</strong>
                    <p>Questions, feedback, or licensing for your team.</p>
                  </div>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => void openExternal("mailto:" + BRAND.email)}
                  >
                    {BRAND.email}
                  </button>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>Website</strong>
                    <p>Product news and documentation.</p>
                  </div>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => void openExternal(BRAND.site)}
                  >
                    theklippers.com
                  </button>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>Support Klippers</strong>
                    <p>
                      Klippers is an independent team of five. We build products
                      like Nymkeep alongside our day jobs. We want to quit those
                      jobs and do this full-time.
                    </p>
                    <p>
                      If our work earns it, back us with a star, a follow, or a
                      sponsorship. Tooling subscriptions and development
                      hardware help just as much. Supporters keep Klippers
                      independent and its software affordable.
                    </p>
                  </div>
                </div>
                <div className="about-links">
                  {BRAND.repo !== "" && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => void openExternal(BRAND.repo)}
                    >
                      Star on GitHub
                    </button>
                  )}
                  {BRAND.follow !== "" && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => void openExternal(BRAND.follow)}
                    >
                      Follow
                    </button>
                  )}
                  {BRAND.sponsor !== "" && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => void openExternal(BRAND.sponsor)}
                    >
                      Sponsor us
                    </button>
                  )}
                </div>
              </div>
            </section>
            <details className="privacy-details">
              <summary>What stays on this device?</summary>
              <p>
                Protect and Restore run offline. Drafts and mappings stay in
                memory; custom terms and shortcuts are saved locally. Nothing
                from your text is sent to a server by these actions.
              </p>
              <p>
                Clipboard fallback reads text you already copied. Clipboard
                history, sync, or other apps may retain it. Restoring to the
                clipboard puts the original details back there.
              </p>
              <p>
                Detection is assistive and can miss sensitive information.
                Review the result before sharing. Direct selection capture is
                implemented for Windows; macOS and Linux adapters still require
                implementation and device testing.
              </p>
            </details>
          </>
        )}
      </main>
      <footer className="app-footer">
        <span>
          <Icon name="lock" />
          Protect and Restore work offline
        </span>
        <span>Mappings expire after 30 min without use</span>
        <span>{BRAND.byline}</span>
      </footer>
    </div>
  );
}
