import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { api } from "../src/api";
import ScreenshotView from "../src/ScreenshotView";

vi.mock("../src/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/api")>();
  return {
    ...original,
    desktop: true,
    api: {
      ...original.api,
      copy: vi.fn(),
      shots: Object.fromEntries(
        Object.keys(original.api.shots).map((key) => [key, vi.fn()]),
      ),
    },
  };
});
const mock = vi.mocked(api.shots);
const bytes = readFileSync("src-tauri/tests/fixtures/synthetic-note.png");
const image = { pngBase64: bytes.toString("base64"), width: 1120, height: 620 };
const manualBox = { x: 60, y: 254, w: 420, h: 50 };
const detectedBox = { x: 62, y: 257, w: 340, h: 42 };
const detection = {
  protectedText: "Contact EMAIL_1",
  count: 1,
  words: [],
  redactions: [{ token: "EMAIL_1", boxes: [detectedBox] }],
  kinds: [{ kind: "EMAIL", count: 1 }],
  nerActive: false,
};
const button = (name: string) =>
  screen.getByRole("button", { name, exact: true }) as HTMLButtonElement;
const click = (name: string) => fireEvent.click(button(name));
const file = (type = "image/png") => {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return new File([copy.buffer], "fictional.png", { type });
};
async function openImage() {
  fireEvent.change(screen.getByLabelText("Image file"), {
    target: { files: [file()] },
  });
  await screen.findByAltText("Original image under local review");
  await waitFor(() => expect(button("Paste image").disabled).toBe(false));
}
function addManualBox() {
  fireEvent.click(screen.getByText("Add a box with coordinates"));
  for (const [label, value] of [
    ["Left (pixels)", 60],
    ["Top (pixels)", 254],
    ["Width (pixels)", 420],
    ["Height (pixels)", 50],
  ] as const)
    fireEvent.change(screen.getByLabelText(label), {
      target: { value: String(value) },
    });
  fireEvent.submit(button("Add manual box").closest("form")!);
}
beforeEach(() => {
  vi.resetAllMocks();
  mock.status.mockResolvedValue({ available: true, backend: "windows-ocr" });
  mock.load.mockResolvedValue(image);
  mock.paste.mockResolvedValue(image);
  mock.detect.mockResolvedValue(detection);
  mock.redact.mockResolvedValue("redactedFixture");
  mock.copy.mockResolvedValue();
  mock.save.mockResolvedValue(true);
  vi.mocked(api.copy).mockResolvedValue();
});
afterEach(cleanup);

describe("Screenshot review and export", () => {
  it("uses native image paste and enables manual Copy and Save without OCR", async () => {
    mock.status.mockResolvedValue({ available: false, backend: "unavailable" });
    render(<ScreenshotView />);
    click("Paste image");
    await screen.findByAltText("Original image under local review");
    await waitFor(() => expect(button("Paste image").disabled).toBe(false));
    expect(button("Detect sensitive text").disabled).toBe(true);
    expect(button("Copy redacted image").disabled).toBe(true);
    addManualBox();
    click("Copy redacted image");
    await waitFor(() =>
      expect(mock.copy).toHaveBeenCalledWith(image.pngBase64, [manualBox]),
    );
    await screen.findByText(
      "Redacted image copied. Selected pixels are permanently black.",
    );
    click("Save redacted PNG");
    await waitFor(() =>
      expect(mock.save).toHaveBeenCalledWith(image.pngBase64, [manualBox]),
    );
    await screen.findByText("Redacted PNG saved.");
    expect(mock.detect).not.toHaveBeenCalled();
  });
  it("normalizes an input file before display and native processing", async () => {
    render(<ScreenshotView />);
    await openImage();
    expect(mock.load).toHaveBeenCalledWith(image.pngBase64);
    expect(
      screen
        .getByAltText("Original image under local review")
        .getAttribute("src"),
    ).toBe(`data:image/png;base64,${image.pngBase64}`);
  });
  it("keeps manual areas when detection fails", async () => {
    mock.detect.mockRejectedValueOnce(
      "Text recognition failed. Draw manual boxes.",
    );
    render(<ScreenshotView />);
    await openImage();
    addManualBox();
    click("Detect sensitive text");
    await screen.findByRole("alert");
    expect(button("Copy redacted image").disabled).toBe(false);
    click("Copy redacted image");
    await waitFor(() =>
      expect(mock.copy).toHaveBeenCalledWith(image.pngBase64, [manualBox]),
    );
  });
  it("keeps manual areas and matching exclusions through repeated detection", async () => {
    render(<ScreenshotView />);
    await openImage();
    addManualBox();
    click("Detect sensitive text");
    await screen.findByRole("button", {
      name: "Exclude suggested EMAIL_1 area 1",
    });
    click("Exclude suggested EMAIL_1 area 1");
    click("Detect sensitive text");
    await waitFor(() => expect(mock.detect).toHaveBeenCalledTimes(2));
    await screen.findByRole("button", {
      name: "Include suggested EMAIL_1 area 1",
    });
    click("Copy redacted image");
    await waitFor(() =>
      expect(mock.copy).toHaveBeenCalledWith(image.pngBase64, [manualBox]),
    );
  });
  it("prevents unmasked export when every suggested box is excluded", async () => {
    render(<ScreenshotView />);
    await openImage();
    click("Detect sensitive text");
    await screen.findByRole("button", {
      name: "Exclude suggested EMAIL_1 area 1",
    });
    click("Exclude suggested EMAIL_1 area 1");
    expect(button("Copy redacted image").disabled).toBe(true);
    expect(button("Save redacted PNG").disabled).toBe(true);
    expect(mock.copy).not.toHaveBeenCalled();
    expect(mock.save).not.toHaveBeenCalled();
  });
  it("shows actual redacted pixels and invalidates the preview when a box is removed", async () => {
    render(<ScreenshotView />);
    await openImage();
    addManualBox();
    click("Preview redacted PNG");
    const output = await screen.findByAltText(
      "Actual redacted PNG ready to share",
    );
    expect(output.getAttribute("src")).toBe(
      "data:image/png;base64,redactedFixture",
    );
    expect(mock.redact).toHaveBeenCalledWith(image.pngBase64, [manualBox]);
    click("Edit boxes");
    click("Remove manual area 1");
    expect(
      screen.queryByAltText("Actual redacted PNG ready to share"),
    ).toBeNull();
    expect(button("Copy redacted image").disabled).toBe(true);
  });
  it("reports copy failure and save cancellation without false success", async () => {
    mock.copy.mockRejectedValueOnce(
      "Image copy failed. Use Save redacted PNG.",
    );
    mock.save.mockResolvedValueOnce(false);
    render(<ScreenshotView />);
    await openImage();
    addManualBox();
    click("Copy redacted image");
    await screen.findByRole("alert");
    expect(
      screen.queryByText(
        "Redacted image copied. Selected pixels are permanently black.",
      ),
    ).toBeNull();
    click("Save redacted PNG");
    await screen.findByText("Save cancelled. No image was saved.");
    expect(screen.queryByText("Redacted PNG saved.")).toBeNull();
  });
  it("keeps protected OCR text separate from manual pixel decisions", async () => {
    render(<ScreenshotView />);
    await openImage();
    click("Detect sensitive text");
    await screen.findByText("Protected text from this image (1 replacement)");
    fireEvent.click(
      screen.getByText("Protected text from this image (1 replacement)"),
    );
    expect(
      (
        screen.getByLabelText(
          "Protected text from image",
        ) as HTMLTextAreaElement
      ).value,
    ).toBe("Contact EMAIL_1");
    click("Copy protected text");
    await waitFor(() =>
      expect(api.copy).toHaveBeenCalledWith("Contact EMAIL_1"),
    );
    await screen.findByText(
      "Protected OCR text copied. Review it before sharing.",
    );
  });
  it("rejects unsupported or oversized files before native processing", async () => {
    render(<ScreenshotView />);
    fireEvent.change(screen.getByLabelText("Image file"), {
      target: { files: [file("image/svg+xml")] },
    });
    await screen.findByRole("alert");
    expect(mock.load).not.toHaveBeenCalled();
    const large = file();
    Object.defineProperty(large, "size", { value: 21 * 1024 * 1024 });
    fireEvent.change(screen.getByLabelText("Image file"), {
      target: { files: [large] },
    });
    await screen.findByText("Use an image smaller than 20 MB.");
    expect(mock.load).not.toHaveBeenCalled();
  });
  it("does not assume that zero automatic matches means a shareable image", async () => {
    mock.detect.mockResolvedValueOnce({
      ...detection,
      count: 0,
      redactions: [],
      kinds: [],
      protectedText: "Fictional note",
    });
    render(<ScreenshotView />);
    await openImage();
    click("Detect sensitive text");
    await screen.findByText(
      /No automatic matches. Sensitive details may still be present/,
    );
    expect(button("Copy redacted image").disabled).toBe(true);
    addManualBox();
    expect(button("Copy redacted image").disabled).toBe(false);
  });
  it("discards a pending detection result when clearing or leaving the screenshot view", async () => {
    let finish!: (value: typeof detection) => void;
    mock.detect.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const rendered = render(<ScreenshotView key={1} />);
    await openImage();
    click("Detect sensitive text");
    rendered.rerender(<ScreenshotView key={2} />);
    await act(async () => finish(detection));
    expect(
      screen.queryByAltText("Original image under local review"),
    ).toBeNull();
    expect(
      screen.queryByText("Protected text from this image (1 replacement)"),
    ).toBeNull();
    expect(mock.copy).not.toHaveBeenCalled();
  });
  it("hides private image review on blur and clears it on Start over", async () => {
    render(<ScreenshotView />);
    await openImage();
    fireEvent(window, new Event("blur"));
    expect(
      screen
        .getByAltText("Original image under local review")
        .closest(".shot-private"),
    ).not.toBeNull();
    fireEvent(window, new Event("focus"));
    expect(
      screen
        .getByAltText("Original image under local review")
        .closest(".shot-private"),
    ).toBeNull();
    click("Start over");
    expect(
      screen.queryByAltText("Original image under local review"),
    ).toBeNull();
  });
  it("finishes a pointer drag outside the image without losing the manual area", async () => {
    render(<ScreenshotView />);
    await openImage();
    const canvas = screen.getByLabelText("Image box editor");
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 560,
      bottom: 310,
      width: 560,
      height: 310,
      toJSON: () => ({}),
    });
    const pointer = (type: string, x: number, y: number) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        button: 0,
        clientX: x,
        clientY: y,
      });
      Object.defineProperty(event, "pointerId", { value: 1 });
      fireEvent(canvas, event);
    };
    pointer("pointerdown", 56, 31);
    pointer("pointermove", 700, 400);
    pointer("pointerup", 700, 400);
    click("Copy redacted image");
    await waitFor(() =>
      expect(mock.copy).toHaveBeenCalledWith(image.pngBase64, [
        { x: 112, y: 62, w: 1008, h: 558 },
      ]),
    );
  });
});
