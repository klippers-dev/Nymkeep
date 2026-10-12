import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import UpdateSettings from "../src/UpdateSettings";
import { api } from "../src/api";
vi.mock("../src/api", () => ({
  desktop: true,
  api: {
    updateStatus: vi.fn(),
    checkUpdate: vi.fn(),
    installUpdate: vi.fn(),
    restartUpdate: vi.fn(),
  },
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
const status = {
  currentVersion: "0.1.0",
  configured: true,
  manualOnly: false,
  availableVersion: null,
  restartRequired: false,
  message: "Check when you choose.",
};
const mock = vi.mocked(api);
beforeEach(() => {
  vi.clearAllMocks();
  mock.updateStatus.mockResolvedValue(status);
  mock.checkUpdate.mockResolvedValue({
    ...status,
    availableVersion: "0.2.0",
    message: "A new version is available.",
  });
  mock.installUpdate.mockResolvedValue();
  mock.restartUpdate.mockResolvedValue();
});
afterEach(cleanup);
it("opening settings reads local availability without starting a network check", async () => {
  render(<UpdateSettings beforeInstall={vi.fn()} setInstalling={vi.fn()} />);
  await screen.findByText("Installed version 0.1.0");
  expect(mock.checkUpdate).not.toHaveBeenCalled();
  expect(mock.installUpdate).not.toHaveBeenCalled();
});
it("installation requires a separate confirmation and clears drafts before native installation", async () => {
  const clear = vi.fn(),
    installing = vi.fn();
  mock.installUpdate.mockImplementation(async () => {
    expect(clear).toHaveBeenCalledOnce();
  });
  render(<UpdateSettings beforeInstall={clear} setInstalling={installing} />);
  await screen.findByText("Installed version 0.1.0");
  fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
  await screen.findByText("Nymkeep 0.2.0 is available.");
  expect(mock.checkUpdate).toHaveBeenCalledWith();
  fireEvent.click(screen.getByRole("button", { name: "Install update…" }));
  expect(mock.installUpdate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Keep current version" }));
  expect(clear).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Install update…" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Install and clear session" }),
  );
  await screen.findByRole("button", { name: "Restart now" });
  expect(mock.installUpdate).toHaveBeenCalledWith();
  expect(installing.mock.calls).toEqual([[true], [false]]);
  expect(mock.restartUpdate).not.toHaveBeenCalled();
});
it("unsigned builds and Debian installations retain the manual release path", async () => {
  mock.updateStatus.mockResolvedValue({
    ...status,
    manualOnly: true,
    message: "Download the next Debian package from Releases.",
  });
  render(<UpdateSettings beforeInstall={vi.fn()} setInstalling={vi.fn()} />);
  await screen.findByText("Installed version 0.1.0");
  expect(
    screen.getByRole("button", { name: "Check for updates" }),
  ).toHaveProperty("disabled", true);
  expect(screen.getByRole("button", { name: "View releases" })).toHaveProperty(
    "disabled",
    false,
  );
  expect(mock.checkUpdate).not.toHaveBeenCalled();
});
it("failed checks keep a retry action and never install", async () => {
  mock.checkUpdate.mockRejectedValue(new Error("synthetic network error"));
  render(<UpdateSettings beforeInstall={vi.fn()} setInstalling={vi.fn()} />);
  await screen.findByText("Installed version 0.1.0");
  fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
  await screen.findByRole("alert");
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Check for updates" }),
    ).toHaveProperty("disabled", false),
  );
  expect(mock.installUpdate).not.toHaveBeenCalled();
});
