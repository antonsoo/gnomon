import { describe, expect, it } from "vitest";
import { CITIES } from "../src/lib/cities.ts";
import { equationOfTimeCurve, equationOfTimeTable } from "../src/lib/equation-of-time.ts";
import { MOTTOES } from "../src/lib/motto.ts";
import { hourLabel, toRomanNumeral } from "../src/lib/render/numerals.ts";

describe("equation of time", () => {
  it("the table has one row per requested day of each month", () => {
    const rows = equationOfTimeTable(2026, [1, 15]);
    expect(rows).toHaveLength(24);
    expect(rows[0]!.label).toBe("1 Jan");
  });

  it("the daily curve covers the year and stays within known physical bounds (+/- ~16.5 min)", () => {
    const curve = equationOfTimeCurve(2026);
    expect(curve).toHaveLength(365);
    for (const sample of curve) {
      expect(sample.equationOfTimeMin).toBeGreaterThan(-17);
      expect(sample.equationOfTimeMin).toBeLessThan(17);
    }
  });
});

describe("mottoes", () => {
  it("every motto has a non-empty translation and attribution", () => {
    expect(MOTTOES.length).toBeGreaterThan(0);
    for (const m of MOTTOES) {
      expect(m.latin.length).toBeGreaterThan(0);
      expect(m.translation.length).toBeGreaterThan(0);
      expect(m.attribution.length).toBeGreaterThan(0);
    }
  });

  it("marks the classic 'sunny hours' motto as traditional, not attributed to an author", () => {
    const m = MOTTOES.find((x) => x.latin.includes("Horas non numero"));
    expect(m?.attribution).toBe("traditional");
  });
});

describe("city gazetteer", () => {
  it("every city has plausible coordinates and a resolvable IANA time zone", () => {
    for (const c of CITIES) {
      expect(c.latitudeDeg).toBeGreaterThanOrEqual(-90);
      expect(c.latitudeDeg).toBeLessThanOrEqual(90);
      expect(c.longitudeDeg).toBeGreaterThanOrEqual(-180);
      expect(c.longitudeDeg).toBeLessThanOrEqual(180);
      expect(() => new Intl.DateTimeFormat("en-US", { timeZone: c.timeZone })).not.toThrow();
    }
  });

  it("includes the historic astronomy sites the brief calls for", () => {
    const names = CITIES.map((c) => c.name);
    for (const expected of ["Alexandria", "Athens", "Rome", "Babylon", "Samarkand", "Jaipur"]) {
      expect(names.some((n) => n.includes(expected))).toBe(true);
    }
  });
});

describe("numerals", () => {
  it("uses the traditional clock-face IIII for 4 by default, not IV", () => {
    expect(toRomanNumeral(4)).toBe("IIII");
    expect(toRomanNumeral(4, "IV")).toBe("IV");
  });

  it("folds 24-hour values into the repeating 1-12 dial face", () => {
    expect(hourLabel(0, "arabic")).toBe("12");
    expect(hourLabel(13, "arabic")).toBe("1");
    expect(hourLabel(12, "roman")).toBe("XII");
  });

  it("renders quarter-hour fractions", () => {
    expect(hourLabel(3.25, "arabic")).toBe("3¼");
    expect(hourLabel(3.5, "arabic")).toBe("3½");
    expect(hourLabel(3.75, "arabic")).toBe("3¾");
  });
});
