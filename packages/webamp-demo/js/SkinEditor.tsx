import React, { useEffect, useRef, useState } from "react";
import WebampLazy from "webamp/lazy";
import JSZip from "jszip";
import SKIN_SPRITES, { Sprite } from "../../webamp/js/skinSprites";
import {
  exportWsz,
  importWsz,
  replaceImageAsset,
  SkinImageAsset,
  WszDocument,
} from "../../webamp/js/skinEditor";
import { encodeBmp24 } from "../../webamp/js/skinEditor/raster";

interface DecodedSheet {
  width: number;
  height: number;
  pixels: ImageData;
}

interface SpriteRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface BackgroundLayer {
  image: ImageBitmap;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
}

type Tool = "pencil" | "eraser" | "position";

const MAX_HISTORY = 40;
const createEmptyMap = () => new Map<string, DecodedSheet>();

function pushHistory(stack: DecodedSheet[], image: DecodedSheet) {
  stack.push(image);
  if (stack.length > MAX_HISTORY) stack.shift();
}

function copyImageData(image: ImageData): ImageData {
  return new ImageData(
    new Uint8ClampedArray(image.data),
    image.width,
    image.height
  );
}

function cropImageData(image: ImageData, rect: SpriteRect): ImageData {
  const cropped = new ImageData(rect.width, rect.height);
  for (let row = 0; row < rect.height; row++) {
    const sourceStart = ((rect.y + row) * image.width + rect.x) * 4;
    const targetStart = row * rect.width * 4;
    cropped.data.set(
      image.data.subarray(sourceStart, sourceStart + rect.width * 4),
      targetStart
    );
  }
  return cropped;
}

async function decodeAsset(asset: SkinImageAsset): Promise<DecodedSheet> {
  const bytes = asset.data.slice();
  const blob = new Blob([bytes.buffer as ArrayBuffer], {
    type: asset.mimeType,
  });
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not create an image editing canvas");
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return {
    width: canvas.width,
    height: canvas.height,
    pixels: context.getImageData(0, 0, canvas.width, canvas.height),
  };
}

function spriteKey(asset: SkinImageAsset): string {
  const filename = asset.name.split(/[\\/]/).pop() || asset.name;
  return filename.replace(/\.[^.]+$/, "").toUpperCase();
}

function spritesForAsset(asset: SkinImageAsset): Sprite[] {
  return (SKIN_SPRITES as Record<string, Sprite[]>)[spriteKey(asset)] || [];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getBackgroundCrop(background: BackgroundLayer): SpriteRect {
  const x = clamp(Math.trunc(background.cropX), 0, background.image.width - 1);
  const y = clamp(Math.trunc(background.cropY), 0, background.image.height - 1);
  return {
    x,
    y,
    width: clamp(
      Math.trunc(background.cropWidth),
      1,
      background.image.width - x
    ),
    height: clamp(
      Math.trunc(background.cropHeight),
      1,
      background.image.height - y
    ),
  };
}

interface ContextPlacement extends SpriteRect {
  name: string;
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
}

interface ContextPixel {
  name: string;
  x: number;
  y: number;
}

function normalizedPlaylistSprite(name: string): string {
  const selectedPairs: Record<string, string> = {
    PLAYLIST_TOP_LEFT_SELECTED: "PLAYLIST_TOP_LEFT_CORNER",
    PLAYLIST_TITLE_BAR_SELECTED: "PLAYLIST_TITLE_BAR",
    PLAYLIST_TOP_RIGHT_SELECTED: "PLAYLIST_TOP_RIGHT_CORNER",
    PLAYLIST_TOP_TILE_SELECTED: "PLAYLIST_TOP_TILE",
    PLAYLIST_SHADE_BACKGROUND_RIGHT_SELECTED: "PLAYLIST_SHADE_BACKGROUND_RIGHT",
  };
  return selectedPairs[name] || name.replace(/_SELECTED$/, "");
}

function displayElementName(name: string): string {
  return name
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function drawPlaylistContext(
  context: CanvasRenderingContext2D,
  sheet: HTMLCanvasElement,
  sprites: Sprite[],
  highlightedSprite: string | null
) {
  const width = 560;
  const height = 360;
  const scale = 1.35;
  const originX = 77.5;
  const originY = 48;
  const spriteByName = new Map(sprites.map((sprite) => [sprite.name, sprite]));
  const placements: ContextPlacement[] = [];

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#f2f4ee";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#6e7c72";
  context.font = "10px 'DM Mono', monospace";
  context.fillText("PLAYLIST WINDOW / SAMPLE LAYOUT", 20, 25);
  context.fillStyle = "#9aa59a";
  context.fillText("300 × 180 SKIN PIXELS", 411, 25);

  const drawScaled = (
    callback: (draw: (name: string, x: number, y: number) => void) => void
  ) => {
    context.save();
    context.translate(originX, originY);
    context.scale(scale, scale);
    callback((name, x, y) => {
      const sprite = spriteByName.get(name);
      if (!sprite) return;
      context.drawImage(
        sheet,
        sprite.x,
        sprite.y,
        sprite.width,
        sprite.height,
        x,
        y,
        sprite.width,
        sprite.height
      );
      placements.push({
        name,
        x: originX + x * scale,
        y: originY + y * scale,
        width: sprite.width * scale,
        height: sprite.height * scale,
        sourceX: sprite.x,
        sourceY: sprite.y,
        sourceWidth: sprite.width,
        sourceHeight: sprite.height,
      });
    });
    context.restore();
  };

  drawScaled((draw) => {
    context.fillStyle = "#141a16";
    context.fillRect(0, 0, 300, 180);

    draw("PLAYLIST_TOP_LEFT_CORNER", 0, 0);
    draw("PLAYLIST_TITLE_BAR", 25, 0);
    for (let x = 125; x < 275; x += 25) draw("PLAYLIST_TOP_TILE", x, 0);
    draw("PLAYLIST_TOP_RIGHT_CORNER", 275, 0);

    context.fillStyle = "#080c09";
    context.fillRect(12, 20, 268, 80);
    context.save();
    context.beginPath();
    context.rect(0, 20, 300, 80);
    context.clip();
    for (let y = 20; y < 100; y += 29) {
      draw("PLAYLIST_LEFT_TILE", 0, y);
      draw("PLAYLIST_RIGHT_TILE", 280, y);
    }
    context.restore();

    context.fillStyle = "#28485a";
    context.fillRect(13, 43, 164, 18);
    context.font = "8px 'DM Mono', monospace";
    context.fillStyle = "#d2f66b";
    context.fillText("01", 19, 35);
    context.fillStyle = "#e8eee4";
    context.fillText("Satellite Anthem", 37, 35);
    context.fillStyle = "#c2d0c4";
    context.fillText("02", 19, 57);
    context.fillText("Midnight Circuit", 37, 57);
    context.fillStyle = "#a7b3a8";
    context.fillText("03", 19, 75);
    context.fillText("Soft Focus", 37, 75);
    context.fillText("04", 19, 93);
    context.fillText("Static in Bloom", 37, 93);

    draw("PLAYLIST_VISUALIZER_BACKGROUND", 180, 20);
    context.fillStyle = "#d2f66b";
    [6, 13, 9, 17, 11, 19, 8, 14, 5].forEach((bar, index) => {
      context.fillRect(185 + index * 7, 51 - bar, 3, bar);
    });
    draw("PLAYLIST_SCROLL_HANDLE", 263, 47);

    const firstRow = [
      "PLAYLIST_ADD_URL",
      "PLAYLIST_ADD_DIR",
      "PLAYLIST_ADD_FILE",
      "PLAYLIST_REMOVE_ALL",
      "PLAYLIST_CROP",
      "PLAYLIST_REMOVE_SELECTED",
    ];
    const secondRow = [
      "PLAYLIST_REMOVE_MISC",
      "PLAYLIST_INVERT_SELECTION",
      "PLAYLIST_SELECT_ZERO",
      "PLAYLIST_SELECT_ALL",
      "PLAYLIST_SORT_LIST",
      "PLAYLIST_FILE_INFO",
      "PLAYLIST_MISC_OPTIONS",
      "PLAYLIST_NEW_LIST",
      "PLAYLIST_SAVE_LIST",
      "PLAYLIST_LOAD_LIST",
    ];
    firstRow.forEach((name, index) => draw(name, 10 + index * 42, 102));
    secondRow.forEach((name, index) => draw(name, 8 + index * 26, 122));

    draw("PLAYLIST_BOTTOM_LEFT_CORNER", 0, 142);
    draw("PLAYLIST_BOTTOM_TILE", 125, 142);
    draw("PLAYLIST_BOTTOM_RIGHT_CORNER", 150, 142);
    draw("PLAYLIST_CLOSE_SELECTED", 52, 5);
    draw("PLAYLIST_COLLAPSE_SELECTED", 62, 5);
    draw("PLAYLIST_EXPAND_SELECTED", 150, 5);
  });

  drawScaled((draw) => {
    context.fillStyle = "#6e7c72";
    context.font = "7px 'DM Mono', monospace";
    context.fillText("WINAMP SHADE", 0, 187);
    draw("PLAYLIST_SHADE_BACKGROUND_LEFT", 0, 190);
    for (let x = 25; x < 225; x += 25) {
      draw("PLAYLIST_SHADE_BACKGROUND", x, 190);
    }
    draw("PLAYLIST_SHADE_BACKGROUND_RIGHT", 225, 190);
  });

  if (highlightedSprite) {
    const targetName = normalizedPlaylistSprite(highlightedSprite);
    for (const placement of placements) {
      if (placement.name !== targetName) continue;
      context.fillStyle = "rgb(210 246 107 / 30%)";
      context.fillRect(
        placement.x,
        placement.y,
        placement.width,
        placement.height
      );
      context.strokeStyle = "#d2f66b";
      context.lineWidth = 2;
      context.strokeRect(
        placement.x + 1,
        placement.y + 1,
        placement.width - 2,
        placement.height - 2
      );
    }
  }

  return placements;
}

function SpriteThumbnail({
  image,
  sprite,
}: {
  image: DecodedSheet;
  sprite: Sprite;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scale = Math.min(42 / sprite.width, 26 / sprite.height);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    canvas.width = sprite.width;
    canvas.height = sprite.height;
    context.putImageData(cropImageData(image.pixels, sprite), 0, 0);
  }, [image, sprite]);

  return (
    <span className="skin-editor-sprite-thumb-wrap">
      <canvas
        ref={canvasRef}
        className="skin-editor-sprite-thumb"
        style={{ width: sprite.width * scale, height: sprite.height * scale }}
      />
    </span>
  );
}

function ContextPreview({
  image,
  sprites,
  assetKey,
  highlightedSprite,
  tool,
  onHoverSprite,
  onPaintStart,
  onPaintMove,
  onPaintEnd,
}: {
  image: DecodedSheet;
  sprites: Sprite[];
  assetKey: string;
  highlightedSprite: string | null;
  tool: Tool;
  onHoverSprite: (name: string | null) => void;
  onPaintStart: (pixel: ContextPixel) => void;
  onPaintMove: (pixel: ContextPixel) => void;
  onPaintEnd: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const placementsRef = useRef<ContextPlacement[]>([]);
  const pointerDown = useRef(false);

  function getContextPixel(
    event: React.PointerEvent<HTMLCanvasElement>
  ): ContextPixel | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const bounds = canvas.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * canvas.width;
    const y = ((event.clientY - bounds.top) / bounds.height) * canvas.height;
    const placement = [...placementsRef.current]
      .reverse()
      .find(
        (item) =>
          x >= item.x &&
          x < item.x + item.width &&
          y >= item.y &&
          y < item.y + item.height
      );
    if (!placement) return null;
    return {
      name: placement.name,
      x:
        placement.sourceX +
        Math.floor(
          ((x - placement.x) / placement.width) * placement.sourceWidth
        ),
      y:
        placement.sourceY +
        Math.floor(
          ((y - placement.y) / placement.height) * placement.sourceHeight
        ),
    };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const pixel = getContextPixel(event);
    if (!pixel || tool === "position") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerDown.current = true;
    onHoverSprite(pixel.name);
    onPaintStart(pixel);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const pixel = getContextPixel(event);
    if (pointerDown.current) {
      if (pixel) {
        onHoverSprite(pixel.name);
        onPaintMove(pixel);
      } else {
        pointerDown.current = false;
        onPaintEnd();
      }
    } else {
      onHoverSprite(pixel?.name || null);
    }
  }

  function handlePointerUp() {
    pointerDown.current = false;
    onPaintEnd();
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    canvas.width = 560;
    canvas.height = 360;
    context.imageSmoothingEnabled = false;

    const sheet = window.document.createElement("canvas");
    sheet.width = image.width;
    sheet.height = image.height;
    const sheetContext = sheet.getContext("2d");
    if (!sheetContext) return;
    sheetContext.putImageData(image.pixels, 0, 0);

    if (assetKey === "PLEDIT") {
      placementsRef.current = drawPlaylistContext(
        context,
        sheet,
        sprites,
        highlightedSprite
      );
      return;
    }

    context.fillStyle = "#f2f4ee";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#6e7c72";
    context.font = "10px 'DM Mono', monospace";
    context.fillText("BITMAP / SPRITE ATLAS", 20, 25);
    const scale = Math.min(500 / image.width, 292 / image.height);
    const x = (canvas.width - image.width * scale) / 2;
    const y = 48 + (292 - image.height * scale) / 2;
    context.drawImage(sheet, x, y, image.width * scale, image.height * scale);
    placementsRef.current = sprites.map((sprite) => ({
      name: sprite.name,
      x: x + sprite.x * scale,
      y: y + sprite.y * scale,
      width: sprite.width * scale,
      height: sprite.height * scale,
      sourceX: sprite.x,
      sourceY: sprite.y,
      sourceWidth: sprite.width,
      sourceHeight: sprite.height,
    }));
    for (const placement of placementsRef.current) {
      if (placement.name !== highlightedSprite) continue;
      context.strokeStyle = "#d2f66b";
      context.lineWidth = 2;
      context.strokeRect(
        placement.x,
        placement.y,
        placement.width,
        placement.height
      );
    }
  }, [assetKey, highlightedSprite, image, sprites]);

  return (
    <canvas
      ref={canvasRef}
      className={`skin-editor-context-canvas tool-${tool}`}
      aria-label={
        assetKey === "PLEDIT"
          ? "Playlist window preview with highlighted sprite"
          : "Bitmap atlas preview with highlighted sprite"
      }
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onLostPointerCapture={handlePointerUp}
    />
  );
}

function NumberField({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  onChange: (nextValue: number) => void;
}) {
  return (
    <label className="skin-editor-number">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}

export default function SkinEditor() {
  const [document, setDocument] = useState<WszDocument | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [selectedSpriteName, setSelectedSpriteName] = useState("sheet");
  const [hoveredSpriteName, setHoveredSpriteName] = useState<string | null>(
    null
  );
  const [viewMode, setViewMode] = useState<"source" | "live">("source");
  const [currentImage, setCurrentImage] = useState<DecodedSheet | null>(null);
  const [editedImages, setEditedImages] = useState(createEmptyMap);
  const [background, setBackground] = useState<BackgroundLayer | null>(null);
  const [tool, setTool] = useState<Tool>("pencil");
  const [zoom, setZoom] = useState(5);
  const [color, setColor] = useState("#f0f2df");
  const [eraseColor, setEraseColor] = useState("#202923");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [draggingArchive, setDraggingArchive] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewStatus, setPreviewStatus] = useState("");

  const archiveInput = useRef<HTMLInputElement>(null);
  const backgroundInput = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewHostRef = useRef<HTMLDivElement>(null);
  const originalImages = useRef(createEmptyMap());
  const editedImagesRef = useRef(createEmptyMap());
  const currentImageRef = useRef<DecodedSheet | null>(null);
  const undoStack = useRef<DecodedSheet[]>([]);
  const redoStack = useRef<DecodedSheet[]>([]);
  const pointerDown = useRef(false);
  const previousPixel = useRef<{ x: number; y: number } | null>(null);
  const previousContextPixel = useRef<ContextPixel | null>(null);
  const backgroundDragOffset = useRef<{ x: number; y: number } | null>(null);
  const backgroundDragMode = useRef<"move" | "resize" | null>(null);

  const selectedAsset = document?.project.assets.find(
    (asset) => asset.id === selectedAssetId
  );
  const availableSprites = selectedAsset
    ? spritesForAsset(selectedAsset).filter(
        (sprite) =>
          currentImage &&
          sprite.x >= 0 &&
          sprite.y >= 0 &&
          sprite.x + sprite.width <= currentImage.width &&
          sprite.y + sprite.height <= currentImage.height
      )
    : [];
  const selectedSprite = availableSprites.find(
    (sprite) => sprite.name === selectedSpriteName
  );
  const selectionRect: SpriteRect | null = currentImage
    ? selectedSprite || {
        x: 0,
        y: 0,
        width: currentImage.width,
        height: currentImage.height,
      }
    : null;

  useEffect(() => {
    if (!selectedAsset) {
      currentImageRef.current = null;
      setCurrentImage(null);
      return;
    }

    let cancelled = false;
    currentImageRef.current = null;
    setCurrentImage(null);
    setError("");

    const existing =
      editedImagesRef.current.get(selectedAsset.id) ||
      originalImages.current.get(selectedAsset.id);
    if (existing) {
      currentImageRef.current = existing;
      setCurrentImage(existing);
      return;
    }

    decodeAsset(selectedAsset)
      .then((image) => {
        if (cancelled) return;
        originalImages.current.set(selectedAsset.id, image);
        currentImageRef.current = image;
        setCurrentImage(image);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof Error ? cause.message : "Could not open this image"
        );
      });

    return () => {
      cancelled = true;
    };
  }, [selectedAsset?.id, document]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentImage || !selectionRect) return;

    canvas.width = selectionRect.width;
    canvas.height = selectionRect.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    context.imageSmoothingEnabled = false;
    context.putImageData(
      cropImageData(currentImage.pixels, selectionRect),
      0,
      0
    );

    if (background) {
      const crop = getBackgroundCrop(background);
      context.globalAlpha = 0.92;
      context.drawImage(
        background.image,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        background.x,
        background.y,
        background.width,
        background.height
      );
      context.globalAlpha = 1;
      context.strokeStyle = "#d2f66b";
      context.lineWidth = 1;
      context.setLineDash([2, 2]);
      context.strokeRect(
        background.x + 0.5,
        background.y + 0.5,
        background.width - 1,
        background.height - 1
      );
      context.setLineDash([]);
      context.fillStyle = "#d2f66b";
      for (const [handleX, handleY] of [
        [background.x, background.y],
        [background.x + background.width - 1, background.y],
        [background.x, background.y + background.height - 1],
        [
          background.x + background.width - 1,
          background.y + background.height - 1,
        ],
      ]) {
        context.fillRect(handleX - 1, handleY - 1, 3, 3);
      }
    }
  }, [currentImage, selectionRect, background]);

  useEffect(() => {
    if (!previewUrl || !previewHostRef.current) return;
    let cancelled = false;
    let instance: WebampLazy | null = null;
    const host = previewHostRef.current;
    setPreviewStatus("Loading edited skin...");

    (async () => {
      try {
        const musicMetadata = await import("music-metadata-browser");
        if (cancelled) return;
        instance = new WebampLazy({
          initialSkin: { url: previewUrl },
          initialTracks: [],
          enableHotkeys: false,
          requireJSZip: async () => JSZip,
          requireMusicMetadata: async () => musicMetadata,
        });
        await instance.renderInto(host);
        if (!cancelled) setPreviewStatus("");
      } catch (cause) {
        if (!cancelled) {
          setPreviewStatus(
            cause instanceof Error
              ? cause.message
              : "Could not load the skin preview"
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      instance?.dispose();
      URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    function handleEditorShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest("input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== "z"
      ) {
        return;
      }
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    }

    window.addEventListener("keydown", handleEditorShortcut);
    return () => window.removeEventListener("keydown", handleEditorShortcut);
  });

  function commitImage(image: DecodedSheet) {
    if (!selectedAsset) return;
    currentImageRef.current = image;
    editedImagesRef.current.set(selectedAsset.id, image);
    setCurrentImage(image);
    setEditedImages(new Map(editedImagesRef.current));
  }

  function resetHistory() {
    undoStack.current = [];
    redoStack.current = [];
  }

  function chooseAsset(assetId: string) {
    if (assetId === selectedAssetId) return;
    setSelectedAssetId(assetId);
    setSelectedSpriteName("sheet");
    setBackground(null);
    setTool("pencil");
    resetHistory();
  }

  async function openArchive(file: File) {
    setBusy(true);
    setError("");
    try {
      const name = file.name.replace(/\.(wsz|zip)$/i, "") || "Untitled skin";
      const loaded = await importWsz(await file.arrayBuffer(), name);
      if (loaded.project.assets.length === 0) {
        throw new Error("This archive contains no editable bitmap images");
      }
      originalImages.current = createEmptyMap();
      editedImagesRef.current = createEmptyMap();
      setEditedImages(createEmptyMap());
      setDocument(loaded);
      setPreviewUrl(null);
      setSelectedAssetId(loaded.project.assets[0].id);
      setSelectedSpriteName("sheet");
      setHoveredSpriteName(null);
      setViewMode("source");
      setBackground(null);
      setTool("pencil");
      resetHistory();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open skin");
    } finally {
      setBusy(false);
    }
  }

  async function addBackground(file: File) {
    if (!selectionRect) {
      setError("Open a skin bitmap before adding a background image");
      return;
    }
    setError("");
    try {
      const image = await createImageBitmap(file);
      const scale = Math.min(
        1,
        selectionRect.width / image.width,
        selectionRect.height / image.height
      );
      setBackground({
        image,
        name: file.name,
        x: 0,
        y: 0,
        width: Math.max(1, Math.round(image.width * scale)),
        height: Math.max(1, Math.round(image.height * scale)),
        cropX: 0,
        cropY: 0,
        cropWidth: image.width,
        cropHeight: image.height,
      });
      setTool("position");
    } catch {
      setError("Could not open this background image");
    }
  }

  function pixelPosition(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!selectionRect) return null;
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp(
        Math.floor(
          ((event.clientX - bounds.left) / bounds.width) * selectionRect.width
        ),
        0,
        selectionRect.width - 1
      ),
      y: clamp(
        Math.floor(
          ((event.clientY - bounds.top) / bounds.height) * selectionRect.height
        ),
        0,
        selectionRect.height - 1
      ),
    };
  }

  function paintLine(
    from: { x: number; y: number },
    to: { x: number; y: number },
    rect: SpriteRect | null = selectionRect
  ) {
    const image = currentImageRef.current;
    if (!image || !rect) return;
    const nextPixels = image.pixels;
    let x = from.x;
    let y = from.y;
    const dx = Math.abs(to.x - from.x);
    const sx = from.x < to.x ? 1 : -1;
    const dy = -Math.abs(to.y - from.y);
    const sy = from.y < to.y ? 1 : -1;
    let errorValue = dx + dy;

    while (true) {
      const target = ((rect.y + y) * image.width + rect.x + x) * 4;
      const hex = tool === "eraser" ? eraseColor : color;
      nextPixels.data[target] = parseInt(hex.slice(1, 3), 16);
      nextPixels.data[target + 1] = parseInt(hex.slice(3, 5), 16);
      nextPixels.data[target + 2] = parseInt(hex.slice(5, 7), 16);
      nextPixels.data[target + 3] = 255;
      if (x === to.x && y === to.y) break;
      const twiceError = 2 * errorValue;
      if (twiceError >= dy) {
        errorValue += dy;
        x += sx;
      }
      if (twiceError <= dx) {
        errorValue += dx;
        y += sy;
      }
    }

    commitImage({ ...image, pixels: nextPixels });
  }

  function onContextPaintStart(pixel: ContextPixel) {
    const image = currentImageRef.current;
    if (!image || tool === "position") return;
    setSelectedSpriteName(pixel.name);
    setBackground(null);
    pushHistory(undoStack.current, {
      ...image,
      pixels: copyImageData(image.pixels),
    });
    redoStack.current = [];
    previousContextPixel.current = pixel;
    paintLine(pixel, pixel, {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
    });
  }

  function onContextPaintMove(pixel: ContextPixel) {
    const image = currentImageRef.current;
    const previous = previousContextPixel.current;
    if (!image || !previous) return;
    const sheetRect = {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
    };
    if (previous.name === pixel.name) {
      paintLine(previous, pixel, sheetRect);
    }
    previousContextPixel.current = pixel;
  }

  function onContextPaintEnd() {
    previousContextPixel.current = null;
  }

  function onCanvasPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!currentImage || !selectionRect) return;
    const point = pixelPosition(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerDown.current = true;

    if (tool === "position" && background) {
      const onResizeHandle =
        point.x >= background.x + background.width - 3 &&
        point.y >= background.y + background.height - 3;
      backgroundDragMode.current = onResizeHandle ? "resize" : "move";
      backgroundDragOffset.current = {
        x: onResizeHandle ? 0 : point.x - background.x,
        y: onResizeHandle ? 0 : point.y - background.y,
      };
      return;
    }

    pushHistory(undoStack.current, {
      ...currentImage,
      pixels: copyImageData(currentImage.pixels),
    });
    redoStack.current = [];
    previousPixel.current = point;
    paintLine(point, point);
  }

  function onCanvasPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!pointerDown.current) return;
    const point = pixelPosition(event);
    if (!point) return;

    if (
      tool === "position" &&
      background &&
      backgroundDragOffset.current &&
      backgroundDragMode.current === "resize"
    ) {
      setBackground((current) =>
        current
          ? {
              ...current,
              width: Math.max(1, point.x - current.x + 1),
              height: Math.max(1, point.y - current.y + 1),
            }
          : current
      );
      return;
    }

    if (tool === "position" && background && backgroundDragOffset.current) {
      setBackground((current) =>
        current
          ? {
              ...current,
              x: point.x - backgroundDragOffset.current!.x,
              y: point.y - backgroundDragOffset.current!.y,
            }
          : current
      );
      return;
    }

    if (previousPixel.current) paintLine(previousPixel.current, point);
    previousPixel.current = point;
  }

  function endCanvasPointer() {
    pointerDown.current = false;
    previousPixel.current = null;
    backgroundDragOffset.current = null;
    backgroundDragMode.current = null;
  }

  function undo() {
    const previous = undoStack.current.pop();
    const current = currentImageRef.current;
    if (!previous || !current) return;
    redoStack.current.push(current);
    commitImage(previous);
  }

  function redo() {
    const next = redoStack.current.pop();
    const current = currentImageRef.current;
    if (!next || !current) return;
    undoStack.current.push(current);
    commitImage(next);
  }

  function updateBackground(
    field: keyof Omit<BackgroundLayer, "image" | "name">,
    value: number
  ) {
    setBackground((current) =>
      current ? { ...current, [field]: value } : current
    );
  }

  function applyBackground() {
    const image = currentImageRef.current;
    if (!image || !selectionRect || !background || !selectedAsset) return;
    const localCanvas = window.document.createElement("canvas");
    localCanvas.width = selectionRect.width;
    localCanvas.height = selectionRect.height;
    const localContext = localCanvas.getContext("2d", {
      willReadFrequently: true,
    });
    if (!localContext) return;
    localContext.putImageData(cropImageData(image.pixels, selectionRect), 0, 0);

    const cropX = clamp(background.cropX, 0, background.image.width - 1);
    const cropY = clamp(background.cropY, 0, background.image.height - 1);
    const cropWidth = clamp(
      background.cropWidth,
      1,
      background.image.width - cropX
    );
    const cropHeight = clamp(
      background.cropHeight,
      1,
      background.image.height - cropY
    );
    localContext.drawImage(
      background.image,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      background.x,
      background.y,
      Math.max(1, background.width),
      Math.max(1, background.height)
    );

    const merged = localContext.getImageData(
      0,
      0,
      selectionRect.width,
      selectionRect.height
    );
    const nextPixels = copyImageData(image.pixels);
    for (let row = 0; row < selectionRect.height; row++) {
      const sourceStart = row * selectionRect.width * 4;
      const targetStart =
        ((selectionRect.y + row) * image.width + selectionRect.x) * 4;
      nextPixels.data.set(
        merged.data.subarray(
          sourceStart,
          sourceStart + selectionRect.width * 4
        ),
        targetStart
      );
    }

    pushHistory(undoStack.current, {
      ...image,
      pixels: copyImageData(image.pixels),
    });
    redoStack.current = [];
    commitImage({ ...image, pixels: nextPixels });
    setBackground(null);
    setTool("pencil");
  }

  async function encodeEditedAsset(
    asset: SkinImageAsset,
    image: DecodedSheet
  ): Promise<Uint8Array> {
    if (asset.mimeType === "image/bmp") {
      return encodeBmp24(image.width, image.height, image.pixels.data);
    }
    if (asset.mimeType === "image/gif") {
      throw new Error(`GIF assets cannot be exported yet: ${asset.name}`);
    }

    const canvas = window.document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create an export canvas");
    context.putImageData(image.pixels, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) =>
          result ? resolve(result) : reject(new Error("Image export failed")),
        asset.mimeType,
        0.96
      );
    });
    return new Uint8Array(await blob.arrayBuffer());
  }

  async function buildEditedArchive(): Promise<Blob> {
    if (!document) throw new Error("Open a skin before exporting");
    let project = document.project;
    for (const [assetId, image] of editedImagesRef.current) {
      const asset = project.assets.find((item) => item.id === assetId);
      if (!asset) continue;
      const bytes = await encodeEditedAsset(asset, image);
      project = replaceImageAsset(project, assetId, bytes);
    }
    const output = await exportWsz({ ...document, project });
    return new Blob([output.buffer as ArrayBuffer], {
      type: "application/zip",
    });
  }

  async function downloadSkin() {
    if (!document) return;
    setBusy(true);
    setError("");
    try {
      const blob = await buildEditedArchive();
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = `${document.project.name || "skin"}-edited.wsz`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not export skin"
      );
    } finally {
      setBusy(false);
    }
  }

  async function openPreview() {
    if (!document || busy) return;
    setBusy(true);
    setError("");
    try {
      const blob = await buildEditedArchive();
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not prepare the skin preview"
      );
    } finally {
      setBusy(false);
    }
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDraggingArchive(false);
    const file = event.dataTransfer.files[0];
    if (!file) return;
    if (/\.(wsz|zip)$/i.test(file.name)) {
      void openArchive(file);
    } else if (file.type.startsWith("image/")) {
      void addBackground(file);
    }
  }

  function handleNumberChange(
    field: keyof Omit<BackgroundLayer, "image" | "name">,
    value: number
  ) {
    updateBackground(field, Number.isFinite(value) ? Math.trunc(value) : 0);
  }

  const spriteLabel =
    (selectedSprite && displayElementName(selectedSprite.name)) ||
    "Whole bitmap";
  const contextHighlight =
    hoveredSpriteName ||
    (selectedSpriteName === "sheet" ? null : selectedSpriteName);
  const showContextPreview = viewMode === "live";
  const showSpriteCanvas = viewMode === "source" && selectionRect != null;
  const showWelcome = viewMode === "source" && selectionRect == null;

  return (
    <div
      className={`skin-editor ${draggingArchive ? "is-dragging" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDraggingArchive(true);
      }}
      onDragLeave={() => setDraggingArchive(false)}
      onDrop={handleDrop}
    >
      <header className="skin-editor-header">
        <div className="skin-editor-brand">
          <div className="skin-editor-mark">W</div>
          <div>
            <strong>WEBAMP</strong>
            <span>SKIN EDITOR</span>
          </div>
        </div>
        <div className="skin-editor-document-name">
          <span className="skin-editor-live-dot" />
          {document?.project.name || "Untitled skin"}
          {editedImages.size > 0 && (
            <span className="skin-editor-unsaved">Edited</span>
          )}
        </div>
        <div className="skin-editor-header-actions">
          <button
            className="skin-editor-button skin-editor-button-muted"
            onClick={() => archiveInput.current?.click()}
          >
            Open skin
          </button>
          <button
            className="skin-editor-button skin-editor-button-muted"
            onClick={() => backgroundInput.current?.click()}
            disabled={!selectionRect}
          >
            Add image
          </button>
          <button
            className="skin-editor-button skin-editor-button-muted"
            onClick={() => void openPreview()}
            disabled={!document || busy}
          >
            Preview player
          </button>
          <button
            className="skin-editor-button skin-editor-button-primary"
            onClick={() => void downloadSkin()}
            disabled={!document || busy}
          >
            {busy ? "Working..." : "Export .wsz"}
          </button>
          <input
            ref={archiveInput}
            className="skin-editor-hidden-input"
            type="file"
            accept=".wsz,.zip,application/zip"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void openArchive(file);
              event.currentTarget.value = "";
            }}
          />
          <input
            ref={backgroundInput}
            className="skin-editor-hidden-input"
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void addBackground(file);
              event.currentTarget.value = "";
            }}
          />
        </div>
      </header>

      <div className="skin-editor-workspace">
        <aside className="skin-editor-assets">
          <div className="skin-editor-panel-heading">
            <span>Archive assets</span>
            <span className="skin-editor-count">
              {document?.project.assets.length || 0}
            </span>
          </div>
          {document ? (
            <div className="skin-editor-asset-list">
              {document.project.assets.map((asset, index) => (
                <button
                  key={asset.id}
                  className={`skin-editor-asset ${
                    selectedAssetId === asset.id ? "is-selected" : ""
                  }`}
                  onClick={() => chooseAsset(asset.id)}
                >
                  <span className="skin-editor-asset-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="skin-editor-asset-copy">
                    <strong>{asset.name.split(/[\\/]/).pop()}</strong>
                    <small>
                      {asset.mimeType.replace("image/", "").toUpperCase()}
                    </small>
                  </span>
                  {editedImages.has(asset.id) && (
                    <span className="skin-editor-edited-dot" />
                  )}
                </button>
              ))}
            </div>
          ) : (
            <button
              className="skin-editor-open-card"
              onClick={() => archiveInput.current?.click()}
            >
              <span className="skin-editor-open-mark">+</span>
              <strong>Open a skin archive</strong>
              <small>WSZ or ZIP</small>
            </button>
          )}
          <div className="skin-editor-assets-footer">
            <span>Original files stay in the archive</span>
            {document && <span>{document.files.size} files</span>}
          </div>
        </aside>

        <main className="skin-editor-center">
          <div className="skin-editor-toolbar">
            <div className="skin-editor-tool-group" aria-label="Drawing tools">
              <button
                className={tool === "pencil" ? "is-active" : ""}
                title="Pencil"
                onClick={() => setTool("pencil")}
                disabled={!currentImage}
              >
                Pencil
              </button>
              <button
                className={tool === "eraser" ? "is-active" : ""}
                title="Erase with the background color"
                onClick={() => setTool("eraser")}
                disabled={!currentImage}
              >
                Eraser
              </button>
              <button
                className={tool === "position" ? "is-active" : ""}
                title="Move the imported background image"
                onClick={() => setTool("position")}
                disabled={!background || viewMode !== "source"}
              >
                Position
              </button>
            </div>
            <div className="skin-editor-view-modes" aria-label="Canvas view">
              <button
                className={viewMode === "source" ? "is-active" : ""}
                onClick={() => setViewMode("source")}
              >
                Source
              </button>
              <button
                className={viewMode === "live" ? "is-active" : ""}
                onClick={() => setViewMode("live")}
                disabled={!currentImage}
              >
                Live
              </button>
            </div>
            <div className="skin-editor-color-tools">
              <label title="Paint color">
                <span>Ink</span>
                <input
                  type="color"
                  value={color}
                  disabled={tool === "position"}
                  onChange={(event) => setColor(event.currentTarget.value)}
                />
              </label>
              <label title="Eraser color">
                <span>Paper</span>
                <input
                  type="color"
                  value={eraseColor}
                  disabled={tool === "position"}
                  onChange={(event) => setEraseColor(event.currentTarget.value)}
                />
              </label>
            </div>
            <div className="skin-editor-zoom">
              <button
                aria-label="Zoom out"
                onClick={() => setZoom((value) => Math.max(1, value - 1))}
                disabled={zoom <= 1 || viewMode !== "source"}
              >
                −
              </button>
              <span>{zoom}×</span>
              <button
                aria-label="Zoom in"
                onClick={() => setZoom((value) => Math.min(16, value + 1))}
                disabled={zoom >= 16 || viewMode !== "source"}
              >
                +
              </button>
            </div>
            <div className="skin-editor-history">
              <button
                aria-label="Undo"
                title="Undo"
                onClick={undo}
                disabled={undoStack.current.length === 0}
              >
                ↶
              </button>
              <button
                aria-label="Redo"
                title="Redo"
                onClick={redo}
                disabled={redoStack.current.length === 0}
              >
                ↷
              </button>
            </div>
          </div>

          <div className="skin-editor-stage-wrap">
            {error && <div className="skin-editor-error">{error}</div>}
            {showContextPreview && currentImage && selectedAsset && (
              <div className="skin-editor-context-scroll">
                <div className="skin-editor-context-heading">
                  <strong>
                    {spriteKey(selectedAsset) === "PLEDIT"
                      ? "Playlist window"
                      : "Bitmap context"}
                  </strong>
                  <span>
                    {contextHighlight
                      ? displayElementName(contextHighlight)
                      : "Hover an element to locate it"}
                  </span>
                </div>
                <ContextPreview
                  image={currentImage}
                  sprites={availableSprites}
                  assetKey={spriteKey(selectedAsset)}
                  highlightedSprite={contextHighlight}
                  tool={tool}
                  onHoverSprite={setHoveredSpriteName}
                  onPaintStart={onContextPaintStart}
                  onPaintMove={onContextPaintMove}
                  onPaintEnd={onContextPaintEnd}
                />
              </div>
            )}
            {showSpriteCanvas && selectionRect && (
              <div className="skin-editor-stage-scroll">
                <div
                  className="skin-editor-pixel-wrap"
                  style={
                    {
                      width: selectionRect.width * zoom,
                      height: selectionRect.height * zoom,
                      "--pixel-size": `${zoom}px`,
                    } as React.CSSProperties
                  }
                >
                  <canvas
                    ref={canvasRef}
                    className={`skin-editor-canvas tool-${tool}`}
                    style={{
                      width: selectionRect.width * zoom,
                      height: selectionRect.height * zoom,
                    }}
                    onPointerDown={onCanvasPointerDown}
                    onPointerMove={onCanvasPointerMove}
                    onPointerUp={endCanvasPointer}
                    onPointerCancel={endCanvasPointer}
                    onLostPointerCapture={endCanvasPointer}
                  />
                </div>
              </div>
            )}
            {showWelcome && (
              <div className="skin-editor-welcome">
                <div className="skin-editor-welcome-index">
                  01 / CLASSIC SKINS
                </div>
                <div className="skin-editor-welcome-art" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <h1>Make the pixels yours.</h1>
                <p>Open a classic skin archive to edit its bitmap sprites.</p>
                <button
                  className="skin-editor-button skin-editor-button-primary"
                  onClick={() => archiveInput.current?.click()}
                >
                  Open .wsz skin
                </button>
              </div>
            )}
          </div>

          <div className="skin-editor-statusbar">
            <span>{selectedAsset?.name || "No asset selected"}</span>
            <span>{spriteLabel}</span>
            <span>
              {selectionRect
                ? `${selectionRect.width} × ${selectionRect.height} px`
                : "Native pixel canvas"}
            </span>
          </div>
        </main>

        <aside className="skin-editor-properties">
          <div className="skin-editor-panel-heading">Element</div>
          <label className="skin-editor-property">
            <span>Bitmap</span>
            <select
              value={selectedAssetId}
              onChange={(event) => chooseAsset(event.currentTarget.value)}
              disabled={!document}
            >
              {document?.project.assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name.split(/[\\/]/).pop()}
                </option>
              ))}
            </select>
          </label>
          <div className="skin-editor-sprite-inventory">
            <div className="skin-editor-sprite-inventory-heading">
              <span>Elements</span>
              <span>{availableSprites.length}</span>
            </div>
            <button
              className={`skin-editor-sprite-row ${
                selectedSpriteName === "sheet" ? "is-selected" : ""
              }`}
              onMouseEnter={() => setHoveredSpriteName(null)}
              onFocus={() => setHoveredSpriteName(null)}
              onClick={() => {
                setSelectedSpriteName("sheet");
                setBackground(null);
                resetHistory();
              }}
            >
              <span className="skin-editor-sprite-sheet-icon">▦</span>
              <span className="skin-editor-sprite-row-name">Whole bitmap</span>
              <span className="skin-editor-sprite-row-size">
                {currentImage
                  ? `${currentImage.width}×${currentImage.height}`
                  : "—"}
              </span>
            </button>
            <div
              className="skin-editor-sprite-list"
              onMouseLeave={() => setHoveredSpriteName(null)}
            >
              {availableSprites.map((sprite) => (
                <button
                  key={sprite.name}
                  className={`skin-editor-sprite-row ${
                    selectedSpriteName === sprite.name ? "is-selected" : ""
                  }`}
                  onMouseEnter={() => setHoveredSpriteName(sprite.name)}
                  onFocus={() => setHoveredSpriteName(sprite.name)}
                  onClick={() => {
                    setSelectedSpriteName(sprite.name);
                    setBackground(null);
                    resetHistory();
                  }}
                >
                  {currentImage && (
                    <SpriteThumbnail image={currentImage} sprite={sprite} />
                  )}
                  <span className="skin-editor-sprite-row-name">
                    {displayElementName(sprite.name)}
                  </span>
                  <span className="skin-editor-sprite-row-size">
                    {sprite.width}×{sprite.height}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="skin-editor-size-readout">
            <span>Canvas size</span>
            <strong>
              {selectionRect
                ? `${selectionRect.width} × ${selectionRect.height}`
                : "—"}
            </strong>
          </div>

          <div className="skin-editor-property-section">
            <div className="skin-editor-section-title">Background image</div>
            {background ? (
              <>
                <div
                  className="skin-editor-background-name"
                  title={background.name}
                >
                  {background.name}
                </div>
                <div className="skin-editor-field-grid">
                  <NumberField
                    label="X"
                    value={background.x}
                    onChange={(value) => handleNumberChange("x", value)}
                  />
                  <NumberField
                    label="Y"
                    value={background.y}
                    onChange={(value) => handleNumberChange("y", value)}
                  />
                  <NumberField
                    label="W"
                    min={1}
                    value={background.width}
                    onChange={(value) => handleNumberChange("width", value)}
                  />
                  <NumberField
                    label="H"
                    min={1}
                    value={background.height}
                    onChange={(value) => handleNumberChange("height", value)}
                  />
                </div>
                <div className="skin-editor-section-title skin-editor-crop-title">
                  Source crop
                </div>
                <div className="skin-editor-field-grid">
                  <NumberField
                    label="Left"
                    min={0}
                    value={background.cropX}
                    onChange={(value) => handleNumberChange("cropX", value)}
                  />
                  <NumberField
                    label="Top"
                    min={0}
                    value={background.cropY}
                    onChange={(value) => handleNumberChange("cropY", value)}
                  />
                  <NumberField
                    label="Width"
                    min={1}
                    value={background.cropWidth}
                    onChange={(value) => handleNumberChange("cropWidth", value)}
                  />
                  <NumberField
                    label="Height"
                    min={1}
                    value={background.cropHeight}
                    onChange={(value) =>
                      handleNumberChange("cropHeight", value)
                    }
                  />
                </div>
                <button
                  className="skin-editor-button skin-editor-button-primary skin-editor-apply"
                  onClick={applyBackground}
                >
                  Apply to sprite
                </button>
                <button
                  className="skin-editor-text-button"
                  onClick={() => setBackground(null)}
                >
                  Remove image
                </button>
              </>
            ) : (
              <button
                className="skin-editor-add-background"
                onClick={() => backgroundInput.current?.click()}
                disabled={!selectionRect}
              >
                <span>+</span>
                <strong>Place an image</strong>
                <small>Move it on canvas, then set size and crop</small>
              </button>
            )}
          </div>

          <div className="skin-editor-properties-footer">
            <strong>Pixel output</strong>
            <span>BMP sprites export as 24-bit.</span>
            <span>PNG transparency is retained.</span>
          </div>
        </aside>
      </div>

      {previewUrl && (
        <div className="skin-editor-preview-overlay">
          <section
            className="skin-editor-preview-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Edited skin player preview"
          >
            <header className="skin-editor-preview-header">
              <div>
                <strong>Webamp preview</strong>
                <span>RENDERED WITH THE EXPORTED SKIN</span>
              </div>
              <button
                className="skin-editor-preview-close"
                aria-label="Close player preview"
                onClick={() => setPreviewUrl(null)}
              >
                ×
              </button>
            </header>
            <div className="skin-editor-preview-stage">
              <div ref={previewHostRef} className="skin-editor-preview-host" />
              {previewStatus && (
                <div className="skin-editor-preview-status">
                  {previewStatus}
                </div>
              )}
            </div>
            <footer className="skin-editor-preview-footer">
              Close the preview to continue editing.
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
