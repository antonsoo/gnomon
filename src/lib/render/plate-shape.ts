/**
 * Where a horizontal or vertical dial's hour lines actually reach (the
 * angular range illuminated above the horizon on some date, see
 * `hourLineAngle` in `geometry.ts`) is rarely +/-90
 * degrees -- at most latitudes the longest day pushes early-morning and
 * late-evening lines well past the noon-to-side quarter circle. A dial
 * plate shaped as a full circle around a centred root therefore wastes
 * most of the "far" side (no hour line ever reaches it) while crowding
 * every real line into a narrow wedge -- exactly what a classic antique
 * horizontal dial's shield/fan-shaped plate avoids by cutting the plate
 * to the wedge that is actually used, with the root at its point.
 *
 * This module computes that wedge (and the plain circle alternative) as
 * plain geometry, shared by the SVG and PDF renderers.
 */

import type { PolarDialResult } from "../dials/types.ts";

export type PlateShape = "fan" | "circle";

/** The largest |hour-line angle| the dial actually uses, radians. Falls back to a quarter turn if there are no lines (e.g. all-null at an extreme latitude). */
export function thetaMaxRad(dial: PolarDialResult): number {
  let max = 0;
  for (const line of dial.hourLines) max = Math.max(max, Math.abs(line.angleRad));
  return max || Math.PI / 2;
}

/** Smallest sector containing all hour rays, including fans crossing +/-pi. */
export function plateSector(dial: PolarDialResult): { thetaMax: number; thetaCenter: number } {
  const turn = 2 * Math.PI;
  const angles = dial.hourLines.map((line) => (line.angleRad + turn) % turn).sort((a, b) => a - b);
  if (!angles.length) return { thetaMax: Math.PI / 2, thetaCenter: 0 };
  let largestGap = -1;
  let start = angles[0]!;
  for (let i = 0; i < angles.length; i++) {
    const next = angles[(i + 1) % angles.length]! + (i === angles.length - 1 ? turn : 0);
    const gap = next - angles[i]!;
    if (gap > largestGap) { largestGap = gap; start = next % turn; }
  }
  const thetaMax = (turn - largestGap) / 2;
  return { thetaMax, thetaCenter: (start + thetaMax) % turn };
}

export function withinSector(angle: number, thetaMax: number, thetaCenter: number): boolean {
  return Math.abs(Math.atan2(Math.sin(angle - thetaCenter), Math.cos(angle - thetaCenter))) <= thetaMax + 1e-9;
}

export interface PlateBounds {
  /** Greatest u reached, including the root. */
  topU: number;
  /** Least u reached, including the root. */
  bottomU: number;
  /** Half the plate's east-west extent. */
  halfWidth: number;
}

export function plateBounds(shape: PlateShape, labelRadius: number, thetaMax: number, thetaCenter = 0): PlateBounds {
  if (shape === "circle") {
    return { topU: labelRadius, bottomU: -labelRadius, halfWidth: labelRadius };
  }
  const angles = [thetaCenter - thetaMax, thetaCenter + thetaMax, ...[0, Math.PI / 2, Math.PI, 3 * Math.PI / 2].filter((a) => withinSector(a, thetaMax, thetaCenter))];
  const topU = Math.max(0, ...angles.map((a) => labelRadius * Math.cos(a)));
  const bottomU = Math.min(0, ...angles.map((a) => labelRadius * Math.cos(a)));
  const halfWidth = Math.max(...angles.map((a) => Math.abs(labelRadius * Math.sin(a))));
  return { topU, bottomU, halfWidth };
}

/** Sample points around the plate outline in (u, v) space, root-relative, closed (first === last). For "fan" this is the arc plus the two straight sides back to the root; for "circle" it's just the circle. */
export function plateOutline(shape: PlateShape, radius: number, thetaMax: number, arcSteps = 96, thetaCenter = 0): { u: number; v: number }[] {
  if (shape === "circle") {
    const pts: { u: number; v: number }[] = [];
    for (let i = 0; i <= arcSteps; i++) {
      const a = (2 * Math.PI * i) / arcSteps;
      pts.push({ u: radius * Math.cos(a), v: radius * Math.sin(a) });
    }
    return pts;
  }
  const pts: { u: number; v: number }[] = [{ u: 0, v: 0 }];
  for (let i = 0; i <= arcSteps; i++) {
    const a = thetaCenter - thetaMax + (2 * thetaMax * i) / arcSteps;
    pts.push({ u: radius * Math.cos(a), v: radius * Math.sin(a) });
  }
  pts.push({ u: 0, v: 0 });
  return pts;
}
