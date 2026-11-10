import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { replaceImageAsset } from "./skinProject";
import { exportWsz, importWsz } from "./wszAdapter";

describe("WSZ adapter", () => {
  it("replaces image data and preserves other archive entries", async () => {
    const sourceZip = new JSZip();
    sourceZip.file("MAIN.BMP", new Uint8Array([1, 2, 3]));
    sourceZip.file("readme.txt", "keep this file");
    const source = await sourceZip.generateAsync({ type: "uint8array" });

    const imported = await importWsz(source, "Example");
    const image = imported.project.assets[0];
    const editedProject = replaceImageAsset(
      imported.project,
      image.id,
      new Uint8Array([4, 5, 6])
    );
    const exported = await exportWsz({ ...imported, project: editedProject });
    const exportedZip = await JSZip.loadAsync(exported);

    expect(await exportedZip.file("MAIN.BMP").async("uint8array")).toEqual(
      new Uint8Array([4, 5, 6])
    );
    expect(await exportedZip.file("readme.txt").async("text")).toBe(
      "keep this file"
    );
  });
});