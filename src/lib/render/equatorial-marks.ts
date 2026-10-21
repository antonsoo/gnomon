import type { PolarDialResult } from "../dials/types.ts";
import { polarToUV } from "./project.ts";

/** The foot plus one asymmetric target locates the two prints on one backing. */
export function equatorialAlignmentMark(dial: PolarDialResult, radiusMm: number) {
  const face = dial.equatorial;
  if (!face) return null;
  const sign = face.face === "pole-facing" ? 1 : -1;
  const poleCenter = face.cutSector.thetaCenter * sign;
  // Keep A's physical position, rather than independently placing it to the
  // right on each viewed face. Its paper coordinate must mirror on the back.
  return polarToUV(sign * (poleCenter + face.cutSector.thetaMax / 3), radiusMm + 4);
}
