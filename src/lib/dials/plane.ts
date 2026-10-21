import { makePlane, scale, styleAxisENU, vec3 } from "../geometry.ts";
import type { DialPlane } from "../geometry.ts";
import type { DialKind, EquatorialFace } from "./types.ts";

/** View each side from outside: retain physical page-up and reverse page-right. */
export function buildEquatorialPlane(latitudeDeg: number, face: EquatorialFace = "pole-facing"): DialPlane {
  if (!Number.isFinite(latitudeDeg) || Math.abs(latitudeDeg) > 90) throw new Error("Latitude must be between -90 and 90 degrees.");
  if (face !== "pole-facing" && face !== "opposite") throw new Error("Choose a pole-facing or opposite equatorial face.");
  const pole = styleAxisENU(latitudeDeg);
  const phi = latitudeDeg * Math.PI / 180;
  // This is the projected zenith away from the poles, with a finite meridian
  // reference at the poles themselves (where projecting zenith gives zero).
  return makePlane(vec3(0, 0, 0), face === "pole-facing" ? pole : scale(pole, -1), vec3(0, -Math.sin(phi), Math.cos(phi)));
}

/** The dial-plane construction shared by horizontal.ts, vertical.ts and equatorial.ts, exposed for the live simulator. */
export function buildDialPlane(kind: Exclude<DialKind, "analemmatic">, latitudeDeg: number, wallDeclinationDeg = 0): DialPlane {
  if (kind === "horizontal") return makePlane(vec3(0, 0, 0), vec3(0, 0, 1), vec3(0, 1, 0));
  if (kind === "equatorial") return buildEquatorialPlane(latitudeDeg);
  const faceAzimuthRad = ((180 + wallDeclinationDeg) * Math.PI) / 180;
  const normal = vec3(Math.sin(faceAzimuthRad), Math.cos(faceAzimuthRad), 0);
  return makePlane(vec3(0, 0, 0), normal, vec3(0, 0, 1));
}
