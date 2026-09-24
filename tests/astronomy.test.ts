import { describe, expect, it } from "vitest";
import { altAzFromHourAngle, solarEphemeris } from "../src/lib/astronomy.ts";

describe("solarEphemeris", () => {
  it("declination near +23.44 deg at the June solstice", () => {
    const { declinationDeg } = solarEphemeris(new Date("2026-06-21T12:00:00Z"));
    expect(declinationDeg).toBeGreaterThan(23.3);
    expect(declinationDeg).toBeLessThan(23.45);
  });

  it("declination near -23.44 deg at the December solstice", () => {
    const { declinationDeg } = solarEphemeris(new Date("2026-12-21T12:00:00Z"));
    expect(declinationDeg).toBeLessThan(-23.3);
    expect(declinationDeg).toBeGreaterThan(-23.45);
  });

  it("declination near 0 at the equinoxes", () => {
    const march = solarEphemeris(new Date("2026-03-20T12:00:00Z"));
    const september = solarEphemeris(new Date("2026-09-23T00:00:00Z"));
    expect(Math.abs(march.declinationDeg)).toBeLessThan(0.6);
    expect(Math.abs(september.declinationDeg)).toBeLessThan(0.6);
  });

  it("equation of time reaches its known February minimum (about -14 min)", () => {
    const { equationOfTimeMin } = solarEphemeris(new Date("2026-02-11T12:00:00Z"));
    expect(equationOfTimeMin).toBeLessThan(-13);
    expect(equationOfTimeMin).toBeGreaterThan(-15);
  });

  it("equation of time reaches its known early-November maximum (about +16.4 min)", () => {
    const { equationOfTimeMin } = solarEphemeris(new Date("2026-11-03T12:00:00Z"));
    expect(equationOfTimeMin).toBeGreaterThan(15.5);
    expect(equationOfTimeMin).toBeLessThan(17);
  });
});

describe("altAzFromHourAngle", () => {
  it("puts the sun due south at solar noon north of the tropics", () => {
    const { azimuthDeg, altitudeDeg } = altAzFromHourAngle(45, 10, 0);
    expect(azimuthDeg).toBeCloseTo(180, 5);
    expect(altitudeDeg).toBeCloseTo(90 - 45 + 10, 5);
  });

  it("puts the sun due north at solar noon south of the tropics", () => {
    const { azimuthDeg, altitudeDeg } = altAzFromHourAngle(-45, -10, 0);
    expect(azimuthDeg).toBeCloseTo(0, 5);
    expect(altitudeDeg).toBeCloseTo(90 - Math.abs(-45 - -10), 5);
  });

  it("gives exactly 90 deg sunrise/sunset hour angle at the equinox, any latitude", () => {
    for (const lat of [-70, -20, 0.1, 35, 80]) {
      const { altitudeDeg } = altAzFromHourAngle(lat, 0, 90);
      expect(altitudeDeg).toBeCloseTo(0, 6);
    }
  });
});
