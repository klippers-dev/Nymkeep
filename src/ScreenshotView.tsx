import { useEffect, useRef, useState } from "react";
import { api, desktop, kindName } from "./api";
import type { ShotBox, ShotDetect, ShotImage, ShotStatus } from "./api";
import { boxKey, clampBox, dataUrlToBase64, flattenRedactions } from "./shots";

const readFile = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject("The image could not be read.");
    reader.onerror = () =>
      reject("The image could not be read. Try another file.");
    reader.onabort = () => reject("Image loading was cancelled.");
    reader.readAsDataURL(file);
  });

export default function ScreenshotView({
  onSessionChange,
}: {
  onSessionChange?: () => Promise<void>;
}) {
  const [image, setImage] = useState<ShotImage | null>(null);
  const [detected, setDetected] = useState<ShotDetect | null>(null);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [manual, setManual] = useState<ShotBox[]>([]);
  const [draft, setDraft] = useState<ShotBox | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<ShotStatus | null>(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{
    text: string;
    error?: boolean;
  } | null>(null);
  const [privateView, setPrivateView] = useState(false);
  const [coordinates, setCoordinates] = useState({
    x: "0",
    y: "0",
    w: "120",
    h: "40",
  });
  const frame = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const epoch = useRef(0);
  const mounted = useRef(true);
  const locked = useRef(false);
  const drag = useRef<{
    x: number;
    y: number;
    id: number;
    box: ShotBox;
  } | null>(null);
  const disabled = !desktop || !!busy;
  const automatic = flattenRedactions(detected?.redactions ?? []);
  const boxes = image
    ? [
        ...automatic
          .filter(({ box }) => !excluded.includes(boxKey(box)))
          .map(({ box }) => box),
        ...manual,
      ]
        .map((box) => clampBox(box, image.width, image.height))
        .filter((box): box is ShotBox => box !== null)
    : [];

  useEffect(() => {
    mounted.current = true;
    if (desktop)
      api.shots
        .status()
        .then((value) => {
          if (mounted.current) setStatus(value);
        })
        .catch(() => {
          if (mounted.current)
            setStatus({ available: false, backend: "unavailable" });
        });
    const hide = () => setPrivateView(true);
    const show = () => setPrivateView(false);
    window.addEventListener("blur", hide);
    window.addEventListener("focus", show);
    return () => {
      mounted.current = false;
      epoch.current += 1;
      window.removeEventListener("blur", hide);
      window.removeEventListener("focus", show);
    };
  }, []);

  async function act(
    label: string,
    work: (current: () => boolean) => Promise<void>,
  ) {
    if (locked.current || !desktop) return;
    locked.current = true;
    const ticket = epoch.current;
    const current = () => mounted.current && ticket === epoch.current;
    setBusy(label);
    setNotice(null);
    try {
      await work(current);
    } catch (error) {
      if (current())
        setNotice({
          text:
            typeof error === "string"
              ? error
              : "The image action could not finish. Try again.",
          error: true,
        });
    } finally {
      locked.current = false;
      if (current()) setBusy("");
    }
  }

  function reset() {
    epoch.current += 1;
    setImage(null);
    setDetected(null);
    setExcluded([]);
    setManual([]);
    setPreview(null);
    setDraft(null);
    setNotice(null);
    drag.current = null;
    if (fileInput.current) fileInput.current.value = "";
  }
  function acceptImage(next: ShotImage) {
    setImage(next);
    setDetected(null);
    setExcluded([]);
    setManual([]);
    setPreview(null);
    setDraft(null);
    drag.current = null;
  }
  function changed() {
    setPreview(null);
    setNotice(null);
  }

  async function load(file: File) {
    if (disabled) return;
    if (!/^image\/(png|jpeg|webp|gif|bmp|x-ms-bmp)$/.test(file.type)) {
      setNotice({
        text: "Choose a PNG, JPEG, WebP, GIF or BMP image.",
        error: true,
      });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setNotice({ text: "Use an image smaller than 20 MB.", error: true });
      return;
    }
    await act("Opening image…", async (current) => {
      const source = dataUrlToBase64(await readFile(file));
      if (!current()) return;
      if (!source) throw "The image could not be read. Try another file.";
      const next = await api.shots.load(source);
      if (current()) acceptImage(next);
    });
  }
  async function paste() {
    await act("Reading image…", async (current) => {
      const next = await api.shots.paste();
      if (current()) acceptImage(next);
    });
  }
  async function detect() {
    if (!image) return;
    await act("Detecting text…", async (current) => {
      const next = await api.shots.detect(image.pngBase64);
      if (!current()) return;
      setDetected(next);
      const nextKeys = next.redactions.flatMap((redaction) =>
        redaction.boxes.map(boxKey),
      );
      setExcluded((previous) =>
        previous.filter((key) => nextKeys.includes(key)),
      );
      setPreview(null);
      setNotice({
        text: next.count
          ? `${next.count} details suggested. Review every box; your manual boxes were kept.`
          : "No automatic matches. Sensitive details may still be present; draw manual boxes before sharing.",
      });
      await onSessionChange?.();
    });
  }
  async function exportImage(action: "copy" | "save" | "preview") {
    if (!image || !boxes.length) return;
    await act(
      action === "copy"
        ? "Copying image…"
        : action === "save"
          ? "Saving PNG…"
          : "Creating preview…",
      async (current) => {
        if (action === "preview") {
          const next = await api.shots.redact(image.pngBase64, boxes);
          if (current()) setPreview(`data:image/png;base64,${next}`);
        } else if (action === "copy") {
          await api.shots.copy(image.pngBase64, boxes);
          if (current())
            setNotice({
              text: "Redacted image copied. Selected pixels are permanently black.",
            });
        } else {
          const saved = await api.shots.save(image.pngBase64, boxes);
          if (current())
            setNotice({
              text: saved
                ? "Redacted PNG saved."
                : "Save cancelled. No image was saved.",
            });
        }
      },
    );
  }

  function point(clientX: number, clientY: number) {
    if (!image || !frame.current) return null;
    const rect = frame.current.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(
          image.width,
          ((clientX - rect.left) / Math.max(1, rect.width)) * image.width,
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          image.height,
          ((clientY - rect.top) / Math.max(1, rect.height)) * image.height,
        ),
      ),
    };
  }
  function addCoordinateBox(event: React.FormEvent) {
    event.preventDefault();
    if (!image || disabled) return;
    const box = clampBox(
      {
        x: Number(coordinates.x),
        y: Number(coordinates.y),
        w: Number(coordinates.w),
        h: Number(coordinates.h),
      },
      image.width,
      image.height,
    );
    if (!box) {
      setNotice({
        text: "Enter an area at least 2 × 2 pixels inside the image.",
        error: true,
      });
      return;
    }
    changed();
    setManual((previous) => [...previous, box]);
  }
  const position = (box: ShotBox) => ({
    left: `${(box.x / image!.width) * 100}%`,
    top: `${(box.y / image!.height) * 100}%`,
    width: `${(box.w / image!.width) * 100}%`,
    height: `${(box.h / image!.height) * 100}%`,
  });

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Redact screenshots.</h1>
          <p>
            Cover sensitive details, review the pixels, then copy or save a PNG.
            Image redaction is permanent.
          </p>
        </div>
        <span className="workflow-label">Before you share</span>
      </div>
      {notice && (
        <div
          className={`banner ${notice.error ? "error" : "info"}`}
          role={notice.error ? "alert" : "status"}
        >
          {notice.text}
        </div>
      )}
      <section
        className="editor-panel screenshot-workspace"
        aria-label="Screenshot redaction"
        onPaste={(event) => {
          const file = Array.from(event.clipboardData.items)
            .find((item) => item.type.startsWith("image/"))
            ?.getAsFile();
          if (file && !disabled) {
            event.preventDefault();
            void load(file);
          }
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files[0];
          if (file && !disabled) void load(file);
        }}
      >
        <div className="shot-toolbar">
          <div className="shot-intake">
            <button
              className="secondary"
              disabled={disabled}
              onClick={() => fileInput.current?.click()}
            >
              Choose image
            </button>
            <input
              ref={fileInput}
              aria-label="Image file"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/x-ms-bmp"
              hidden
              disabled={disabled}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void load(file);
              }}
            />
            <button
              className="secondary"
              disabled={disabled}
              onClick={() => void paste()}
            >
              Paste image
            </button>
          </div>
          {image && (
            <button className="text-button" disabled={disabled} onClick={reset}>
              Start over
            </button>
          )}
        </div>
        {!image ? (
          <div className="shot-drop">
            <strong>Your next screenshot, with less exposed.</strong>
            <p>Choose a file, paste an image, or drop one here.</p>
            <p>
              PNG, JPEG, WebP, GIF or BMP · up to 20 MB and 16 megapixels. GIF
              uses its first frame.
            </p>
            <p>
              Processing stays on your device. Automatic text detection is
              optional.
            </p>
          </div>
        ) : (
          <>
            <div className="shot-review-heading">
              <div>
                <h2>
                  {preview ? "Actual export preview" : "Review your image"}
                </h2>
                <p>
                  {image.width} × {image.height} pixels · {boxes.length}{" "}
                  selected areas
                </p>
              </div>
              <div className="shot-intake">
                <button
                  className="secondary"
                  disabled={disabled || !boxes.length}
                  onClick={() =>
                    preview ? setPreview(null) : void exportImage("preview")
                  }
                >
                  {preview ? "Edit boxes" : "Preview redacted PNG"}
                </button>
                <button
                  className="secondary"
                  disabled={disabled || status?.available === false}
                  onClick={() => void detect()}
                >
                  Detect sensitive text
                </button>
              </div>
            </div>
            <div className="shot-private-wrap">
              {privateView && (
                <p className="shot-private-notice">
                  Image hidden while Nymkeep is unfocused.
                </p>
              )}
              <div className={privateView ? "shot-private" : ""}>
                {preview ? (
                  <img
                    className="shot-export-preview"
                    src={preview}
                    alt="Actual redacted PNG ready to share"
                  />
                ) : (
                  <div
                    className="shot-preview"
                    ref={frame}
                    aria-label="Image box editor"
                    onPointerDown={(event) => {
                      if (
                        disabled ||
                        event.button !== 0 ||
                        (event.target as HTMLElement).closest("[data-box]")
                      )
                        return;
                      const origin = point(event.clientX, event.clientY);
                      if (!origin) return;
                      drag.current = {
                        ...origin,
                        id: event.pointerId,
                        box: { ...origin, w: 0, h: 0 },
                      };
                      frame.current?.setPointerCapture?.(event.pointerId);
                      setDraft(drag.current.box);
                    }}
                    onPointerMove={(event) => {
                      const current = drag.current;
                      const next = point(event.clientX, event.clientY);
                      if (!current || !next || current.id !== event.pointerId)
                        return;
                      current.box = {
                        x: Math.min(current.x, next.x),
                        y: Math.min(current.y, next.y),
                        w: Math.abs(next.x - current.x),
                        h: Math.abs(next.y - current.y),
                      };
                      setDraft(current.box);
                    }}
                    onPointerUp={(event) => {
                      const current = drag.current;
                      if (!current || current.id !== event.pointerId || !image)
                        return;
                      const box = clampBox(
                        current.box,
                        image.width,
                        image.height,
                      );
                      drag.current = null;
                      setDraft(null);
                      frame.current?.releasePointerCapture?.(event.pointerId);
                      if (box) {
                        changed();
                        setManual((previous) => [...previous, box]);
                      }
                    }}
                    onPointerCancel={() => {
                      drag.current = null;
                      setDraft(null);
                    }}
                  >
                    <img
                      src={`data:image/png;base64,${image.pngBase64}`}
                      alt="Original image under local review"
                      draggable={false}
                    />
                    {automatic.map(({ token, box }, index) => {
                      const off = excluded.includes(boxKey(box));
                      return (
                        <button
                          key={`auto-${index}`}
                          className={`shot-box${off ? " off" : ""}`}
                          data-box="1"
                          style={position(box)}
                          disabled={disabled}
                          aria-label={`${off ? "Include" : "Exclude"} suggested ${token} area ${index + 1}`}
                          aria-pressed={!off}
                          onClick={() => {
                            changed();
                            setExcluded((previous) =>
                              off
                                ? previous.filter((key) => key !== boxKey(box))
                                : [...previous, boxKey(box)],
                            );
                          }}
                        >
                          <span>{off ? "Excluded" : token}</span>
                        </button>
                      );
                    })}
                    {manual.map((box, index) => (
                      <button
                        key={`manual-${index}`}
                        className="shot-box manual"
                        data-box="1"
                        style={position(box)}
                        disabled={disabled}
                        aria-label={`Remove manual area ${index + 1}`}
                        onClick={() => {
                          changed();
                          setManual((previous) =>
                            previous.filter((_, i) => i !== index),
                          );
                        }}
                      >
                        <span>Manual {index + 1}</span>
                      </button>
                    ))}
                    {draft && (
                      <span
                        className="shot-box draft"
                        aria-hidden="true"
                        style={position(draft)}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
            <p className="shot-help">
              {status?.available === false
                ? "Automatic recognition is unavailable. Manual boxes, Copy and Save still work."
                : "Detection can miss details. Drag to add a manual box; select an existing box to exclude or remove it."}{" "}
              Faces and objects need manual marking.
            </p>
            <details className="shot-coordinates">
              <summary>Add a box with coordinates</summary>
              <form onSubmit={addCoordinateBox}>
                {(
                  [
                    ["x", "Left (pixels)"],
                    ["y", "Top (pixels)"],
                    ["w", "Width (pixels)"],
                    ["h", "Height (pixels)"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      type="number"
                      min={key === "x" || key === "y" ? 0 : 2}
                      step="1"
                      required
                      disabled={disabled}
                      value={coordinates[key]}
                      onChange={(event) =>
                        setCoordinates((previous) => ({
                          ...previous,
                          [key]: event.target.value,
                        }))
                      }
                    />
                  </label>
                ))}
                <button className="secondary" disabled={disabled} type="submit">
                  Add manual box
                </button>
              </form>
            </details>
            {!!(automatic.length + manual.length) && (
              <details className="shot-area-review">
                <summary>
                  Review marked areas ({automatic.length + manual.length})
                </summary>
                <ul>
                  {automatic.map(({ token, box }, index) => (
                    <li key={`list-auto-${index}`}>
                      <label>
                        <input
                          type="checkbox"
                          disabled={disabled}
                          checked={!excluded.includes(boxKey(box))}
                          onChange={() => {
                            changed();
                            setExcluded((previous) =>
                              previous.includes(boxKey(box))
                                ? previous.filter((key) => key !== boxKey(box))
                                : [...previous, boxKey(box)],
                            );
                          }}
                        />
                        Suggested {token} area {index + 1}
                        <span>
                          {box.x}, {box.y} · {box.w} × {box.h} pixels
                        </span>
                      </label>
                    </li>
                  ))}
                  {manual.map((box, index) => (
                    <li key={`list-manual-${index}`}>
                      <span>
                        Manual area {index + 1} · {box.x}, {box.y} · {box.w} ×{" "}
                        {box.h} pixels
                      </span>
                      <button
                        className="text-button"
                        disabled={disabled}
                        onClick={() => {
                          changed();
                          setManual((previous) =>
                            previous.filter((_, i) => i !== index),
                          );
                        }}
                      >
                        Remove area {index + 1}
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div className="shot-export-bar">
              <div>
                <strong>
                  {boxes.length
                    ? `${boxes.length} areas will become solid black.`
                    : "Add or include a box to enable export."}
                </strong>
                <p>
                  Review the entire image. Preview labels are never included in
                  the PNG.
                </p>
              </div>
              <div className="shot-intake">
                <button
                  className="primary"
                  disabled={disabled || !boxes.length}
                  onClick={() => void exportImage("copy")}
                >
                  Copy redacted image
                </button>
                <button
                  className="secondary"
                  disabled={disabled || !boxes.length}
                  onClick={() => void exportImage("save")}
                >
                  Save redacted PNG
                </button>
              </div>
            </div>
            {detected && (
              <details
                className={`shot-ocr-text${privateView ? " shot-private" : ""}`}
              >
                <summary>
                  Protected text from this image ({detected.count}{" "}
                  {detected.count === 1 ? "replacement" : "replacements"})
                </summary>
                <p>
                  Review before copying. Manual pixel boxes do not change this
                  separate text result.
                </p>
                <textarea
                  aria-label="Protected text from image"
                  value={detected.protectedText}
                  readOnly
                />
                <p>
                  {detected.kinds
                    .map((kind) => `${kindName(kind.kind)} × ${kind.count}`)
                    .join(" · ") || "No automatic matches"}
                </p>
                <button
                  className="secondary"
                  disabled={disabled}
                  onClick={() =>
                    void act("Copying text…", async (current) => {
                      await api.copy(detected.protectedText);
                      if (current())
                        setNotice({
                          text: "Protected OCR text copied. Review it before sharing.",
                        });
                    })
                  }
                >
                  Copy protected text
                </button>
              </details>
            )}
          </>
        )}
        {!!busy && (
          <p className="shot-busy" role="status">
            {busy}
          </p>
        )}
      </section>
    </>
  );
}
