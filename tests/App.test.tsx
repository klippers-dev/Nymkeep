import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import App from "../src/App";
import { api, byteLength, termError } from "../src/api";

vi.mock("../src/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/api")>();
  return {
    ...original,
    desktop: true,
    api: Object.fromEntries(
      Object.keys(original.api).map((key) => [
        key,
        key === "shots"
          ? Object.fromEntries(
              Object.keys(original.api.shots).map((name) => [name, vi.fn()]),
            )
          : vi.fn(),
      ]),
    ),
  };
});
const mock = vi.mocked(api);
const protectedResult = {
  text: "Contact EMAIL_1",
  count: 1,
  kinds: [{ kind: "EMAIL", count: 1 }],
  nerActive: false,
};
const rows = [
  { token: "EMAIL_1", original: "alex@example.com", kind: "EMAIL" },
];
async function start() {
  render(<App />);
  await waitFor(() => expect(mock.rules).toHaveBeenCalled());
  await act(async () => {});
}
const button = (name: string) =>
  screen.getByRole("button", { name, exact: true });
const click = (name: string) => fireEvent.click(button(name));
const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByRole("textbox", { name: label, exact: true }), {
    target: { value },
  });
async function protectDraft() {
  fill("Original text", "Contact alex@example.com");
  click("Protect text");
  await screen.findByDisplayValue("Contact EMAIL_1");
}

beforeEach(() => {
  vi.resetAllMocks();
  mock.rules.mockResolvedValue({ always: [], never: [], moneyDates: false });
  mock.shortcuts.mockResolvedValue({
    protect: "Alt+C",
    restore: "Alt+R",
    quick: "Alt+J",
  });
  mock.autostart.mockResolvedValue(false);
  mock.captureStatus.mockResolvedValue({
    platform: "windows",
    backend: "windows-uia",
    permissionRequired: false,
    trusted: true,
    implemented: true,
  });
  mock.ner.mockResolvedValue(false);
  mock.session.mockResolvedValue({ count: 1, expiresInSeconds: 1800 });
  mock.listen.mockResolvedValue(() => {});
  mock.mappings.mockResolvedValue(rows);
  mock.protect.mockResolvedValue(protectedResult);
  mock.restore.mockResolvedValue({
    text: "alex@example.com and PERSON_99",
    known: 1,
    unknown: 1,
    unknownTokens: ["PERSON_99"],
  });
  mock.copy.mockResolvedValue();
  vi.mocked(mock.shots.status).mockResolvedValue({
    available: false,
    backend: "unavailable",
  });
  vi.mocked(mock.shots.paste).mockResolvedValue({
    pngBase64: "fictionalFixture",
    width: 100,
    height: 100,
  });
  mock.clear.mockResolvedValue();
  mock.saveRules.mockImplementation(async (rules) => rules);
  mock.saveShortcuts.mockImplementation(async (keys) => ({
    ...keys,
    message: "Shortcuts updated.",
  }));
  mock.setAutostart.mockResolvedValue();
});
afterEach(cleanup);

describe("Review workflows", () => {
  it("checks Mac permission without requesting it when Settings opens", async () => {
    mock.captureStatus.mockResolvedValue({
      platform: "macos",
      backend: "macos-ax",
      permissionRequired: true,
      trusted: false,
      implemented: true,
    });
    await start();
    click("Settings");
    await screen.findByText("Permission needed");
    expect(mock.requestCapturePermission).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Copied text works without permission/),
    ).toBeTruthy();
  });
  it("keeps Mac access pending until an actual permission check succeeds", async () => {
    const pending = {
      platform: "macos",
      backend: "macos-ax",
      permissionRequired: true,
      trusted: false,
      implemented: true,
    };
    mock.captureStatus.mockResolvedValue(pending);
    mock.requestCapturePermission.mockResolvedValue(pending);
    await start();
    click("Settings");
    await screen.findByText("Permission needed");
    click("Request Accessibility access");
    await screen.findByText(
      "Complete the macOS permission prompt, then check permission again.",
    );
    expect(screen.getByText("Permission needed")).toBeTruthy();
    mock.captureStatus.mockResolvedValue({ ...pending, trusted: true });
    click("Check permission");
    await screen.findByText("Allowed");
    expect(
      screen.queryByRole("button", { name: "Request Accessibility access" }),
    ).toBeNull();
    expect(mock.requestCapturePermission).toHaveBeenCalledTimes(1);
  });
  it("does not report permission granted when the native request fails", async () => {
    mock.captureStatus.mockResolvedValue({
      platform: "macos",
      backend: "macos-ax",
      permissionRequired: true,
      trusted: false,
      implemented: true,
    });
    mock.requestCapturePermission.mockRejectedValue(new Error("Unavailable"));
    await start();
    click("Settings");
    await screen.findByText("Permission needed");
    click("Request Accessibility access");
    await waitFor(() =>
      expect(mock.requestCapturePermission).toHaveBeenCalledTimes(1),
    );
    expect(screen.getByText("Permission needed")).toBeTruthy();
    expect(screen.queryByText("Allowed")).toBeNull();
  });
  it("discards screenshot drafts on navigation and on a tray session clear", async () => {
    let notify!: (value: { kind: string; message: string }) => void;
    mock.listen.mockImplementation(async (fn) => {
      notify = fn;
      return () => {};
    });
    await start();
    click("Screenshot");
    click("Paste image");
    await screen.findByAltText("Original image under local review");
    click("Protect");
    click("Screenshot");
    expect(
      screen.queryByAltText("Original image under local review"),
    ).toBeNull();
    click("Paste image");
    await screen.findByAltText("Original image under local review");
    await act(async () =>
      notify({ kind: "clear", message: "Session cleared." }),
    );
    expect(
      screen.queryByAltText("Original image under local review"),
    ).toBeNull();
  });
  it("protects and copies, then invalidates the output as soon as the input changes", async () => {
    await start();
    await protectDraft();
    click("Copy protected text");
    await waitFor(() =>
      expect(mock.copy).toHaveBeenCalledWith("Contact EMAIL_1"),
    );
    await waitFor(() =>
      expect((button("Protect text") as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
    fill("Original text", "Contact another@example.com");
    expect(screen.queryByDisplayValue("Contact EMAIL_1")).toBeNull();
    expect((button("Copy protected text") as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
  it("offers a temporary selection correction without saving a persistent rule", async () => {
    await start();
    fill("Original text", "Project Aurora");
    const draft = screen.getByRole("textbox", {
      name: "Original text",
      exact: true,
    }) as HTMLTextAreaElement;
    draft.focus();
    draft.setSelectionRange(0, 14);
    fireEvent.select(draft);
    click("Protect selection");
    await waitFor(() =>
      expect(mock.protect).toHaveBeenCalledWith("Project Aurora", [
        "Project Aurora",
      ]),
    );
    expect(mock.saveRules).not.toHaveBeenCalled();
  });
  it("explains unknown placeholders and copies the full restored result explicitly", async () => {
    await start();
    click("Restore");
    fill("AI reply", "EMAIL_1 and PERSON_99");
    click("Restore text");
    await screen.findByDisplayValue("alex@example.com and PERSON_99");
    expect(screen.getByText("PERSON_99", { selector: "li" })).toBeTruthy();
    expect(screen.getByText("Contains original details")).toBeTruthy();
    click("Copy restored text");
    await waitFor(() =>
      expect(mock.copy).toHaveBeenCalledWith("alex@example.com and PERSON_99"),
    );
  });
  it("does not run on whitespace or on an oversized Unicode draft", async () => {
    await start();
    fill("Original text", "  \n ");
    expect((button("Protect text") as HTMLButtonElement).disabled).toBe(true);
    fill("Original text", "界".repeat(33334));
    expect((button("Protect text") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(
      screen.getByRole("textbox", { name: "Original text", exact: true }),
      { key: "Enter", ctrlKey: true },
    );
    expect(mock.protect).not.toHaveBeenCalled();
  });
  it("keeps the draft and removes a previous result when protection fails", async () => {
    await start();
    await protectDraft();
    mock.protect.mockRejectedValue(
      "input contains placeholder-like text that would make restore ambiguous",
    );
    click("Protect text");
    await screen.findByRole("alert");
    expect(screen.getByDisplayValue("Contact alex@example.com")).toBeTruthy();
    expect(screen.queryByDisplayValue("Contact EMAIL_1")).toBeNull();
  });
  it("reports clipboard failure without claiming copy succeeded", async () => {
    await start();
    await protectDraft();
    mock.copy.mockRejectedValue("Could not copy text.");
    click("Copy protected text");
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Could not copy",
    );
    expect(screen.getByDisplayValue("Contact EMAIL_1")).toBeTruthy();
  });
  it("does not replace a draft with clipboard contents accidentally", async () => {
    await start();
    fill("Original text", "Keep this draft");
    expect((button("Paste clipboard") as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(mock.readClipboard).not.toHaveBeenCalled();
  });
  it("serializes repeated protection requests", async () => {
    let complete!: (value: typeof protectedResult) => void;
    mock.protect.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    await start();
    fill("Original text", "alex@example.com");
    click("Protect text");
    fireEvent.keyDown(
      screen.getByRole("textbox", { name: "Original text", exact: true }),
      { key: "Enter", ctrlKey: true },
    );
    expect(mock.protect).toHaveBeenCalledTimes(1);
    await act(async () => complete(protectedResult));
  });
});

describe("Session privacy", () => {
  it("discards an in-flight result if the tray clears the session", async () => {
    let complete!: (value: typeof protectedResult) => void;
    mock.protect.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    await start();
    fill("Original text", "alex@example.com");
    click("Protect text");
    const receive = mock.listen.mock.calls[0][0];
    await act(async () =>
      receive({ kind: "clear", message: "Mappings cleared." }),
    );
    await act(async () => complete(protectedResult));
    expect(screen.queryByDisplayValue("Contact EMAIL_1")).toBeNull();
    expect(
      (
        screen.getByRole("textbox", {
          name: "Original text",
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("");
  });
  it("fetches originals only on reveal, and removes them on window blur", async () => {
    await start();
    expect(mock.mappings).not.toHaveBeenCalled();
    click("Session, 1 active mappings");
    expect(mock.mappings).not.toHaveBeenCalled();
    click("Reveal originals");
    await screen.findByText("alex@example.com");
    fireEvent(window, new Event("blur"));
    expect(screen.queryByText("alex@example.com")).toBeNull();
    expect(button("Reveal originals")).toBeTruthy();
  });
  it("never reveals a late mapping response after leaving the view", async () => {
    let complete!: (value: typeof rows) => void;
    mock.mappings.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    await start();
    click("Session, 1 active mappings");
    click("Reveal originals");
    click("Protect");
    await act(async () => complete(rows));
    click("Session, 1 active mappings");
    expect(screen.queryByText("alex@example.com")).toBeNull();
    expect(button("Reveal originals")).toBeTruthy();
  });
  it("requires an explicit clear action and clears every draft after success", async () => {
    await start();
    await protectDraft();
    click("Session, 1 active mappings");
    click("Clear session");
    expect(mock.clear).not.toHaveBeenCalled();
    click("Keep session");
    expect(mock.clear).not.toHaveBeenCalled();
    click("Clear session");
    mock.session.mockResolvedValue({ count: 0, expiresInSeconds: null });
    click("Clear session and drafts");
    await waitFor(() => expect(mock.clear).toHaveBeenCalledOnce());
    await screen.findByText(
      "Session and drafts cleared. Existing clipboard contents were not changed.",
    );
    click("Protect");
    expect(
      (
        screen.getByRole("textbox", {
          name: "Original text",
          exact: true,
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("");
    expect((button("Copy protected text") as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
  it("cleans up a status listener even when it resolves after unmount", async () => {
    let complete!: (value: () => void) => void;
    const unsubscribe = vi.fn();
    mock.listen.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const ui = render(<App />);
    ui.unmount();
    await act(async () => complete(unsubscribe));
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});

describe("Settings recovery", () => {
  it("preserves an entered custom term when saving fails and supports retry", async () => {
    await start();
    click("Settings");
    fill("Always protect term", "Project Aurora");
    mock.saveRules.mockRejectedValueOnce(
      "Could not save settings to this device.",
    );
    click("Add always-protect term");
    await screen.findByRole("alert");
    expect(screen.getByDisplayValue("Project Aurora")).toBeTruthy();
    click("Add always-protect term");
    await screen.findByText("Project Aurora", { selector: ".term-list span" });
    expect(
      (screen.getByLabelText("Always protect term") as HTMLInputElement).value,
    ).toBe("");
  });
  it("rejects contradictory custom terms before writing", async () => {
    mock.rules.mockResolvedValue({
      always: ["Project Aurora"],
      never: [],
      moneyDates: false,
    });
    await start();
    click("Settings");
    fill("Never protect term", "PROJECT AURORA");
    click("Add never-protect term");
    expect(
      screen.getByText(
        "This term is in the other list. Remove it there first.",
      ),
    ).toBeTruthy();
    expect(mock.saveRules).not.toHaveBeenCalled();
  });
  it("does not change the autostart switch after a failed save", async () => {
    await start();
    click("Settings");
    mock.setAutostart.mockRejectedValue("Could not change login setting.");
    const toggle = screen.getByRole("switch", { name: /Launch at login/ });
    fireEvent.click(toggle);
    await screen.findByRole("alert");
    expect((toggle as HTMLInputElement).checked).toBe(false);
  });
  it("records Space correctly and saves the chosen key combination", async () => {
    await start();
    click("Settings");
    click("Protect and copy");
    fireEvent.keyDown(button("Protect and copy"), {
      key: " ",
      code: "Space",
      ctrlKey: true,
      altKey: true,
    });
    click("Save shortcuts");
    await waitFor(() =>
      expect(mock.saveShortcuts).toHaveBeenCalledWith({
        protect: "Ctrl+Alt+Space",
        restore: "Alt+R",
        quick: "Alt+J",
      }),
    );
  });
  it("disables saving when initial settings could not be read", async () => {
    mock.rules.mockRejectedValue("unavailable");
    await start();
    click("Settings");
    expect(button("Retry loading")).toBeTruthy();
    expect(
      (screen.getByLabelText("Always protect term") as HTMLInputElement)
        .disabled,
    ).toBe(true);
  });
});

describe("Input validation", () => {
  it("counts UTF-8 bytes rather than code units", () => {
    expect(byteLength("界🙂")).toBe(7);
  });
  it("validates Unicode length and duplicate terms", () => {
    const rules = { always: ["Aurora"], never: [], moneyDates: false };
    expect(termError("AURORA", "always", rules)).toContain("already");
    expect(termError("x", "always", rules)).toContain("2 and 200");
    expect(termError("éé", "always", rules)).toBeNull();
  });
});
