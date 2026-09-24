import { describe, expect, it } from "vitest";
import { buildHorizontalDial } from "../src/lib/dials/horizontal.ts";
import { buildVerticalDial } from "../src/lib/dials/vertical.ts";
import { generateHistoricalHours } from "../src/lib/dials/historical-hours.ts";
import { buildDialPlane } from "../src/lib/dials/plane.ts";
import { toRoman } from "../src/lib/dials/historical-hours.ts";

const APPARENT = { mode: "apparent" as const, longitudeDeg: 0 };

describe("declination lines", () => {
  it("the equinox line is a straight line (the sun sits on the celestial equator all day)", () => {
    const dial = buildHorizontalDial({
      latitudeDeg: 45,
      timeReference: APPARENT,
      hourLineOptions: { startHour: 4, endHour: 20, stepHours: 1 },
      nodusDistanceMm: 30,
      gnomonBaseLengthMm: 60,
    });
    const equinox = dial.declinationLines.find((l) => l.kind === "equinox");
    expect(equinox).toBeDefined();
    const pts = equinox!.points;
    expect(pts.length).toBeGreaterThan(5);

    // Colinearity: every point's cross product with the first-to-last
    // chord should be ~0 (within floating tolerance relative to the
    // dial's scale).
    const a = pts[0]!;
    const b = pts[pts.length - 1]!;
    const dx = b.u - a.u;
    const dy = b.v - a.v;
    const scale = Math.hypot(dx, dy) || 1;
    for (const p of pts) {
      const cross = (p.u - a.u) * dy - (p.v - a.v) * dx;
      expect(Math.abs(cross) / scale).toBeLessThan(1e-6);
    }
  });

  it("summer and winter solstice lines are distinct curves, both centred on the noon line", () => {
    const dial = buildVerticalDial({
      latitudeDeg: 45,
      wallDeclinationDeg: 0,
      timeReference: APPARENT,
      hourLineOptions: { startHour: 6, endHour: 18, stepHours: 1 },
      nodusDistanceMm: 30,
      gnomonBaseLengthMm: 60,
    });
    const summer = dial.declinationLines.find((l) => l.kind === "solstice-summer")!;
    const winter = dial.declinationLines.find((l) => l.kind === "solstice-winter")!;
    expect(summer.points.length).toBeGreaterThan(3);
    expect(winter.points.length).toBeGreaterThan(3);

    // Both curves are symmetric about the noon line (v = 0): the point
    // swept at hour angle +H should mirror the one at -H.
    for (const line of [summer, winter]) {
      const first = line.points[0]!;
      const last = line.points[line.points.length - 1]!;
      expect(first.v).toBeCloseTo(-last.v, 3);
      expect(first.u).toBeCloseTo(last.u, 3);
    }
    // The two curves are not the same curve.
    const summerNoon = summer.points[Math.floor(summer.points.length / 2)]!;
    const winterNoon = winter.points[Math.floor(winter.points.length / 2)]!;
    expect(Math.abs(summerNoon.u - winterNoon.u)).toBeGreaterThan(1);
  });
});

describe("historical hour curves", () => {
  const plane = buildDialPlane("horizontal", 45);

  it("temporal hours produce curves for I-XI (XII falls exactly at sunset, a grazing/no-shadow boundary)", () => {
    const curves = generateHistoricalHours(45, plane, 30, ["temporal"]);
    const indices = new Set(curves.map((c) => c.hourIndex));
    // Hour XII is defined as exactly sunset for every date by construction
    // (-h0 + 12*(2*h0/12) = h0), so the sun is always exactly on the
    // horizon there -- correctly no usable shadow, not a bug.
    expect(indices).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]));
    for (const c of curves) expect(c.points.length).toBeGreaterThan(2);
  });

  it("Babylonian and Italian hours produce curves only where the sun is above the horizon", () => {
    const babylonian = generateHistoricalHours(45, plane, 30, ["babylonian"]);
    const italian = generateHistoricalHours(45, plane, 30, ["italian"]);
    expect(babylonian.length).toBeGreaterThan(0);
    expect(italian.length).toBeGreaterThan(0);
    // Babylonian hour 1 (just after sunrise) should exist for far more of
    // the year than hour 15 (only exists on long summer days).
    const hour1 = babylonian.find((c) => c.hourIndex === 1)!;
    const hour15 = babylonian.find((c) => c.hourIndex === 15);
    expect(hour1.points.length).toBeGreaterThan(hour15?.points.length ?? 0);
  });

  it("toRoman renders the traditional sundial sequence I-XII", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(toRoman)).toEqual([
      "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII",
    ]);
  });
});
