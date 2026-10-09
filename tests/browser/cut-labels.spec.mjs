import { test, expect } from '@playwright/test';
import { buildHorizontalDial } from '../../src/lib/dials/horizontal.ts';
import { buildVerticalDial } from '../../src/lib/dials/vertical.ts';
import { buildEquatorialDial } from '../../src/lib/dials/equatorial.ts';
import { renderPolarDialSVG } from '../../src/lib/render/svg.ts';

// Measure actual rendered glyphs against the actual exported cutting path.
// This deliberately does not import the layout/bounds calculation under test.
test('cutting every supported polar plate retains the rendered hour numerals', async ({ page }) => {
  const svgs = [];
  for (const latitudeDeg of [-60, -10, 10, 60]) {
    const shared = { latitudeDeg, timeReference: { mode: 'apparent', longitudeDeg: 0 }, hourLineOptions: { startHour: 3, endHour: 21, stepHours: 0.25 }, nodusDistanceMm: 10, gnomonBaseLengthMm: 20 };
    const dials = [buildHorizontalDial(shared), buildEquatorialDial(shared), ...[-170, -45, 0, 45, 170].map((wallDeclinationDeg) => buildVerticalDial({ ...shared, wallDeclinationDeg }))];
    for (const [index, dial] of dials.entries()) for (const radiusMm of [30, 90, 400]) for (const plateShape of ['fan', 'circle']) for (const numerals of ['arabic', 'roman']) {
      svgs.push({ label: `${latitudeDeg}/${index}/${radiusMm}/${plateShape}/${numerals}`, svg: renderPolarDialSVG(dial, { radiusMm, innerRadiusMm: 4, plateShape, numerals, theme: 'laser', showDeclinationLines: true, showHistoricalHours: false }) });
    }
  }
  await page.setContent('<main></main>');
  const result = await page.evaluate((inputs) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    let labels = 0;
    const outside = [];
    for (const input of inputs) {
      document.querySelector('main').innerHTML = input.svg;
      const svg = document.querySelector('svg');
      const cut = new Path2D(svg.querySelector('path').getAttribute('d'));
      for (const text of svg.querySelectorAll('text[dominant-baseline="middle"]')) {
        labels++;
        const box = text.getBBox();
        for (const x of [box.x, box.x + box.width / 2, box.x + box.width]) for (const y of [box.y, box.y + box.height / 2, box.y + box.height]) {
          if (!ctx.isPointInPath(cut, x, y)) outside.push(`${input.label}: ${text.textContent}`);
        }
      }
    }
    return { labels, outside };
  }, svgs);
  expect(result.labels).toBeGreaterThan(3000);
  expect(result.outside).toEqual([]);
});
