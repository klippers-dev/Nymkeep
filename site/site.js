(() => {
  "use strict";
  const motionPreference = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  );
  const easeOut = "cubic-bezier(0.16, 1, 0.3, 1)";
  const animateChange = (element, event, lift = 0) => {
    if (!element) return;
    element.getAnimations?.().forEach((animation) => animation.cancel());
    // Keyboard actions and reduced-motion users receive the new state instantly.
    if (!event?.detail || motionPreference.matches) return;
    element.animate?.(
      [
        { opacity: 0.72, transform: `translateY(${lift}px)` },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 220, easing: easeOut },
    );
  };
  motionPreference.addEventListener?.("change", () => {
    if (motionPreference.matches)
      document.getAnimations?.().forEach((animation) => animation.cancel());
  });
  // A saved output from the synthetic native-backend check; no live OCR here.
  const imageExamples = {
    original: {
      src: "assets/screenshot-original.png",
      alt: "Fictional project note showing mira@example.com and the reserved example IP address 192.0.2.42.",
      caption: "Original fictional image, before masking.",
    },
    redacted: {
      src: "assets/screenshot-redacted.png",
      alt: "Fictional project note with the email and server address permanently covered by solid black pixels.",
      caption: "Email and IP address redacted.",
    },
  };
  document.querySelectorAll("[data-image-stage]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const example = imageExamples[button.dataset.imageStage];
      const img = document.querySelector("[data-shot-example]");
      if (!example || !img) return;
      img.src = example.src;
      img.alt = example.alt;
      document.querySelectorAll("[data-image-stage]").forEach((item) => {
        item.setAttribute("aria-pressed", String(item === button));
      });
      const caption = document.querySelector("[data-image-caption]");
      if (caption) caption.textContent = example.caption;
      animateChange(document.querySelector(".image-proof-canvas"), event);
    });
  });
  document.querySelectorAll("[data-year]").forEach((el) => {
    el.textContent = String(new Date().getFullYear());
  });

  // Fixed fictional samples only. The website never accepts or detects user text.
  const p = (text, kind = "") => ({ text, kind });
  const original = [
    p("Write a follow-up to "),
    p("Mira Sen", "original"),
    p(" at "),
    p("mira@example.com", "original"),
    p(" about the "),
    p("Juniper Studio", "original"),
    p(" proposal."),
  ];
  const protectedText = [
    p("Write a follow-up to "),
    p("PERSON_1", "token"),
    p(" at "),
    p("EMAIL_1", "token"),
    p(" about the "),
    p("ORG_1", "token"),
    p(" proposal."),
  ];
  const reply = [
    p("To: "),
    p("EMAIL_1", "token"),
    p(". Hi "),
    p("PERSON_1", "token"),
    p(", following up on the "),
    p("ORG_1", "token"),
    p(" proposal. Would you like to discuss next steps?"),
  ];
  const restored = [
    p("To: "),
    p("mira@example.com", "original"),
    p(". Hi "),
    p("Mira Sen", "original"),
    p(", following up on the "),
    p("Juniper Studio", "original"),
    p(" proposal. Would you like to discuss next steps?"),
  ];
  const stages = {
    protect: {
      sourceLabel: "Your original, on your PC",
      source: original,
      resultLabel: "Protected version, ready to share",
      result: protectedText,
      bridge: "Protect & copy",
      key: "Alt + C",
      caption: "The context stays useful. The real details stay with you.",
      next: "reply",
      nextLabel: "See the AI reply",
    },
    reply: {
      sourceLabel: "The protected prompt you share",
      source: protectedText,
      resultLabel: "An illustrative AI reply",
      result: reply,
      bridge: "Ask your AI tool",
      key: "",
      caption:
        "The reply uses the same placeholders, without the replaced details.",
      next: "restore",
      nextLabel: "Restore the reply",
    },
    restore: {
      sourceLabel: "Copy the reply with placeholders",
      source: reply,
      resultLabel: "Originals restored on your PC",
      result: restored,
      bridge: "Restore locally",
      key: "Alt + R",
      caption:
        "Known placeholders return to the originals in the same session.",
      next: "protect",
      nextLabel: "Replay the example",
    },
  };
  const draw = (selector, fragments) => {
    const target = document.querySelector(selector);
    if (!target) return;
    const content = document.createDocumentFragment();
    fragments.forEach(({ text, kind }) => {
      if (!kind) {
        content.append(document.createTextNode(text));
        return;
      }
      const item = document.createElement(kind === "token" ? "mark" : "span");
      if (kind === "original") item.className = "original";
      item.textContent = text;
      content.append(item);
    });
    target.replaceChildren(content);
  };
  const setText = (selector, value) => {
    const el = document.querySelector(selector);
    if (el) el.textContent = value;
  };
  const buttons = [...document.querySelectorAll("[data-stage]")];
  const nextButton = document.querySelector("[data-next-stage]");
  let current = "protect";
  const showStage = (name, event) => {
    const stage = stages[name];
    if (!stage) return;
    current = name;
    buttons.forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.stage === name),
      ),
    );
    draw("[data-source-text]", stage.source);
    draw("[data-result-text]", stage.result);
    setText("[data-source-label]", stage.sourceLabel);
    setText("[data-result-label]", stage.resultLabel);
    setText("[data-bridge-label]", stage.bridge);
    setText("[data-bridge-key]", stage.key);
    const key = document.querySelector("[data-bridge-key]");
    if (key) key.hidden = !stage.key;
    setText("[data-example-caption]", stage.caption);
    setText("[data-next-stage-label]", stage.nextLabel);
    animateChange(document.querySelector(".example-content"), event, 4);
  };
  buttons.forEach((button) =>
    button.addEventListener("click", (event) =>
      showStage(button.dataset.stage, event),
    ),
  );
  nextButton?.addEventListener("click", (event) =>
    showStage(stages[current].next, event),
  );

  // System preference by default, with a session-only theme override for review.
  const theme = document.querySelector(".theme-toggle");
  if (theme) {
    let dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const updateThemeLabel = () => {
      theme.setAttribute("aria-pressed", String(dark));
      theme.setAttribute(
        "aria-label",
        dark ? "Switch to light theme" : "Switch to dark theme",
      );
      theme
        .querySelector("[data-theme-icon]")
        ?.setAttribute("href", dark ? "#nk-sun" : "#nk-moon");
    };
    theme.hidden = false;
    updateThemeLabel();
    theme.addEventListener("click", () => {
      dark = !dark;
      document.documentElement.dataset.theme = dark ? "dark" : "light";
      updateThemeLabel();
    });
  }

  const sectionLinks = [...document.querySelectorAll('#page-nav a[href^="#"]')];
  const indicateSection = (id) => {
    sectionLinks.forEach((link) => {
      if (link.hash === id) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  };
  indicateSection(window.location.hash);
  window.addEventListener("hashchange", () =>
    indicateSection(window.location.hash),
  );
  sectionLinks.forEach((link) =>
    link.addEventListener("click", () => indicateSection(link.hash)),
  );

  if (typeof window.IntersectionObserver === "function") {
    const sectionObserver = new window.IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length)
          indicateSection("#" + visible[visible.length - 1].target.id);
      },
      { rootMargin: "-96px 0px -60% 0px", threshold: 0 },
    );
    sectionLinks.forEach((link) => {
      const section = document.querySelector(link.hash);
      if (section) sectionObserver.observe(section);
    });
    // Only the explanatory sequence and image proof arrive with motion.
    // Content is fully visible before enhancement and when JS/WAAPI are absent.
    const revealObserver = new window.IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          revealObserver.unobserve(entry.target);
          if (motionPreference.matches) return;
          const items = entry.target.matches(".steps")
            ? [...entry.target.children]
            : [entry.target];
          items.forEach((item, index) =>
            item.animate?.(
              [
                { opacity: 0.85, transform: "translateY(14px)" },
                { opacity: 1, transform: "translateY(0)" },
              ],
              { duration: 550, delay: index * 70, easing: easeOut },
            ),
          );
        });
      },
      { threshold: 0.12 },
    );
    document
      .querySelectorAll(".steps, .image-proof")
      .forEach((element) => revealObserver.observe(element));
  }

  // Without JavaScript the navigation remains visible.
  const menu = document.querySelector(".menu-toggle");
  const nav = document.querySelector("#page-nav");
  if (menu && nav) {
    menu.hidden = false;
    nav.dataset.enhanced = "true";
    const closeMenu = () => {
      nav.classList.remove("is-open");
      menu.setAttribute("aria-expanded", "false");
    };
    menu.addEventListener("click", () => {
      const open = menu.getAttribute("aria-expanded") !== "true";
      menu.setAttribute("aria-expanded", String(open));
      nav.classList.toggle("is-open", open);
    });
    nav
      .querySelectorAll("a")
      .forEach((link) => link.addEventListener("click", closeMenu));
    document.addEventListener("keydown", (event) => {
      if (
        event.key === "Escape" &&
        menu.getAttribute("aria-expanded") === "true"
      ) {
        closeMenu();
        menu.focus();
      }
    });
    window
      .matchMedia("(max-width: 900px)")
      .addEventListener?.("change", closeMenu);
  }

  // Fail closed unless a release version and absolute HTTPS installer URL are set.
  const release = window.NYMKEEP_RELEASE;
  let installer;
  try {
    if (release?.url && release?.version) {
      const candidate = new URL(release.url);
      if (
        candidate.protocol === "https:" &&
        !candidate.username &&
        !candidate.password
      )
        installer = candidate.href;
    }
  } catch {
    /* Invalid configuration keeps the pending state. */
  }
  if (!installer) return;

  document
    .querySelectorAll("[data-release-cta], [data-installer-link]")
    .forEach((link) => {
      link.href = installer;
      const icon = link.querySelector(".icon")?.cloneNode(true);
      link.replaceChildren(document.createTextNode("Download Windows"));
      if (icon) link.append(icon);
      link.setAttribute("aria-label", "Download Nymkeep for Windows");
    });
  setText(
    "[data-release-status]",
    "Nymkeep " + release.version + " is available",
  );
  setText(
    "[data-release-note]",
    "The signed Windows installer is ready. Download it to protect and restore text on your PC.",
  );
  setText(
    "[data-release-meta]",
    release.fileLabel || "Windows 11, 64-bit installer",
  );
  setText(
    "[data-download-description]",
    "Download the signed desktop app. Protect sensitive details locally, review the result, then restore replies in the same session.",
  );
  setText(
    "[data-release-faq]",
    "Yes. The signed Windows installer is linked in the release section above. Protect and Restore run locally after installation.",
  );
})();
