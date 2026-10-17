import type { PlanePoint } from "../dials/types.ts";
import { withinSector, type PlateShape } from "./plate-shape.ts";

/** Keep sampled curve runs inside the cut plate; never bridge a missing run. */
export function clipCurve(points: (PlanePoint | null)[], radius: number, shape: PlateShape, thetaMax: number, thetaCenter: number): PlanePoint[][] {
  const runs: PlanePoint[][] = [];
  let current: PlanePoint[] = [];
  for (const p of points) {
    if (p !== null && Math.hypot(p.u, p.v) <= radius && (shape === "circle" || withinSector(Math.atan2(p.v, p.u), thetaMax, thetaCenter))) {
      current.push(p);
    } else {
      if (current.length >= 2) runs.push(current);
      current = [];
    }
  }
  if (current.length >= 2) runs.push(current);
  return runs;
}
