import { expect, it } from "vitest";
import { buildAnalemmaticDial } from "../src/lib/dials/analemmatic.ts";

const signs = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];

it("the standing scale covers all twelve tropical sign entries, including the southern intermediate pair", () => {
  const dial = buildAnalemmaticDial({ latitudeDeg: -33.8688, semiMajorMm: 90,
    startHour: 4, endHour: 20, stepHours: 1, includeZodiac: true });
  const names = dial.dateScale.map(mark => mark.label).join(" / ").split(" / ");
  for (const sign of signs) expect(names).toContain(sign);
  // Rotate a zero-latitude ecliptic Sun vector about the equinox axis.
  // Check the existing rounded zodiac convention, not a new date ephemeris.
  for (const [index, sign] of signs.entries()) {
    const mark = dial.dateScale.find(mark => mark.label.split(" / ").includes(sign));
    const z = Math.sin(23.44 * Math.PI / 180) * Math.sin(index * 30 * Math.PI / 180);
    const declination = Math.asin(z) * 180 / Math.PI;
    expect(Math.abs(mark!.declinationDeg - declination)).toBeLessThan(0.06);
    const recovered = Math.atan(mark!.offsetMm / (90 * Math.cos(-33.8688 * Math.PI / 180))) * 180 / Math.PI;
    expect(recovered).toBeCloseTo(mark!.declinationDeg, 10);
  }
});
