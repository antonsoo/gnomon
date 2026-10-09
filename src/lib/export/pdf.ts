/** Scale-exact vector PDF. Large plates use overlapping full-size sheets. */
import { jsPDF } from "jspdf";
import type { PlanePoint, PolarDialResult } from "../dials/types.ts";
import type { Motto } from "../motto.ts";
import { hourLabel } from "../render/numerals.ts";
import { plateOutline, type PlateShape } from "../render/plate-shape.ts";
import { clipCurve } from "../render/curves.ts";
import { polarToUV, toPage, type PageMapping } from "../render/project.ts";
import { planPolarPrint, registrationMarks, type PageFormat, type PolarPrintPlan, type PrintTile } from "./print-layout.ts";

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

  const drawCurve = (points: PlanePoint[], historical: boolean) => {
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
  doc.setFillColor(20, 20, 20);
  doc.circle(m.centerX, m.centerY, 0.6 * scale, "F");
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

function assemblyGuide(doc: jsPDF, dial: PolarDialResult, opts: PdfExportOptions, plan: PolarPrintPlan): void {
  const width = plan.page.width - 20;
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("Assemble your sundial", 10, 17);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`${plan.columns} ${plan.columns === 1 ? "column" : "columns"} x ${plan.rows} ${plan.rows === 1 ? "row" : "rows"} / ${plan.tiles.length} full-size sheets / ${opts.format.toUpperCase()}`, 10, 25);
  doc.setFontSize(8);
  doc.text(`Radius ${opts.radiusMm} mm. Overlap ${plan.overlapMm} mm. Print one-sided at Actual size / 100%.`, 10, 32);
  doc.text("Disable Fit, Shrink and extra poster tiling. Check each bar and the frame's width and height.", 10, 37);

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
    doc.text(tile.id, cx, cy, { align: "center", baseline: "middle" });
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
  paragraph("1. Keep all sheets facing the same way. Start at R1C1, then work across each row.");
  paragraph("2. On columns after C1, trim the left blank margin at the dashed frame. On rows after R1, trim the top blank margin there. Keep the printed overlap.");
  paragraph("3. Lay each new sheet over its neighbor's 10 mm overlap. Match both crosshair targets and the drawing. Tape the back, then cut the plate's solid outline.");
  paragraph("Dashed frames and crosshairs are assembly aids, not dial cuts. The frame sits 10 mm from the left and right paper edges. Keep the separate Gnomon SVG for the style template.");
  if (opts.title) paragraph(opts.title, 10);
  if (opts.motto) paragraph(opts.motto.latin, 9);
  if (opts.description) paragraph(opts.description);
  calibrationBar(doc);
}

function drawTile(doc: jsPDF, dial: PolarDialResult, opts: PdfExportOptions, plan: PolarPrintPlan, tile: PrintTile, index: number): void {
  const v = plan.viewport;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text(`${tile.id} / ${plan.rows} ${plan.rows === 1 ? "row" : "rows"} x ${plan.columns} ${plan.columns === 1 ? "column" : "columns"}`, 10, 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(`${opts.format.toUpperCase()} | radius ${opts.radiusMm} mm | 100% | page ${index + 2} of ${plan.pageCount}`, plan.page.width - 10, 10, { align: "right" });
  doc.text(`Drawing origin x ${tile.x.toFixed(1)} mm, y ${tile.y.toFixed(1)} mm | 10 mm overlaps`, 10, 16);
  const m = { centerX: v.x + plan.root.x - tile.x, centerY: v.y + plan.root.y - tile.y };
  doc.saveGraphicsState();
  doc.rect(v.x, v.y, v.width, v.height, null);
  doc.clip();
  doc.discardPath();
  drawPlate(doc, dial, opts, plan, m);
  doc.restoreGraphicsState();

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
    tile.column > 0 ? `left R${tile.row + 1}C${tile.column}` : "",
    tile.column < plan.columns - 1 ? `right R${tile.row + 1}C${tile.column + 2}` : "",
    tile.row > 0 ? `above R${tile.row}C${tile.column + 1}` : "",
    tile.row < plan.rows - 1 ? `below R${tile.row + 2}C${tile.column + 1}` : "",
  ].filter(Boolean).join(" / ");
  doc.text(`Join: ${neighbors}`, 10, plan.page.height - 24);
  doc.setFontSize(6);
  doc.text(`Frame ${v.width.toFixed(1)} x ${v.height.toFixed(1)} mm - check both axes`, 10, plan.page.height - 19);
  if (opts.title) {
    const lines = doc.splitTextToSize(opts.title, plan.page.width - 125) as string[];
    doc.text(lines[0]!, plan.page.width - 10, plan.page.height - 19, { align: "right" });
  }
  calibrationBar(doc);
}

export function exportPolarDialPDF(dial: PolarDialResult, opts: PdfExportOptions): Uint8Array {
  const plan = planPolarPrint(dial, opts);
  const doc = new jsPDF({ unit: "mm", format: opts.format, orientation: "portrait" });
  doc.setProperties({ title: opts.title ?? "Sundial", subject: opts.description ?? "", creator: "Gnomon" });
  if (plan.tiled) {
    assemblyGuide(doc, dial, opts, plan);
    for (const [index, tile] of plan.tiles.entries()) {
      doc.addPage();
      drawTile(doc, dial, opts, plan, tile, index);
    }
  } else singlePage(doc, dial, opts, plan);
  return new Uint8Array(doc.output("arraybuffer"));
}
