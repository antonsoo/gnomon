import { expect, it } from "vitest";
import { generateHistoricalHours } from "../src/lib/dials/historical-hours.ts";
import { buildDialPlane } from "../src/lib/dials/plane.ts";
import { historicalOracle, type HourSystem } from "./historical-oracle.ts";

it.each([-78, -66, -45, -10, 10, 37.7749, 45, 66, 78])(
  "retains every usable published historical hour at latitude %s", (latitude) => {
    const systems: HourSystem[] = ["temporal", "babylonian", "italian"];
    const actual = generateHistoricalHours(latitude, buildDialPlane("horizontal", latitude), 32, systems);
    for (const system of systems) {
      const curves = actual.filter((curve) => curve.system === system);
      const expected = historicalOracle(latitude, 32, system);
      expect(curves.map((curve) => curve.hourIndex), system).toEqual(expected.map((curve) => curve.hourIndex));
      for (const [index, curve] of curves.entries()) {
        const reference = expected[index]!;
        expect(curve.points.length).toBe(reference.points.length);
        for (const [pointIndex, point] of curve.points.entries()) {
          const target = reference.points[pointIndex]!;
          const error = Math.hypot(point.u - target.u, point.v - target.v);
          expect(error).toBeLessThan(2e-8 + Math.hypot(target.u, target.v) * 1e-10);
        }
      }
    }
  },
);
