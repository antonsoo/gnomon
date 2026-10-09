/** Capture physical outputs for an independent reader, including extreme geometry. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { captureDesign, designSvg } from '../src/design.ts';
import { defaultState } from '../src/state.ts';
import { renderGnomonSVG } from '../src/lib/render/svg.ts';
import { exportConstructionPDF } from '../src/lib/export/pdf.ts';

const directory = resolve(process.argv[2] ?? 'test-results/construction');
mkdirSync(directory, { recursive: true });
const cases = [
  ['garden', { latitudeDeg: 45, radiusMm: 90 }],
  ['south', { latitudeDeg: -45, radiusMm: 150 }],
  ['wall', { latitudeDeg: 51.5, dialType: 'vertical', wallDeclinationDeg: 35, radiusMm: 200 }],
  ['base-outside-old-fan', { latitudeDeg: -45, dialType: 'vertical', wallDeclinationDeg: -45, radiusMm: 90 }],
  ['arctic', { latitudeDeg: 89, radiusMm: 90 }],
  ['near-normal', { latitudeDeg: 89.91, radiusMm: 90 }],
  ['tiny-rise', { latitudeDeg: 0.1, radiusMm: 30 }],
  ['tall-narrow', { latitudeDeg: -89.91, dialType: 'vertical', wallDeclinationDeg: 35, radiusMm: 235 }],
  ['maximum', { latitudeDeg: 45, radiusMm: 400 }],
  ['maximum-tall', { latitudeDeg: -78, radiusMm: 400 }],
  ['equatorial', { latitudeDeg: 37.7749, dialType: 'equatorial', radiusMm: 150 }],
  ['equatorial-large', { latitudeDeg: -33, dialType: 'equatorial', radiusMm: 400 }],
  ['pole', { latitudeDeg: 90, radiusMm: 90 }],
];
const records = [];
const save = (name, bytes) => {
  writeFileSync(join(directory, name), bytes);
  return { file: name, sha256: createHash('sha256').update(bytes).digest('hex') };
};
for (const [name, settings] of cases) {
  const state = { ...defaultState(), longitudeDeg: 0, timeZone: 'UTC', timeMode: 'apparent', ...settings };
  const instant = new Date('2026-06-21T12:00:00Z');
  const design = captureDesign(state, instant);
  const plate = save(`${name}-plate.svg`, designSvg(design, 'laser'));
  const style = save(`${name}-style.svg`, renderGnomonSVG(design.dial, { theme: 'laser', marginMm: 8 }));
  for (const format of ['a4', 'letter']) {
    const pdf = save(`${name}-${format}.pdf`, exportConstructionPDF(design.dial, { ...design.polarOptions, format }));
    records.push({ ...pdf, plate, style, format, settings: state, instant: instant.toISOString() });
  }
}
writeFileSync(join(directory, 'manifest.json'), JSON.stringify({ generator: 'scripts/construction-fixtures.mjs', node: process.version, records }, null, 2) + '\n');
process.stdout.write(`Wrote ${records.length} construction PDFs and their SVG parts to ${directory}\n`);
