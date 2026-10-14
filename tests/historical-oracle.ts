/** Independent horizontal ray intersection and published hour definitions.
 * The 37 declinations match the documented approximation, not an ephemeris.
 * No production astronomy, clock or geometry helper is used.
 */
export type HourSystem = "temporal" | "babylonian" | "italian";

export function historicalOracle(latitudeDeg: number, nodusMm: number, system: HourSystem) {
  const phi = latitudeDeg * Math.PI / 180;
  const north = Math.sign(latitudeDeg) * nodusMm * Math.cos(phi);
  const height = nodusMm * Math.abs(Math.sin(phi));
  const curves: { hourIndex: number; points: { u: number; v: number }[] }[] = [];
  for (let hourIndex = 1; hourIndex <= (system === "temporal" ? 12 : 24); hourIndex++) {
    const points: { u: number; v: number }[] = [];
    for (let sample = 0; sample < 37; sample++) {
      const declination = 23.44 * Math.sin(2 * Math.PI * (sample / 36 - 0.22)) * Math.PI / 180;
      const cosine = -Math.tan(phi) * Math.tan(declination);
      if (Math.abs(cosine) >= 1 || height < 1e-12) continue; // no sunrise/sunset or raised nodus
      const halfDayHours = Math.acos(cosine) * 12 / Math.PI;
      const sunrise = 12 - halfDayHours;
      const sunset = 12 + halfDayHours;
      const solarHour = system === "babylonian" ? sunrise + hourIndex
        : system === "italian" ? sunset - (24 - hourIndex)
        : sunrise + hourIndex * (sunset - sunrise) / 12;
      if (solarHour <= sunrise + 1e-10 || solarHour >= sunset - 1e-10) continue;
      const hourAngle = (solarHour - 12) * Math.PI / 12;
      // Rotate the equatorial Sun vector into the local East-North-Up frame.
      const east = -Math.cos(declination) * Math.sin(hourAngle);
      const sunNorth = Math.cos(phi) * Math.sin(declination)
        - Math.sin(phi) * Math.cos(declination) * Math.cos(hourAngle);
      const up = Math.sin(phi) * Math.sin(declination)
        + Math.cos(phi) * Math.cos(declination) * Math.cos(hourAngle);
      if (up <= 1e-12) continue;
      // A ray from the elevated polar nodus meets horizontal z=0 at height/up.
      points.push({ u: north - height * sunNorth / up, v: -height * east / up });
    }
    if (points.length >= 2) curves.push({ hourIndex, points });
  }
  return curves;
}
