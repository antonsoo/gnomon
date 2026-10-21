/** Scale-exact vector PDF. Large plates use overlapping full-size sheets. */
import { jsPDF } from "jspdf";
import type { PlanePoint, PolarDialResult } from "../dials/types.ts";
import type { Motto } from "../motto.ts";
import { hourLabel } from "../render/numerals.ts";
import { plateOutline, type PlateShape } from "../render/plate-shape.ts";
import { clipCurve } from "../render/curves.ts";
import { equatorialAlignmentMark } from "../render/equatorial-marks.ts";
import { gnomonBaseEnd, gnomonInstructions, gnomonConstructionWarning, type gnomonLayout } from "../render/gnomon-layout.ts";
import { polarToUV, toPage, type PageMapping } from "../render/project.ts";
import { planPolarPrint, planConstructionPrint, registrationMarks, type PageFormat, type PolarPrintPlan, type GnomonPrintPlan, type PrintTile } from "./print-layout.ts";

export type { PageFormat } from "./print-layout.ts";
export interface PdfExportOptions {
  radiusMm: number;
  innerRadiusMm: number;
  plateShape: PlateShape;
  numerals: "arabic" | "roman";
  romanStyle?: "IIII" | "IV";
  title?: string;
  description?: string;
  motto?: Motto;
  showDeclinationLines?: boolean;
  showHistoricalHours?: boolean;
  format: PageFormat;
}

/** All pages use this painter; the guide alone passes a scale other than one. */
function drawPlate(doc: jsPDF, dial: PolarDialResult, opts: PdfExportOptions, plan: PolarPrintPlan, m: PageMapping, scale = 1): void {
  const project = (p: PlanePoint) => toPage(p.u * scale, p.v * scale, m);
  doc.setDrawColor(20, 20, 20);
  doc.setTextColor(20, 20, 20);
  doc.setLineDashPattern([], 0);
  doc.setLineWidth(0.3 * scale);
  const outline = plateOutline(opts.plateShape, opts.radiusMm, plan.thetaMax, 96, plan.thetaCenter);
  const outlinePts = outline.map(project);
  doc.lines(outlinePts.slice(1).map((p, i) => [p.x - outlinePts[i]!.x, p.y - outlinePts[i]!.y]), outlinePts[0]!.x, outlinePts[0]!.y, [1, 1], "S", true);

  const drawCurve = (points: (PlanePoint | null)[], historical: boolean) => {
    doc.setLineWidth((historical ? 0.2 : 0.25) * scale);
    doc.setLineDashPattern(historical ? [scale, 0.8 * scale] : [], 0);
    for (const run of clipCurve(points, plan.hourRadius, opts.plateShape, plan.thetaMax, plan.thetaCenter)) {
      const mapped = run.map(project);
      doc.lines(mapped.slice(1).map((p, i) => [p.x - mapped[i]!.x, p.y - mapped[i]!.y]), mapped[0]!.x, mapped[0]!.y, [1, 1], "S", false);
    }
  };
  if (opts.showDeclinationLines) for (const line of dial.declinationLines) drawCurve(line.points, false);
  if (opts.showHistoricalHours) for (const line of dial.historicalHours) drawCurve(line.points, true);
  doc.setLineDashPattern([], 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(plan.fontSizeMm * 72 / 25.4 * scale);
  for (const line of dial.hourLines) {
    const p0 = project(polarToUV(line.angleRad, opts.innerRadiusMm));
    const p1 = project(polarToUV(line.angleRad, plan.hourRadius));
    doc.setLineWidth((line.isMajor ? 0.35 : 0.15) * scale);
    doc.line(p0.x, p0.y, p1.x, p1.y);
    if (line.isMajor) {
      const pp = project(polarToUV(line.angleRad, plan.labelRadius));
      doc.text(hourLabel(line.hour, opts.numerals, opts.romanStyle), pp.x, pp.y, { align: "center", baseline: "middle" });
    }
  }
  if (dial.gnomon.baseLengthMm > 0) {
    const end = project(gnomonBaseEnd(dial));
    doc.setLineWidth(0.22 * scale);
    doc.setLineDashPattern([1.2 * scale, 0.8 * scale], 0);
    doc.line(m.centerX, m.centerY, end.x, end.y);
    doc.setLineDashPattern([], 0);
    doc.setLineWidth(0.25 * scale);
    doc.circle(end.x, end.y, 1.1 * scale);
  }
  doc.setFillColor(20, 20, 20);
  doc.circle(m.centerX, m.centerY, 0.6 * scale, "F");
  const alignment = equatorialAlignmentMark(dial, opts.radiusMm);
  if (alignment) {
    const p = project(alignment);
    doc.setLineWidth(0.2 * scale);
    doc.line(p.x - scale, p.y, p.x + scale, p.y);
    doc.line(p.x, p.y - scale, p.x, p.y + scale);
    doc.setFontSize(7 * scale);
    doc.text("A", p.x + 1.5 * scale, p.y, { baseline: "middle" });
  }
}

function faceHeading(dial: PolarDialResult): string | undefined {
  const face = dial.equatorial;
  return face ? `${face.face === "pole-facing" ? "P | Pole-facing" : "O | Opposite"} face | ${face.illuminated} | viewed from outside` : undefined;
}

function calibrationBar(doc: jsPDF): void {
  const barY = doc.internal.pageSize.getHeight() - 12;
  doc.setDrawColor(20, 20, 20);
  doc.setTextColor(20, 20, 20);
  doc.setLineDashPattern([], 0);
  doc.setLineWidth(0.4);
  doc.line(10, barY, 110, barY);
  doc.line(10, barY - 1.5, 10, barY + 1.5);
  doc.line(110, barY - 1.5, 110, barY + 1.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("100 mm calibration - verify before cutting", 10, barY + 5);
}

function singlePage(doc: jsPDF, dial: PolarDialResult, opts: PdfExportOptions, plan: PolarPrintPlan): void {
  const heading = faceHeading(dial);
  if (heading) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(heading, 10, 10);
  }
  const m = { centerX: plan.page.width / 2, centerY: 20 + plan.bounds.topU };
  drawPlate(doc, dial, opts, plan, m);
  let y = m.centerY - plan.bounds.bottomU + 8;
  const paragraph = (text: string | undefined, fontSize: number, centered: boolean) => {
    if (!text) return;
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(text, plan.page.width - 20) as string[];
    const leading = fontSize * 25.4 / 72 * 1.3;
    if (y + (lines.length - 1) * leading > plan.page.height - 22) {
      throw new Error("The design notes do not fit below this plate. Reduce the radius or shorten the notes.");
    }
    doc.text(lines, centered ? plan.page.width / 2 : 10, y, { align: centered ? "center" : "left", lineHeightFactor: 1.3 });
    y += lines.length * leading + 2;
  };
  paragraph(opts.title, 10, true);
  paragraph(opts.motto?.latin, 8, true);
  paragraph(opts.description, 7, false);
  calibrationBar(doc);
}

function assemblyGuide(doc: jsPDF, dial: PolarDialResult, opts: PdfExportOptions, plan: PolarPrintPlan, kit: boolean, prefix: string): void {
  const width = plan.page.width - 20;
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text(dial.equatorial ? `${prefix}Assemble this face` : "Assemble your sundial", 10, 17);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`${plan.columns} ${plan.columns === 1 ? "column" : "columns"} x ${plan.rows} ${plan.rows === 1 ? "row" : "rows"} / ${plan.tiles.length} full-size sheets / ${opts.format.toUpperCase()}`, 10, 25);
  doc.setFontSize(8);
  doc.text(`Radius ${opts.radiusMm} mm. Overlap ${plan.overlapMm} mm. Print one-sided at Actual size / 100%.`, 10, 32);
  doc.text("Disable Fit, Shrink and extra poster tiling. Check each bar and the frame's width and height.", 10, 37);
  const heading = faceHeading(dial);
  if (heading) {
    doc.setFontSize(7);
    doc.text(heading, 10, 41);
  }

  // The map is deliberately separated from cutting geometry and labelled at
  // the point of use. The source drawing and sheet arrangement share a frame.
  const scale = Math.min(width / plan.assembledWidth, 85 / plan.assembledHeight);
  const mapWidth = plan.assembledWidth * scale;
  const mapHeight = plan.assembledHeight * scale;
  const x = (plan.page.width - mapWidth) / 2;
  const y = 51;
  doc.setFontSize(8);
  doc.text("ASSEMBLY MAP - reduced size, not a cutting template", 10, 46);
  drawPlate(doc, dial, opts, plan, { centerX: x + plan.root.x * scale, centerY: y + plan.root.y * scale }, scale);
  for (const tile of plan.tiles) {
    doc.setDrawColor(100, 100, 100);
    doc.setLineWidth(0.2);
    doc.setLineDashPattern([1, 0.8], 0);
    doc.rect(x + tile.x * scale, y + tile.y * scale, plan.viewport.width * scale, plan.viewport.height * scale);
    const cx = x + (tile.x + plan.viewport.width / 2) * scale;
    const cy = y + (tile.y + plan.viewport.height / 2) * scale;
    doc.setFillColor(255, 255, 255);
    doc.rect(cx - 7, cy - 2.5, 14, 5, "F");
    doc.setFontSize(8);
    doc.text(prefix + tile.id, cx, cy, { align: "center", baseline: "middle" });
  }
  doc.setLineDashPattern([], 0);
  let cursor = y + mapHeight + 9;
  const paragraph = (text: string, size = 8) => {
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, width) as string[];
    const leading = size * 25.4 / 72 * 1.35;
    if (cursor + (lines.length - 1) * leading > plan.page.height - 22) {
      throw new Error("The assembly notes are too long for this page. Shorten the title, motto or design notes.");
    }
    doc.text(lines, 10, cursor, { lineHeightFactor: 1.35 });
    cursor += lines.length * leading + 2.5;
  };
  paragraph(`1. Keep all sheets facing the same way. Start at ${prefix}R1C1, then work across each row. ${dial.equatorial ? "Assemble P- and O-sheets separately." : ""}`);
  paragraph("2. On columns after C1, trim the left blank margin at the dashed frame. On rows after R1, trim the top blank margin there. Keep the printed overlap.");
  paragraph("3. Lay each new sheet over its neighbor's 10 mm overlap. Match both crosshair targets and the drawing. Tape the back, then cut the plate's solid outline.");
  paragraph("Dashed frames and crosshairs are assembly aids, not dial cuts. The frame sits 10 mm from the left and right paper edges. " + (kit ? "The matching gnomon template and mounting instructions follow the plate sheets." : "Keep the separate Gnomon SVG for the style template."));
  if (opts.title) paragraph(opts.title, 10);
  if (opts.motto) paragraph(opts.motto.latin, 9);
  if (opts.description) paragraph(opts.description);
  calibrationBar(doc);
}

function drawTile(doc: jsPDF, dial: PolarDialResult, opts: PdfExportOptions, plan: PolarPrintPlan, tile: PrintTile, index: number, totalPages: number, pageOffset: number, prefix: string): void {
  const v = plan.viewport;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text(`${prefix}${tile.id} / ${plan.rows} ${plan.rows === 1 ? "row" : "rows"} x ${plan.columns} ${plan.columns === 1 ? "column" : "columns"}`, 10, 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(`${opts.format.toUpperCase()} | radius ${opts.radiusMm} mm | 100% | page ${pageOffset + index + 2} of ${totalPages}`, plan.page.width - 10, 10, { align: "right" });
  doc.text(`Drawing origin x ${tile.x.toFixed(1)} mm, y ${tile.y.toFixed(1)} mm | 10 mm overlaps`, 10, 16);
  const m = { centerX: v.x + plan.root.x - tile.x, centerY: v.y + plan.root.y - tile.y };
  doc.saveGraphicsState();
  doc.rect(v.x, v.y, v.width, v.height, null);
  doc.clip();
  doc.discardPath();
  drawPlate(doc, dial, opts, plan, m);
  doc.restoreGraphicsState();

  drawTileFrame(doc, plan, tile, prefix);
  if (opts.title) {
    const lines = doc.splitTextToSize(opts.title, plan.page.width - 125) as string[];
    doc.text(lines[0]!, plan.page.width - 10, plan.page.height - 19, { align: "right" });
  }
  calibrationBar(doc);
}

/** Shared paper frame and matching targets for both plate and style sheets. */
function drawTileFrame(doc: jsPDF, plan: PolarPrintPlan | GnomonPrintPlan, tile: PrintTile, prefix = ""): void {
  const v = plan.viewport;
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.15);
  doc.setLineDashPattern([1.5, 1], 0);
  doc.rect(v.x, v.y, v.width, v.height);
  if (tile.column < plan.columns - 1) doc.line(v.x + v.width - plan.overlapMm, v.y, v.x + v.width - plan.overlapMm, v.y + v.height);
  if (tile.row < plan.rows - 1) doc.line(v.x, v.y + v.height - plan.overlapMm, v.x + v.width, v.y + v.height - plan.overlapMm);
  doc.setLineDashPattern([], 0);
  doc.setDrawColor(80, 80, 80);
  for (const mark of registrationMarks(plan, tile)) {
    const x = v.x + mark.x - tile.x;
    const y = v.y + mark.y - tile.y;
    doc.circle(x, y, 1.2);
    doc.line(x - 2, y, x + 2, y);
    doc.line(x, y - 2, x, y + 2);
  }
  doc.setFontSize(7);
  const neighbors = [
    tile.column > 0 ? `left ${prefix}R${tile.row + 1}C${tile.column}` : "",
    tile.column < plan.columns - 1 ? `right ${prefix}R${tile.row + 1}C${tile.column + 2}` : "",
    tile.row > 0 ? `above ${prefix}R${tile.row}C${tile.column + 1}` : "",
    tile.row < plan.rows - 1 ? `below ${prefix}R${tile.row + 2}C${tile.column + 1}` : "",
  ].filter(Boolean).join(" / ");
  doc.text(`Join: ${neighbors}`, 10, plan.page.height - 24);
  doc.setFontSize(6);
  doc.text(`Frame ${v.width.toFixed(1)} x ${v.height.toFixed(1)} mm - check both axes`, 10, plan.page.height - 19);
}

function createPlateDocument(dial: PolarDialResult, opts: PdfExportOptions, totalPages?: number): jsPDF {
  const plan = planPolarPrint(dial, opts);
  const doc = new jsPDF({ unit: "mm", format: opts.format, orientation: "portrait" });
  doc.setProperties({ title: opts.title ?? "Sundial", subject: opts.description ?? "", creator: "Gnomon" });
  drawPlatePages(doc, dial, opts, plan, totalPages ?? plan.pageCount, 0, totalPages !== undefined);
  return doc;
}

/** Draw onto the current page and append subsequent sheets, preserving page numbering. */
function drawPlatePages(doc: jsPDF, dial: PolarDialResult, opts: PdfExportOptions, plan: PolarPrintPlan, totalPages: number, pageOffset: number, kit: boolean): void {
  const prefix = dial.equatorial ? dial.equatorial.face === "pole-facing" ? "P-" : "O-" : "";
  if (plan.tiled) {
    assemblyGuide(doc, dial, opts, plan, kit, prefix);
    for (const [index, tile] of plan.tiles.entries()) {
      doc.addPage();
      drawTile(doc, dial, opts, plan, tile, index, totalPages, pageOffset, prefix);
    }
  } else singlePage(doc, dial, opts, plan);
}

/** Plate-only export for callers that fabricate their own style. */
export function exportPolarDialPDF(dial: PolarDialResult, opts: PdfExportOptions): Uint8Array {
  return new Uint8Array(createPlateDocument(dial, opts).output("arraybuffer"));
}

function drawGnomon(doc: jsPDF, shape: ReturnType<typeof gnomonLayout>, origin: { x: number; y: number }, scale = 1): void {
  const map = (p: { x: number; y: number }) => ({ x: origin.x + p.x * scale, y: origin.y + p.y * scale });
  const foot = map(shape.foot);
  const end = map(shape.end);
  doc.setDrawColor(20, 20, 20);
  doc.setFillColor(20, 20, 20);
  doc.setLineWidth(0.35 * scale);
  doc.setLineDashPattern([], 0);
  if (shape.rod) doc.line(foot.x, foot.y, end.x, end.y);
  else {
    const cut = shape.cut.map(map);
    doc.lines(cut.slice(1).map((p, i) => [p.x - cut[i]!.x, p.y - cut[i]!.y]), cut[0]!.x, cut[0]!.y, [1, 1], "S", true);
    const baseEnd = map(shape.baseEnd!);
    doc.setLineWidth(0.25 * scale);
    doc.setLineDashPattern([1.2 * scale, 0.8 * scale], 0);
    doc.line(baseEnd.x, baseEnd.y, foot.x, foot.y);
    doc.setLineDashPattern([], 0);
    doc.circle(baseEnd.x, baseEnd.y, 1.1 * scale);
  }
  doc.circle(foot.x, foot.y, 0.8 * scale, "F");
  if (shape.nodus) {
    const nodus = map(shape.nodus);
    doc.setLineWidth(0.25 * scale);
    doc.line(nodus.x - 1.5 * scale, nodus.y, nodus.x + 1.5 * scale, nodus.y);
    doc.line(nodus.x, nodus.y - 1.5 * scale, nodus.x, nodus.y + 1.5 * scale);
  }
}

function gnomonGuide(doc: jsPDF, dial: PolarDialResult, opts: PdfExportOptions, plan: GnomonPrintPlan): void {
  const shape = plan.layout;
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(shape.rod ? "Gnomon rod - length gauge" : gnomonConstructionWarning(dial) ? "Gnomon - angle gauge" : "Gnomon - cut and fold", 10, 15);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`${opts.format.toUpperCase()} | plate radius ${opts.radiusMm} mm | print at Actual size / 100%`, 10, 22);
  let y = 32;
  if (plan.tiled) {
    doc.text(`GNOMON MAP - reduced size. Cut from the ${plan.tiles.length} G-prefixed sheets that follow.`, 10, y);
    y += 7;
    const scale = Math.min((plan.page.width - 20) / plan.assembledWidth, 65 / plan.assembledHeight);
    const x = (plan.page.width - plan.assembledWidth * scale) / 2;
    drawGnomon(doc, shape, { x: x + plan.origin.x * scale, y: y + plan.origin.y * scale }, scale);
    for (const tile of plan.tiles) {
      doc.setDrawColor(130, 130, 130);
      doc.setLineWidth(0.15);
      doc.rect(x + tile.x * scale, y + tile.y * scale, plan.viewport.width * scale, plan.viewport.height * scale);
      doc.setFontSize(7);
      doc.text(`G-${tile.id}`, x + tile.x * scale + 2, y + tile.y * scale + 4);
    }
    y += plan.assembledHeight * scale + 8;
  } else {
    drawGnomon(doc, shape, { x: (plan.page.width - shape.widthMm) / 2, y });
    y += shape.heightMm + 9;
  }
  const paragraph = (text: string) => {
    doc.setFontSize(8);
    const lines = doc.splitTextToSize(text, plan.page.width - 20) as string[];
    if (y + (lines.length - 1) * 3.7 > plan.page.height - 22) throw new Error("The gnomon instructions do not fit on the page.");
    doc.text(lines, 10, y, { lineHeightFactor: 1.3 });
    y += lines.length * 3.7 + 2;
  };
  if (plan.tiled) paragraph("Assemble G-sheets separately from the plate. Trim only blank left/top margins of later columns/rows. Overlap by 10 mm, match both crosshair targets, and tape the back. Dashed frames and crosshair targets are not cuts.");
  for (const instruction of gnomonInstructions(dial)) paragraph(instruction);
  paragraph(dial.orientation);
  calibrationBar(doc);
}

/** One download holds the matching plate, style, scale checks and instructions. */
export function exportConstructionPDF(dial: PolarDialResult, opts: PdfExportOptions): Uint8Array {
  const plan = planConstructionPrint(dial, opts);
  const doc = createPlateDocument(dial, opts, plan.pageCount);
  const counterpart = dial.equatorial?.counterpart;
  if (counterpart && plan.reversePlate) {
    doc.addPage();
    // The caller's description names the primary face. Give the reverse its
    // own orientation while retaining the same clock convention and design notes.
    const reverseOpts = { ...opts, description: opts.description?.replace(dial.orientation, counterpart.orientation) };
    drawPlatePages(doc, counterpart, reverseOpts, plan.reversePlate, plan.pageCount, plan.plate.pageCount, true);
  }
  doc.addPage();
  gnomonGuide(doc, dial, opts, plan.gnomon);
  if (plan.gnomon.tiled) {
    const g = plan.gnomon;
    for (const [index, tile] of g.tiles.entries()) {
      doc.addPage();
      doc.setTextColor(20, 20, 20);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(`G-${tile.id} / GNOMON / ${g.rows} rows x ${g.columns} columns`, 10, 10);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text(`${opts.format.toUpperCase()} | radius ${opts.radiusMm} mm | 100% | page ${plan.plate.pageCount + (plan.reversePlate?.pageCount ?? 0) + index + 2} of ${plan.pageCount}`, g.page.width - 10, 16, { align: "right" });
      doc.text(`Drawing origin x ${tile.x.toFixed(1)} mm, y ${tile.y.toFixed(1)} mm`, 10, 16);
      const v = g.viewport;
      doc.saveGraphicsState();
      doc.rect(v.x, v.y, v.width, v.height, null);
      doc.clip();
      doc.discardPath();
      drawGnomon(doc, g.layout, { x: v.x + g.origin.x - tile.x, y: v.y + g.origin.y - tile.y });
      doc.restoreGraphicsState();
      drawTileFrame(doc, g, tile, "G-");
      calibrationBar(doc);
    }
  }
  return new Uint8Array(doc.output("arraybuffer"));
}
