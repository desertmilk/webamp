export function encodeBmp24(
  width: number,
  height: number,
  rgba: Uint8ClampedArray | Uint8Array
): Uint8Array {
  if (!Number.isInteger(width) || width <= 0) {
    throw new Error("BMP width must be a positive integer");
  }
  if (!Number.isInteger(height) || height <= 0) {
    throw new Error("BMP height must be a positive integer");
  }
  if (rgba.length !== width * height * 4) {
    throw new Error("RGBA data length does not match BMP dimensions");
  }

  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelDataSize = rowSize * height;
  const bytes = new Uint8Array(54 + pixelDataSize);
  const view = new DataView(bytes.buffer);

  view.setUint16(0, 0x4d42, true);
  view.setUint32(2, bytes.length, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, pixelDataSize, true);

  for (let y = 0; y < height; y++) {
    const targetRow = 54 + (height - y - 1) * rowSize;
    for (let x = 0; x < width; x++) {
      const sourcePixel = (y * width + x) * 4;
      const targetPixel = targetRow + x * 3;
      bytes[targetPixel] = rgba[sourcePixel + 2];
      bytes[targetPixel + 1] = rgba[sourcePixel + 1];
      bytes[targetPixel + 2] = rgba[sourcePixel];
    }
  }

  return bytes;
}
