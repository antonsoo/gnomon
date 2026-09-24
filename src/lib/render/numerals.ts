/** Roman numeral rendering, including the traditional clock-face "IIII" for 4 (not "IV"). */
export function toRomanNumeral(n: number, style: "IIII" | "IV" = "IIII"): string {
  const table: [number, string][] =
    style === "IIII"
      ? [
          [50, "L"], [40, "XL"], [10, "X"], [9, "IX"],
          [5, "V"], [4, "IIII"], [1, "I"],
        ]
      : [
          [50, "L"], [40, "XL"], [10, "X"], [9, "IX"],
          [5, "V"], [4, "IV"], [1, "I"],
        ];
  let rem = Math.round(n);
  if (rem <= 0) return "XII"; // hour 0 / 24 reads as XII
  let out = "";
  for (const [value, sym] of table) {
    while (rem >= value) {
      out += sym;
      rem -= value;
    }
  }
  return out;
}

/** Civil-hour label (1-12 with am/pm folded away, since sundials conventionally show 1-12 repeating). */
export function hourLabel(hour24: number, numerals: "arabic" | "roman", romanStyle: "IIII" | "IV" = "IIII"): string {
  const h = ((Math.round(hour24 * 4) / 4) % 12 + 12) % 12 || 12;
  const whole = Math.floor(h);
  const frac = h - whole;
  const base = numerals === "roman" ? toRomanNumeral(whole === 0 ? 12 : whole, romanStyle) : String(whole === 0 ? 12 : whole);
  if (Math.abs(frac) < 1e-6) return base;
  if (Math.abs(frac - 0.5) < 1e-6) return `${base}½`; // 1/2
  if (Math.abs(frac - 0.25) < 1e-6) return `${base}¼`; // 1/4
  if (Math.abs(frac - 0.75) < 1e-6) return `${base}¾`; // 3/4
  return base;
}
