import { describe, expect, it } from "vitest";
import { buildEquatorialDial } from "../src/lib/dials/equatorial.ts";
import { buildEquatorialPlane } from "../src/lib/dials/plane.ts";
import { nodusShadow } from "../src/lib/geometry.ts";
import { plateOutline } from "../src/lib/render/plate-shape.ts";
import { polarHourMarks } from "../src/lib/render/hour-marks.ts";
import { equatorialAlignmentMark } from "../src/lib/render/equatorial-marks.ts";
import { exportConstructionPDF } from "../src/lib/export/pdf.ts";
import { planConstructionPrint } from "../src/lib/export/print-layout.ts";

const common = { latitudeDeg: 45, timeReference: { mode: "apparent" as const, longitudeDeg: 0 },
  hourLineOptions: { startHour: 3, endHour: 21, stepHours: 0.25 as const },
  nodusDistanceMm: 20, gnomonBaseLengthMm: 50 };

describe("two viewed equatorial faces", () => {
  it.each([[-45, "pole-facing", -23.44, 1], [-45, "opposite", 23.44, -1],
    [45, "pole-facing", 23.44, -1], [45, "opposite", -23.44, 1]] as const)(
    "casts the 15:00 nodus shadow at latitude %s on %s", (latitudeDeg, face, declinationDeg, side) => {
      const plane = buildEquatorialPlane(latitudeDeg, face);
      const shadow = nodusShadow(latitudeDeg, declinationDeg, 45, plane, 20)!;
      // An equatorial disc sees a circular nodus path of radius d*cot(|delta|).
      // At 15:00 the ray is 45 degrees from downward noon on the specified side.
      const component = 20 / Math.tan(23.44 * Math.PI / 180) / Math.SQRT2;
      expect(shadow.u).toBeCloseTo(-component, 9);
      expect(shadow.v).toBeCloseTo(side * component, 9);
      expect(nodusShadow(latitudeDeg, -declinationDeg, 45, plane, 20)).toBeNull();
      expect(nodusShadow(latitudeDeg, 0, 45, plane, 20)).toBeNull();
    });

  it.each([-78, -33.9, 0, 37.7749, 78])("fits both faces to one asymmetric fan at %s", (latitudeDeg) => {
    const pole = buildEquatorialDial({ ...common, latitudeDeg,
      timeReference: { mode: "standard", longitudeDeg: -122.4194, zoneMeridianDeg: -120, dstOffsetHours: 1 } });
    const opposite = pole.equatorial!.counterpart!;
    const a = polarHourMarks(pole, 80), b = polarHourMarks(opposite, 80);
    const front = plateOutline("fan", 80, a.thetaMax, 96, a.thetaCenter);
    const back = plateOutline("fan", 80, b.thetaMax, 96, b.thetaCenter).reverse();
    for (const [i, p] of front.entries()) {
      expect(back[i]!.u).toBeCloseTo(p.u, 9);
      expect(back[i]!.v).toBeCloseTo(-p.v, 9);
    }
    const targetA = equatorialAlignmentMark(pole, 80)!;
    const targetB = equatorialAlignmentMark(opposite, 80)!;
    expect(targetB.u).toBeCloseTo(targetA.u, 9);
    expect(targetB.v).toBeCloseTo(-targetA.v, 9);
    expect(opposite.equatorial!.counterpart).toBeUndefined();
    expect(() => JSON.stringify(pole)).not.toThrow();
  });

  it("retains the requested face and reverses the calendar in the southern hemisphere", () => {
    const north = buildEquatorialDial(common);
    const south = buildEquatorialDial({ ...common, latitudeDeg: -45, face: "opposite" });
    expect(north.equatorial!.illuminated).toBe("March equinox to September equinox");
    expect(south.equatorial!.face).toBe("opposite");
    expect(south.equatorial!.illuminated).toBe(north.equatorial!.illuminated);
    expect(south.equatorial!.counterpart!.equatorial!.face).toBe("pole-facing");
  });

  it.each([-90, 90])("has a finite meridian reference at geographic pole %s", (latitudeDeg) => {
    const dial = buildEquatorialDial({ ...common, latitudeDeg });
    expect(dial.hourLines.length).toBeGreaterThan(20);
    expect(dial.equatorial!.counterpart!.hourLines).toHaveLength(0);
    expect(dial.hourLines.every(line => Number.isFinite(line.angleRad))).toBe(true);
  });

  it("refuses an invalid face or latitude", () => {
    expect(() => buildEquatorialDial({ ...common, face: "both" as "opposite" })).toThrow("face");
    for (const latitudeDeg of [NaN, Infinity, -91, 91]) expect(() => buildEquatorialDial({ ...common, latitudeDeg })).toThrow("Latitude");
  });
});

describe("downloadable equatorial construction kits", () => {
  for (const format of ["a4", "letter"] as const) for (const radiusMm of [80, 150, 400]) {
    it(`keeps both viewed faces and rod instructions at ${radiusMm} mm on ${format}`, () => {
      const dial = buildEquatorialDial({ ...common, gnomonBaseLengthMm: radiusMm * 0.62 });
      const opts = { radiusMm, innerRadiusMm: 6, plateShape: "fan" as const, numerals: "arabic" as const, format };
      const plan = planConstructionPrint(dial, opts);
      const pdf = new TextDecoder().decode(exportConstructionPDF(dial, opts));
      expect(pdf).toContain(`/Count ${plan.pageCount}\n`);
      expect(pdf).toContain("P | Pole-facing face");
      expect(pdf).toContain("O | Opposite face");
      expect(pdf).toContain("exposed on EACH side");
      expect(pdf).toContain("not automatic duplex");
      expect(pdf.match(/100 mm calibration - verify before cutting/g)).toHaveLength(plan.pageCount);
      if (plan.plate.tiled) {
        expect(pdf).toContain("P-R1C1");
        expect(pdf).toContain("O-R1C1");
      }
    });
  }
});
