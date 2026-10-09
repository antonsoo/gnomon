/**
 * SVG rendering for horizontal / vertical / equatorial dials (the
 * "polar-style" family sharing `PolarDialResult`) and for the analemmatic
 * dial's ellipse layout. Coordinates are plain millimetres: the root
 * `<svg>` carries `width`/`height` in `mm` and a matching `viewBox`, so
 * the file is scale-exact when opened in any vector or laser-cutting
 * tool, with no unit conversion needed.
 */

import type { Motto } from "../motto.ts";
import type { AnalemmaticDialResult, PolarDialResult } from "../dials/types.ts";
import { hourLabel } from "./numerals.ts";
import { plateBounds, plateOutline, type PlateShape } from "./plate-shape.ts";
import { polarHourMarks } from "./hour-marks.ts";
import { clipCurve } from "./curves.ts";
import { polarToUV, toPage } from "./project.ts";
import type { PageMapping } from "./project.ts";
import { THEMES, type Theme } from "./theme.ts";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface PolarDialRenderOptions {
  radiusMm: number;
  innerRadiusMm: number;
  /**
   * "fan" (default): the plate is cut to the wedge the hour lines actually
   * reach (see plate-shape.ts) -- root at the point, no wasted plate. This
   * is the classic look for a horizontal or declining-vertical dial whose
   * hour range runs well past 6am-6pm. "circle": the traditional full
   * circle, root at the centre -- simpler to cut by hand, and correct for
   * an equatorial dial, whose hour lines are evenly spaced regardless of
   * latitude.
   */
  plateShape: PlateShape;
  numerals: "arabic" | "roman";
  romanStyle?: "IIII" | "IV";
  theme: Theme;
  showDeclinationLines: boolean;
  showHistoricalHours: boolean;
  title?: string;
  description?: string;
  motto?: Motto;
  /** Live shadow tip, in dial (u, v) mm, if simulating "now". */
  shadowTip?: { u: number; v: number } | null;
}

/** Canvas size and the root's page position for a given plate shape -- shared by the SVG and PDF renderers so they lay out identically. */
export function polarDialLayout(dial: PolarDialResult, opts: Pick<PolarDialRenderOptions, "radiusMm" | "plateShape">) {
  const { thetaMax, thetaCenter } = polarHourMarks(dial, opts.radiusMm);
  const bounds = plateBounds(opts.plateShape, opts.radiusMm, thetaMax, thetaCenter);
  const padSide = Math.max(8, opts.radiusMm * 0.08);
  const padTop = Math.max(6, opts.radiusMm * 0.06);
  const padBottom = Math.max(20, opts.radiusMm * 0.24); // room for title + motto below the plate

  const widthMm = 2 * bounds.halfWidth + 2 * padSide;
  const heightMm = (bounds.topU - bounds.bottomU) + padTop + padBottom;
  const centerX = bounds.halfWidth + padSide;
  const centerY = padTop + bounds.topU;

  return { thetaMax, thetaCenter, widthMm, heightMm, mapping: { centerX, centerY } as PageMapping };
}

export function renderPolarDialSVG(dial: PolarDialResult, opts: PolarDialRenderOptions): string {
  const c = THEMES[opts.theme];
  const marks = polarHourMarks(dial, opts.radiusMm);
  const { thetaMax, thetaCenter, widthMm, heightMm, mapping: m } = polarDialLayout(dial, opts);
  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${widthMm} ${heightMm}" font-family="'Cormorant Garamond', 'EB Garamond', Georgia, serif">`,
  );
  if (opts.title) parts.push(`<title>${esc(opts.title)}</title>`);
  if (opts.description) parts.push(`<desc>${esc(opts.description)}</desc>`);
  if (c.background !== "none") {
    parts.push(`<rect x="0" y="0" width="${widthMm}" height="${heightMm}" fill="${c.background}"/>`);
  }
  const outline = plateOutline(opts.plateShape, opts.radiusMm, thetaMax, 96, thetaCenter);
  const outlineD = outline.map((p, i) => `${i === 0 ? "M" : "L"} ${toPage(p.u, p.v, m).x.toFixed(3)} ${toPage(p.u, p.v, m).y.toFixed(3)}`).join(" ");
  parts.push(`<path d="${outlineD} Z" fill="none" stroke="${c.frame}" stroke-width="0.4"/>`);

  if (opts.showDeclinationLines) {
    for (const line of dial.declinationLines) {
      const stroke = line.kind === "zodiac" ? c.mutedText : c.declinationLine;
      for (const run of clipCurve(line.points, marks.hourRadius, opts.plateShape, thetaMax, thetaCenter)) {
        const d = run.map((p, i) => `${i === 0 ? "M" : "L"} ${toPage(p.u, p.v, m).x.toFixed(3)} ${toPage(p.u, p.v, m).y.toFixed(3)}`).join(" ");
        parts.push(`<path d="${d}" fill="none" stroke="${stroke}" stroke-width="0.25"/>`);
      }
    }
  }

  if (opts.showHistoricalHours) {
    for (const curve of dial.historicalHours) {
      for (const run of clipCurve(curve.points, marks.hourRadius, opts.plateShape, thetaMax, thetaCenter)) {
        const d = run.map((p, i) => `${i === 0 ? "M" : "L"} ${toPage(p.u, p.v, m).x.toFixed(3)} ${toPage(p.u, p.v, m).y.toFixed(3)}`).join(" ");
        parts.push(`<path d="${d}" fill="none" stroke="${c.historicalLine}" stroke-width="0.2" stroke-dasharray="1,0.8"/>`);
      }
    }
  }

  for (const line of dial.hourLines) {
    const inner = polarToUV(line.angleRad, opts.innerRadiusMm);
    const outer = polarToUV(line.angleRad, marks.hourRadius);
    const p0 = toPage(inner.u, inner.v, m);
    const p1 = toPage(outer.u, outer.v, m);
    const stroke = line.isMajor ? c.hourLineMajor : c.hourLineMinor;
    const width = line.isMajor ? 0.35 : 0.18;
    parts.push(
      `<line x1="${p0.x.toFixed(3)}" y1="${p0.y.toFixed(3)}" x2="${p1.x.toFixed(3)}" y2="${p1.y.toFixed(3)}" stroke="${stroke}" stroke-width="${width}"/>`,
    );
    if (line.isMajor) {
      const lp = polarToUV(line.angleRad, marks.labelRadius);
      const pp = toPage(lp.u, lp.v, m);
      const label = hourLabel(line.hour, opts.numerals, opts.romanStyle);
      parts.push(
        `<text x="${pp.x.toFixed(3)}" y="${pp.y.toFixed(3)}" font-size="${marks.fontSizeMm}" fill="${c.text}" text-anchor="middle" dominant-baseline="middle">${esc(label)}</text>`,
      );
    }
  }

  // Gnomon foot marker.
  parts.push(`<circle cx="${m.centerX}" cy="${m.centerY}" r="0.6" fill="${c.gnomon}"/>`);

  if (opts.shadowTip) {
    const tip = toPage(opts.shadowTip.u, opts.shadowTip.v, m);
    parts.push(
      `<line x1="${m.centerX}" y1="${m.centerY}" x2="${tip.x.toFixed(3)}" y2="${tip.y.toFixed(3)}" stroke="${c.declinationLine}" stroke-width="0.6" stroke-linecap="round"/>`,
    );
    parts.push(`<circle cx="${tip.x.toFixed(3)}" cy="${tip.y.toFixed(3)}" r="1.1" fill="${c.declinationLine}"/>`);
  }

  if (opts.title) {
    parts.push(
      `<text x="${m.centerX}" y="${heightMm - 6}" font-size="${Math.max(3, opts.radiusMm * 0.05)}" fill="${c.mutedText}" text-anchor="middle" letter-spacing="0.5">${esc(opts.title)}</text>`,
    );
  }
  if (opts.motto) {
    parts.push(
      `<text x="${m.centerX}" y="${heightMm - 1.5}" font-style="italic" font-size="${Math.max(2.6, opts.radiusMm * 0.04)}" fill="${c.mutedText}" text-anchor="middle">${esc(opts.motto.latin)}</text>`,
    );
  }

  parts.push("</svg>");
  return parts.join("");
}

export interface GnomonRenderOptions {
  theme: Theme;
  marginMm: number;
}

/**
 * The triangular gnomon template, as a separate flat piece: base + fold
 * tab. An equatorial dial's style is, by construction, perpendicular to
 * the dial face rather than leaning across it (style height 90 deg), so
 * there is no triangle to cut -- it is a plain rod through the disc's
 * centre -- and we draw that instead of a degenerate infinite-height
 * triangle.
 */
export function renderGnomonSVG(dial: PolarDialResult, opts: GnomonRenderOptions): string {
  const c = THEMES[opts.theme];
  const base = dial.gnomon.baseLengthMm;
  const nodus = dial.gnomon.nodusDistanceMm;

  if (dial.gnomon.styleHeightDeg > 89.9) {
    const rodLength = base;
    const w = Math.max(opts.marginMm * 2 + 24, 70);
    const h = rodLength + opts.marginMm * 2 + 20;
    const cx = w / 2;
    const parts: string[] = [];
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}" font-family="'Cormorant Garamond', Georgia, serif">`);
    if (c.background !== "none") parts.push(`<rect width="${w}" height="${h}" fill="${c.background}"/>`);
    parts.push(
      `<line x1="${cx}" y1="${opts.marginMm}" x2="${cx}" y2="${opts.marginMm + rodLength}" stroke="${c.gnomon}" stroke-width="0.6" stroke-linecap="round"/>`,
    );
    parts.push(`<circle cx="${cx}" cy="${opts.marginMm}" r="1" fill="${c.gnomon}"/>`);
    if (nodus !== undefined && nodus <= rodLength) {
      parts.push(`<path d="M ${cx - 2} ${opts.marginMm + nodus} h 4" stroke="${c.text}" stroke-width="0.3"/><text x="${cx + 3}" y="${opts.marginMm + nodus}" font-size="2.5" fill="${c.text}">nodus</text>`);
    }
    parts.push(
      `<text x="${cx}" y="${h - 12}" font-size="2.8" fill="${c.text}" text-anchor="middle">rod ${rodLength.toFixed(1)}mm; dot = foot</text>`,
    );
    parts.push(
      `<text x="${cx}" y="${h - 7}" font-size="2.8" fill="${c.text}" text-anchor="middle">perpendicular to the disc</text>`,
    );
    if (nodus !== undefined) parts.push(`<text x="${cx}" y="${h - 2}" font-size="2.8" fill="${c.text}" text-anchor="middle">nodus ${nodus.toFixed(1)}mm from foot</text>`);
    parts.push("</svg>");
    return parts.join("");
  }

  const height = base * Math.tan((dial.gnomon.styleHeightDeg * Math.PI) / 180);
  const tabDepth = Math.max(6, base * 0.15);
  const w = Math.max(80, base + opts.marginMm * 2);
  const h = height + tabDepth + opts.marginMm * 2 + 13;
  const x0 = (w - base) / 2;
  const y0 = opts.marginMm + height; // baseline y

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}" font-family="'Cormorant Garamond', Georgia, serif">`);
  if (c.background !== "none") parts.push(`<rect width="${w}" height="${h}" fill="${c.background}"/>`);

  // The sloping edge runs from base-right (the foot) to the apex.
  const baseLeft = { x: x0, y: y0 };
  const baseRight = { x: x0 + base, y: y0 };
  const apex = { x: x0, y: y0 - height };
  parts.push(
    `<path d="M ${apex.x} ${apex.y} L ${baseRight.x} ${baseRight.y} L ${baseRight.x} ${baseRight.y + tabDepth} L ${baseLeft.x} ${baseLeft.y + tabDepth} Z" fill="none" stroke="${c.gnomon}" stroke-width="0.35"/>`,
  );
  parts.push(`<circle cx="${baseRight.x}" cy="${baseRight.y}" r="0.8" fill="${c.text}"/>`);
  const styleLength = Math.hypot(base, height);
  if (nodus !== undefined && nodus <= styleLength) {
    const x = baseRight.x - base * nodus / styleLength;
    const y = baseRight.y - height * nodus / styleLength;
    parts.push(`<path d="M ${x - 1.5} ${y} h 3 M ${x} ${y - 1.5} v 3" stroke="${c.text}" stroke-width="0.25"/>`);
  }
  // The tab is part of the outer cut. Engrave the fold; cutting the
  // triangle's base would detach the very tab intended for mounting it.
  parts.push(
    `<path d="M ${baseLeft.x} ${baseLeft.y} L ${baseRight.x} ${baseRight.y}" fill="none" stroke="${c.text}" stroke-width="0.25" stroke-dasharray="1.2,0.8"/>`,
  );
  parts.push(
    `<text x="${w / 2}" y="${y0 + tabDepth + 5}" font-size="2.8" fill="${c.text}" text-anchor="middle">style ${dial.gnomon.styleHeightDeg.toFixed(2)}°; dot = foot</text>`,
  );
  parts.push(`<text x="${w / 2}" y="${y0 + tabDepth + 10}" font-size="2.8" fill="${c.text}" text-anchor="middle">fold tab along the base</text>`);
  if (nodus !== undefined) parts.push(`<text x="${w / 2}" y="${y0 + tabDepth + 15}" font-size="2.8" fill="${c.text}" text-anchor="middle">cross = nodus, ${nodus.toFixed(1)}mm from foot</text>`);
  parts.push("</svg>");
  return parts.join("");
}

export interface AnalemmaticRenderOptions {
  widthMm: number;
  heightMm: number;
  theme: Theme;
  numerals: "arabic" | "roman";
  romanStyle?: "IIII" | "IV";
  title?: string;
  description?: string;
  motto?: Motto;
}

export function renderAnalemmaticSVG(dial: AnalemmaticDialResult, opts: AnalemmaticRenderOptions): string {
  const c = THEMES[opts.theme];
  const m = { centerX: opts.widthMm / 2, centerY: opts.heightMm / 2 };
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${opts.widthMm}mm" height="${opts.heightMm}mm" viewBox="0 0 ${opts.widthMm} ${opts.heightMm}" font-family="'Cormorant Garamond', Georgia, serif">`);
  if (opts.title) parts.push(`<title>${esc(opts.title)}</title>`);
  if (opts.description) parts.push(`<desc>${esc(opts.description)}</desc>`);
  if (c.background !== "none") parts.push(`<rect width="${opts.widthMm}" height="${opts.heightMm}" fill="${c.background}"/>`);

  parts.push(
    `<ellipse cx="${m.centerX}" cy="${m.centerY}" rx="${dial.semiMajorMm}" ry="${dial.semiMinorMm}" fill="none" stroke="${c.frame}" stroke-width="0.4"/>`,
  );

  for (const p of dial.hourPoints) {
    const pt = toPage(p.y, p.x, m); // u = north/south (y), v = east/west (x)
    const r = p.isMajor ? 1.1 : 0.6;
    parts.push(`<circle cx="${pt.x.toFixed(3)}" cy="${pt.y.toFixed(3)}" r="${r}" fill="${p.isMajor ? c.hourLineMajor : c.hourLineMinor}"/>`);
    if (p.isMajor) {
      const labelPt = toPage(p.y * 1.13 + Math.sign(p.y || 1) * 3, p.x * 1.13, m);
      parts.push(
        `<text x="${labelPt.x.toFixed(3)}" y="${labelPt.y.toFixed(3)}" font-size="4" fill="${c.text}" text-anchor="middle" dominant-baseline="middle">${esc(hourLabel(p.hour, opts.numerals, opts.romanStyle))}</text>`,
      );
    }
  }

  // Date scale, along the minor (north-south) axis.
  for (const mark of dial.dateScale) {
    const pt = toPage(mark.offsetMm, 0, m);
    parts.push(`<circle cx="${pt.x.toFixed(3)}" cy="${pt.y.toFixed(3)}" r="0.8" fill="${c.declinationLine}"/>`);
    parts.push(
      `<text x="${(pt.x + 4).toFixed(3)}" y="${pt.y.toFixed(3)}" font-size="2.6" fill="${c.mutedText}" dominant-baseline="middle">${esc(mark.label)}</text>`,
    );
  }

  parts.push(`<circle cx="${m.centerX}" cy="${m.centerY}" r="0.6" fill="${c.gnomon}"/>`);

  if (opts.title) {
    parts.push(
      `<text x="${m.centerX}" y="${opts.heightMm - 6}" font-size="4.5" fill="${c.mutedText}" text-anchor="middle" letter-spacing="0.5">${esc(opts.title)}</text>`,
    );
  }
  if (opts.motto) {
    parts.push(
      `<text x="${m.centerX}" y="${opts.heightMm - 1.5}" font-style="italic" font-size="3.6" fill="${c.mutedText}" text-anchor="middle">${esc(opts.motto.latin)}</text>`,
    );
  }
  parts.push("</svg>");
  return parts.join("");
}
