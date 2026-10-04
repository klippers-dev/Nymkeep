import { describe, expect, it } from "vitest";
import {
  base64ToBlob,
  boxKey,
  clampBox,
  dataUrlToBase64,
  flattenRedactions,
  toggleBox,
} from "../src/shots";

describe("dataUrlToBase64", () => {
  it("extracts png payloads", () => {
    expect(dataUrlToBase64("data:image/png;base64,QUJD")).toBe("QUJD");
    expect(dataUrlToBase64("data:image/x-ms-bmp;base64,QUJD")).toBe("QUJD");
  });
  it("rejects non-images and malformed urls", () => {
    expect(dataUrlToBase64("data:text/plain;base64,QUJD")).toBeNull();
    expect(dataUrlToBase64("not-a-url")).toBeNull();
    expect(dataUrlToBase64("data:image/png;base64,!!!")).toBeNull();
  });
});

describe("toggleBox", () => {
  const a = { x: 1, y: 2, w: 3, h: 4 };
  it("adds then removes the same box", () => {
    const added = toggleBox([], a);
    expect(added).toHaveLength(1);
    expect(toggleBox(added, a)).toHaveLength(0);
  });
  it("keeps distinct boxes", () => {
    const b = { x: 5, y: 6, w: 3, h: 4 };
    expect(toggleBox([a], b)).toHaveLength(2);
  });
});

describe("clampBox", () => {
  it("clamps overflow into bounds", () => {
    expect(clampBox({ x: 8, y: 8, w: 100, h: 100 }, 10, 10)).toEqual({
      x: 8,
      y: 8,
      w: 2,
      h: 2,
    });
  });
  it("rejects slivers and empty canvases", () => {
    expect(clampBox({ x: 0, y: 0, w: 1, h: 1 }, 10, 10)).toBeNull();
    expect(clampBox({ x: 0, y: 0, w: 5, h: 5 }, 0, 0)).toBeNull();
  });
  it("clips negative origins without shifting the covered area", () => {
    expect(clampBox({ x: -4, y: -3, w: 8, h: 6 }, 10, 10)).toEqual({
      x: 0,
      y: 0,
      w: 4,
      h: 3,
    });
  });
  it("rejects wholly outside and nonfinite boxes", () => {
    expect(clampBox({ x: 12, y: 3, w: 4, h: 5 }, 10, 10)).toBeNull();
    expect(clampBox({ x: NaN, y: 0, w: 4, h: 5 }, 10, 10)).toBeNull();
  });
  it("covers fractional edge pixels instead of exposing a sliver", () => {
    expect(clampBox({ x: 1.8, y: 2.8, w: 2.4, h: 2.4 }, 10, 10)).toEqual({
      x: 1,
      y: 2,
      w: 4,
      h: 4,
    });
  });
});

describe("flattenRedactions", () => {
  it("flattens token boxes with labels", () => {
    const out = flattenRedactions([
      { token: "EMAIL_1", boxes: [{ x: 1, y: 1, w: 2, h: 2 }] },
    ]);
    expect(out).toEqual([
      { token: "EMAIL_1", box: { x: 1, y: 1, w: 2, h: 2 } },
    ]);
  });
});

describe("boxKey/base64ToBlob", () => {
  it("keys are stable", () => {
    expect(boxKey({ x: 1, y: 2, w: 3, h: 4 })).toBe("1,2,3,4");
  });
  it("decodes to a png blob", () => {
    const blob = base64ToBlob("iVBORw0KGgo=");
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBeGreaterThan(0);
  });
});
