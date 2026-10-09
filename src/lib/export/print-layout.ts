/** Millimetre coordinates shared by the export panel and PDF writer. No PDF dependency. */
import type { PolarDialResult } from "../dials/types.ts";
import { plateBounds, type PlateShape } from "../render/plate-shape.ts";
import { polarHourMarks } from "../render/hour-marks.ts";

export type PageFormat = "a4" | "letter";
export const PAGE_SIZE_MM: Record<PageFormat, { width: number; height: number }> = {
  a4: { width: 210, height: 297 },
  letter: { width: 215.9, height: 279.4 },
};

export interface PrintDimensions {
  radiusMm: number;
  innerRadiusMm: number;
  plateShape: PlateShape;
  format: PageFormat;
}

export interface PrintTile {
  row: number;
  column: number;
  id: string;
  /** Top-left in the assembled drawing, not on the paper. */
  x: number;
  y: number;
}

export function planPolarPrint(dial: PolarDialResult, opts: PrintDimensions) {
  if (!Number.isFinite(opts.radiusMm) || opts.radiusMm <= 0 || !Number.isFinite(opts.innerRadiusMm)
    || opts.innerRadiusMm < 0 || opts.innerRadiusMm > opts.radiusMm) throw new Error("Invalid dial dimensions.");
  const page = PAGE_SIZE_MM[opts.format];
  if (!page) throw new Error("Choose A4 or Letter paper.");
  const marks = polarHourMarks(dial, opts.radiusMm);
  if (opts.innerRadiusMm > marks.hourRadius) throw new Error("The inner radius leaves no room for hour lines and numerals.");
  const bounds = plateBounds(opts.plateShape, opts.radiusMm, marks.thetaMax, marks.thetaCenter);
  const plateWidth = 2 * bounds.halfWidth;
  const plateHeight = bounds.topU - bounds.bottomU;
  // Retain the original compact one-sheet export when its plate fits.
  const tiled = plateWidth > page.width - 16 || plateHeight > page.height - 55;
  const viewport = { x: 10, y: 22, width: page.width - 20, height: page.height - 52 };
  const overlapMm = 10;
  const strideX = viewport.width - overlapMm;
  const strideY = viewport.height - overlapMm;
  // Leave room outside the cut for assembly. Unlike the small export,
  // design notes live on the guide rather than below the drawing.
  const drawingWidth = plateWidth + 20;
  const drawingHeight = plateHeight + 20;
  const columns = tiled ? Math.max(1, Math.ceil((drawingWidth - overlapMm) / strideX)) : 1;
  const rows = tiled ? Math.max(1, Math.ceil((drawingHeight - overlapMm) / strideY)) : 1;
  if (!Number.isFinite(columns * rows) || columns * rows > 64) {
    throw new Error("This design needs more than 64 full-size sheets. Reduce the radius or export SVG instead.");
  }
  const assembledWidth = viewport.width + (columns - 1) * strideX;
  const assembledHeight = viewport.height + (rows - 1) * strideY;
  const root = {
    x: (assembledWidth - drawingWidth) / 2 + 10 + bounds.halfWidth,
    y: (assembledHeight - drawingHeight) / 2 + 10 + bounds.topU,
  };
  const labelAnchors = dial.hourLines.filter((line) => line.isMajor).map((line) => ({
    x: root.x + marks.labelRadius * Math.sin(line.angleRad),
    y: root.y - marks.labelRadius * Math.cos(line.angleRad),
  }));
  const tiles: PrintTile[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      tiles.push({ row, column, id: `R${row + 1}C${column + 1}`, x: column * strideX, y: row * strideY });
    }
  }
  return {
    ...marks, page, bounds, tiled, viewport, overlapMm, strideX, strideY,
    rows, columns, assembledWidth, assembledHeight, root, labelAnchors, tiles,
    pageCount: tiled ? tiles.length + 1 : 1,
  };
}

export type PolarPrintPlan = ReturnType<typeof planPolarPrint>;

/** Each seam's two targets occur at exactly the same drawing coordinates on both sheets. */
export function registrationMarks(plan: PolarPrintPlan, tile: PrintTile): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  const addPair = (pointAt: (fraction: number) => { x: number; y: number }) => {
    for (const candidates of [[1 / 3, 1 / 4, 1 / 5, 0.4], [2 / 3, 3 / 4, 4 / 5, 0.6]]) {
      // Use the same whole-drawing coordinates on both sheets. Move a target
      // away from numeral labels without changing the shared seam position.
      const candidatesWithClearance = candidates.map((fraction) => {
        const point = pointAt(fraction);
        const clearance = Math.min(...plan.labelAnchors.map((p) => Math.hypot(p.x - point.x, p.y - point.y)));
        return { point, clearance };
      });
      const chosen = candidatesWithClearance.find((p) => p.clearance >= plan.fontSizeMm * 1.2 + 3)
        ?? candidatesWithClearance.sort((a, b) => b.clearance - a.clearance)[0]!;
      points.push(chosen.point);
    }
  };
  for (const seam of [tile.column - 1, tile.column]) {
    if (seam < 0 || seam >= plan.columns - 1) continue;
    const x = (seam + 1) * plan.strideX + plan.overlapMm / 2;
    addPair((fraction) => ({ x, y: tile.y + plan.viewport.height * fraction }));
  }
  for (const seam of [tile.row - 1, tile.row]) {
    if (seam < 0 || seam >= plan.rows - 1) continue;
    const y = (seam + 1) * plan.strideY + plan.overlapMm / 2;
    addPair((fraction) => ({ x: tile.x + plan.viewport.width * fraction, y }));
  }
  return points;
}
