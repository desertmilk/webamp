import { describe, expect, it } from "vitest";
import { describeBitmapAsset, describeSpriteElement } from "./assetGuide";

describe("skin asset guide", () => {
  it("describes known bitmap sheets by archive filename", () => {
    expect(describeBitmapAsset("PLEDIT.BMP")).toContain("Playlist editor");
    expect(describeBitmapAsset("eq_ex.bmp")).toContain("shade-mode");
  });

  it("explains sprite roles and selected-state variants", () => {
    expect(describeSpriteElement("PLAYLIST_TITLE_BAR")).toContain(
      "title-bar artwork"
    );
    expect(describeSpriteElement("PLAYLIST_TOP_TILE_SELECTED")).toContain(
      "selected state"
    );
  });

  it("does not invent a description for unmapped bitmap files", () => {
    expect(describeBitmapAsset("custom_art.bmp")).toContain(
      "not mapped by the editor"
    );
  });
});