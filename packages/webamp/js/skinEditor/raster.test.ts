import { describe, expect, it } from "vitest";
import { encodeBmp24 } from "./raster";

describe("encodeBmp24", () => {
  it("encodes bottom-up BGR pixels with row padding", () => {
    const bitmap = encodeBmp24(
      1,
      2,
      new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255])
    );
    const view = new DataView(bitmap.buffer);

    expect(view.getUint16(0, true)).toBe(0x4d42);
    expect(view.getUint32(2, true)).toBe(62);
    expect(view.getInt32(18, true)).toBe(1);
    expect(view.getInt32(22, true)).toBe(2);
    expect(view.getUint16(28, true)).toBe(24);
    expect(Array.from(bitmap.slice(54))).toEqual([0, 255, 0, 0, 0, 0, 255, 0]);
  });

  it("rejects pixel data with mismatched dimensions", () => {
    expect(() => encodeBmp24(1, 1, new Uint8Array(3))).toThrow(
      "RGBA data length does not match BMP dimensions"
    );
  });
});
