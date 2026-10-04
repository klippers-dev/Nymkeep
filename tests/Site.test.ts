import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const html = readFileSync(resolve("site/index.html"), "utf8");
const code = readFileSync(resolve("site/site.js"), "utf8");
const config = readFileSync(resolve("site/release.js"), "utf8");
const run = (source: string) =>
  new Function("document", "window", "URL", source)(document, window, URL);
const el = (selector: string) => document.querySelector<HTMLElement>(selector)!;
const text = (selector: string) =>
  el(selector).textContent?.replace(/\s+/g, " ").trim();

beforeEach(() => {
  delete document.documentElement.dataset.theme;
  Object.defineProperty(window, "IntersectionObserver", {
    configurable: true,
    value: undefined,
  });
  document.body.innerHTML = new DOMParser().parseFromString(
    html,
    "text/html",
  ).body.innerHTML;
  document.body.id = "top";
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({ matches: false, addEventListener: vi.fn() })),
  });
  run(config);
});

describe("marketing website", () => {
  it("switches themes with an accessible label and no persistent storage", () => {
    run(code);
    const theme = el(".theme-toggle");
    expect(theme.getAttribute("aria-label")).toBe("Switch to dark theme");
    theme.click();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(theme.getAttribute("aria-label")).toBe("Switch to light theme");
    expect(el("[data-theme-icon]").getAttribute("href")).toBe("#nk-sun");
    theme.click();
    expect(document.documentElement.dataset.theme).toBe("light");
  });
  it("keeps the unreleased installer state truthful without disabling the walkthrough", () => {
    run(code);
    expect(text("[data-release-status]")).toBe("Public release coming soon");
    expect(el("[data-installer-link]").getAttribute("href")).toMatch(
      /^mailto:/,
    );
    el('[data-stage="reply"]').click();
    expect(text("[data-result-label]")).toBe("An illustrative AI reply");
    expect(el('[data-stage="reply"]').getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(el("[data-bridge-key]").hidden).toBe(true);
  });

  it("walks through a reply and restores the exact fictional originals, then replays", () => {
    run(code);
    const original = text("[data-source-text]");
    el("[data-next-stage]").click();
    expect(text("[data-result-text]")).toContain("EMAIL_1");
    expect(text("[data-result-text]")).not.toContain("mira@example.com");
    el("[data-next-stage]").click();
    expect(text("[data-result-text]")).toContain("mira@example.com");
    expect(text("[data-result-text]")).toContain("Mira Sen");
    expect(text("[data-result-text]")).toContain("Juniper Studio");
    expect(text("[data-bridge-key]")).toBe("Alt + R");
    expect(
      document.querySelectorAll('[data-stage][aria-pressed="true"]'),
    ).toHaveLength(1);
    el("[data-next-stage]").click();
    expect(text("[data-source-text]")).toBe(original);
    expect(el('[data-stage="protect"]').getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(el("[data-next-stage] .icon use").getAttribute("href")).toBe(
      "#nk-arrow-right",
    );
    expect(
      document.querySelectorAll("input, textarea, [contenteditable]"),
    ).toHaveLength(0);
    expect(text(".example-disclaimer")).toContain("not live detection");
  });

  it("opens and closes mobile navigation, returns focus on Escape, and closes on link selection", () => {
    run(code);
    const menu = el(".menu-toggle");
    menu.click();
    expect(menu.getAttribute("aria-expanded")).toBe("true");
    expect(el("#page-nav").classList.contains("is-open")).toBe(true);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(menu.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(menu);
    menu.click();
    el('#page-nav a[href="#how"]').click();
    expect(menu.getAttribute("aria-expanded")).toBe("false");
  });

  it("connects every download entry and updates release copy when a release is configured", () => {
    Object.defineProperty(window, "NYMKEEP_RELEASE", {
      configurable: true,
      value: {
        url: "https://downloads.example.com/nymkeep.exe",
        version: "0.1.0",
        fileLabel: "Windows installer",
      },
    });
    run(code);
    document
      .querySelectorAll("[data-release-cta], [data-installer-link]")
      .forEach((link) => {
        expect(link.getAttribute("href")).toBe(
          "https://downloads.example.com/nymkeep.exe",
        );
        expect(link.textContent).toContain("Download Windows");
        expect(link.querySelector(".icon use")?.getAttribute("href")).toBe(
          "#nk-arrow-external",
        );
      });
    expect(text("[data-release-status]")).toBe("Nymkeep 0.1.0 is available");
    expect(text("[data-release-faq]")).toMatch(/^Yes\./);
    expect(text("[data-download-description]")).not.toContain("preparing");
  });

  it.each([
    "javascript:alert(1)",
    "http://downloads.example.com/app.exe",
    "/app.exe",
    "https://user:password@example.com/app.exe",
  ])("rejects invalid or unsafe release links: %s", (url) => {
    Object.defineProperty(window, "NYMKEEP_RELEASE", {
      configurable: true,
      value: { url, version: "0.1.0" },
    });
    run(code);
    expect(text("[data-release-status]")).toBe("Public release coming soon");
    expect(el("[data-installer-link]").getAttribute("href")).toMatch(
      /^mailto:/,
    );
  });

  it("retains a usable pending page without configuration or JavaScript", () => {
    expect(el("#page-nav").dataset.enhanced).toBeUndefined();
    expect(text("[data-source-text]")).toContain("mira@example.com");
    Object.defineProperty(window, "NYMKEEP_RELEASE", {
      configurable: true,
      value: undefined,
    });
    run(code);
    expect(text("[data-release-status]")).toBe("Public release coming soon");
  });

  it("compares saved synthetic screenshot outputs without accepting an upload", () => {
    run(code);
    const image = el("[data-shot-example]");
    expect(image.getAttribute("src")).toBe("assets/screenshot-redacted.png");
    expect(text("[data-image-caption]")).toContain("redacted");
    el('[data-image-stage="original"]').click();
    expect(image.getAttribute("src")).toBe("assets/screenshot-original.png");
    expect(image.getAttribute("alt")).toContain("mira@example.com");
    expect(text("[data-image-caption]")).toContain("before masking");
    expect(existsSync(resolve("site", image.getAttribute("src")!))).toBe(true);
    el('[data-image-stage="redacted"]').click();
    expect(image.getAttribute("alt")).toContain("solid black pixels");
    expect(
      document.querySelectorAll('[data-image-stage][aria-pressed="true"]'),
    ).toHaveLength(1);
    expect(
      document.querySelectorAll("input, textarea, [contenteditable]"),
    ).toHaveLength(0);
  });

  it("distinguishes implemented masking from open native release checks", () => {
    expect(text("#screenshots")).toContain("Built & verified");
    expect(text("#screenshots")).not.toContain("In testing");
    expect(text("#screenshots")).toContain("permanent");
    expect(text("#screenshots")).toContain(
      "Faces and objects need manual marking",
    );
    expect(text(".screenshot-verification")).toContain("Verified on Windows");
    expect(text("#roadmap")).toContain(
      "native image copy and PNG save are built and covered by automated checks",
    );
    expect(text("#roadmap")).toContain("independent privacy review");
    expect(text(".platform-progress")).toContain("Windows");
    expect(text(".platform-progress")).toContain("macOS");
    expect(text(".platform-progress")).toContain("Linux");
    expect(text(".platform-progress")).toContain("Platform work remains");
  });

  it("animates pointer walkthrough changes, cancels interrupted motion, and makes keyboard actions immediate", () => {
    const content = el(".example-content");
    const animate = vi.fn();
    const cancel = vi.fn();
    Object.defineProperty(content, "animate", { value: animate });
    Object.defineProperty(content, "getAnimations", {
      value: () => [{ cancel }],
    });
    run(code);
    el('[data-stage="reply"]').dispatchEvent(
      new MouseEvent("click", { detail: 1 }),
    );
    expect(animate).toHaveBeenCalledTimes(1);
    expect(text("[data-result-label]")).toBe("An illustrative AI reply");
    el('[data-stage="restore"]').click();
    expect(text("[data-result-label]")).toBe("Originals restored on your PC");
    expect(animate).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(2);
  });

  it("respects reduced motion initially and cancels motion when the preference changes", () => {
    let onChange: (() => void) | undefined;
    const preference = {
      matches: true,
      addEventListener: (_: string, listener: () => void) => {
        onChange = listener;
      },
    };
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn((query: string) =>
        query.includes("reduced-motion")
          ? preference
          : { matches: false, addEventListener: vi.fn() },
      ),
    });
    const animate = vi.fn();
    const cancel = vi.fn();
    Object.defineProperty(el(".example-content"), "animate", {
      value: animate,
    });
    Object.defineProperty(document, "getAnimations", {
      configurable: true,
      value: () => [{ cancel }],
    });
    run(code);
    el('[data-stage="reply"]').dispatchEvent(
      new MouseEvent("click", { detail: 1 }),
    );
    expect(animate).not.toHaveBeenCalled();
    expect(text("[data-result-label]")).toBe("An illustrative AI reply");
    preference.matches = false;
    el('[data-stage="restore"]').dispatchEvent(
      new MouseEvent("click", { detail: 1 }),
    );
    expect(animate).toHaveBeenCalledOnce();
    preference.matches = true;
    onChange?.();
    expect(cancel).toHaveBeenCalledOnce();
    delete (document as Document & { getAnimations?: unknown }).getAnimations;
  });

  it("tracks the visible section and enhances the visible workflow once without hiding content", () => {
    type Entry = { isIntersecting: boolean; target: Element };
    const observers: TestObserver[] = [];
    class TestObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      constructor(public callback: (entries: Entry[]) => void) {
        observers.push(this);
      }
    }
    Object.defineProperty(window, "IntersectionObserver", {
      configurable: true,
      value: TestObserver,
    });
    const animate = vi.fn();
    el(".steps")
      .querySelectorAll("li")
      .forEach((item) =>
        Object.defineProperty(item, "animate", { value: animate }),
      );
    run(code);
    observers[0].callback([
      { isIntersecting: true, target: el("#screenshots") },
    ]);
    expect(
      el('#page-nav a[href="#screenshots"]').getAttribute("aria-current"),
    ).toBe("location");
    expect(document.querySelectorAll("#page-nav [aria-current]")).toHaveLength(
      1,
    );
    el('#page-nav a[href="#faq"]').click();
    expect(el('#page-nav a[href="#faq"]').getAttribute("aria-current")).toBe(
      "location",
    );
    expect(el(".steps").style.opacity).toBe("");
    observers[1].callback([{ isIntersecting: true, target: el(".steps") }]);
    expect(animate).toHaveBeenCalledTimes(3);
    expect(observers[1].unobserve).toHaveBeenCalledWith(el(".steps"));
  });

  it("resolves all local assets and internal section links", () => {
    document.querySelectorAll<HTMLElement>("[href], [src]").forEach((item) => {
      const value = item.getAttribute("href") || item.getAttribute("src") || "";
      if (value.startsWith("#"))
        expect(document.getElementById(value.slice(1))).not.toBeNull();
      else if (value && !value.includes(":"))
        expect(existsSync(resolve("site", value))).toBe(true);
    });
  });
});
