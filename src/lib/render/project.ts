/**
 * Shared "plane (u, v) millimetres -> page (x, y) millimetres" mapping,
 * used by every renderer (SVG, PDF) so the visual layout convention lives
 * in exactly one place. `u` (the dial's reference/noon axis) points up
 * the page; `v` points right -- for a horizontal dial that is true
 * north-up, east-right, the ordinary way to read a map.
 */
export interface PageMapping {
  centerX: number;
  centerY: number;
}

export function toPage(u: number, v: number, m: PageMapping): { x: number; y: number } {
  return { x: m.centerX + v, y: m.centerY - u };
}

export function polarToUV(angleRad: number, radius: number): { u: number; v: number } {
  return { u: radius * Math.cos(angleRad), v: radius * Math.sin(angleRad) };
}
