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
import { gnomonBaseEnd, gnomonLayout, gnomonConstructionWarning } from "./gnomon-layout.ts";
import { clipCurve } from "./curves.ts";
import { equatorialAlignmentMark } from "./equatorial-marks.ts";
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

  // Engraved mounting line: filled dot = foot, open circle = base end.
  if (dial.gnomon.baseLengthMm > 0) {
    const baseEnd = gnomonBaseEnd(dial);
    const end = toPage(baseEnd.u, baseEnd.v, m);
    parts.push(`<path d="M ${m.centerX} ${m.centerY} L ${end.x} ${end.y}" fill="none" stroke="${c.text}" stroke-width="0.22" stroke-dasharray="1.2,0.8"/>`);
    parts.push(`<circle cx="${end.x}" cy="${end.y}" r="1.1" fill="none" stroke="${c.text}" stroke-width="0.25"/>`);
  }
  // Gnomon foot marker.
  parts.push(`<circle cx="${m.centerX}" cy="${m.centerY}" r="0.6" fill="${c.text}"/>`);
  const alignment = equatorialAlignmentMark(dial, opts.radiusMm);
  if (alignment) {
    const p = toPage(alignment.u, alignment.v, m);
    parts.push(`<path d="M ${p.x - 1} ${p.y} h 2 M ${p.x} ${p.y - 1} v 2" fill="none" stroke="${c.text}" stroke-width="0.2"/>`);
    parts.push(`<text x="${p.x + 1.5}" y="${p.y}" font-size="2.5" fill="${c.text}" dominant-baseline="middle">A</text>`);
  }

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
  const g = dial.gnomon;
  const layout = gnomonLayout(dial);
  const w = Math.max(110, layout.widthMm + opts.marginMm * 2);
  const h = layout.heightMm + opts.marginMm * 2 + 26;
  const offset = { x: (w - layout.widthMm) / 2, y: opts.marginMm };
  const map = (p: { x: number; y: number }) => ({ x: p.x + offset.x, y: p.y + offset.y });
  const foot = map(layout.foot);
  const end = map(layout.end);
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}" font-family="'Cormorant Garamond', Georgia, serif">`];
  if (c.background !== "none") parts.push(`<rect width="${w}" height="${h}" fill="${c.background}"/>`);
  if (layout.rod) {
    // This is a length gauge, not a rod-width cutting outline.
    parts.push(`<line x1="${foot.x}" y1="${foot.y}" x2="${end.x}" y2="${end.y}" stroke="${c.text}" stroke-width="0.35"/>`);
  } else {
    const path = layout.cut.map((p, i) => { const q = map(p); return `${i ? "L" : "M"} ${q.x} ${q.y}`; }).join(" ");
    parts.push(`<path d="${path} Z" fill="none" stroke="${c.gnomon}" stroke-width="0.35"/>`);
    const baseEnd = map(layout.baseEnd!);
    parts.push(`<path d="M ${baseEnd.x} ${baseEnd.y} L ${foot.x} ${foot.y}" fill="none" stroke="${c.text}" stroke-width="0.25" stroke-dasharray="1.2,0.8"/>`);
    parts.push(`<circle cx="${baseEnd.x}" cy="${baseEnd.y}" r="1.1" fill="none" stroke="${c.text}" stroke-width="0.25"/>`);
  }
  parts.push(`<circle cx="${foot.x}" cy="${foot.y}" r="0.8" fill="${c.text}"/>`);
  if (layout.nodus) {
    const p = map(layout.nodus);
    parts.push(`<path d="M ${p.x - 1.5} ${p.y} h 3 M ${p.x} ${p.y - 1.5} v 3" stroke="${c.text}" stroke-width="0.25"/>`);
  }
  const lines = [
    layout.rod ? dial.equatorial?.counterpart
      ? `${g.styleLengthMm.toFixed(2)}mm exposed on EACH side; perpendicular to plate`
      : `rod ${g.styleLengthMm.toFixed(2)}mm; perpendicular to plate`
      : `style ${g.styleHeightDeg.toFixed(4)}°; ${gnomonConstructionWarning(dial) ? "angle gauge for a rigid style" : "fold tab 90° along dashed base"}`,
    layout.rod ? "filled dot = foot on plate; line = length gauge" : "match filled foot dots and open base-end circles",
    ...(g.nodusDistanceMm === undefined ? [] : [`cross = nodus, ${g.nodusDistanceMm.toFixed(1)}mm from foot`]),
    "add a bead or notch at the cross for a date-line shadow",
  ];
  for (const [i, line] of lines.entries()) {
    parts.push(`<text x="${w / 2}" y="${opts.marginMm + layout.heightMm + 6 + i * 5}" font-size="2.8" fill="${c.text}" text-anchor="middle">${esc(line)}</text>`);
  }
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
  /** Derived from the selected civil minute; independent of fixed calendar marks. */
  selectedDateMark?: {
    offsetMm: number;
    declinationDeg: number;
    utcInstant: string;
    localLabel: string;
    positionLabel: string;
  };
}

export function renderAnalemmaticSVG(dial: AnalemmaticDialResult, opts: AnalemmaticRenderOptions): string {
  const c = THEMES[opts.theme];
  const m = { centerX: opts.widthMm / 2, centerY: opts.heightMm / 2 };
  // Several calendar names describe the same physical standing point. Group
  // at the SVG's existing 0.001 mm serialization precision, including the pole
  // where every date collapses to the centre. Do not change the model values.
  const grouped = new Map<number, { offsetMm: number; labels: string[] }>();
  for (const mark of dial.dateScale) {
    const key = Number((m.centerY - mark.offsetMm).toFixed(3));
    const group = grouped.get(key);
    if (group) group.labels.push(mark.label);
    else grouped.set(key, { offsetMm: mark.offsetMm, labels: [mark.label] });
  }
  const calendar = [...grouped.values()].sort((a, b) => b.offsetMm - a.offsetMm);
  const useCalendarKey = calendar.length !== dial.dateScale.length || calendar.some((mark, i) =>
    i > 0 && calendar[i - 1]!.offsetMm - mark.offsetMm < 3.8);
  // A separate footer keeps the selected-date legend away from physical hour
  // points and calendar marks. Wrap small printed designs at readable font sizes.
  const footer: { text: string; size: number; italic?: boolean; lineHeight?: number }[] = [];
  if (opts.selectedDateMark || useCalendarKey) {
    const captions = [
      ...(opts.title ? [{ text: opts.title, size: 4.5 }] : []),
      ...(opts.motto ? [{ text: opts.motto.latin, size: 3.6, italic: true }] : []),
      ...(opts.selectedDateMark ? [
        { text: opts.selectedDateMark.localLabel, size: 2.6 },
        { text: `Open ring: rod base ${opts.selectedDateMark.positionLabel}`, size: 2.6 },
      ] : []),
      ...(useCalendarKey ? [
        { text: "Calendar key (approximate declinations)", size: 2.6, lineHeight: 4.5 },
        ...calendar.map((mark, i) => ({ text: `${String.fromCharCode(65 + i)}: ${mark.labels.join(" / ")}`, size: 2.6, lineHeight: 4.5 })),
      ] : []),
    ];
    for (const caption of captions) {
      const limit = Math.max(1, Math.floor((opts.widthMm - 12) / (caption.size * 0.75)));
      let line = "";
      for (const word of caption.text.split(/\s+/)) {
        if (line && line.length + word.length + 1 > limit) { footer.push({ ...caption, text: line }); line = ""; }
        line += (line ? " " : "") + word;
      }
      if (line) footer.push({ ...caption, text: line });
    }
  }
  const heightMm = opts.heightMm + (footer.length ? footer.reduce((height, row) => height + (row.lineHeight ?? 6), 0) + 10 : 0);
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${opts.widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${opts.widthMm} ${heightMm}" font-family="'Cormorant Garamond', Georgia, serif">`);
  if (opts.title) parts.push(`<title>${esc(opts.title)}</title>`);
  if (opts.description) parts.push(`<desc>${esc(opts.description)}</desc>`);
  if (c.background !== "none") parts.push(`<rect width="${opts.widthMm}" height="${heightMm}" fill="${c.background}"/>`);

  parts.push(
    `<ellipse cx="${m.centerX}" cy="${m.centerY}" rx="${dial.semiMajorMm}" ry="${dial.semiMinorMm}" fill="none" stroke="${c.frame}" stroke-width="0.4"/>`,
  );

  for (const p of dial.hourPoints) {
    const pt = toPage(p.y, p.x, m); // u = north/south (y), v = east/west (x)
    const r = p.isMajor ? 1.1 : 0.6;
    parts.push(`<circle cx="${pt.x.toFixed(3)}" cy="${pt.y.toFixed(3)}" r="${r}" fill="${p.isMajor ? c.hourLineMajor : c.hourLineMinor}"/>`);
    if (p.isMajor) {
      const labelPt = toPage(p.y * 1.13 + Math.sign(p.y || 1) * 3, p.x * 1.13, m);
      // On a 30 mm polar-limit ellipse, the noon label's ink otherwise
      // extends above the canvas. This moves only text, not the hour dot.
      const labelY = Math.max(2.8, labelPt.y);
      parts.push(
        `<text x="${labelPt.x.toFixed(3)}" y="${labelY.toFixed(3)}" font-size="4" fill="${c.text}" text-anchor="middle" dominant-baseline="middle">${esc(hourLabel(p.hour, opts.numerals, opts.romanStyle))}</text>`,
      );
    }
  }

  // Date scale, along the minor (north-south) axis.
  if (useCalendarKey && calendar.length) {
    // Keep callouts in order and spread only their labels. Thin physical ticks
    // retain the standing positions, even when the larger old dots overlapped.
    const labels = calendar.map(mark => m.centerY - mark.offsetMm);
    for (let i = 1; i < labels.length; i++) labels[i] = Math.max(labels[i]!, labels[i - 1]! + 3.8);
    const labelMiddle = (labels[0]! + labels[labels.length - 1]!) / 2;
    const scaleMiddle = m.centerY - (calendar[0]!.offsetMm + calendar[calendar.length - 1]!.offsetMm) / 2;
    const shift = labelMiddle - scaleMiddle;
    for (const [i, mark] of calendar.entries()) {
      const y = m.centerY - mark.offsetMm;
      const labelY = labels[i]! - shift;
      const key = String.fromCharCode(65 + i);
      parts.push(`<g data-calendar-key="${key}"><title>${esc(mark.labels.join(" / "))}</title>`);
      parts.push(`<path d="M ${(m.centerX - 1.2).toFixed(3)} ${y.toFixed(3)} H ${(m.centerX + 1.2).toFixed(3)}" fill="none" stroke="${c.declinationLine}" stroke-width="0.18"/>`);
      parts.push(`<path d="M ${(m.centerX + 1.2).toFixed(3)} ${y.toFixed(3)} L ${(m.centerX + 3).toFixed(3)} ${labelY.toFixed(3)}" fill="none" stroke="${c.mutedText}" stroke-width="0.15"/>`);
      parts.push(`<text x="${(m.centerX + 4).toFixed(3)}" y="${labelY.toFixed(3)}" font-size="2.6" fill="${c.mutedText}" dominant-baseline="middle">${key}</text></g>`);
    }
  } else {
    for (const mark of dial.dateScale) {
      const pt = toPage(mark.offsetMm, 0, m);
      parts.push(`<circle cx="${pt.x.toFixed(3)}" cy="${pt.y.toFixed(3)}" r="0.8" fill="${c.declinationLine}"/>`);
      parts.push(
        `<text x="${(pt.x + 4).toFixed(3)}" y="${pt.y.toFixed(3)}" font-size="2.6" fill="${c.mutedText}" dominant-baseline="middle">${esc(mark.label)}</text>`,
      );
    }
  }

  parts.push(`<circle cx="${m.centerX}" cy="${m.centerY}" r="0.6" fill="${c.text}"/>`);

  if (opts.selectedDateMark) {
    const mark = opts.selectedDateMark;
    const pt = toPage(mark.offsetMm, 0, m);
    parts.push(`<g><title>${esc(`${mark.localLabel}: rod base ${mark.positionLabel}`)}</title><circle data-selected-minute="${esc(mark.utcInstant).replace(/"/g, "&quot;")}" cx="${pt.x.toFixed(3)}" cy="${pt.y.toFixed(3)}" r="1.6" fill="none" stroke="${c.text}" stroke-width="0.3"/></g>`);
  }
  let footerY = opts.heightMm + 6;
  for (const row of footer) {
    parts.push(`<text x="${m.centerX}" y="${footerY}" font-size="${row.size}"${row.italic ? ' font-style="italic"' : ''} fill="${c.mutedText}" text-anchor="middle">${esc(row.text)}</text>`);
    footerY += row.lineHeight ?? 6;
  }

  if (opts.title && !footer.length) {
    parts.push(
      `<text x="${m.centerX}" y="${opts.heightMm - 6}" font-size="4.5" fill="${c.mutedText}" text-anchor="middle" letter-spacing="0.5">${esc(opts.title)}</text>`,
    );
  }
  if (opts.motto && !footer.length) {
    parts.push(
      `<text x="${m.centerX}" y="${opts.heightMm - 1.5}" font-style="italic" font-size="3.6" fill="${c.mutedText}" text-anchor="middle">${esc(opts.motto.latin)}</text>`,
    );
  }
  parts.push("</svg>");
  return parts.join("");
}
