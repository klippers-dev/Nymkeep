# Nymkeep interface system

Nymkeep is a system utility for people who repeatedly move work text between
apps and AI tools. It uses the OS light/dark preference, restrained cyan actions,
and cool neutral surfaces to stay readable beside editors and office apps.

The name joins `nym` (pseudonym or alias) with `keep` (real details remain local).
The brand mark is a geometric `N`: two upright rails, an amber alias token, and a
deliberate gap between the source and returned value. The right rail changes from
frost to cyan to express reversible transformation. It is the master mark in the
window, favicon, installer, and operating-system icon. The shield remains an
action symbol for Protect; it is not the Nymkeep logo.

- Segoe UI/system sans, 14px base. Fixed heading scale and compact utility controls.
- Four navigation views: Protect, Restore, Session, Settings. One task per view.
- Protect/Restore use two equal editor panes above 640px, stacked below it.
- White/near-black main surfaces, a secondary neutral result surface, 1px borders,
  6–10px radii. No decorative drop shadows, gradients, or nested card groups.
- Primary cyan is reserved for actions, selected navigation, and successful states.
  Errors use red, unknown-token warnings use amber, always accompanied by text.
- Focus rings, descriptive labels, a skip link, keyboard recorder escape, and
  Ctrl+Enter for the active editor. Reduced-motion disables transitions.
- Sensitive text never appears in global notices. Session originals are hidden
  by default and dropped from component state on navigation or window blur.
- Browser previews explicitly require the desktop runtime. They never simulate
  detection or show a successful protection result without native processing.

Tokens and responsive rules live in `src/App.css`; shared icons and the shortcut
recorder live in `src/components.tsx`. The native boundary is in `src/api.ts`.

## Marketing website

The independent `site/` page preserves the canonical geometric N, system sans
type, cool neutrals, cyan actions and amber originals. It expands the scale and
spacing for a public explanation, separate from the desktop review window.
Design variance 5, motion intensity 4, visual density 3. Native HTML/CSS with a
calm, precise visual language for people moving work text into AI tools.

- Asymmetric hero with a clickable fictional walkthrough, explicit illustrative
  label and no editable private-text input or live detection.
- Distinct layouts for the workflow sequence, shortcut artwork and controls,
  roadmap, release callout, native FAQ disclosures and maker credit.
- System light/dark preference and session-only theme switch. Semantic tokens,
  12px surfaces, 6px controls. Lowest checked text/accent contrast is 5.56:1.
- One local SVG symbol family uses 24px viewboxes, 1.7px rounded strokes and
  semantic device/restore/apps symbols. Decorative icons are hidden from assistive tech.
- Hero entrance, one-time workflow/image arrival and interruptible 220ms pointer
  feedback use exponential easing. Keyboard actions are instant. Preference changes
  cancel active animations; CSS also disables motion for reduced-motion users.
  Content stays visible without JavaScript.
- Responsive navigation with Escape/focus return, keyboard controls, skip link
  active section indication and polite live region for stage changes.
- `site/release.js` controls public installer availability. The default is pending;
  a verified signed HTTPS installer and version activate links and copy together.
  Screenshot implementation is Built & verified with Windows synthetic evidence;
  signed-download readiness stays separate. Platform support and detection caveats remain explicit.
