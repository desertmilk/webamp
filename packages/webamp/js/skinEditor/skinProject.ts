export interface SkinImageAsset {
  id: string;
  name: string;
  mimeType: string;
  data: Uint8Array;
}

export interface SkinProject {
  name: string;
  assets: SkinImageAsset[];
}

export function replaceImageAsset(
  project: SkinProject,
  assetId: string,
  data: Uint8Array
): SkinProject {
  let found = false;
  const assets = project.assets.map((asset) => {
    if (asset.id !== assetId) return asset;
    found = true;
    return { ...asset, data };
  });

  if (!found) {
    throw new Error(`Unknown image asset: ${assetId}`);
  }

  return { ...project, assets };
}
