import { solarEphemeris } from "./astronomy.ts";

export interface EquationOfTimeSample {
  date: Date;
  /** Day of year label, e.g. "15 Jan". */
  label: string;
  equationOfTimeMin: number;
  declinationDeg: number;
}

/**
 * Equation-of-time correction table, sampled at fixed calendar days
 * (the convention used on printed dial plaques) for a given year.
 * `daysOfMonth` defaults to the 1st, 11th and 21st of each month, which
 * is dense enough to interpolate by eye to within about a minute.
 */
export function equationOfTimeTable(year: number, daysOfMonth: number[] = [1, 11, 21]): EquationOfTimeSample[] {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const samples: EquationOfTimeSample[] = [];
  for (let m = 0; m < 12; m++) {
    for (const day of daysOfMonth) {
      const date = new Date(Date.UTC(year, m, day, 12, 0, 0));
      const { equationOfTimeMin, declinationDeg } = solarEphemeris(date);
      samples.push({ date, label: `${day} ${months[m]}`, equationOfTimeMin, declinationDeg });
    }
  }
  return samples;
}

/** Daily series across a year, for plotting the equation-of-time graph. */
export function equationOfTimeCurve(year: number): EquationOfTimeSample[] {
  const samples: EquationOfTimeSample[] = [];
  const start = Date.UTC(year, 0, 1, 12, 0, 0);
  for (let d = 0; d < 365; d++) {
    const date = new Date(start + d * 86400000);
    const { equationOfTimeMin, declinationDeg } = solarEphemeris(date);
    samples.push({ date, label: date.toISOString().slice(0, 10), equationOfTimeMin, declinationDeg });
  }
  return samples;
}
