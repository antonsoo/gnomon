/**
 * Rasterize an SVG string to PNG at a given resolution. Browser-only (it
 * needs `Image` and `<canvas>`), so it lives at the I/O edge rather than
 * in the pure geometry modules -- there is nothing here to unit test that
 * isn't already covered by testing the SVG string generation itself.
 */
export async function svgToPngBlob(svg: string, pixelWidth: number, pixelHeight: number): Promise<Blob> {
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
