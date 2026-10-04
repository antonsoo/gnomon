/**
 * Rasterize an SVG string to PNG at a given resolution. Browser-only (it
 * needs `Image` and `<canvas>`), so it lives at the I/O edge rather than
 * in the pure geometry modules. Real-browser tests exercise decoding,
 * canvas failures, and download state.
 */
const MAX_PIXELS = 16_000_000;
const MAX_SIDE = 8192;

/** Up to 300 DPI, bounded to 16 megapixels and 8192px per side. */
export function pngDimensions(widthMm: number, heightMm: number): { width: number; height: number; dpi: number } {
  if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm) || widthMm <= 0 || heightMm <= 0) {
    throw new Error("PNG dimensions must be positive and finite.");
  }
  const pixelsPerMm = Math.min(300 / 25.4, MAX_SIDE / widthMm, MAX_SIDE / heightMm, Math.sqrt(MAX_PIXELS / (widthMm * heightMm)));
  return { width: Math.max(1, Math.floor(widthMm * pixelsPerMm)), height: Math.max(1, Math.floor(heightMm * pixelsPerMm)), dpi: pixelsPerMm * 25.4 };
}

export async function svgToPngBlob(svg: string, pixelWidth: number, pixelHeight: number): Promise<Blob> {
  if (!Number.isSafeInteger(pixelWidth) || !Number.isSafeInteger(pixelHeight) || pixelWidth < 1 || pixelHeight < 1
    || pixelWidth > MAX_SIDE || pixelHeight > MAX_SIDE || pixelWidth * pixelHeight > MAX_PIXELS) {
    throw new Error("PNG exceeds the 16 megapixel or 8192px size limit. Use SVG instead.");
  }
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2D context unavailable");
    ctx.drawImage(img, 0, 0, pixelWidth, pixelHeight);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG encoding failed"))), "image/png");
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("failed to rasterize SVG"));
    img.src = url;
  });
}
