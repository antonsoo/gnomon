import { dot, hourLineAngle, styleAxisForPlane } from "../geometry.ts";
import type { DialPlane } from "../geometry.ts";
import { hourAngleForClock } from "../time-reference.ts";
import type { TimeReference } from "../time-reference.ts";
import type { GnomonTemplate, HourLine } from "./types.ts";

export interface HourLineOptions {
  /** Earliest and latest civil clock hour to draw, decimal (e.g. 4, 20). */
  startHour: number;
  endHour: number;
  /** Smallest hour subdivision to draw: 1 (whole), 0.5, or 0.25. */
  stepHours: 1 | 0.5 | 0.25;
}

export function generateHourLines(latDeg: number, plane: DialPlane, ref: TimeReference, opts: HourLineOptions): HourLine[] {
  const lines: HourLine[] = [];
  const steps = Math.round((opts.endHour - opts.startHour) / opts.stepHours);
  for (let i = 0; i <= steps; i++) {
    const hour = opts.startHour + i * opts.stepHours;
    const hourAngleDeg = hourAngleForClock(hour, ref);
    const angleRad = hourLineAngle(latDeg, hourAngleDeg, plane);
    if (angleRad === null) continue;
    lines.push({ hour, angleRad, isMajor: Math.abs(hour - Math.round(hour)) < 1e-9 });
  }
  return lines;
}

/**
 * Style height (angle of the gnomon's edge above the dial face) and the
 * substyle angle (where the style's own shadow-casting foot line sits,
 * measured from the reference `u` axis) -- both fall out of the same style
 * vector used for the hour lines, projected onto/against the dial plane.
 */
export function computeGnomon(
  latDeg: number,
  plane: DialPlane,
  sizeMm: number,
  nodusDistanceMm?: number,
): GnomonTemplate {
  if (!Number.isFinite(sizeMm) || sizeMm <= 0
    || nodusDistanceMm !== undefined && (!Number.isFinite(nodusDistanceMm) || nodusDistanceMm < 0)) {
    throw new Error("Gnomon dimensions must be finite and positive (the nodus may be at the foot).");
  }
  const signedStyle = styleAxisForPlane(latDeg, plane);
  const normal = Math.max(0, dot(signedStyle, plane.normal));
  const uComp = dot(signedStyle, plane.u);
  const vComp = dot(signedStyle, plane.v);
  const along = Math.hypot(uComp, vComp);
  // atan2 retains the small in-plane component near 90 degrees. A threshold
  // such as 89.9 must not silently turn a leaning style into a normal rod.
  const styleHeightDeg = Math.atan2(normal, along) * 180 / Math.PI;
  const substyleAngleDeg = (Math.atan2(vComp, uComp) * 180) / Math.PI;
  // Bound BOTH legs, rather than holding the base constant as tan(angle)
  // tends to infinity. Extending to an explicitly requested nodus takes
  // precedence over that size envelope; the date curves never move.
  const styleLengthMm = Math.max(sizeMm / Math.max(normal, along), nodusDistanceMm ?? 0);
  const baseLengthMm = along < 1e-12 ? 0 : along * styleLengthMm;
  const heightMm = normal * styleLengthMm;
  return { styleHeightDeg, substyleAngleDeg, baseLengthMm, heightMm, styleLengthMm, nodusDistanceMm };
}
