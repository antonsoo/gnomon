/**
 * The solar ephemeris against an independent one: the Sun's apparent
 * declination and the equation of time from Skyfield + JPL DE421
 * (scripts/solar_oracle.py), at 12:00 UTC every 17 days, 1900-2050.
 * Measured when the fixture was generated: declination within 0.0034 deg,
 * equation of time within 3.8 s. The tolerances leave a little headroom.
 */
import { describe, expect, it } from "vitest";
import { solarEphemeris } from "../src/lib/astronomy.ts";
import raw from "./fixtures/solar-oracle.json";

interface Fixture {
  source: string;
  points: Array<[string, number, number]>;
}

const fixture = raw as unknown as Fixture;

describe("solar ephemeris vs Skyfield + DE421", () => {
  it("covers 1900-2050", () => {
    expect(fixture.points.length).toBeGreaterThan(3000);
    expect(fixture.points[0]?.[0]).toBe("1900-01-01T12:00:00Z");
  });

  it("matches apparent declination within 0.005 deg and the equation of time within 5 s", () => {
    let worstDec = 0;
    let worstEotSec = 0;
    for (const [utc, dec, eotMin] of fixture.points) {
      const e = solarEphemeris(new Date(utc));
      worstDec = Math.max(worstDec, Math.abs(e.declinationDeg - dec));
      worstEotSec = Math.max(worstEotSec, Math.abs(e.equationOfTimeMin - eotMin) * 60);
    }
    expect(worstDec).toBeLessThan(0.005);
    expect(worstEotSec).toBeLessThan(5);
  });
});
