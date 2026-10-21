import type { PolarDialResult } from "../dials/types.ts";

/** Flat millimetre geometry, with the same foot/end marks as the dial plate. */
export function gnomonLayout(dial: PolarDialResult) {
  const g = dial.gnomon;
  const rod = g.baseLengthMm === 0;
  const tabDepth = rod ? 0 : Math.max(6, Math.min(12, g.styleLengthMm * 0.1));
  const foot = rod ? { x: 4, y: 0 } : { x: g.baseLengthMm, y: g.heightMm };
  const end = rod ? { x: 4, y: g.styleLengthMm } : { x: 0, y: 0 };
  const baseEnd = rod ? null : { x: 0, y: g.heightMm };
  const fraction = (g.nodusDistanceMm ?? 0) / g.styleLengthMm;
  const nodus = g.nodusDistanceMm === undefined ? null : {
    x: foot.x + (end.x - foot.x) * fraction,
    y: foot.y + (end.y - foot.y) * fraction,
  };
  const cut = rod ? [] : [end, foot, { x: foot.x, y: foot.y + tabDepth }, { x: 0, y: foot.y + tabDepth }];
  return {
    rod, foot, end, baseEnd, nodus, cut, tabDepth,
    widthMm: Math.max(8, g.baseLengthMm),
    heightMm: rod ? g.styleLengthMm : g.heightMm + tabDepth,
  };
}

/** Coordinates relative to the plate foot, not relative to the SVG page. */
export function gnomonBaseEnd(dial: PolarDialResult) {
  const angle = dial.gnomon.substyleAngleDeg * Math.PI / 180;
  return { u: dial.gnomon.baseLengthMm * Math.cos(angle), v: dial.gnomon.baseLengthMm * Math.sin(angle) };
}

export function gnomonConstructionWarning(dial: PolarDialResult): string | null {
  const g = dial.gnomon;
  if (g.baseLengthMm > 0 && Math.min(g.baseLengthMm, g.heightMm) < 3) {
    return "One triangle leg is under 3 mm: use this as an angle gauge for a thin rigid style, not a self-supporting paper fold.";
  }
  return null;
}

export function gnomonInstructions(dial: PolarDialResult): string[] {
  const g = dial.gnomon;
  const rod = g.baseLengthMm === 0;
  const warning = gnomonConstructionWarning(dial);
  if (rod && dial.equatorial?.counterpart) return [
    `Use a thin rod with ${g.styleLengthMm.toFixed(2)} mm exposed on EACH side of the plate: ${(2 * g.styleLengthMm).toFixed(2)} mm plus your backing's thickness in total. The gauge measures one exposed half from its plate surface, not the whole rod. Set the rod perpendicular through the filled foot dots.`,
    "Print both faces on separate sheets at 100%, not automatic duplex. Keep the print facing outward on each side of one rigid backing. Align the filled foot dots and target A through the backing; transfer those two marks before trimming. The outlines fit the same cut. Target A is an assembly aid outside the cut.",
    "Away from the poles, page-up on both layouts is uphill on the tilted disc. Support the disc without blocking either face or the rod. At a geographic pole the meridian reference is arbitrary; there is no illuminated winter face during polar night.",
    `Read the pole-facing side from ${dial.equatorial.face === "pole-facing" ? dial.equatorial.illuminated : dial.equatorial.counterpart.equatorial!.illuminated}; use the opposite side in the other half of the year, when the Sun is above your horizon. At an equinox the Sun grazes both faces, so neither gives a usable reading.`,
    ...(g.nodusDistanceMm === undefined ? [] : [
      `For date curves, put a bead or notch ${g.nodusDistanceMm.toFixed(2)} mm along EACH exposed half, measured from that side's plate surface. The cross on the gauge marks this distance; ink alone does not cast a distinct nodus shadow.`,
    ]),
    "The tilt and mounting support are not cut templates. Material thickness, kerf and printer distortion are not compensated; check the calibration bars before cutting.",
  ];
  return [
    ...(warning ? [warning] : []),
    rod
      ? `Use a thin rod ${g.styleLengthMm.toFixed(2)} mm long, measured from the plate surface (add any buried mounting length). Set it perpendicular to the plate at the filled dot.`
      : warning
        ? `Use the sloping edge as a side-view angle reference: ${g.styleHeightDeg.toFixed(4)} degrees above the plate. Hold this reference upright, perpendicular to the plate, while positioning the rigid style.`
        : `Cut the solid outline. Fold the tab 90 degrees at the dashed base. The triangle stands perpendicular to the plate; its sloping edge rises ${g.styleHeightDeg.toFixed(4)} degrees above it.`,
    ...(rod ? [] : [
      "Mount the plate on flat backing. Match the filled foot dots and the open base-end circles; align the dashed base with the plate's dashed mounting line. " + (warning ? "Secure the rigid style with your own support." : "Secure the tab to the backing; it may overhang a fan's point."),
      `Base ${g.baseLengthMm.toFixed(2)} mm; rise ${g.heightMm.toFixed(2)} mm; style edge ${g.styleLengthMm.toFixed(2)} mm. Keep the triangle upright, not laid flat on the plate.`,
    ]),
    ...(g.nodusDistanceMm === undefined ? [] : [
      `The cross marks the nodus, ${g.nodusDistanceMm.toFixed(2)} mm along the style from the filled foot dot. Add a small bead or notch there to cast a distinct date-line shadow; an ink cross alone will not do this.`,
    ]),
    "Use a thin shadow-casting edge. Material thickness, kerf and fold allowance are not compensated in these templates.",
  ];
}
