import { describe, expect, it } from "vitest";
import { buildVerticalDial } from "../src/lib/dials/vertical.ts";
import { buildHorizontalDial } from "../src/lib/dials/horizontal.ts";
import { buildEquatorialDial } from "../src/lib/dials/equatorial.ts";
import { buildDialPlane } from "../src/lib/dials/plane.ts";
import { computeGnomon } from "../src/lib/dials/common.ts";
import { nodusShadow, projectOntoPlane, styleAxisForPlane, dot } from "../src/lib/geometry.ts";
import { plateBounds, plateOutline, plateSector, withinSector } from "../src/lib/render/plate-shape.ts";

const common = { latitudeDeg: 45, timeReference: { mode: "apparent" as const, longitudeDeg: 0 }, hourLineOptions: { startHour: 6, endHour: 18, stepHours: 1 as const }, nodusDistanceMm: 30, gnomonBaseLengthMm: 60 };

describe("physical rays, with hand-derived wall coordinates", () => {
  // At 45N on a south wall the 30mm style ends at (E=0,N=-30/sqrt(2),U=-30/sqrt(2)).
  // At equinox noon the sun unit vector is (0,-1/sqrt(2),+1/sqrt(2)).
  // Travel 30mm away from the sun to hit N=0: U=-30*sqrt(2), never above the root.
  it.each([[9, -30], [12, 0], [15, 30]])("casts a real equinox shadow at solar hour %s", (hour, expectedEast) => {
    const plane = buildDialPlane("vertical", 45, 0);
    const shadow = nodusShadow(45, 0, (hour - 12) * 15, plane, 30)!;
    expect(shadow.u).toBeCloseTo(-30 * Math.SQRT2, 8);
    expect(shadow.v).toBeCloseTo(expectedEast, 8);
    const dial = buildVerticalDial({ ...common, wallDeclinationDeg: 0 });
    const line = dial.hourLines.find((l) => l.hour === hour)!;
    expect(Math.cos(line.angleRad)).toBeLessThan(0);
    expect(Math.atan2(Math.sin(line.angleRad - Math.atan2(expectedEast, -30 * Math.SQRT2)), Math.cos(line.angleRad - Math.atan2(expectedEast, -30 * Math.SQRT2)))).toBeCloseTo(0, 8);
  });

  it("cannot project a point through a wall towards the light source", () => {
    const plane = buildDialPlane("vertical", 45, 0);
    expect(projectOntoPlane({ x: 0, y: 1, z: 1 }, { x: 0, y: -1, z: 1 }, plane)).toBeNull();
  });

  it("puts the style outside every receiving face and derives its mounting direction from that vector", () => {
    for (const lat of [-75, -33, -1, 1, 37, 75]) for (const wall of [-170, -100, -70, 0, 35, 100, 180]) {
      const plane = buildDialPlane("vertical", lat, wall);
      const axis = styleAxisForPlane(lat, plane);
      expect(dot(axis, plane.normal)).toBeGreaterThan(0);
      const gnomon = computeGnomon(lat, plane, 60);
      expect(gnomon.substyleAngleDeg).toBeCloseTo(Math.atan2(dot(axis, plane.v), dot(axis, plane.u)) * 180 / Math.PI, 8);
    }
    expect(Math.abs(computeGnomon(45, buildDialPlane("vertical", 45, 0), 60).substyleAngleDeg)).toBeCloseTo(180, 8);
  });

  it("has downward noon shadows on equator-facing walls in both hemispheres", () => {
    for (const [lat, wall] of [[45, 0], [-45, 180]]) {
      const shadow = nodusShadow(lat!, 0, 0, buildDialPlane("vertical", lat!, wall!), 30)!;
      expect(shadow.u).toBeCloseTo(-30 * Math.SQRT2, 8);
      expect(shadow.v).toBeCloseTo(0, 8);
    }
  });

  it("reports disc tilt from the plane normal, not the gnomon altitude", () => {
    for (const lat of [-60, -30, 0, 30, 60]) {
      const dial = buildEquatorialDial({ ...common, latitudeDeg: lat });
      const tilt = Math.acos(buildDialPlane("equatorial", lat).normal.z) * 180 / Math.PI;
      expect(dial.orientation).toContain(`${tilt.toFixed(1)}° from horizontal`);
    }
  });

  it("does not fabricate hour lines for a style lying in the plate", () => {
    expect(buildHorizontalDial({ ...common, latitudeDeg: 0 }).hourLines).toHaveLength(0);
    expect(nodusShadow(0, 0, 0, buildDialPlane("horizontal", 0), 30)).toBeNull();
  });

  it("keeps near-normal styles finite without replacing their angle with a perpendicular rod", () => {
    for (const latitudeDeg of [-89.9999, -89.91, -89, 78, 89, 89.91, 89.9999]) {
      const g = buildHorizontalDial({ ...common, latitudeDeg }).gnomon;
      // Reconstruct the casting edge from physical template dimensions.
      const measuredAngle = Math.atan2(g.heightMm, g.baseLengthMm) * 180 / Math.PI;
      expect(measuredAngle).toBeCloseTo(Math.abs(latitudeDeg), 8);
      expect(g.baseLengthMm).toBeGreaterThan(0);
      expect(Math.max(g.baseLengthMm, g.heightMm)).toBeCloseTo(60, 8);
      expect(g.styleLengthMm).toBeGreaterThanOrEqual(g.nodusDistanceMm!);
    }
    const pole = buildHorizontalDial({ ...common, latitudeDeg: 90 }).gnomon;
    expect(pole.baseLengthMm).toBe(0);
    expect(pole.heightMm).toBe(60);
  });

  it("extends a deliberately small style to its nodus without moving the date curves", () => {
    const original = buildHorizontalDial(common);
    const small = buildHorizontalDial({ ...common, gnomonBaseLengthMm: 5 });
    expect(small.gnomon.styleLengthMm).toBe(30);
    expect(Math.hypot(small.gnomon.baseLengthMm, small.gnomon.heightMm)).toBeCloseTo(30, 8);
    expect(small.declinationLines).toEqual(original.declinationLines);
  });
});

describe("cut plates follow the actual hour-ray sector", () => {
  it("puts a direct-south fan below its root, without a full-circle cut through the root", () => {
    const dial = buildVerticalDial({ ...common, wallDeclinationDeg: 0 });
    const sector = plateSector(dial);
    expect(sector.thetaCenter).toBeCloseTo(Math.PI, 8);
    expect(sector.thetaMax).toBeLessThanOrEqual(Math.PI / 2 + 1e-9);
    const bounds = plateBounds("fan", 90, sector.thetaMax, sector.thetaCenter);
    expect(bounds.topU).toBeCloseTo(0, 8);
    expect(bounds.bottomU).toBeCloseTo(-90, 8);
  });

  it("contains every sampled hour ray and outline point in both hemispheres", () => {
    for (const lat of [-60, -20, 20, 60]) for (const wall of [-160, -65, 0, 40, 160]) {
      const dial = buildVerticalDial({ ...common, latitudeDeg: lat, wallDeclinationDeg: wall });
      const { thetaMax, thetaCenter } = plateSector(dial);
      const bounds = plateBounds("fan", 90, thetaMax, thetaCenter);
      for (const line of dial.hourLines) expect(withinSector(line.angleRad, thetaMax, thetaCenter)).toBe(true);
      expect(withinSector(dial.gnomon.substyleAngleDeg * Math.PI / 180, thetaMax, thetaCenter)).toBe(true);
      for (const p of plateOutline("fan", 90, thetaMax, 1000, thetaCenter)) {
        expect(p.u).toBeLessThanOrEqual(bounds.topU + 1e-8);
        expect(p.u).toBeGreaterThanOrEqual(bounds.bottomU - 1e-8);
        expect(Math.abs(p.v)).toBeLessThanOrEqual(bounds.halfWidth + 1e-8);
      }
    }
  });
});

describe("hour rays require daylight on the receiving face", () => {
  it("never includes a ray that only exists with the sun below the horizon", () => {
    for (const lat of [-60, -35, 35, 60]) for (const wall of [-150, -65, 0, 65, 150]) {
      const dial = buildVerticalDial({ ...common, latitudeDeg: lat, wallDeclinationDeg: wall, hourLineOptions: { startHour: 0, endHour: 23, stepHours: 1 } });
      const phi = lat * Math.PI / 180;
      const face = (180 + wall) * Math.PI / 180;
      for (const line of dial.hourLines) {
        const h = (line.hour - 12) * Math.PI / 12;
        // Dense, independent numerical sweep. Work directly in east/north/up;
        // no library sun formula, style vector, or interval solver.
        let visible = false;
        for (let step = 0; step <= 2000; step++) {
          const d = (-23.44 + 46.88 * step / 2000) * Math.PI / 180;
          const east = -Math.cos(d) * Math.sin(h);
          const north = Math.sin(d) * Math.cos(phi) - Math.cos(d) * Math.cos(h) * Math.sin(phi);
          const up = Math.sin(d) * Math.sin(phi) + Math.cos(d) * Math.cos(h) * Math.cos(phi);
          if (up > 0 && east * Math.sin(face) + north * Math.cos(face) > 0) { visible = true; break; }
        }
        expect(visible, `lat=${lat}, wall=${wall}, hour=${line.hour}`).toBe(true);
      }
    }
  });
});
