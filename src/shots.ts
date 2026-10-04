import type { ShotBox } from "./api";

// Pure helpers for the screenshot view. No I/O, fully unit-tested.

export function dataUrlToBase64(dataUrl: string): string | null {
  const m =
    /^data:image\/(png|jpeg|gif|webp|bmp|x-ms-bmp);base64,([A-Za-z0-9+/=]+)$/.exec(
      dataUrl.trim(),
    );
  return m ? m[2] : null;
}

export function base64ToBlob(b64: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: "image/png" });
}

export function boxKey(b: ShotBox): string {
  return `${b.x},${b.y},${b.w},${b.h}`;
}

export function toggleBox(boxes: ShotBox[], box: ShotBox): ShotBox[] {
  const key = boxKey(box);
  if (boxes.some((b) => boxKey(b) === key)) {
    return boxes.filter((b) => boxKey(b) !== key);
  }
  return [...boxes, box];
}

export function clampBox(
  b: ShotBox,
  natW: number,
  natH: number,
): ShotBox | null {
  if (
    ![b.x, b.y, b.w, b.h, natW, natH].every(Number.isFinite) ||
    b.w <= 0 ||
    b.h <= 0 ||
    natW <= 0 ||
    natH <= 0
  )
    return null;
  const x = Math.max(0, Math.floor(b.x));
  const y = Math.max(0, Math.floor(b.y));
  const w = Math.min(natW, Math.ceil(b.x + b.w)) - x;
  const h = Math.min(natH, Math.ceil(b.y + b.h)) - y;
  if (w < 2 || h < 2) return null;
  return { x, y, w, h };
}

export function flattenRedactions(
  redactions: { token: string; boxes: ShotBox[] }[],
): { token: string; box: ShotBox }[] {
  const out: { token: string; box: ShotBox }[] = [];
  for (const r of redactions) {
    for (const box of r.boxes) out.push({ token: r.token, box });
  }
  return out;
}
