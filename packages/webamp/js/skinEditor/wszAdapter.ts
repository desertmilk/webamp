import JSZip from "jszip";
import { SkinProject } from "./skinProject";

const IMAGE_MIME_TYPES: { [extension: string]: string } = {
  bmp: "image/bmp",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
};

export interface WszDocument {
  project: SkinProject;
  files: Map<string, Uint8Array>;
  assetPaths: Map<string, string>;
}

export async function importWsz(
  data: ArrayBuffer | Uint8Array,
  name = "Untitled skin"
): Promise<WszDocument> {
  const zip = await JSZip.loadAsync(data);
  const files = new Map<string, Uint8Array>();
  const assets: SkinProject["assets"] = [];
  const assetPaths = new Map<string, string>();

  await Promise.all(
    Object.values(zip.files).map(async (file) => {
      if (file.dir) return;

      const contents = await file.async("uint8array");
      files.set(file.name, contents);

      const extension = file.name.split(".").pop()?.toLowerCase() || "";
      const mimeType = IMAGE_MIME_TYPES[extension];
      if (!mimeType) return;

      const id = `image:${file.name}`;
      assets.push({ id, name: file.name, mimeType, data: contents });
      assetPaths.set(id, file.name);
    })
  );

  return { project: { name, assets }, files, assetPaths };
}

export async function exportWsz(document: WszDocument): Promise<Uint8Array> {
  const zip = new JSZip();
  const files = new Map(document.files);

  for (const asset of document.project.assets) {
    const path = document.assetPaths.get(asset.id);
    if (path) files.set(path, asset.data);
  }

  for (const [path, contents] of files) {
    zip.file(path, contents);
  }

  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}