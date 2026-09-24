import { makePlane, styleAxisENU, vec3 } from "../geometry.ts";
import type { DialPlane } from "../geometry.ts";
import type { DialKind } from "./types.ts";

/** The dial-plane construction shared by horizontal.ts, vertical.ts and equatorial.ts, exposed for the live simulator. */
export function buildDialPlane(kind: Exclude<DialKind, "analemmatic">, latitudeDeg: number, wallDeclinationDeg = 0): DialPlane {
  if (kind === "horizontal") return makePlane(vec3(0, 0, 0), vec3(0, 0, 1), vec3(0, 1, 0));
  if (kind === "equatorial") return makePlane(vec3(0, 0, 0), styleAxisENU(latitudeDeg), vec3(0, 0, 1));
  const faceAzimuthRad = ((180 + wallDeclinationDeg) * Math.PI) / 180;
  const normal = vec3(Math.sin(faceAzimuthRad), Math.cos(faceAzimuthRad), 0);
  return makePlane(vec3(0, 0, 0), normal, vec3(0, 0, 1));
}
