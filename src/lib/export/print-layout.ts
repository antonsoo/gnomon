/** Millimetre coordinates shared by the export panel and PDF writer. No PDF dependency. */
import type { PolarDialResult } from "../dials/types.ts";
import { plateBounds, type PlateShape } from "../render/plate-shape.ts";
import { polarHourMarks } from "../render/hour-marks.ts";
import { gnomonLayout } from "../render/gnomon-layout.ts";

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

function sheetGrid(drawingWidth: number, drawingHeight: number, format: PageFormat, tiled: boolean) {
  const page = PAGE_SIZE_MM[format];
  if (!page) throw new Error("Choose A4 or Letter paper.");
  const viewport = { x: 10, y: 22, width: page.width - 20, height: page.height - 52 };
  const overlapMm = 10;
  const strideX = viewport.width - overlapMm;
  const strideY = viewport.height - overlapMm;
  const columns = tiled ? Math.max(1, Math.ceil((drawingWidth - overlapMm) / strideX)) : 1;
  const rows = tiled ? Math.max(1, Math.ceil((drawingHeight - overlapMm) / strideY)) : 1;
  if (!Number.isFinite(drawingWidth + drawingHeight) || drawingWidth <= 0 || drawingHeight <= 0
    || !Number.isFinite(columns * rows) || columns * rows > 64) {
    throw new Error("This design needs more than 64 full-size sheets or has invalid dimensions. Reduce the size or export SVG instead.");
  }
  const assembledWidth = viewport.width + (columns - 1) * strideX;
  const assembledHeight = viewport.height + (rows - 1) * strideY;
  const tiles: PrintTile[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      tiles.push({ row, column, id: `R${row + 1}C${column + 1}`, x: column * strideX, y: row * strideY });
    }
  }
  return { page, tiled, viewport, overlapMm, strideX, strideY, columns, rows, assembledWidth, assembledHeight, tiles,
    pageCount: tiled ? tiles.length + 1 : 1 };
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
  // A tall, narrow fan may fit the paper but leave no room for mounting
  // notes. Reserve space for the app's title, motto and design description.
  const tiled = plateWidth > page.width - 16 || plateHeight > page.height - 80;
  // Leave room outside the cut for assembly. Unlike the small export,
  // design notes live on the guide rather than below the drawing.
  const drawingWidth = plateWidth + 20;
  const drawingHeight = plateHeight + 20;
  const grid = sheetGrid(drawingWidth, drawingHeight, opts.format, tiled);
  const { assembledWidth, assembledHeight } = grid;
  const root = {
    x: (assembledWidth - drawingWidth) / 2 + 10 + bounds.halfWidth,
    y: (assembledHeight - drawingHeight) / 2 + 10 + bounds.topU,
  };
  const labelAnchors = dial.hourLines.filter((line) => line.isMajor).map((line) => ({
    x: root.x + marks.labelRadius * Math.sin(line.angleRad),
    y: root.y - marks.labelRadius * Math.cos(line.angleRad),
  }));
  return {
    ...marks, ...grid, bounds, root, labelAnchors,
  };
}

export type PolarPrintPlan = ReturnType<typeof planPolarPrint>;

export function planGnomonPrint(dial: PolarDialResult, format: PageFormat) {
  const layout = gnomonLayout(dial);
  const page = PAGE_SIZE_MM[format];
  if (!page) throw new Error("Choose A4 or Letter paper.");
  // Reserve the bottom of compact pages for construction instructions.
  const tiled = layout.widthMm > page.width - 40 || layout.heightMm > page.height - 150;
  const grid = sheetGrid(layout.widthMm + 20, layout.heightMm + 20, format, tiled);
  const origin = { x: (grid.assembledWidth - layout.widthMm) / 2, y: (grid.assembledHeight - layout.heightMm) / 2 };
  const labelAnchors = [layout.foot, layout.baseEnd, layout.nodus].filter((p) => p !== null).map((p) => ({ x: p.x + origin.x, y: p.y + origin.y }));
  return { ...grid, layout, origin, labelAnchors, fontSizeMm: 2.5 };
}
export type GnomonPrintPlan = ReturnType<typeof planGnomonPrint>;

export function planConstructionPrint(dial: PolarDialResult, opts: PrintDimensions) {
  const plate = planPolarPrint(dial, opts);
  const counterpart = dial.equatorial?.counterpart;
  const reversePlate = counterpart ? planPolarPrint(counterpart, opts) : undefined;
  const gnomon = planGnomonPrint(dial, opts.format);
  return { plate, reversePlate, gnomon, pageCount: plate.pageCount + (reversePlate?.pageCount ?? 0) + gnomon.pageCount };
}

/** Each seam's two targets occur at exactly the same drawing coordinates on both sheets. */
export function registrationMarks(plan: PolarPrintPlan | GnomonPrintPlan, tile: PrintTile): { x: number; y: number }[] {
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
