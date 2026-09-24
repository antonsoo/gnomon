/**
 * PDF export at exact print scale. Rather than converting the SVG markup
 * (which risks silent unit drift through a parser), this draws the same
 * geometric data directly with jsPDF's vector primitives in millimetre
 * units -- the same `toPage`/`polarToUV` mapping `render/svg.ts` uses, so
 * one line drawn "10mm long" here really is 10mm on a printed page. A
 * 100mm calibration bar is included on every export specifically so a
 * user (or `tests/export.test.ts`) can verify that with a ruler or by
 * re-measuring the PDF's own page geometry.
 */

import { jsPDF } from "jspdf";
import type { PolarDialResult } from "../dials/types.ts";
import { hourLabel } from "../render/numerals.ts";
import { plateBounds, plateOutline, thetaMaxRad, type PlateShape } from "../render/plate-shape.ts";
import { polarToUV, toPage } from "../render/project.ts";

export type PageFormat = "a4" | "letter";

export interface PdfExportOptions {
  radiusMm: number;
  innerRadiusMm: number;
  plateShape: PlateShape;
  numerals: "arabic" | "roman";
  romanStyle?: "IIII" | "IV";
  title?: string;
  format: PageFormat;
}

const PAGE_SIZE_MM: Record<PageFormat, { width: number; height: number }> = {
  a4: { width: 210, height: 297 },
  letter: { width: 215.9, height: 279.4 },
};

function clampPlateFits(widthMm: number, heightAboveRootMm: number, heightBelowRootMm: number, format: PageFormat): void {
  const page = PAGE_SIZE_MM[format];
  const usableWidth = page.width - 16; // 8mm margin either side
  const usableHeight = page.height - 20 /* top margin */ - 35; // room for title + 100mm calibration strip below
  const totalHeight = heightAboveRootMm + heightBelowRootMm;
  if (widthMm > usableWidth || totalHeight > usableHeight) {
    throw new Error(
      `This dial (about ${widthMm.toFixed(0)}mm wide, ${totalHeight.toFixed(0)}mm tall) does not fit on ${format.toUpperCase()} (usable area ~${usableWidth.toFixed(0)}x${usableHeight.toFixed(0)}mm). Reduce the radius or export SVG instead.`,
    );
  }
}

export function exportPolarDialPDF(dial: PolarDialResult, opts: PdfExportOptions): Uint8Array {
  const thetaMax = thetaMaxRad(dial);
  const labelRadius = opts.radiusMm + Math.max(4, opts.radiusMm * 0.06);
  const bounds = plateBounds(opts.plateShape, labelRadius, thetaMax);
  clampPlateFits(2 * bounds.halfWidth, bounds.topU, -bounds.bottomU, opts.format);

  const doc = new jsPDF({ unit: "mm", format: opts.format, orientation: "portrait" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const m = { centerX: pageWidth / 2, centerY: 20 + bounds.topU };

  doc.setDrawColor(20, 20, 20);
  doc.setLineWidth(0.3);
  const outline = plateOutline(opts.plateShape, opts.radiusMm, thetaMax);
  const outlinePts = outline.map((p) => toPage(p.u, p.v, m));
  doc.lines(
    outlinePts.slice(1).map((p, i) => [p.x - outlinePts[i]!.x, p.y - outlinePts[i]!.y]),
    outlinePts[0]!.x,
    outlinePts[0]!.y,
    [1, 1],
    "S",
    true,
  );

  doc.setFontSize(7);
  for (const line of dial.hourLines) {
    const inner = polarToUV(line.angleRad, opts.innerRadiusMm);
    const outer = polarToUV(line.angleRad, opts.radiusMm);
    const p0 = toPage(inner.u, inner.v, m);
    const p1 = toPage(outer.u, outer.v, m);
    doc.setLineWidth(line.isMajor ? 0.35 : 0.15);
    doc.line(p0.x, p0.y, p1.x, p1.y);
    if (line.isMajor) {
      const lp = polarToUV(line.angleRad, opts.radiusMm + 6);
      const pp = toPage(lp.u, lp.v, m);
      const label = hourLabel(line.hour, opts.numerals, opts.romanStyle);
      doc.text(label, pp.x, pp.y, { align: "center", baseline: "middle" });
    }
  }

  doc.setFillColor(20, 20, 20);
  doc.circle(m.centerX, m.centerY, 0.6, "F");

  const belowPlateY = m.centerY - bounds.bottomU + 10;
  if (opts.title) {
    doc.setFontSize(10);
    doc.text(opts.title, pageWidth / 2, belowPlateY, { align: "center" });
  }

  // 100mm calibration bar, bottom-left of the page -- print at "actual
  // size" / 100% scale and this measures exactly 100mm with a ruler.
  const pageHeight = doc.internal.pageSize.getHeight();
  const barY = pageHeight - 12;
  doc.setLineWidth(0.4);
  doc.line(10, barY, 110, barY);
  doc.line(10, barY - 1.5, 10, barY + 1.5);
  doc.line(110, barY - 1.5, 110, barY + 1.5);
  doc.setFontSize(7);
  doc.text("100 mm calibration — verify before cutting", 10, barY + 5);

  return new Uint8Array(doc.output("arraybuffer"));
}
