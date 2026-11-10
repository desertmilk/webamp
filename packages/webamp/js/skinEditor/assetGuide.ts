const BITMAP_DESCRIPTIONS: Record<string, string> = {
  BALANCE: "Balance slider track and thumb for the main player.",
  CBUTTONS: "Play, pause, stop, previous, next, and eject button artwork.",
  EQMAIN: "Equalizer window background, title, sliders, graph, and controls.",
  EQ_EX: "Equalizer shade-mode controls and slider pieces.",
  GEN: "Shared artwork for general-purpose windows and media-library panels.",
  MAIN: "Main player window background and display area.",
  MONOSTER: "Mono and stereo indicators in their normal and selected states.",
  NUMBERS: "Digits and signs used by the main player's time display.",
  NUMS_EX: "Alternate digits and signs for the extended time display.",
  PLEDIT: "Playlist editor frame, title, toolbar buttons, scrollbar, and shade strip.",
  PLAYPAUS: "Playing, paused, stopped, and busy indicators.",
  POSBAR: "Track-position slider track and thumb.",
  SHUFREP: "Shuffle and repeat buttons, plus equalizer and playlist toggles.",
  TEXT: "Bitmap glyphs used for small player labels and text.",
  TITLEBAR: "Main player title strip, window controls, and shade-mode artwork.",
  VOLUME: "Main player volume slider track and thumb.",
};

function normalizedName(name: string): string {
  return name
    .split(/[\\/]/)
    .pop()!
    .replace(/\.[^.]+$/, "")
    .toUpperCase();
}

export function describeBitmapAsset(name: string): string {
  return (
    BITMAP_DESCRIPTIONS[normalizedName(name)] ||
    "Supporting bitmap artwork from the skin archive. It is preserved on export even when its elements are not mapped by the editor."
  );
}

export function describeSpriteElement(name: string): string {
  const isSelected = name.endsWith("_SELECTED");
  const base = name.replace(/_SELECTED$/, "");
  let description: string;

  if (/TITLE_BAR/.test(base)) {
    description = "Repeating title-bar artwork across the top of the window.";
  } else if (/TOP_.*(CORNER|TILE)|TOP_LEFT_SELECTED|TOP_RIGHT_SELECTED/.test(base)) {
    description = "Top-edge frame piece used to join the playlist title and border.";
  } else if (/BOTTOM_/.test(base)) {
    description = "Bottom-edge frame or fill piece used to finish the playlist window.";
  } else if (/LEFT_TILE|RIGHT_TILE/.test(base)) {
    description = "Repeating side-frame tile for the playlist window.";
  } else if (/SHADE_BACKGROUND/.test(base)) {
    description = "Winshade strip artwork for the collapsed playlist window.";
  } else if (/SCROLL_HANDLE/.test(base)) {
    description = "Playlist scrollbar thumb.";
  } else if (/VISUALIZER_BACKGROUND/.test(base)) {
    description = "Background panel behind the playlist visualizer.";
  } else if (/MENU_BAR/.test(base)) {
    description = "Vertical separator between groups in the playlist toolbar.";
  } else if (/ADD_/.test(base)) {
    description = "Playlist toolbar command for adding tracks, folders, or URLs.";
  } else if (/REMOVE_/.test(base)) {
    description = "Playlist toolbar command for removing tracks or clearing items.";
  } else if (/SELECT_|INVERT_SELECTION/.test(base)) {
    description = "Playlist toolbar command for selecting playlist entries.";
  } else if (/SORT_LIST/.test(base)) {
    description = "Playlist toolbar command for sorting entries.";
  } else if (/FILE_INFO/.test(base)) {
    description = "Playlist toolbar command for track information.";
  } else if (/MISC_OPTIONS/.test(base)) {
    description = "Playlist toolbar command for miscellaneous options.";
  } else if (/NEW_LIST|SAVE_LIST|LOAD_LIST/.test(base)) {
    description = "Playlist toolbar command for creating, saving, or loading lists.";
  } else if (/CLOSE|COLLAPSE|EXPAND/.test(base)) {
    description = "Window control shown in the playlist title bar.";
  } else {
    description = "A named skin element used by the Winamp player interface.";
  }

  return isSelected
    ? `${description} This variant is shown in its selected state.`
    : description;
}